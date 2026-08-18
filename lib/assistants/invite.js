/**
 * Commercial assistant invitation / provisioning flow.
 *
 * Mirrors lib/agents/invite.js (the proven temp-password onboarding path)
 * but WITHOUT the agent machinery: no is_agent flag, no commission rate,
 * no organization, no agent folder. Fair access is granted through the
 * existing event_access table instead.
 *
 * Behavior notes (kept identical to the agent flow):
 *   - Temp password instead of magic link: email scanners pre-fetched the
 *     OTP links and burned them before invitees could click.
 *   - has_password_set stays false so /set-password is forced on first login.
 *   - grantAccess / email steps are best-effort where the agent flow is too.
 */

// Relative imports (not '@/') so this module stays importable from the
// node:test suites, which have no Next.js path-alias resolution.
import { grantAccess } from '../agents/access.js';
import { InviteError } from '../agents/invite.js';
import { isValidEmail, normalizeEmail } from '../auth/validation.js';
import { generateTempPassword } from '../auth/generateTempPassword.js';
import { welcomeAssistantWithPasswordEmail, upgradeAssistantEmail } from '../email-templates.js';

async function resolveDeps(deps) {
  const d = {
    grantAccess,
    generateTempPassword,
    ...deps,
  };
  if (!d.sendEmail) {
    // sendEmail transitively imports Next.js server modules, so it is loaded
    // lazily — only when the caller did not inject a replacement (tests inject).
    d.sendEmail = (await import('../send-email.js')).sendEmail;
  }
  return d;
}

/**
 * Replace an assistant's fair access with exactly `eventIds`.
 * Rows for events not in the list are removed; new ones are upserted with
 * permission 'edit' so the assistant can both see and file orders.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {object} options
 * @param {string} options.userId - assistant profile id
 * @param {string} options.userEmail - assistant email (legacy live schema requires it)
 * @param {string[]} options.eventIds - the full desired set of event ids
 * @param {string|null} [options.grantedBy] - admin user id for attribution
 */
export async function setAssistantEventAccess(adminSupabase, {
  userId,
  userEmail,
  eventIds,
  grantedBy = null,
}) {
  if (!userId) throw new InviteError('Missing assistant user id', 400);
  const normalizedEmail = normalizeEmail(userEmail);
  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    throw new InviteError('Missing assistant email for fair access', 400);
  }
  const desired = [...new Set((eventIds || []).filter(Boolean))];

  const { data: currentRows, error: readErr } = await adminSupabase
    .from('event_access')
    .select('event_id')
    .eq('user_id', userId);
  if (readErr) {
    throw new InviteError(`Failed to read current fair access: ${readErr.message}`, 500);
  }

  const current = new Set((currentRows || []).map((r) => r.event_id));
  const toRemove = [...current].filter((id) => !desired.includes(id));
  const toAdd = desired.filter((id) => !current.has(id));

  if (toRemove.length > 0) {
    const { error: delErr } = await adminSupabase
      .from('event_access')
      .delete()
      .eq('user_id', userId)
      .in('event_id', toRemove);
    if (delErr) {
      throw new InviteError(`Failed to revoke fair access: ${delErr.message}`, 500);
    }
  }

  if (toAdd.length > 0) {
    const rows = toAdd.map((eventId) => ({
      event_id: eventId,
      user_id: userId,
      // The live event_access table predates the checked-in Phase 14 schema
      // and has this legacy NOT NULL column. Keep both identifiers populated:
      // user_id is authoritative; user_email preserves live compatibility.
      user_email: normalizedEmail,
      permission: 'edit',
      granted_by: grantedBy,
    }));
    const { error: upsertErr } = await adminSupabase
      .from('event_access')
      .upsert(rows, { onConflict: 'event_id,user_id' });
    if (upsertErr) {
      throw new InviteError(`Failed to grant fair access: ${upsertErr.message}`, 500);
    }
  }

  return { added: toAdd, removed: toRemove };
}

/**
 * Invite (or upgrade) a commercial assistant.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase - service-role client
 * @param {object} options
 * @param {string} options.email - invitee email (will be normalized)
 * @param {string} [options.fullName] - invitee full name
 * @param {string[]} [options.eventIds] - fairs to grant (event ids)
 * @param {string[]} [options.eventNames] - fair display names for the email
 * @param {string|null} [options.invitedByUserId] - caller user id (event_access.granted_by)
 * @param {boolean} [options.sendInvite] - send the welcome / upgrade email
 * @param {string} [options.siteUrl]
 * @param {object} [deps] - injectable dependencies (tests)
 * @returns {Promise<{ assistant: object, created: boolean, tempPassword: string|null }>}
 */
export async function inviteAssistant(adminSupabase, options, deps = {}) {
  const {
    email,
    fullName = '',
    eventIds = [],
    eventNames = [],
    invitedByUserId = null,
    sendInvite = true,
    siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://b2b.love-lab.com',
  } = options;

  const emailLower = normalizeEmail(email);
  if (!emailLower || !isValidEmail(emailLower)) {
    throw new InviteError('Invalid email format', 400);
  }

  const d = await resolveDeps(deps);

  const { data: existingProfile } = await adminSupabase
    .from('profiles')
    .select('id, email, is_assistant, is_agent, role, has_password_set')
    .eq('email', emailLower)
    .maybeSingle();

  let assistantProfile;
  let created = false;
  let tempPassword = null;
  let resumedPendingInvite = false;

  if (existingProfile) {
    // Existing user — flag as assistant (keeps any existing role/agent state).
    const nameUpdate = fullName?.trim() ? { full_name: fullName.trim() } : {};
    const { data, error } = await adminSupabase
      .from('profiles')
      .update({ is_assistant: true, ...nameUpdate })
      .eq('id', existingProfile.id)
      .select()
      .single();

    if (error) {
      console.error('[inviteAssistant] Update error:', error.message);
      throw new InviteError('Failed to update profile', 500);
    }
    assistantProfile = data;

    try {
      await d.grantAccess(adminSupabase, emailLower);
    } catch (grantErr) {
      console.error('[inviteAssistant] grantAccess error (non-blocking):', grantErr.message);
    }

    // A previous invite may have created the auth/profile records and then
    // failed while granting fair access. Retrying must not send the password-
    // less "upgrade" email: rotate a fresh temporary password and finish the
    // original welcome flow instead.
    if (existingProfile.has_password_set === false) {
      tempPassword = d.generateTempPassword(fullName);
      const { error: pwErr } = await adminSupabase.auth.admin.updateUserById(existingProfile.id, {
        password: tempPassword,
      });
      if (pwErr) {
        console.error('[inviteAssistant] Pending invite password reset error:', pwErr.message);
        throw new InviteError('Failed to refresh temporary password', 500);
      }
      resumedPendingInvite = true;
    }
  } else {
    // New user — allowlist + auth account with a temp password.
    try {
      await d.grantAccess(adminSupabase, emailLower);
    } catch (grantErr) {
      console.error('[inviteAssistant] grantAccess error (non-blocking):', grantErr.message);
    }

    tempPassword = d.generateTempPassword(fullName);

    // Reuse an existing auth user (e.g. prior Google OAuth) instead of
    // creating a duplicate with a different ID.
    let authUser = null;
    try {
      const { data: existingUsers } = await adminSupabase.auth.admin.listUsers({
        filter: `email.eq.${emailLower}`,
        perPage: 1,
      });
      const match = (existingUsers?.users || []).find(
        (u) => u.email?.toLowerCase() === emailLower
      );
      if (match) authUser = match;
    } catch (lookupErr) {
      console.warn('[inviteAssistant] Auth user lookup warning:', lookupErr.message);
    }

    if (authUser) {
      const { error: pwErr } = await adminSupabase.auth.admin.updateUserById(authUser.id, {
        password: tempPassword,
      });
      if (pwErr) {
        console.error('[inviteAssistant] Password update error:', pwErr.message);
        throw new InviteError('Failed to set temporary password', 500);
      }
    } else {
      const { data: createData, error: createErr } = await adminSupabase.auth.admin.createUser({
        email: emailLower,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName?.trim() || '' },
      });
      if (createErr || !createData?.user) {
        console.error('[inviteAssistant] Could not create auth user:', createErr?.message);
        throw new InviteError(
          'Failed to create account. Please try again or check if the email already exists.',
          500
        );
      }
      authUser = createData.user;
    }

    const { data, error } = await adminSupabase
      .from('profiles')
      .upsert(
        {
          id: authUser.id,
          email: emailLower,
          full_name: fullName?.trim() || '',
          has_password_set: false,
          is_assistant: true,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[inviteAssistant] Profile upsert error:', error.message);
      throw new InviteError('Failed to create assistant profile', 500);
    }
    assistantProfile = data;
    created = true;
  }

  // Fair access — blocking: an assistant without her fairs is useless, so a
  // failure here must surface to the admin instead of silently succeeding.
  if (assistantProfile?.id && eventIds.length > 0) {
    await setAssistantEventAccess(adminSupabase, {
      userId: assistantProfile.id,
      userEmail: emailLower,
      eventIds,
      grantedBy: invitedByUserId,
    });
  }

  if (sendInvite) {
    const assistantName = fullName?.trim() || assistantProfile?.full_name || emailLower;
    try {
      const { subject, html } = (created || resumedPendingInvite)
        ? welcomeAssistantWithPasswordEmail(
            assistantName,
            emailLower,
            tempPassword,
            `${siteUrl}/login`,
            siteUrl,
            eventNames
          )
        : upgradeAssistantEmail(assistantName, siteUrl, eventNames);
      await d.sendEmail({ to: emailLower, subject, html });
    } catch (emailErr) {
      if (created) {
        // A brand-new invitee who never receives the temp password is locked
        // out — surface the failure so the admin can hit "Resend invite".
        throw new InviteError(`Assistant created but the invite email failed: ${emailErr.message}`, 502);
      }
      console.error('[inviteAssistant] Upgrade email failed (non-blocking):', emailErr.message);
    }
  }

  return { assistant: assistantProfile, created, tempPassword };
}

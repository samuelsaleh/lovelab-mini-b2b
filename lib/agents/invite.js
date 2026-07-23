/**
 * Shared agent invitation / provisioning flow.
 *
 * Extracted from POST /api/agents so the same proven onboarding path
 * (allowed_emails grant + temp-password auth account + agent profile +
 * org membership + folder provisioning) can be triggered by:
 *   - LoveLab admins (POST /api/agents — full agent form), and
 *   - organization owners (POST /api/organizations/[id]/members — team
 *     self-onboarding for the partner-company template).
 *
 * Behavior notes (kept identical to the historical /api/agents flow):
 *   - Temp password instead of magic link: email scanners pre-fetched the
 *     OTP links and burned them before agents could click. The temp
 *     password has no expiry and works from any device after any delay.
 *   - has_password_set stays false so /set-password is forced on first login.
 *   - grantAccess / email / folder steps are best-effort (non-blocking).
 */

// Relative imports (not '@/') so this module stays importable from the
// node:test suites, which have no Next.js path-alias resolution.
import { grantAccess } from './access.js';
import { isValidEmail, normalizeEmail } from '../auth/validation.js';
import { generateTempPassword } from '../auth/generateTempPassword.js';
import { welcomeAgentWithPasswordEmail, upgradeAgentEmail } from '../email-templates.js';

/** Error with an HTTP status the calling route can map onto its response. */
export class InviteError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'InviteError';
    this.status = status;
  }
}

// sendEmail and the org provisioning helpers transitively import Next.js
// server modules (next/headers), so they are loaded lazily — only when the
// caller did not inject a replacement (tests always inject).
async function resolveDeps(deps) {
  const d = {
    grantAccess,
    generateTempPassword,
    ...deps,
  };
  if (!d.sendEmail) {
    d.sendEmail = (await import('../send-email.js')).sendEmail;
  }
  if (!d.provisionAgentInOrg || !d.autoEnsureOrganization) {
    const provision = await import('../organizations/provision-agent.js');
    d.provisionAgentInOrg = d.provisionAgentInOrg || provision.provisionAgentInOrg;
    d.autoEnsureOrganization = d.autoEnsureOrganization || provision.autoEnsureOrganization;
  }
  if (!d.ensureAgentFolderEvent) {
    d.ensureAgentFolderEvent = (await import('../events/ensure-agent-folder.js')).ensureAgentFolderEvent;
  }
  return d;
}

/**
 * Invite (or upgrade) an agent.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase - service-role client
 * @param {object} options
 * @param {string} options.email - invitee email (will be normalized)
 * @param {string} [options.fullName] - invitee full name
 * @param {number|null} [options.commissionRate] - per-agent commission rate; omit/null to leave unset
 * @param {object} [options.extraAgentFields] - additional profile columns (agent_phone, agent_territory, ...)
 * @param {string|null} [options.organizationId] - when set, the invitee joins THIS org
 *   (membership role below) and NO solo org is auto-created for them.
 * @param {'owner'|'member'} [options.membershipRole] - membership role inside organizationId
 * @param {boolean} [options.autoEnsureOrg] - when no organizationId: auto-create the
 *   invitee's own org with them as owner (historical admin-invite behavior)
 * @param {string|null} [options.invitedByUserId] - caller user id (org created_by attribution)
 * @param {boolean} [options.sendInvite] - send the welcome / upgrade email
 * @param {string} [options.siteUrl]
 * @param {object} [deps] - injectable dependencies (tests)
 * @returns {Promise<{ agent: object, created: boolean, tempPassword: string|null }>}
 */
export async function inviteAgent(adminSupabase, options, deps = {}) {
  const {
    email,
    fullName = '',
    commissionRate = null,
    extraAgentFields = {},
    organizationId = null,
    membershipRole = 'member',
    autoEnsureOrg = true,
    invitedByUserId = null,
    sendInvite = true,
    siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://b2b.love-lab.com',
  } = options;

  const emailLower = normalizeEmail(email);
  if (!emailLower || !isValidEmail(emailLower)) {
    throw new InviteError('Invalid email format', 400);
  }
  if (membershipRole !== 'owner' && membershipRole !== 'member') {
    throw new InviteError('Invalid membership role', 400);
  }

  const d = await resolveDeps(deps);

  // Check if the user already exists in profiles
  const { data: existingProfile } = await adminSupabase
    .from('profiles')
    .select('id, email, is_agent, organization_id')
    .eq('email', emailLower)
    .maybeSingle();

  const agentFields = {
    is_agent: true,
    agent_status: existingProfile ? 'active' : 'invited',
    agent_since: new Date().toISOString(),
    organization_id: organizationId || null,
    ...(commissionRate !== null && commissionRate !== undefined
      ? { commission_rate: commissionRate }
      : {}),
    ...extraAgentFields,
  };

  let agentProfile;
  let created = false;
  let tempPassword = null;

  if (existingProfile) {
    // Existing user -- upgrade to agent
    const nameUpdate = fullName?.trim() ? { full_name: fullName.trim() } : {};
    const { data, error } = await adminSupabase
      .from('profiles')
      .update({ ...agentFields, ...nameUpdate })
      .eq('id', existingProfile.id)
      .select()
      .single();

    if (error) {
      console.error('[inviteAgent] Update error:', error.message);
      throw new InviteError('Failed to update profile', 500);
    }
    agentProfile = data;

    // Ensure existing users are also granted login access
    try {
      await d.grantAccess(adminSupabase, emailLower);
    } catch (grantErr) {
      console.error('[inviteAgent] grantAccess error (non-blocking):', grantErr.message);
    }

    if (sendInvite) {
      try {
        const agentName = fullName?.trim() || existingProfile.email;
        const { subject, html } = upgradeAgentEmail(agentName, siteUrl);
        await d.sendEmail({ to: existingProfile.email || emailLower, subject, html });
      } catch (emailErr) {
        console.error('[inviteAgent] Upgrade email failed (non-blocking):', emailErr.message);
      }
    }
  } else {
    // New user -- add to allowed_emails and create an auth account with a
    // temp password (see behavior notes at the top of this file).
    try {
      await d.grantAccess(adminSupabase, emailLower);
    } catch (grantErr) {
      console.error('[inviteAgent] grantAccess error (non-blocking):', grantErr.message);
    }

    tempPassword = d.generateTempPassword(fullName);

    // Check if an auth user already exists for this email (e.g. via Google
    // OAuth) to prevent creating a duplicate auth user with a different ID.
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
      console.warn('[inviteAgent] Auth user lookup warning:', lookupErr.message);
    }

    if (authUser) {
      // Auth user already exists (likely from prior Google OAuth) — just
      // set the temp password on the existing record.
      const { error: pwErr } = await adminSupabase.auth.admin.updateUserById(authUser.id, {
        password: tempPassword,
      });
      if (pwErr) {
        console.error('[inviteAgent] Password update error:', pwErr.message);
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
        console.error('[inviteAgent] Could not create auth user:', createErr?.message);
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
          ...agentFields,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[inviteAgent] Profile upsert error:', error.message);
      throw new InviteError('Failed to create agent profile', 500);
    }
    agentProfile = data;
    created = true;

    if (sendInvite) {
      const agentName = fullName?.trim() || emailLower;
      const { subject, html } = welcomeAgentWithPasswordEmail(
        agentName,
        emailLower,
        tempPassword,
        `${siteUrl}/login`,
        siteUrl
      );
      await d.sendEmail({ to: emailLower, subject, html });
    }
  }

  // Organization membership + folder provisioning
  if (agentProfile?.id && !agentProfile?._pending) {
    if (organizationId) {
      try {
        const { data: existingMembership } = await adminSupabase
          .from('organization_memberships')
          .select('id, deleted_at, role')
          .eq('organization_id', organizationId)
          .eq('user_id', agentProfile.id)
          .maybeSingle();

        if (!existingMembership) {
          await adminSupabase
            .from('organization_memberships')
            .insert({ organization_id: organizationId, user_id: agentProfile.id, role: membershipRole });
        } else if (existingMembership.deleted_at) {
          // Re-inviting a previously removed member reactivates the membership.
          await adminSupabase
            .from('organization_memberships')
            .update({ deleted_at: null, role: membershipRole })
            .eq('id', existingMembership.id);
        }

        await d.provisionAgentInOrg(organizationId, agentProfile.id);
      } catch (memberErr) {
        console.error('[inviteAgent] Org membership/folder error (non-blocking):', memberErr.message);
      }
    } else if (autoEnsureOrg && !agentProfile.organization_id) {
      try {
        const result = await d.autoEnsureOrganization(
          agentProfile.id,
          invitedByUserId || agentProfile.id
        );
        agentProfile.organization_id = result.organization?.id || null;
      } catch (orgErr) {
        console.error('[inviteAgent] Auto-ensure org error (non-blocking):', orgErr.message);
      }
    }

    // Create the events.type='agent' folder immediately so the agent's first
    // order has somewhere to file into (and the Fairs page shows the folder
    // without waiting for an admin to open SaveDocumentModal). Best-effort —
    // resolveAgentFolderEventId also creates on save as a second safety net.
    try {
      await d.ensureAgentFolderEvent(adminSupabase, agentProfile.id);
    } catch (folderErr) {
      console.error('[inviteAgent] ensure agent folder error (non-blocking):', folderErr.message);
    }
  }

  return { agent: agentProfile, created, tempPassword };
}

/**
 * Re-send the welcome email (with a freshly generated temp password) to an
 * agent who has been invited but has never set their own password.
 *
 * Security: hard-refuses when the target has already set a password —
 * otherwise an org owner could rotate an active member's credentials.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {object} options
 * @param {object} options.profile - target profile row (id, email, full_name, has_password_set, agent_status)
 * @param {string} [options.siteUrl]
 * @param {object} [deps]
 */
export async function resendAgentInvite(adminSupabase, options, deps = {}) {
  const {
    profile,
    siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://b2b.love-lab.com',
  } = options;

  if (!profile?.id || !profile?.email) {
    throw new InviteError('Missing target profile', 400);
  }
  if (profile.has_password_set) {
    throw new InviteError('This member already set their own password', 409);
  }
  if (profile.agent_status && profile.agent_status !== 'invited') {
    throw new InviteError('Only pending invitations can be re-sent', 409);
  }

  const d = await resolveDeps(deps);
  const emailLower = normalizeEmail(profile.email);
  const tempPassword = d.generateTempPassword(profile.full_name);

  const { error: pwErr } = await adminSupabase.auth.admin.updateUserById(profile.id, {
    password: tempPassword,
  });
  if (pwErr) {
    console.error('[resendAgentInvite] Password reset error:', pwErr.message);
    throw new InviteError('Failed to reset temporary password', 500);
  }

  const agentName = profile.full_name?.trim() || emailLower;
  const { subject, html } = welcomeAgentWithPasswordEmail(
    agentName,
    emailLower,
    tempPassword,
    `${siteUrl}/login`,
    siteUrl
  );
  await d.sendEmail({ to: emailLower, subject, html });

  return { ok: true };
}

/**
 * Employee invitation flow — a colleague who gets the same access as an admin.
 *
 * Sam, 14 Sep 2026: "an admin can invite new employees through a button, with
 * the same access an admin has, like we have with agents — they receive an
 * email and a temporary password."
 *
 * Mirrors lib/assistants/invite.js (itself a copy of the proven agent path)
 * with none of the agent or assistant machinery: the only thing an employee
 * gets is `role = 'admin'` on their profile and a place on the login allowlist.
 *
 * Two facts decide the shape of this file:
 *   - Nothing in the app ever demotes a role. The auth callback only upgrades
 *     from ADMIN_EMAILS, so `role: 'admin'` written here holds on every later
 *     login, Google or password. No env var is needed.
 *   - Password logins never pass through /auth/callback, and the client-side
 *     "choose your own password" redirect (AuthProvider) only fires for agents
 *     and assistants. `has_password_set` is false on every profile created by
 *     Google sign-in too, so it cannot tell an invited employee apart from
 *     Sam. The invite therefore leaves its own mark on the auth user —
 *     user_metadata.must_set_password — which /api/me hands to the client
 *     and PATCH /api/me/password-set clears once they picked a password.
 */

// Relative imports (not '@/') so this module stays importable from the
// node:test suites, which have no Next.js path-alias resolution.
import { grantAccess } from '../agents/access.js';
import { InviteError } from '../agents/invite.js';
import { isValidEmail, normalizeEmail } from '../auth/validation.js';
import { generateTempPassword } from '../auth/generateTempPassword.js';
import { welcomeEmployeeWithPasswordEmail, upgradeEmployeeEmail } from '../email-templates.js';

export const EMPLOYEE_SELECT = 'id, email, full_name, avatar_url, role, is_agent, is_assistant, has_password_set, created_at';

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

/** The mark that tells the client this account still runs on a temporary password. */
function markedMetadata(existing, fullName) {
  const base = { ...(existing || {}) };
  if (fullName?.trim()) base.full_name = fullName.trim();
  base.must_set_password = true;
  return base;
}

/**
 * Give an auth user a fresh temporary password and the must-set-password mark.
 * Shared by the invite (existing auth user), the pending-invite retry and resend.
 */
async function rotateTempPassword(adminSupabase, d, { userId, fullName, existingMetadata }) {
  const tempPassword = d.generateTempPassword(fullName);
  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    password: tempPassword,
    user_metadata: markedMetadata(existingMetadata, fullName),
  });
  if (error) {
    console.error('[inviteEmployee] Temporary password error:', error.message);
    throw new InviteError('Failed to set the temporary password', 500);
  }
  return tempPassword;
}

/**
 * Invite (or upgrade) an employee.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase - service-role client
 * @param {object} options
 * @param {string} options.email
 * @param {string} [options.fullName]
 * @param {string|null} [options.invitedByUserId] - kept for parity; nothing stores it yet
 * @param {boolean} [options.sendInvite]
 * @param {string} [options.siteUrl]
 * @param {object} [deps] - injectable dependencies (tests)
 * @returns {Promise<{ employee: object, created: boolean, tempPassword: string|null }>}
 */
export async function inviteEmployee(adminSupabase, options, deps = {}) {
  const {
    email,
    fullName = '',
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
    .select(EMPLOYEE_SELECT)
    .eq('email', emailLower)
    .maybeSingle();

  let employee;
  let created = false;
  let tempPassword = null;
  let resumedPendingInvite = false;

  if (existingProfile) {
    if (existingProfile.role === 'admin') {
      throw new InviteError(`${emailLower} is already an employee with full access`, 409);
    }

    // Existing LoveLab user (an agent, an assistant, a member) — give them
    // full access. Whatever else they are stays as it is.
    const nameUpdate = fullName?.trim() ? { full_name: fullName.trim() } : {};
    const { data, error } = await adminSupabase
      .from('profiles')
      .update({ role: 'admin', ...nameUpdate })
      .eq('id', existingProfile.id)
      .select(EMPLOYEE_SELECT)
      .single();
    if (error) {
      console.error('[inviteEmployee] Update error:', error.message);
      throw new InviteError('Failed to update profile', 500);
    }
    employee = data;

    try {
      await d.grantAccess(adminSupabase, emailLower);
    } catch (grantErr) {
      console.error('[inviteEmployee] grantAccess error (non-blocking):', grantErr.message);
    }

    // A profile that never chose its own password is a pending invite (or an
    // earlier attempt that failed halfway). Finish the welcome flow with a
    // fresh temporary password rather than sending the password-less email.
    if (existingProfile.has_password_set === false) {
      tempPassword = await rotateTempPassword(adminSupabase, d, {
        userId: existingProfile.id,
        fullName: fullName || existingProfile.full_name,
      });
      resumedPendingInvite = true;
    }
  } else {
    // New user — allowlist + auth account with a temp password.
    try {
      await d.grantAccess(adminSupabase, emailLower);
    } catch (grantErr) {
      console.error('[inviteEmployee] grantAccess error (non-blocking):', grantErr.message);
    }

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
      console.warn('[inviteEmployee] Auth user lookup warning:', lookupErr.message);
    }

    if (authUser) {
      tempPassword = await rotateTempPassword(adminSupabase, d, {
        userId: authUser.id,
        fullName,
        existingMetadata: authUser.user_metadata,
      });
    } else {
      tempPassword = d.generateTempPassword(fullName);
      const { data: createData, error: createErr } = await adminSupabase.auth.admin.createUser({
        email: emailLower,
        password: tempPassword,
        email_confirm: true,
        user_metadata: markedMetadata({ full_name: fullName?.trim() || '' }, fullName),
      });
      if (createErr || !createData?.user) {
        console.error('[inviteEmployee] Could not create auth user:', createErr?.message);
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
          role: 'admin',
          has_password_set: false,
        },
        { onConflict: 'id' }
      )
      .select(EMPLOYEE_SELECT)
      .single();
    if (error) {
      console.error('[inviteEmployee] Profile upsert error:', error.message);
      throw new InviteError('Failed to create the employee profile', 500);
    }
    employee = data;
    created = true;
  }

  if (sendInvite) {
    const name = fullName?.trim() || employee?.full_name || emailLower;
    try {
      const { subject, html } = (created || resumedPendingInvite)
        ? welcomeEmployeeWithPasswordEmail(name, emailLower, tempPassword, `${siteUrl}/login`, siteUrl)
        : upgradeEmployeeEmail(name, siteUrl);
      await d.sendEmail({ to: emailLower, subject, html });
    } catch (emailErr) {
      if (created) {
        // A brand-new invitee who never receives the temp password is locked
        // out — surface the failure so the admin can hit "Resend invite".
        throw new InviteError(`Employee created but the invite email failed: ${emailErr.message}`, 502);
      }
      console.error('[inviteEmployee] Upgrade email failed (non-blocking):', emailErr.message);
    }
  }

  return { employee, created, tempPassword };
}

/**
 * Send a fresh temporary password to an employee. Unlike the agent resend
 * this also works after they chose a password: it is the "reset password"
 * button too. The profile goes back to has_password_set = false and the auth
 * user gets the mark again, so the next login forces a new password.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {object} options
 * @param {object} options.profile - target profile row (id, email, full_name)
 * @param {string} [options.siteUrl]
 * @param {object} [deps]
 */
export async function resendEmployeeInvite(adminSupabase, options, deps = {}) {
  const {
    profile,
    siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://b2b.love-lab.com',
  } = options;

  if (!profile?.id || !profile?.email) {
    throw new InviteError('Missing target profile', 400);
  }

  const d = await resolveDeps(deps);
  const emailLower = normalizeEmail(profile.email);

  let existingMetadata;
  try {
    const { data } = await adminSupabase.auth.admin.getUserById(profile.id);
    existingMetadata = data?.user?.user_metadata;
  } catch {
    existingMetadata = undefined;
  }

  const tempPassword = await rotateTempPassword(adminSupabase, d, {
    userId: profile.id,
    fullName: profile.full_name,
    existingMetadata,
  });

  const { error } = await adminSupabase
    .from('profiles')
    .update({ has_password_set: false })
    .eq('id', profile.id);
  if (error) {
    console.error('[resendEmployeeInvite] Profile update error:', error.message);
    throw new InviteError('Failed to mark the account as awaiting a password', 500);
  }

  const name = profile.full_name?.trim() || emailLower;
  const { subject, html } = welcomeEmployeeWithPasswordEmail(name, emailLower, tempPassword, `${siteUrl}/login`, siteUrl);
  await d.sendEmail({ to: emailLower, subject, html });

  return { ok: true };
}

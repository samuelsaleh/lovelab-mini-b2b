import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/send-email';

/**
 * Generate a Supabase magic-link or recovery URL and send it via Resend with
 * a LoveLab-branded HTML template.
 *
 * Why this helper exists:
 *   Supabase ships built-in magic-link / recovery emails, but they look like
 *   a generic developer template and come from `noreply@mail.app.supabase.io`
 *   — confusing for non-technical agents who expect "LoveLab" in the From.
 *   The pattern below has been used in production for agent invites since
 *   Phase 2 (see app/api/agents/route.js): generate the link without sending
 *   an email, then ship our own branded version through Resend.
 *
 * Why the email carries OUR callback URL and not Supabase's `action_link`:
 *   `action_link` points at `<project>.supabase.co/auth/v1/verify?...`. After
 *   verifying, Supabase redirects to `redirectTo` with the session in the URL
 *   *fragment* (`#access_token=...`). Fragments never reach the server, so
 *   /auth/callback saw neither `code` nor `token_hash` and bounced the user
 *   to `/login?error=auth_error` — the "I click the link and nothing happens"
 *   bug. On top of that the browser client runs in PKCE mode and refuses to
 *   consume an implicit-grant fragment ("Not a valid PKCE flow url").
 *
 *   Instead we take `hashed_token` from the same generateLink response and
 *   build `<site>/auth/callback?token_hash=...&type=...&next=...`. The
 *   callback then calls `verifyOtp({ token_hash, type })` server-side, gets a
 *   real session cookie, and redirects to `next`. This is the pattern Supabase
 *   documents for server-side rendering, and it has the bonus of not depending
 *   on the dashboard's Redirect URL allow-list.
 *
 * Always returns — never throws — so callers can stay simple. On any failure
 * the caller should still respond 200 to the end user (don't leak account
 * existence) but inspect `ok`/`reason` for logging or dev debug output.
 *
 * @param {object} args
 * @param {'magiclink'|'recovery'|'invite'} args.type
 * @param {string} args.email                     - Already normalized (lowercase, trimmed)
 * @param {string} [args.fullName]                - For greeting + auth user metadata
 * @param {string} args.redirectPath              - Path appended to siteUrl, e.g. '/auth/callback?next=/reset-password'
 * @param {(name: string, actionLink: string, siteUrl: string) => { subject: string, html: string }} args.buildEmail
 *   Template builder — caller picks magicLinkEmail, resetPasswordEmail, etc.
 * @param {string} args.siteUrl                   - Origin used in the action link
 * @param {number} [args.timeoutMs=8000]          - Resend send timeout
 *
 * @returns {Promise<{ ok: boolean, reason?: string, message_id?: string }>}
 */
/**
 * Build the link that goes in the email: our own /auth/callback with the
 * token_hash + type that `verifyOtp` needs, keeping any existing query string
 * on `redirectPath` (e.g. `?next=/reset-password`) intact.
 *
 * generateLink's `type` values ('magiclink' | 'recovery' | 'invite') are all
 * valid `verifyOtp` email OTP types, so they pass through unchanged.
 */
export function buildCallbackLink({ siteUrl, redirectPath, hashedToken, type }) {
  const separator = redirectPath.includes('?') ? '&' : '?';
  return (
    `${siteUrl}${redirectPath}${separator}` +
    `token_hash=${encodeURIComponent(hashedToken)}&type=${encodeURIComponent(type)}`
  );
}

export async function sendBrandedAuthLink({
  type,
  email,
  fullName,
  redirectPath,
  buildEmail,
  siteUrl,
  timeoutMs = 8000,
}) {
  if (!type || !email || !redirectPath || !buildEmail || !siteUrl) {
    return { ok: false, reason: 'invalid_args' };
  }

  let actionLink;
  try {
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase.auth.admin.generateLink({
      type,
      email,
      options: {
        redirectTo: `${siteUrl}${redirectPath}`,
        data: { full_name: fullName || '' },
      },
    });
    if (error) {
      console.error(`[sendBrandedAuthLink:${type}] generateLink error:`, error.message);
      return { ok: false, reason: 'generate_link_failed' };
    }
    const hashedToken = data?.properties?.hashed_token;
    if (!hashedToken) {
      console.error(`[sendBrandedAuthLink:${type}] no hashed_token in response`);
      return { ok: false, reason: 'no_hashed_token' };
    }
    actionLink = buildCallbackLink({ siteUrl, redirectPath, hashedToken, type });
  } catch (err) {
    console.error(`[sendBrandedAuthLink:${type}] generateLink threw:`, err?.message || err);
    return { ok: false, reason: 'generate_link_threw' };
  }

  const displayName = (fullName || email || '').trim();
  const { subject, html } = buildEmail(displayName, actionLink, siteUrl);

  // Bound the Resend HTTP call so a slow upstream doesn't stall the API
  // route response. Mirrors the 8s pattern proven in /api/signup-request.
  // The signal is forwarded into sendEmail → fetch — without that wiring the
  // timeout was a no-op and a hung Resend call would block until Vercel killed
  // the function (60s+).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await sendEmail({ to: email, subject, html, signal: controller.signal });
    if (!result?.sent) {
      // sendEmail surfaces aborts as { reason: 'aborted' } now — upgrade that
      // to the more descriptive 'send_timeout' for log clarity.
      const reason = result?.reason === 'aborted' ? 'send_timeout' : (result?.reason || 'send_failed');
      console.error(`[sendBrandedAuthLink:${type}] sendEmail not sent:`, reason);
      return { ok: false, reason };
    }
    return { ok: true, message_id: result.message_id };
  } catch (err) {
    // Belt-and-braces: sendEmail itself catches AbortError, but if anything
    // upstream of fetch throws synchronously we still want a clean response.
    if (err?.name === 'AbortError') {
      console.error(`[sendBrandedAuthLink:${type}] sendEmail timed out after ${timeoutMs}ms`);
      return { ok: false, reason: 'send_timeout' };
    }
    console.error(`[sendBrandedAuthLink:${type}] sendEmail threw:`, err?.message || err);
    return { ok: false, reason: 'send_threw' };
  } finally {
    clearTimeout(timer);
  }
}

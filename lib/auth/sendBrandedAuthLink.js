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
    actionLink = data?.properties?.action_link;
    if (!actionLink) {
      console.error(`[sendBrandedAuthLink:${type}] no action_link in response`);
      return { ok: false, reason: 'no_action_link' };
    }
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

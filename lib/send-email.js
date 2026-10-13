import { getSenderFrom } from '@/lib/email';
import { resendPacer } from '@/lib/resendPacer';

/**
 * Send an email via Resend.
 *
 * @param {object} args
 * @param {string|string[]} args.to       — single recipient or list
 * @param {string}          args.subject
 * @param {string}          args.html
 * @param {string}          [args.from]
 * @param {string}          [args.replyTo]
 * @param {string|string[]} [args.cc]     — optional carbon-copy recipient(s)
 * @param {string|string[]} [args.bcc]    — optional blind carbon-copy recipient(s)
 * @param {Array<{ filename: string, content: Buffer | string }>} [args.attachments]
 *        Optional attachments. `content` accepts a Node Buffer (preferred) or
 *        a base64-encoded string. Resend caps attachments at ~40 MB total.
 * @param {AbortSignal}     [args.signal]  — optional abort signal forwarded to
 *        the underlying `fetch`. When the signal aborts, the call returns
 *        `{ sent: false, reason: 'aborted' }` instead of throwing, so callers
 *        can short-circuit slow Resend responses without a try/catch.
 *
 * @param {string}          [args.idempotencyKey] — sent as Resend's Idempotency-Key header (kept 24 h):
 *        a retry with the same key and body returns the first result instead of sending again.
 * @param {number}          [args.maxAttempts=4] — tries on a rate limit (429), a Resend 5xx or a network error.
 *
 * Every send waits for its slot in the shared pacer (lib/resendPacer.js). A 429 is either a RATE limit
 * (wait, retry) or a QUOTA (daily/monthly; waiting does not help, so it is not retried).
 *
 * @returns {Promise<{ sent: boolean, reason?: string, status?: number, message_id?: string, retryable?: boolean, retryAfterMs?: number }>}
 */
export async function sendEmail({ to, subject, html, from, replyTo, cc, bcc, attachments, signal, idempotencyKey, maxAttempts = 4 }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };

  const recipients = Array.isArray(to) ? to : [to];

  const payload = {
    from: from || getSenderFrom(),
    to: recipients,
    subject,
    html,
  };
  if (replyTo) payload.reply_to = replyTo;
  if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
  if (bcc) payload.bcc = Array.isArray(bcc) ? bcc : [bcc];

  if (Array.isArray(attachments) && attachments.length) {
    payload.attachments = attachments.map((a) => {
      const content = Buffer.isBuffer(a.content)
        ? a.content.toString('base64')
        : a.content; // already base64 string
      return { filename: a.filename, content };
    });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
  const body = JSON.stringify(payload);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await resendPacer.wait();

    let res;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body,
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      // Distinguish caller-initiated aborts from genuine network failures so
      // upstream code can surface a "took too long" message instead of "network
      // error" — the former is actionable (retry), the latter often is not.
      if (err?.name === 'AbortError') {
        return { sent: false, reason: 'aborted' };
      }
      console.error('[sendEmail] Network error:', err.message);
      if (attempt >= maxAttempts) return { sent: false, reason: 'network_error', error: err.message, retryable: true };
      await sleep(backoffMs(attempt));    // safe to retry: the idempotency key stops a double send
      continue;
    }

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { sent: true, message_id: data?.id || null };
    }

    const text = await res.text().catch(() => '');
    const name = errorName(text);

    // A QUOTA 429 (daily on the free plan, monthly otherwise) does not clear by waiting.
    if (res.status === 429 && /quota/i.test(name)) {
      console.error('[sendEmail] Resend quota reached:', name);
      return { sent: false, reason: 'quota_exceeded', status: 429, error: text, retryable: false };
    }

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      const wait = retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : backoffMs(attempt);
      resendPacer.pushBack(wait);                       // everyone else waits too
      if (attempt >= maxAttempts) {
        console.error('[sendEmail] Resend still refusing after', attempt, 'tries:', res.status);
        return { sent: false, reason: res.status === 429 ? 'rate_limited' : 'resend_error', status: res.status, error: text, retryable: true, retryAfterMs: wait };
      }
      await sleep(wait);
      continue;
    }

    console.error('[sendEmail] Resend error:', res.status, text);
    return { sent: false, reason: 'resend_error', status: res.status, error: text };
  }
  return { sent: false, reason: 'resend_error', retryable: true };   // unreachable: the loop always returns
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoffMs = (attempt) => 1000 * 2 ** (attempt - 1);          // 1 s, 2 s, 4 s
function errorName(text) {
  try { return String(JSON.parse(text)?.name || ''); } catch { return ''; }
}

import { resendPacer } from '@/lib/resendPacer'

/**
 * Drop-in for `fetch('https://api.resend.com/emails', init)` used by routes that
 * build their own request (alerts, backups, signup mails, documents).
 *
 * Same rule as lib/send-email.js: every send waits for its slot in the shared
 * pacer (never more than 3 per second), and a Resend rate limit (429) or 5xx is
 * retried with Retry-After. A QUOTA 429 (daily/monthly) is not retried.
 * Returns the last Response, so callers keep their own `res.ok` handling.
 */
export async function resendFetch(init, { maxAttempts = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let res
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await resendPacer.wait()
    res = await fetch('https://api.resend.com/emails', init)
    if (res.ok || (res.status !== 429 && res.status < 500)) return res
    if (res.status === 429) {
      const text = await res.clone().text().catch(() => '')
      if (/quota/i.test(text)) return res
    }
    if (attempt === maxAttempts) return res
    const wait = Number(res.headers?.get?.('retry-after')) * 1000 || 1000 * 2 ** (attempt - 1)
    resendPacer.pushBack(wait)
    await sleep(wait)
  }
  return res
}

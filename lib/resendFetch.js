import { resendPacer } from '@/lib/resendPacer'

/**
 * Drop-in for `fetch('https://api.resend.com/emails', init)` used by routes that
 * build their own request (alerts, backups, signup mails, documents).
 *
 * Same rule as lib/send-email.js: every send waits for its slot in the shared
 * pacer (never more than 3 per second), and a Resend rate limit (429) is retried
 * with Retry-After. A QUOTA 429 (daily/monthly) is not retried. A 5xx is retried
 * only when the request carries an Idempotency-Key: without one the mail may
 * already have gone out and a retry would send it twice.
 * Returns the last Response, so callers keep their own `res.ok` handling.
 */
export async function resendFetch(init, { maxAttempts = 3, timeoutMs = 0, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let res
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await resendPacer.wait()
    // The timeout starts AFTER the wait for the pacer slot, so a busy queue cannot use it up.
    const controller = timeoutMs ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    try {
      res = await fetch('https://api.resend.com/emails', controller ? { ...init, signal: controller.signal } : init)
    } finally {
      if (timer) clearTimeout(timer)
    }
    const hasKey = Boolean(init?.headers && (init.headers['Idempotency-Key'] || init.headers['idempotency-key']))
    if (res.ok || (res.status !== 429 && !(res.status >= 500 && hasKey))) return res
    if (res.status === 429) {
      const text = await res.clone().text().catch(() => '')
      if (/quota/i.test(text)) return res
    }
    if (attempt === maxAttempts) return res
    const retryAfter = Number(res.headers?.get?.('retry-after'))
    const wait = (retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * 2 ** (attempt - 1))   // capped: a huge Retry-After must not freeze every sender
    resendPacer.pushBack(wait)
    await sleep(wait)
  }
  return res
}

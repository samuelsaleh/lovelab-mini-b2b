/**
 * The pacing queue behind every Resend send: one send STARTS every 1/N second,
 * shared by whoever asks. Rule (Rafi, 13 Oct 2026): never faster than
 * 3 mails per second. Resend allows 10 requests/second per team, shared by
 * orders, alerts and price lists too; the fair send ran 8 in parallel and got
 * HTTP 429 on 9 Sept 2026.
 *
 * A slot is reserved BEFORE sleeping, so concurrent callers can never pick the
 * same one. The queue lives in this Node process: if the server runs several
 * processes, set RESEND_MAX_PER_SECOND to 3 divided by the number of processes.
 */
export function createPacer({ perSecond, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let rate = perSecond
  let nextSlot = 0
  return {
    configure({ perSecond: next }) { rate = next; nextSlot = 0 },
    get perSecond() { return rate },
    async wait() {
      if (!Number.isFinite(rate) || rate <= 0) return          // unlimited: tests, local dev
      const gap = 1000 / rate
      const t = now()
      const slot = Math.max(t, nextSlot)
      nextSlot = slot + gap
      if (slot > t) await sleep(slot - t)
    },
    /** Resend said "slow down": nobody starts a send for `ms`. */
    pushBack(ms) { nextSlot = Math.max(nextSlot, now() + ms) },
  }
}

/** 3 per second unless the server says otherwise; unlimited under jest unless a test sets it. */
export function defaultPerSecond(env = process.env) {
  const n = Number(env.RESEND_MAX_PER_SECOND)
  if (n > 0) return n
  if (env.NODE_ENV === 'test') return Infinity
  return 3
}

export const resendPacer = createPacer({ perSecond: defaultPerSecond() })

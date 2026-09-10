/**
 * Date handling for the IGI certificate module.
 *
 * Everything here exists because Vercel runs in UTC and LoveLab and IGI are in
 * Antwerp. After 22:00 Brussels in summer, `new Date().toISOString().slice(0,10)`
 * already reads as tomorrow — which would file a movement on the wrong day and
 * split a nightly snapshot across two dates. Nothing else in this module may
 * compute a business date; it all comes through here.
 */

const ZONE = 'Europe/Brussels'

/** Today's business day in Antwerp, as 'YYYY-MM-DD'. */
export function brusselsToday(now = new Date()) {
  return brusselsDate(now)
}

/** The Antwerp calendar day of an instant, as 'YYYY-MM-DD'. */
export function brusselsDate(instant) {
  const d = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(d.getTime())) return null
  // 'en-CA' formats as YYYY-MM-DD, which is what we store.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** '2026-08-27' -> '27/08/2026'. The format both companies already read. */
export function formatDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).split('-')
  return y && m && d ? `${d}/${m}/${y}` : String(iso)
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** '2026-08-27' -> 'August 2026'. */
export function formatMonth(iso) {
  if (!iso) return 'Unknown'
  const [y, m] = String(iso).split('-')
  const name = MONTHS[Number(m) - 1]
  return name ? `${name} ${y}` : 'Unknown'
}

/** The 'YYYY-MM' a date falls in. */
export function monthKey(iso) {
  return iso ? String(iso).slice(0, 7) : null
}

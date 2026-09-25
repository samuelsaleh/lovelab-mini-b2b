const eur0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('en-GB')

/** €82,760 — whole euros for headlines and charts. */
export const euro = (v) => eur0.format(Math.round(Number(v) || 0))
/** €82,760.40 — cents, for the tables that must add up. */
export const euroCents = (v) => eur2.format(Number(v) || 0)
export const count = (v) => int.format(Number(v) || 0)

/**
 * Money leaving LoveLab (agent commission) — always shown with a minus sign so
 * no reader mistakes it for income. Zero shows as a dash.
 */
export const cost = (v) => (Number(v) ? `−${eur0.format(Math.round(Math.abs(Number(v))))}` : '—')
export const costCents = (v) => (Number(v) ? `−${eur2.format(Math.abs(Number(v)))}` : '—')
export const pct = (v) => `${(Number(v) || 0).toFixed(1).replace(/\.0$/, '')}%`

/** +12.4% / −3% / — (no base month to compare with). */
export function change(v) {
  if (v === null || v === undefined) return '—'
  const s = Math.abs(v).toFixed(1).replace(/\.0$/, '')
  return v > 0 ? `+${s}%` : v < 0 ? `−${s}%` : '0%'
}

/** €82.8k — compact, for chart axes and bar-end labels. */
export function euroShort(v) {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1e6) return `€${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1e3) return `€${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k`
  return `€${Math.round(n)}`
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 6–8 Aug 2026, from two ISO dates. */
export function dateRange(start, end) {
  const fmt = (d, withYear) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
  if (!start) return '—'
  if (!end || end === start) return fmt(start, true)
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))}–${fmt(end, true)}`
  return `${fmt(start, false)} – ${fmt(end, true)}`
}

export const AMOUNT_BASIS_LABEL = {
  net_ex_vat: 'excl. VAT and shipping',
  as_recorded: 'as recorded in the app (may include VAT)',
}

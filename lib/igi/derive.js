/**
 * Every number the certificate module displays, derived from the movements.
 *
 * Nothing here touches the database. These are pure functions over plain arrays
 * so the arithmetic that both companies will argue over is unit-testable.
 *
 * The shapes come straight from the tables:
 *   model  { id, serial, name, carat, shape, stones, state, shelf_min, pool_min }
 *   batch  { model_id, qty }
 *   line   { model_id, qty_requested, qty_issued, qty_received, visit_id }
 *   visit  { id, visit_no, visit_date, status, unattributed_total, date_suspect }
 */

import { formatMonth, monthKey } from './dates'

/** €1,20 per certificate, the agreed IGI fee. */
export const FEE_EUR = 1.2

// ── Stock ───────────────────────────────────────────────────────────────────

/**
 * What IGI still holds for a model: everything they ever produced, less
 * everything they have issued. Stock drops when IGI *issues*, not when LoveLab
 * asks and not when LoveLab receives — the certificate has left their stock the
 * moment they attach it.
 */
export function poolOf(modelId, batches, lines) {
  const made = sum(batches.filter((b) => b.model_id === modelId), (b) => b.qty)
  const issued = sum(
    lines.filter((l) => l.model_id === modelId && l.qty_issued != null),
    (l) => l.qty_issued,
  )
  return made - issued
}

/**
 * What sits on LoveLab's shelf: the most recent nightly snapshot.
 *
 * Returns null when no snapshot has ever carried this model — that is "not
 * mapped yet", which is a different thing from zero and must read differently.
 */
export function shelfOf(modelId, snapshots) {
  const rows = snapshots.filter((s) => s.model_id === modelId)
  if (!rows.length) return null
  const latest = rows.reduce((a, b) => (a.snapshot_date >= b.snapshot_date ? a : b))
  return latest.total_pcs
}

/**
 * The only LoveLab-side figure IGI is ever shown: how many of each model
 * LoveLab is asking for in open requests right now. It is their order book and
 * it reveals nothing about how fast anything sells.
 */
export function askedRightNow(modelId, lines, visits) {
  const open = new Set(visits.filter((v) => v.status === 'requested').map((v) => v.id))
  return sum(
    lines.filter((l) => l.model_id === modelId && open.has(l.visit_id)),
    (l) => l.qty_requested,
  )
}

// ── Alerts. Two rules, one owner each. Plain numbers, no forecasting. ────────

/** LoveLab's rule, on their own shelf. Below the level means walk across the road. */
export function shelfStatus(model, shelf) {
  if (shelf == null) return 'unmapped'
  const min = model.shelf_min ?? 25
  if (shelf < min) return 'collect'
  if (shelf < min * 2) return 'watch'
  return 'fine'
}

/** IGI's rule, on their own stock. Below the level means produce more. */
export function poolStatus(model, pool) {
  if (pool == null) return 'unknown'
  const min = model.pool_min
  if (min == null) return 'fine'
  if (pool < min) return 'reorder'
  if (pool < min * 2) return 'watch'
  return 'fine'
}

export const SHELF_LABELS = {
  collect: 'Go collect', watch: 'Watch', fine: 'Fine', unmapped: 'Not mapped',
}
export const POOL_LABELS = {
  reorder: 'Produce more', watch: 'Watch', fine: 'Fine', unknown: 'No count yet',
}

// ── Shortage ────────────────────────────────────────────────────────────────

/**
 * Lines on a request asking for more than IGI holds. Nobody should walk across
 * the road expecting 500 and come back with 41.
 */
export function shortOf(visit, lines, holdings) {
  return lines
    .filter((l) => l.visit_id === visit.id)
    .map((l) => {
      const held = holdings[l.model_id]
      if (held == null || l.qty_requested <= held) return null
      return { model_id: l.model_id, asked: l.qty_requested, held, gap: l.qty_requested - held }
    })
    .filter(Boolean)
}

// ── Dates and periods ───────────────────────────────────────────────────────

/**
 * The month a movement belongs to.
 *
 * Four movements in IGI's file carry a mistyped year (2016, 2024, 2014, 2022).
 * Rather than correct the source, a flagged visit inherits the month of the
 * most recent sound visit before it — which is where it actually happened.
 * `visits` must be in visit_no order.
 */
export function monthOf(visit, visits) {
  const i = visits.findIndex((v) => v.visit_no === visit.visit_no)
  for (let k = i; k >= 0; k--) {
    if (!visits[k].date_suspect) return formatMonth(visits[k].visit_date)
  }
  return 'Unknown'
}

/** '2 of 2' when several movements share a day. Empty when only one did. */
export function sameDayLabel(visit, visits) {
  const same = visits.filter((v) => v.visit_date === visit.visit_date)
  if (same.length < 2) return ''
  return `${same.findIndex((v) => v.visit_no === visit.visit_no) + 1} of ${same.length}`
}

/** 'V-018'. */
export function visitRef(visit) {
  return `V-${String(visit.visit_no).padStart(3, '0')}`
}

// ── Totals ──────────────────────────────────────────────────────────────────

/**
 * Certificates a visit accounts for. An imported movement with no model detail
 * contributes its total but no per-model figure — that is how the 3 245 stay
 * countable without being attributed to a model that did not earn them.
 */
export function visitTotal(visit, lines) {
  if (visit.unattributed_total != null) return visit.unattributed_total
  return sum(
    lines.filter((l) => l.visit_id === visit.id),
    (l) => l.qty_received ?? l.qty_issued ?? l.qty_requested,
  )
}

/** Certificates issued in a period with no model attached. The visible gap. */
export function unattributedTotal(visits) {
  return sum(visits.filter((v) => v.unattributed_total != null), (v) => v.unattributed_total)
}

/** Issued × €1,20, rounded to the cent. */
export function feeFor(qty) {
  return Math.round(qty * FEE_EUR * 100) / 100
}

/**
 * A month's invoice, model by model, plus the unattributed line kept separate
 * so it can never be silently folded into a model's figure.
 */
export function invoiceForMonth(month, visits, lines) {
  const inMonth = visits.filter((v) => monthKey(v.visit_date) === month && v.status === 'closed')
  const ids = new Set(inMonth.map((v) => v.id))
  const byModel = new Map()
  for (const l of lines) {
    if (!ids.has(l.visit_id)) continue
    const qty = l.qty_received ?? l.qty_issued
    if (qty == null) continue
    byModel.set(l.model_id, (byModel.get(l.model_id) || 0) + qty)
  }
  const rows = [...byModel.entries()]
    .map(([model_id, qty]) => ({ model_id, qty, eur: feeFor(qty) }))
    .sort((a, b) => b.qty - a.qty)
  const unattributed = unattributedTotal(inMonth)
  const qty = sum(rows, (r) => r.qty) + unattributed
  return { month, rows, unattributed, qty, eur: feeFor(qty) }
}

// ── Presentation ────────────────────────────────────────────────────────────

/** '0,10' — comma decimal, the way both companies write carats. */
export function formatCarat(carat) {
  return carat == null ? '—' : Number(carat).toFixed(2).replace('.', ',')
}

/**
 * Thousands separator: U+202F narrow no-break space, the Belgian convention both
 * companies already read on their invoices. Named rather than typed literally so
 * it cannot be silently replaced by a plain space in an edit.
 */
export const THIN_SPACE = '\u202f'

/** '1 006'. */
export function formatQty(n) {
  return n == null ? '—' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE)
}

/** '€ 1 207,20'. */
export function formatEur(n) {
  if (n == null) return '—'
  const [whole, cents] = Math.abs(n).toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE)
  return `${n < 0 ? '-' : ''}€ ${grouped},${cents}`
}

/**
 * The specification that must travel with every serial.
 *
 * LGAJ6529 and LGAJ6530 look nearly identical, are printed very small, and
 * somebody is handling three hundred cards at a time. A serial on its own is
 * not enough to tell them apart, so it is never shown on its own.
 */
export function modelSpec(model) {
  return [
    model.stones ? `${model.stones} st` : null,
    model.carat != null ? `${formatCarat(model.carat)} ct` : null,
    model.shape,
  ].filter(Boolean).join(' · ')
}

function sum(rows, pick) {
  return rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0)
}

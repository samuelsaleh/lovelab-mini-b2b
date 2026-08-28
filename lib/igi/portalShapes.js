/**
 * The shapes IGI's screens are allowed to receive.
 *
 * Written down in one place, and asserted by lib/__tests__/igi-portal-serialize.test.js,
 * so that the day somebody widens a shared select the test fails rather than a
 * shelf figure quietly reaching another company.
 *
 * What IGI may see:
 *   their own stock, the requests addressed to them, what is asked right now,
 *   their batches, their history, their invoices.
 *
 * What they may never see:
 *   LoveLab's shelf, how fast it empties, LoveLab's alert levels, the reserved
 *   serials, or the matching table.
 */

/** Fields that must never appear in anything sent to IGI. */
export const FORBIDDEN_TO_IGI = [
  'shelf',
  'shelf_min',
  'snapshot',
  'consumption',
  'to_collect',
  'on_shelf',
]

/** A model as IGI sees it: identity, their stock, their alert level. */
export function toIgiModel(model, { pool, askedNow }) {
  return {
    id: model.id,
    serial: model.serial,
    name: model.name,
    stones: model.stones,
    carat: model.carat,
    shape: model.shape,
    spec: model.spec,
    pool,
    pool_min: model.pool_min ?? null,
    asked_now: askedNow,
  }
}

/** A line on a request, as IGI sees it. */
export function toIgiLine(line, model, held) {
  return {
    id: line.id,
    model_id: line.model_id,
    serial: model?.serial ?? null,
    name: model?.name ?? 'Unknown model',
    stones: model?.stones ?? null,
    carat: model?.carat ?? null,
    shape: model?.shape ?? null,
    qty_requested: line.qty_requested,
    qty_issued: line.qty_issued,
    held,
    short_by: Math.max(0, line.qty_requested - (held ?? 0)),
  }
}

/** A movement, as IGI sees it. */
export function toIgiVisit(visit, lines) {
  return {
    id: visit.id,
    visit_no: visit.visit_no,
    visit_date: visit.visit_date,
    status: visit.status,
    date_suspect: visit.date_suspect,
    unattributed_total: visit.unattributed_total,
    lines,
  }
}

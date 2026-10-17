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
 *   LoveLab's shelf, how fast it empties, LoveLab's shelf level, the reserved
 *   serials, or the matching table.
 *
 * What they do see, since 16 Sept 2026: the level LoveLab want them to hold
 * (igi_models.order_min, "level" on the wire). LoveLab are the customer; the
 * minimum IGI must hold is LoveLab's decision and IGI's job is to see it.
 */

/** Fields that must never appear in anything sent to IGI. */
export const FORBIDDEN_TO_IGI = [
  'shelf',
  'shelf_min',
  'alerted_at',
  'snapshot',
  'consumption',
  'to_collect',
  'on_shelf',
  // Whether LoveLab's email to IGI went out is LoveLab's bookkeeping.
  'notified_at',
  'notify_error',
]

/** A model as IGI sees it: identity, their stock, the level LoveLab want. */
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
    level: model.order_min ?? null,
    asked_now: askedNow,
  }
}

/** A correction IGI made to their own count: what the app said, what they hold. */
export function toIgiCount(count, model) {
  return {
    id: count.id,
    model_id: count.model_id,
    serial: model?.serial ?? null,
    name: model?.name ?? 'Unknown model',
    was: count.was,
    counted: count.counted,
    delta: count.delta,
    note: count.note ?? null,
    counted_at: count.counted_at,
  }
}

/** A model LoveLab added that is waiting for IGI to give it a serial. */
export function toIgiNewModel(model) {
  return {
    id: model.id,
    name: model.name,
    stones: model.stones,
    carat: model.carat,
    shape: model.shape,
    spec: model.spec,
    requested_at: model.requested_at ?? null,
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
    spec: model?.spec ?? null,
    qty_requested: line.qty_requested,
    qty_issued: line.qty_issued,
    held,
    short_by: Math.max(0, line.qty_requested - (held ?? 0)),
  }
}

/**
 * A problem IGI reported on a request, as IGI see it: their note, what they
 * suggested beside what was asked, and LoveLab's answer once there is one.
 */
export function toIgiProblem(problem, changes) {
  if (!problem) return null
  return {
    id: problem.id,
    note: problem.note,
    reported_at: problem.reported_at,
    changes: (changes || []).map((c) => ({
      model_id: c.model_id,
      serial: c.serial,
      name: c.name,
      stones: c.stones,
      carat: c.carat,
      shape: c.shape,
      spec: c.spec,
      from: c.from,
      to: c.to,
    })),
    resolution: problem.resolution ?? null,
    reply: problem.reply ?? null,
    resolved_at: problem.resolved_at ?? null,
  }
}

/** A model IGI may suggest adding to a request: identity only. */
export function toIgiCatalogueEntry(model) {
  return {
    id: model.id,
    serial: model.serial,
    name: model.name,
    stones: model.stones,
    carat: model.carat,
    shape: model.shape,
    spec: model.spec,
  }
}

/** A movement, as IGI sees it. */
export function toIgiVisit(visit, lines, problem = null) {
  return {
    id: visit.id,
    visit_no: visit.visit_no,
    visit_date: visit.visit_date,
    status: visit.status,
    date_suspect: visit.date_suspect,
    correction: Boolean(visit.correction),
    unattributed_total: visit.unattributed_total,
    lines,
    problem,
  }
}

/**
 * The four payloads IGI's screens receive, built once.
 *
 * These are pure functions over the world that loadIgiWorld returns, and they
 * exist because two callers now need byte-identical answers:
 *
 *   /api/igi-portal/*      — IGI themselves, reading as their own user so row
 *                            level security stands between the companies.
 *   /api/igi/preview/*     — a LoveLab admin looking at IGI's screens, reading
 *                            as the service role.
 *
 * A LoveLab admin needs to see what they are asking of another company, both
 * before handing over a login and afterwards when something is queried. That is
 * only worth anything if it is the same view — so it is the same function, not
 * a second query that resembles it today and drifts by March.
 *
 * Nothing here touches a database or a client, which is what makes it safe to
 * import from both sides of the wall.
 */

import { toIgiModel, toIgiLine, toIgiVisit } from './portalShapes'
import { visitTotal, invoiceForMonth, FEE_EUR } from './derive'
import { monthKey } from './dates'

/** The requests waiting on IGI — the whole product from where they stand. */
export function todoView(world) {
  const open = world.visits.filter((v) => v.status === 'requested')
  return {
    visits: open.map((v) => toIgiVisit(
      v,
      world.lines
        .filter((l) => l.visit_id === v.id)
        .map((l) => toIgiLine(l, world.modelById.get(l.model_id), world.poolFor(l.model_id))),
    )),
  }
}

/**
 * What IGI hold, model by model, with "asked right now" beside it — their order
 * book, which unlike a shelf figure says nothing about how fast anything sells.
 */
export function stockView(world) {
  return {
    models: world.models.map((m) => toIgiModel(m, {
      pool: world.poolFor(m.id),
      askedNow: world.askedFor(m.id),
    })),
  }
}

/** What has already happened: movements and the batches IGI recorded making. */
export function historyView(world) {
  return {
    visits: world.visits.map((v) => ({
      id: v.id,
      visit_no: v.visit_no,
      visit_date: v.visit_date,
      status: v.status,
      date_suspect: v.date_suspect,
      unattributed_total: v.unattributed_total,
      total: visitTotal(v, world.lines),
      line_count: world.lines.filter((l) => l.visit_id === v.id).length,
    })),
    batches: world.batches
      .map((b) => ({
        ...b,
        serial: world.modelById.get(b.model_id)?.serial ?? null,
        name: world.modelById.get(b.model_id)?.name ?? 'Unknown model',
      }))
      .sort((a, b) => String(b.batch_date).localeCompare(String(a.batch_date))),
  }
}

/**
 * What IGI have issued, by month, at the agreed fee.
 *
 * The movements recorded as a daily total without models get their own line
 * rather than being spread across models that did not earn them.
 */
export function invoicesView(world) {
  const closed = world.visits.filter((v) => v.status === 'closed')
  const months = [...new Set(closed.map((v) => monthKey(v.visit_date)))]
    .filter(Boolean)
    .sort()
    .reverse()

  return {
    fee_eur: FEE_EUR,
    months: months.map((month) => {
      const invoice = invoiceForMonth(month, world.visits, world.lines)
      return {
        ...invoice,
        rows: invoice.rows.map((r) => {
          const model = world.modelById.get(r.model_id)
          return {
            ...r,
            serial: model?.serial ?? null,
            name: model?.name ?? 'Unknown model',
            stones: model?.stones ?? null,
            carat: model?.carat ?? null,
            shape: model?.shape ?? null,
          }
        }),
      }
    }),
  }
}

/** The four screens by the name their route uses. */
export const PORTAL_VIEWS = {
  todo: todoView,
  stock: stockView,
  history: historyView,
  invoices: invoicesView,
}

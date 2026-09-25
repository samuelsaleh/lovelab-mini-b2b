/**
 * The certificate world as the scheduled emails read it.
 *
 * Three reads, each the same shape the screens use, so a mail can never say
 * something the Dashboard would not:
 *
 *   loadModelsWithStatus  every model with shelf, pool and both statuses
 *                         (moved here from levelAlerts.js on 24 Sept 2026)
 *   loadOpenVisits        the movements still moving: waiting on IGI, or
 *                         made and not yet collected, with their lines
 *   loadAwaitingModels    the models LoveLab added that IGI have not numbered
 */
import { poolOf, shelfOf, shelfStatus, orderStatus } from './derive'

/** Reads the models with both figures and both statuses, as the overview does. */
export async function loadModelsWithStatus(adminSupabase) {
  const [models, batches, lines, snapshots, counts, certIns, certOuts] = await Promise.all([
    adminSupabase.from('igi_models')
      .select('id, serial, name, stones, carat, shape, spec, state, shelf_min, shelf_opening, order_min, shelf_alerted_at, order_alerted_at, sort_order, requested_at')
      .order('sort_order', { ascending: true }),
    adminSupabase.from('igi_batches').select('model_id, qty'),
    adminSupabase.from('igi_visit_lines').select('model_id, qty_issued'),
    adminSupabase.from('igi_shelf_snapshots').select('snapshot_date, description, model_id, total_pcs').order('snapshot_date', { ascending: false }).limit(400),
    adminSupabase.from('igi_counts').select('model_id, delta'),
    adminSupabase.from('igi_certificate_in_sync').select('model_id, pcs'),
    adminSupabase.from('igi_certificate_out_sync').select('model_id, pcs'),
  ])
  const firstError = [models, batches, lines, snapshots, counts, certIns, certOuts].find((r) => r.error)?.error
  if (firstError) throw new Error(firstError.message)

  return models.data.map((m) => {
    const pool = m.state === 'in_use' ? poolOf(m.id, batches.data, lines.data, counts.data) : null
    const shelf = shelfOf(m.id, snapshots.data, certIns.data || [], certOuts.data || [], m.shelf_opening)
    return { ...m, pool, shelf, shelf_status: shelfStatus(m, shelf), order_status: orderStatus(m, pool) }
  })
}

/**
 * Movements in status requested or issued, newest first, each with its lines
 * (serial, name, spec, asked, made). `models` is the list from
 * loadModelsWithStatus, so the same figures name the lines.
 */
export async function loadOpenVisits(adminSupabase, models) {
  const { data: visits, error: vErr } = await adminSupabase
    .from('igi_visits')
    .select('id, visit_no, visit_date, status, requested_at, issued_at, correction')
    .in('status', ['requested', 'issued'])
    .order('visit_no', { ascending: false })
  if (vErr) throw new Error(vErr.message)
  if (!visits?.length) return []

  const { data: lines, error: lErr } = await adminSupabase
    .from('igi_visit_lines')
    .select('visit_id, model_id, qty_requested, qty_issued')
    .in('visit_id', visits.map((v) => v.id))
  if (lErr) throw new Error(lErr.message)

  const byId = new Map((models || []).map((m) => [m.id, m]))
  return visits.map((v) => ({
    ...v,
    lines: (lines || []).filter((l) => l.visit_id === v.id).map((l) => {
      const m = byId.get(l.model_id) || {}
      return { ...l, serial: m.serial ?? null, name: m.name ?? 'Unknown model', stones: m.stones ?? null, carat: m.carat ?? null, shape: m.shape ?? null }
    }),
  }))
}

/** The models LoveLab added that still wait for IGI's serial. */
export function awaitingSerial(models) {
  return (models || []).filter((m) => m.state === 'awaiting_serial')
}

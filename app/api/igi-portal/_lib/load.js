import { poolOf, askedRightNow } from '@/lib/igi/derive';

/**
 * The four reads every IGI screen needs, and nothing else.
 *
 * Row level security already hides the reserved serials and every shelf
 * snapshot, so this cannot return them even by mistake — but the select lists
 * are narrow anyway, because two defences are better than one.
 *
 * The state filter below is the third: LoveLab's "IGI's side" preview calls
 * this with the service-role client, which RLS does not constrain, and that
 * preview is only honest if it shows exactly what IGI would see. Filtering here
 * rather than at the call site means the guarantee holds for whoever calls it.
 */
export async function loadIgiWorld(supabase) {
  const [models, batches, lines, visits] = await Promise.all([
    supabase.from('igi_models')
      .select('id, serial, name, stones, carat, shape, spec, state, pool_min, sort_order, requested_at')
      .order('sort_order', { ascending: true }),
    supabase.from('igi_batches').select('id, model_id, qty, batch_date, reference, created_at'),
    supabase.from('igi_visit_lines').select('id, visit_id, model_id, qty_requested, qty_issued'),
    supabase.from('igi_visits')
      .select('id, visit_no, visit_date, status, date_suspect, unattributed_total, issued_at, closed_at')
      .order('visit_no', { ascending: false }),
  ]);

  const firstError = [models, batches, lines, visits].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  // Reserved serials were numbered and never ordered; they belong on no IGI
  // screen. A model still awaiting a serial cannot be produced, so it stays out
  // of the stock and request views — but it IS IGI's job to number it, so the
  // To do gets them separately.
  const inUse = models.data.filter((m) => m.state === 'in_use');
  const awaiting = models.data
    .filter((m) => m.state === 'awaiting_serial')
    .sort((a, b) => String(a.requested_at || '').localeCompare(String(b.requested_at || '')));

  return {
    models: inUse,
    awaiting,
    batches: batches.data,
    lines: lines.data,
    visits: visits.data,
    poolFor: (modelId) => poolOf(modelId, batches.data, lines.data),
    askedFor: (modelId) => askedRightNow(modelId, lines.data, visits.data),
    modelById: new Map(inUse.map((m) => [m.id, m])),
  };
}

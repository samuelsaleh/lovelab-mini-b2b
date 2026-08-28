import { poolOf, askedRightNow } from '@/lib/igi/derive';

/**
 * The four reads every IGI screen needs, and nothing else.
 *
 * Row level security already hides the reserved serials and every shelf
 * snapshot, so this cannot return them even by mistake — but the select lists
 * are narrow anyway, because two defences are better than one.
 */
export async function loadIgiWorld(supabase) {
  const [models, batches, lines, visits] = await Promise.all([
    supabase.from('igi_models')
      .select('id, serial, name, stones, carat, shape, spec, pool_min, sort_order')
      .order('sort_order', { ascending: true }),
    supabase.from('igi_batches').select('id, model_id, qty, batch_date, reference, created_at'),
    supabase.from('igi_visit_lines').select('id, visit_id, model_id, qty_requested, qty_issued'),
    supabase.from('igi_visits')
      .select('id, visit_no, visit_date, status, date_suspect, unattributed_total, issued_at, closed_at')
      .order('visit_no', { ascending: false }),
  ]);

  const firstError = [models, batches, lines, visits].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  return {
    models: models.data,
    batches: batches.data,
    lines: lines.data,
    visits: visits.data,
    poolFor: (modelId) => poolOf(modelId, batches.data, lines.data),
    askedFor: (modelId) => askedRightNow(modelId, lines.data, visits.data),
    modelById: new Map(models.data.map((m) => [m.id, m])),
  };
}

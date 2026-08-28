import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { poolOf } from '@/lib/igi/derive';

/**
 * GET /api/igi/visits/[id] — one movement with its lines.
 *
 * Each line carries what IGI holds right now, so the screen can show a shortage
 * without a second round trip.
 */
export async function GET(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-visit');
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const db = auth.adminSupabase;

    const { data: visit, error: visitErr } = await db
      .from('igi_visits')
      .select('id, visit_no, visit_date, status, unattributed_total, date_suspect, note, requested_at, issued_at, closed_at, created_by, issued_by, received_by')
      .eq('id', id)
      .maybeSingle();

    if (visitErr) return fail('IGI/Visit GET', visitErr, 'Failed to load the movement');
    if (!visit) return NextResponse.json({ error: 'Movement not found' }, { status: 404 });

    const [lines, models, batches, allLines, sameDay] = await Promise.all([
      db.from('igi_visit_lines')
        .select('id, model_id, qty_requested, qty_issued, qty_received')
        .eq('visit_id', id),
      db.from('igi_models').select('id, serial, name, stones, carat, shape, state'),
      db.from('igi_batches').select('model_id, qty'),
      db.from('igi_visit_lines').select('model_id, qty_issued'),
      db.from('igi_visits').select('visit_no').eq('visit_date', visit.visit_date).order('visit_no'),
    ]);

    for (const r of [lines, models, batches, allLines, sameDay]) {
      if (r.error) return fail('IGI/Visit GET', r.error, 'Failed to load the movement');
    }

    const byId = new Map(models.data.map((m) => [m.id, m]));

    return NextResponse.json({
      visit: {
        ...visit,
        // "2 of 2" when several movements share a day.
        same_day_position: sameDay.data.length > 1
          ? sameDay.data.findIndex((v) => v.visit_no === visit.visit_no) + 1
          : null,
        same_day_total: sameDay.data.length > 1 ? sameDay.data.length : null,
      },
      lines: lines.data.map((l) => {
        const model = byId.get(l.model_id) || {};
        const held = poolOf(l.model_id, batches.data, allLines.data);
        return {
          ...l,
          serial: model.serial ?? null,
          name: model.name ?? 'Unknown model',
          stones: model.stones ?? null,
          carat: model.carat ?? null,
          shape: model.shape ?? null,
          held,
          short_by: Math.max(0, l.qty_requested - held),
        };
      }),
    });
  } catch (err) {
    return fail('IGI/Visit GET', err, 'Internal server error');
  }
}

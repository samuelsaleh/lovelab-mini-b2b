import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { poolOf } from '@/lib/igi/derive';
import { whyNotDeletable } from '@/lib/igi/visits';

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

/**
 * DELETE /api/igi/visits/[id] — remove a movement made in this app.
 *
 * There is no separate "put the stock back" step, and there should not be: no
 * stock figure is stored anywhere. IGI's pool is derived as batches minus
 * issued lines (poolOf in lib/igi/derive.js), so when the lines go the pool
 * corrects itself by arithmetic. LoveLab's shelf never depended on movements at
 * all — it is the last nightly reading of their own software. Deleting the row
 * *is* the revert, which is why this is safe to offer and would not have been
 * if the numbers had been kept in a column somewhere.
 *
 * Only movements this app created can go. See whyNotDeletable() for the rule.
 */
export async function DELETE(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-visit-delete', 20);
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const db = auth.adminSupabase;

    const { data: visit, error: visitErr } = await db
      .from('igi_visits')
      .select('id, visit_no, visit_date, status, created_by')
      .eq('id', id)
      .maybeSingle();

    if (visitErr) return fail('IGI/Visit DELETE', visitErr, 'Failed to delete the movement');
    if (!visit) return NextResponse.json({ error: 'Movement not found' }, { status: 404 });

    const refusal = whyNotDeletable(visit);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });

    // Read the lines before they go, so the answer can say what came back
    // rather than making the screen guess.
    const { data: lines, error: linesErr } = await db
      .from('igi_visit_lines')
      .select('model_id, qty_requested, qty_issued')
      .eq('visit_id', id);

    if (linesErr) return fail('IGI/Visit DELETE', linesErr, 'Failed to delete the movement');

    const returned = (lines || []).reduce((t, l) => t + (l.qty_issued ?? 0), 0);

    // igi_visit_lines and igi_receipts are ON DELETE CASCADE, so one statement
    // takes the whole movement with it.
    const { error: delErr } = await db.from('igi_visits').delete().eq('id', id);
    if (delErr) return fail('IGI/Visit DELETE', delErr, 'Failed to delete the movement');

    console.log(
      `[IGI/Visit DELETE] V-${String(visit.visit_no).padStart(3, '0')} (${visit.status}, ${visit.visit_date}) ` +
      `deleted by ${auth.user.id}; ${returned} certificates returned to IGI's stock`,
    );

    return NextResponse.json({
      deleted: { visit_no: visit.visit_no, status: visit.status, lines: lines?.length ?? 0 },
      returned_to_igi: returned,
    });
  } catch (err) {
    return fail('IGI/Visit DELETE', err, 'Internal server error');
  }
}

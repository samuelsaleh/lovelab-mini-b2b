import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { poolOf, visitTotal } from '@/lib/igi/derive';
import { brusselsToday } from '@/lib/igi/dates';
import { readRequestLines, whyNotRequestable } from '@/lib/igi/visits';

/**
 * GET /api/igi/visits — every movement, newest first.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-visits');
  if (auth.error) return auth.error;

  try {
    const [visits, lines] = await Promise.all([
      auth.adminSupabase.from('igi_visits')
        .select('id, visit_no, visit_date, status, unattributed_total, date_suspect, requested_at, issued_at, closed_at, note')
        .order('visit_no', { ascending: false }),
      auth.adminSupabase.from('igi_visit_lines')
        .select('visit_id, model_id, qty_requested, qty_issued, qty_received'),
    ]);

    if (visits.error) return fail('IGI/Visits GET', visits.error, 'Failed to load the movements');
    if (lines.error) return fail('IGI/Visits GET', lines.error, 'Failed to load the movements');

    return NextResponse.json({
      visits: visits.data.map((v) => ({
        ...v,
        total: visitTotal(v, lines.data),
        line_count: lines.data.filter((l) => l.visit_id === v.id).length,
      })),
    });
  } catch (err) {
    return fail('IGI/Visits GET', err, 'Internal server error');
  }
}

/**
 * POST /api/igi/visits — send a request to IGI.
 *
 * A request asking for more than IGI holds is accepted deliberately: the
 * shortage comes back in the response so both sides see it straight away.
 * Nobody should walk across the road expecting 500 and return with 41.
 */
export async function POST(request) {
  const auth = await requireLoveLab(request, 'igi-visits-write', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { lines, error } = readRequestLines(body?.lines);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const db = auth.adminSupabase;

    const [models, batches, allLines, lastVisit] = await Promise.all([
      db.from('igi_models').select('id, serial, name, state').in('id', lines.map((l) => l.model_id)),
      db.from('igi_batches').select('model_id, qty'),
      db.from('igi_visit_lines').select('model_id, qty_issued'),
      db.from('igi_visits').select('visit_no').order('visit_no', { ascending: false }).limit(1),
    ]);

    for (const r of [models, batches, allLines, lastVisit]) {
      if (r.error) return fail('IGI/Visits POST', r.error, 'Failed to create the movement');
    }

    // Every model must exist and be one that can actually be produced.
    const byId = new Map(models.data.map((m) => [m.id, m]));
    for (const line of lines) {
      const reason = whyNotRequestable(byId.get(line.model_id));
      if (reason) return NextResponse.json({ error: reason }, { status: 400 });
    }

    const visitNo = (lastVisit.data?.[0]?.visit_no ?? 0) + 1;
    const now = new Date().toISOString();

    const { data: visit, error: visitErr } = await db
      .from('igi_visits')
      .insert({
        visit_no: visitNo,
        visit_date: brusselsToday(),
        status: 'requested',
        requested_at: now,
        created_by: auth.user.id,
        note: typeof body?.note === 'string' ? body.note.slice(0, 500) : null,
      })
      .select('id, visit_no, visit_date, status')
      .single();

    if (visitErr) return fail('IGI/Visits POST', visitErr, 'Failed to create the movement');

    const { error: linesErr } = await db.from('igi_visit_lines').insert(
      lines.map((l) => ({
        visit_id: visit.id,
        model_id: l.model_id,
        qty_requested: l.qty,
      })),
    );

    if (linesErr) {
      // Leave no half-written movement behind.
      await db.from('igi_visits').delete().eq('id', visit.id);
      return fail('IGI/Visits POST', linesErr, 'Failed to create the movement');
    }

    // What IGI holds right now, so the shortage is reported at the moment of asking.
    const short = lines
      .map((l) => {
        const held = poolOf(l.model_id, batches.data, allLines.data);
        if (l.qty <= held) return null;
        const model = byId.get(l.model_id);
        return {
          model_id: l.model_id,
          serial: model.serial,
          name: model.name,
          asked: l.qty,
          held,
          gap: l.qty - held,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ visit, short }, { status: 201 });
  } catch (err) {
    return fail('IGI/Visits POST', err, 'Internal server error');
  }
}

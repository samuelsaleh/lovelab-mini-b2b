import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { canAdvance } from '@/lib/igi/visits';

/**
 * PATCH /api/igi/visits/[id]/received
 *
 * LoveLab confirms the certificates came back. One button: by default everything
 * IGI made came back, and a per-line figure is only sent when something is short.
 *
 * This does NOT change LoveLab's own software yet — that endpoint does not exist.
 * Until it does, the shelf figure still comes from the nightly read alone, and
 * the screens show what we expect beside what the API reports rather than
 * assuming ours is right.
 */
export async function PATCH(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-visit-received', 30);
  if (auth.error) return auth.error;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const db = auth.adminSupabase;

    const { data: visit, error: visitErr } = await db
      .from('igi_visits').select('id, status, visit_no').eq('id', id).maybeSingle();

    if (visitErr) return fail('IGI/VisitReceived PATCH', visitErr, 'Failed to confirm the return');
    if (!visit) return NextResponse.json({ error: 'Movement not found' }, { status: 404 });

    if (!canAdvance(visit.status, 'closed')) {
      return NextResponse.json(
        {
          error: visit.status === 'closed'
            ? 'This movement has already been received.'
            : 'Record what IGI made before confirming the return.',
        },
        { status: 409 },
      );
    }

    const { data: lines, error: linesErr } = await db
      .from('igi_visit_lines').select('id, model_id, qty_issued').eq('visit_id', id);

    if (linesErr) return fail('IGI/VisitReceived PATCH', linesErr, 'Failed to confirm the return');

    const overrides = body?.received && typeof body.received === 'object' ? body.received : {};
    let total = 0;

    for (const line of lines) {
      const raw = overrides[line.model_id];
      // Blank means everything IGI made came back, which is the normal case.
      const qty = raw === undefined || raw === null || raw === ''
        ? (line.qty_issued ?? 0)
        : Number(raw);

      if (!Number.isInteger(qty) || qty < 0) {
        return NextResponse.json(
          { error: 'Every quantity must be a whole number, zero or more.' },
          { status: 400 },
        );
      }
      if (qty > (line.qty_issued ?? 0)) {
        return NextResponse.json(
          { error: 'More came back than IGI made. Check the count before confirming.' },
          { status: 400 },
        );
      }

      total += qty;
      const { error: updErr } = await db
        .from('igi_visit_lines').update({ qty_received: qty }).eq('id', line.id);
      if (updErr) return fail('IGI/VisitReceived PATCH', updErr, 'Failed to confirm the return');
    }

    const { data: updated, error: statusErr } = await db
      .from('igi_visits')
      .update({ status: 'closed', closed_at: new Date().toISOString(), received_by: auth.user.id })
      .eq('id', id)
      .select('id, visit_no, status, closed_at')
      .single();

    if (statusErr) return fail('IGI/VisitReceived PATCH', statusErr, 'Failed to confirm the return');

    return NextResponse.json({ visit: updated, received: total });
  } catch (err) {
    return fail('IGI/VisitReceived PATCH', err, 'Internal server error');
  }
}

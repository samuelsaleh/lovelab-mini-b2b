import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { canAdvance, readIssuedQuantities } from '@/lib/igi/visits';

/**
 * PATCH /api/igi/visits/[id]/issued
 *
 * Records what IGI actually produced. Fewer than asked is normal — IGI make what
 * they can from the stock they hold — so a short quantity is accepted without
 * complaint. Their stock falls by this amount, because the certificate has left
 * them the moment it is attached.
 *
 * Until IGI have their own login, LoveLab records this on their behalf. Who
 * typed it is kept, so the two can be told apart later.
 */
export async function PATCH(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-visit-issued', 30);
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

    if (visitErr) return fail('IGI/VisitIssued PATCH', visitErr, 'Failed to record what was made');
    if (!visit) return NextResponse.json({ error: 'Movement not found' }, { status: 404 });

    if (!canAdvance(visit.status, 'issued')) {
      return NextResponse.json(
        {
          error: visit.status === 'issued'
            ? 'What IGI made has already been recorded for this movement.'
            : 'This movement is closed. Record a correction as a new movement so it stays visible.',
        },
        { status: 409 },
      );
    }

    const { data: lines, error: linesErr } = await db
      .from('igi_visit_lines').select('id, model_id, qty_requested').eq('visit_id', id);

    if (linesErr) return fail('IGI/VisitIssued PATCH', linesErr, 'Failed to record what was made');

    const { byModel, error } = readIssuedQuantities(body?.issued, lines);
    if (error) return NextResponse.json({ error }, { status: 400 });

    for (const line of lines) {
      const { error: updErr } = await db
        .from('igi_visit_lines')
        .update({ qty_issued: byModel.get(line.model_id) })
        .eq('id', line.id);
      if (updErr) return fail('IGI/VisitIssued PATCH', updErr, 'Failed to record what was made');
    }

    const { data: updated, error: statusErr } = await db
      .from('igi_visits')
      .update({ status: 'issued', issued_at: new Date().toISOString(), issued_by: auth.user.id })
      .eq('id', id)
      .select('id, visit_no, status, issued_at')
      .single();

    if (statusErr) return fail('IGI/VisitIssued PATCH', statusErr, 'Failed to record what was made');

    return NextResponse.json({ visit: updated });
  } catch (err) {
    return fail('IGI/VisitIssued PATCH', err, 'Internal server error');
  }
}

import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';

/**
 * PATCH /api/igi-portal/todo/[visitId]/produce
 *
 * IGI record what they actually made. Fewer than asked is normal — they make
 * what the stock they hold allows — so a short quantity is accepted without
 * complaint, and a model left blank means they made everything asked for.
 *
 * The database allows exactly this and no more: the column grant on
 * igi_visit_lines means an attempt to change what LoveLab asked for is refused
 * outright, and the policy on igi_visits only permits a movement waiting on IGI
 * to become one ready to receive.
 */
export async function PATCH(request, { params }) {
  const auth = await requireIgi(request, 'igi-produce', 30);
  if (auth.error) return auth.error;

  const { visitId } = await params;
  const { supabase } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const { data: visit, error: visitErr } = await supabase
      .from('igi_visits').select('id, visit_no, status').eq('id', visitId).maybeSingle();

    if (visitErr) return fail('IGI-Portal/Produce', visitErr, 'Could not save what you made');
    if (!visit) return NextResponse.json({ error: 'That request no longer exists' }, { status: 404 });
    if (visit.status !== 'requested') {
      return NextResponse.json(
        { error: 'This one has already been sent back to LoveLab.' },
        { status: 409 },
      );
    }

    const { data: lines, error: linesErr } = await supabase
      .from('igi_visit_lines').select('id, model_id, qty_requested').eq('visit_id', visitId);

    if (linesErr) return fail('IGI-Portal/Produce', linesErr, 'Could not save what you made');

    const made = body?.made && typeof body.made === 'object' ? body.made : {};
    let total = 0;

    for (const line of lines) {
      const raw = made[line.model_id];
      const qty = raw === undefined || raw === null || raw === ''
        ? line.qty_requested
        : Number(raw);

      if (!Number.isInteger(qty) || qty < 0) {
        return NextResponse.json(
          { error: 'Every quantity must be a whole number, zero or more.' },
          { status: 400 },
        );
      }

      total += qty;
      const { error } = await supabase
        .from('igi_visit_lines').update({ qty_issued: qty }).eq('id', line.id);
      if (error) return fail('IGI-Portal/Produce', error, 'Could not save what you made');
    }

    const { error: statusErr } = await supabase
      .from('igi_visits')
      .update({ status: 'issued', issued_at: new Date().toISOString(), issued_by: auth.user.id })
      .eq('id', visitId);

    if (statusErr) return fail('IGI-Portal/Produce', statusErr, 'Could not send it back to LoveLab');

    return NextResponse.json({ visit_no: visit.visit_no, made: total });
  } catch (err) {
    return fail('IGI-Portal/Produce', err, 'Internal server error');
  }
}

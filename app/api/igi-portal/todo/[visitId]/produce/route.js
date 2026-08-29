import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { recordProduction } from '@/lib/igi/portalActions';

/**
 * PATCH /api/igi-portal/todo/[visitId]/produce — IGI record what they made.
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await recordProduction(auth.supabase, auth.user.id, visitId, body);
    if (result.error) return fail('IGI-Portal/Produce', result.error, result.message);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return fail('IGI-Portal/Produce', err, 'Internal server error');
  }
}

import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { notifyIgiOfRequest, siteUrlFor } from '@/lib/igi/notify';

/**
 * POST /api/igi/visits/[id]/notify — send IGI the request email again.
 *
 * The "Send the email again" button on a movement whose first email failed
 * (Sam, 18 Sept 2026). Only while the movement is still waiting on IGI: once
 * they have recorded what they made, the email would announce old news.
 *
 * The answer is the send result, always 200: a failed send is reported in
 * the body (and on the movement), not as an HTTP error, because the movement
 * itself is fine.
 */
export async function POST(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-visit-notify', 10);
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const db = auth.adminSupabase;
    const { data: visit, error } = await db
      .from('igi_visits').select('id, status').eq('id', id).maybeSingle();
    if (error) return fail('IGI/VisitNotify POST', error, 'Could not send the email');
    if (!visit) return NextResponse.json({ error: 'Movement not found' }, { status: 404 });
    if (visit.status !== 'requested') {
      return NextResponse.json(
        { error: 'IGI have already recorded what they made on this movement; there is nothing to ask them for.' },
        { status: 409 },
      );
    }

    const email = await notifyIgiOfRequest(db, { visitId: id, siteUrl: siteUrlFor(request) });
    return NextResponse.json({ email });
  } catch (err) {
    return fail('IGI/VisitNotify POST', err, 'Internal server error');
  }
}

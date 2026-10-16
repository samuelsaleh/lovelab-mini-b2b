import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { reportProblem } from '@/lib/igi/problems';
import { notifyLovelabOfProblem, siteUrlFor } from '@/lib/igi/notify';

/**
 * POST /api/igi-portal/todo/[visitId]/problem — IGI report that a request looks wrong.
 *
 * Body: { note, proposal: [{ model_id, qty }] }. The request goes on hold and
 * Liuba is emailed; LoveLab decide what changes. The database allows IGI
 * exactly this: a request waiting on them may become one on hold, and the
 * report is recorded in their own name (20261016120000_igi_visit_problems).
 */
export async function POST(request, { params }) {
  const auth = await requireIgi(request, 'igi-problem', 20);
  if (auth.error) return auth.error;

  const { visitId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await reportProblem(auth.supabase, auth.user.id, visitId, body);
    if (result.error) return fail('IGI-Portal/Problem', result.error, result.message);
    if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });

    const email = await notifyLovelabOfProblem(auth.supabase, { visitId, siteUrl: siteUrlFor(request) });
    return NextResponse.json({ ...result.body, email }, { status: 200 });
  } catch (err) {
    return fail('IGI-Portal/Problem', err, 'Internal server error');
  }
}

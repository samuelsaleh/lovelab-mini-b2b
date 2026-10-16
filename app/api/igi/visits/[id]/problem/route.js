import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { resolveProblem } from '@/lib/igi/problems';
import { notifyIgiOfAnswer, siteUrlFor } from '@/lib/igi/notify';

/**
 * POST /api/igi/visits/[id]/problem — LoveLab answer a problem IGI reported.
 *
 * Body: { action: 'accept' | 'edit' | 'keep', lines?: [{ model_id, qty }], reply? }.
 * The request goes back on IGI's To do and IGI are emailed what was decided.
 */
export async function POST(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-problem-answer', 30);
  if (auth.error) return auth.error;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await resolveProblem(auth.adminSupabase, auth.user.id, id, body);
    if (result.error) return fail('IGI/Problem answer', result.error, result.message);
    if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });

    const email = await notifyIgiOfAnswer(auth.adminSupabase, { visitId: id, siteUrl: siteUrlFor(request) });
    return NextResponse.json({ ...result.body, email }, { status: 200 });
  } catch (err) {
    return fail('IGI/Problem answer', err, 'Internal server error');
  }
}

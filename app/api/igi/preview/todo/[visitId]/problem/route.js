import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { reportProblem } from '@/lib/igi/problems';
import { notifyLovelabOfProblem, siteUrlFor } from '@/lib/igi/notify';

/**
 * POST /api/igi/preview/todo/[visitId]/problem — report a problem from IGI's
 * screen, as a LoveLab admin in preview.
 *
 * Writes for real through the same action IGI's own route calls, so Sam can
 * test their half; the report says Sam made it, which is the truth.
 */
export async function POST(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-preview-problem', 20);
  if (auth.error) return auth.error;

  const { visitId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await reportProblem(auth.adminSupabase, auth.user.id, visitId, body);
    if (result.error) return fail('IGI/Preview problem', result.error, result.message);
    if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });

    const email = await notifyLovelabOfProblem(auth.adminSupabase, { visitId, siteUrl: siteUrlFor(request) });
    return NextResponse.json({ ...result.body, email }, { status: 200 });
  } catch (err) {
    return fail('IGI/Preview problem', err, 'Internal server error');
  }
}

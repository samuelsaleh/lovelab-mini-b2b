import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { recordBatch } from '@/lib/igi/portalActions';

/**
 * POST /api/igi/preview/batches — record a production run from the preview.
 *
 * Sam has to be able to drive IGI's half of the loop before IGI have a login —
 * a portal whose buttons do nothing cannot be tested. So the preview writes for
 * real, through the same action IGI's own route calls.
 *
 * Attribution needs no special case: the row records whoever acted. Recorded
 * here, it says Sam did it, which is the truth and is what you want to find
 * later when somebody asks where a figure came from.
 */
export async function POST(request) {
  const auth = await requireLoveLab(request, 'igi-preview-batches', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await recordBatch(auth.adminSupabase, auth.user.id, body);
    if (result.error) return fail('IGI/Preview batches', result.error, result.message);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return fail('IGI/Preview batches', err, 'Internal server error');
  }
}

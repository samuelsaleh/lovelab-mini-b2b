import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { assignSerial } from '@/lib/igi/portalActions';

/**
 * PATCH /api/igi/preview/models/[modelId]/serial — give a new model its serial,
 * from LoveLab's preview of IGI's To do.
 *
 * Same action IGI's own route calls, so the preview drives the portal rather
 * than a likeness of it. The row records whoever acted: numbered here, it says
 * a LoveLab admin numbered it, which is the truth.
 */
export async function PATCH(request, { params }) {
  const auth = await requireLoveLab(request, 'igi-preview-serial', 30);
  if (auth.error) return auth.error;

  const { modelId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await assignSerial(auth.adminSupabase, auth.user.id, modelId, body);
    if (result.error) return fail('IGI/Preview serial', result.error, result.message);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return fail('IGI/Preview serial', err, 'Internal server error');
  }
}

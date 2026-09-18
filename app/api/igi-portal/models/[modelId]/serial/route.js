import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { assignSerial } from '@/lib/igi/portalActions';

/**
 * PATCH /api/igi-portal/models/[modelId]/serial — IGI give a new model its serial.
 *
 * LoveLab add the model; IGI number it. The database allows exactly this: the
 * policy lets a model waiting for a serial become one in use, the column grant
 * covers the serial and nothing of LoveLab's, and a trigger refuses to change
 * a serial that is already set — for anyone, ever.
 */
export async function PATCH(request, { params }) {
  const auth = await requireIgi(request, 'igi-serial', 30);
  if (auth.error) return auth.error;

  const { modelId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await assignSerial(auth.supabase, auth.user.id, modelId, body);
    if (result.error) return fail('IGI-Portal/Serial', result.error, result.message);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return fail('IGI-Portal/Serial', err, 'Internal server error');
  }
}

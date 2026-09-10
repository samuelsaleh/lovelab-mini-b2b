import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { recordBatch } from '@/lib/igi/portalActions';

/**
 * POST /api/igi-portal/batches — IGI record a production run.
 *
 * Their stock is the sum of these, never a quantity somebody overwrites, so it
 * stays visible what arrived when and against which order. The database has no
 * update or delete policy for IGI on this table: a mistake is corrected by
 * adding a correcting batch, which keeps the trail.
 */
export async function POST(request) {
  const auth = await requireIgi(request, 'igi-batches', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const result = await recordBatch(auth.supabase, auth.user.id, body);
    if (result.error) return fail('IGI-Portal/Batches', result.error, result.message);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return fail('IGI-Portal/Batches', err, 'Internal server error');
  }
}

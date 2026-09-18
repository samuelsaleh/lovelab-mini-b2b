import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { recordCount } from '@/lib/igi/portalActions';

/**
 * POST /api/igi-portal/counts — IGI correct what they hold of a model.
 *
 * Sam, 18 Sept 2026: IGI's figure is arithmetic and nothing on their side is
 * connected to it, so when it drifts from the shelf they must be able to say
 * so. The count is kept as a row of its own, never an overwrite; the pool is
 * derived from it from then on. "Was" is read through the same loader the
 * stock screen uses, so it is the figure they had in front of them.
 */
export async function POST(request) {
  const auth = await requireIgi(request, 'igi-counts', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const world = await loadIgiWorld(auth.supabase);
    const result = await recordCount(auth.supabase, auth.user.id, body, world.poolFor);
    if (result.error) return fail('IGI-Portal/Counts', result.error, result.message);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return fail('IGI-Portal/Counts', err, 'Internal server error');
  }
}

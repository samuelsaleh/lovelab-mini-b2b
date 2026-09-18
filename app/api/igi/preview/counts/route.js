import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { recordCount } from '@/lib/igi/portalActions';

/**
 * POST /api/igi/preview/counts — correct IGI's count from the preview.
 *
 * Until IGI have a login this is how a "they told me on the phone they hold
 * none" gets into the record: a LoveLab admin drives IGI's own screen, the
 * same action runs, and the row says who did it.
 */
export async function POST(request) {
  const auth = await requireLoveLab(request, 'igi-preview-counts', 30);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const world = await loadIgiWorld(auth.adminSupabase);
    const result = await recordCount(auth.adminSupabase, auth.user.id, body, world.poolFor);
    if (result.error) return fail('IGI/Preview counts', result.error, result.message);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return fail('IGI/Preview counts', err, 'Internal server error');
  }
}

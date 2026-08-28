import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { toIgiLine, toIgiVisit } from '@/lib/igi/portalShapes';

/**
 * GET /api/igi-portal/todo — the requests waiting on IGI.
 *
 * This is the whole product for them: one card per open request, with what they
 * hold beside what LoveLab asked for.
 */
export async function GET(request) {
  const auth = await requireIgi(request, 'igi-todo');
  if (auth.error) return auth.error;

  try {
    const world = await loadIgiWorld(auth.supabase);
    const open = world.visits.filter((v) => v.status === 'requested');

    return NextResponse.json({
      visits: open.map((v) => toIgiVisit(
        v,
        world.lines
          .filter((l) => l.visit_id === v.id)
          .map((l) => toIgiLine(l, world.modelById.get(l.model_id), world.poolFor(l.model_id))),
      )),
    });
  } catch (err) {
    return fail('IGI-Portal/Todo GET', err, 'Failed to load your list');
  }
}

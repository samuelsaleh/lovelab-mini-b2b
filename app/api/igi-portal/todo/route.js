import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { todoView } from '@/lib/igi/portalViews';

/**
 * GET /api/igi-portal/todo — the requests waiting on IGI.
 *
 * This is the whole product for them: one card per open request, with what they
 * hold beside what LoveLab asked for.
 *
 * The payload is built by todoView() in lib/igi/portalViews.js, which a LoveLab
 * admin's preview of this screen also uses — so what Sam sees and what IGI see
 * cannot drift apart.
 */
export async function GET(request) {
  const auth = await requireIgi(request, 'igi-todo');
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(todoView(await loadIgiWorld(auth.supabase)));
  } catch (err) {
    return fail('IGI-Portal/Todo GET', err, 'Failed to load your list');
  }
}

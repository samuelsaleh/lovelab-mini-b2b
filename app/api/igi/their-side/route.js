import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { todoView, stockView, historyView } from '@/lib/igi/portalViews';

/**
 * GET /api/igi/their-side — what IGI see, assembled for LoveLab to look at.
 *
 * LoveLab need to know what they are asking of another company before they hand
 * that company a login, and afterwards they need to answer "what does IGI
 * actually have on screen right now" without borrowing IGI's password.
 *
 * The honest way to build that is to reuse the portal's own machinery rather
 * than write a second query that looks similar today and drifts by March. This
 * route calls loadIgiWorld — the same loader IGI's five screens use — and the
 * same view builders their routes call. So this summary cannot show more than
 * IGI can see: to widen it you would have to widen their portal.
 *
 * For the portal itself rather than this summary of it, see
 * /api/igi/preview/[screen], which serves IGI's four screens verbatim.
 *
 * It reads with the service-role client, which RLS does not constrain, which is
 * exactly why loadIgiWorld filters the reserved serials itself.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-their-side');
  if (auth.error) return auth.error;

  try {
    const world = await loadIgiWorld(auth.adminSupabase);
    const history = historyView(world);

    return NextResponse.json({
      todo: todoView(world).visits,      // their To do
      models: stockView(world).models,   // their stock and order book
      visits: history.visits,            // their history
      batches: history.batches,          // the production they have recorded
    });
  } catch (err) {
    return fail('IGI/TheirSide GET', err, 'Failed to load IGI’s side');
  }
}

import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { toIgiModel, toIgiLine, toIgiVisit } from '@/lib/igi/portalShapes';
import { visitTotal } from '@/lib/igi/derive';

/**
 * GET /api/igi/their-side — what IGI see, assembled for LoveLab to look at.
 *
 * LoveLab need to know what they are asking of another company before they hand
 * that company a login, and afterwards they need to answer "what does IGI
 * actually have on screen right now" without borrowing IGI's password.
 *
 * The honest way to build that is to reuse the portal's own machinery rather
 * than write a second query that looks similar today and drifts by March. This
 * route calls loadIgiWorld — the same loader IGI's five screens use — and puts
 * every row through the same toIgiModel / toIgiLine / toIgiVisit shapers. So
 * this preview cannot show more than IGI can see: to widen it you would have to
 * widen their portal, and lib/__tests__/igi-portal-serialize.test.js would fail.
 *
 * It reads with the service-role client, which RLS does not constrain, which is
 * exactly why loadIgiWorld filters the reserved serials itself.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-their-side');
  if (auth.error) return auth.error;

  try {
    const world = await loadIgiWorld(auth.adminSupabase);

    const linesFor = (visit) => world.lines
      .filter((l) => l.visit_id === visit.id)
      .map((l) => toIgiLine(l, world.modelById.get(l.model_id), world.poolFor(l.model_id)));

    return NextResponse.json({
      // Their To do — the whole product from where they stand.
      todo: world.visits
        .filter((v) => v.status === 'requested')
        .map((v) => toIgiVisit(v, linesFor(v))),

      // Their stock, with their own alert levels and their order book.
      models: world.models.map((m) => toIgiModel(m, {
        pool: world.poolFor(m.id),
        askedNow: world.askedFor(m.id),
      })),

      // Their history: movements and the batches they have recorded producing.
      visits: world.visits.map((v) => ({
        id: v.id,
        visit_no: v.visit_no,
        visit_date: v.visit_date,
        status: v.status,
        date_suspect: v.date_suspect,
        unattributed_total: v.unattributed_total,
        total: visitTotal(v, world.lines),
        line_count: world.lines.filter((l) => l.visit_id === v.id).length,
      })),
      batches: world.batches
        .map((b) => ({
          ...b,
          serial: world.modelById.get(b.model_id)?.serial ?? null,
          name: world.modelById.get(b.model_id)?.name ?? 'Unknown model',
        }))
        .sort((a, b) => String(b.batch_date).localeCompare(String(a.batch_date))),
    });
  } catch (err) {
    return fail('IGI/TheirSide GET', err, 'Failed to load IGI’s side');
  }
}

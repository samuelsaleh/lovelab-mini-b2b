import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { toIgiModel } from '@/lib/igi/portalShapes';

/**
 * GET /api/igi-portal/stock — what IGI hold, model by model.
 *
 * Alongside each model is "asked right now": how many LoveLab are requesting in
 * open movements. That is IGI's order book, and unlike a shelf figure it says
 * nothing about how fast anything sells.
 */
export async function GET(request) {
  const auth = await requireIgi(request, 'igi-stock');
  if (auth.error) return auth.error;

  try {
    const world = await loadIgiWorld(auth.supabase);

    return NextResponse.json({
      models: world.models.map((m) => toIgiModel(m, {
        pool: world.poolFor(m.id),
        askedNow: world.askedFor(m.id),
      })),
    });
  } catch (err) {
    return fail('IGI-Portal/Stock GET', err, 'Failed to load your stock');
  }
}

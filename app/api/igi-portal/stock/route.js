import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { stockView } from '@/lib/igi/portalViews';

/**
 * GET /api/igi-portal/stock — what IGI hold, model by model.
 *
 * Alongside each model is "asked right now": how many LoveLab are requesting in
 * open movements. That is IGI’s order book, and unlike a shelf figure it says
 * nothing about how fast anything sells.
 *
 * The payload is built by stockView() in lib/igi/portalViews.js, which a LoveLab
 * admin's preview of this screen also uses — so what Sam sees and what IGI see
 * cannot drift apart.
 */
export async function GET(request) {
  const auth = await requireIgi(request, 'igi-stock');
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(stockView(await loadIgiWorld(auth.supabase)));
  } catch (err) {
    return fail('IGI-Portal/Stock GET', err, 'Failed to load your stock');
  }
}

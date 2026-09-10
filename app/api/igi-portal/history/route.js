import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { historyView } from '@/lib/igi/portalViews';

/**
 * GET /api/igi-portal/history — what has already happened.
 *
 * Movements and production batches, newest first, read only.
 *
 * The payload is built by historyView() in lib/igi/portalViews.js, which a LoveLab
 * admin's preview of this screen also uses — so what Sam sees and what IGI see
 * cannot drift apart.
 */
export async function GET(request) {
  const auth = await requireIgi(request, 'igi-history');
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(historyView(await loadIgiWorld(auth.supabase)));
  } catch (err) {
    return fail('IGI-Portal/History GET', err, 'Failed to load the history');
  }
}

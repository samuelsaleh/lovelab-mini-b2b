import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { invoicesView } from '@/lib/igi/portalViews';

/**
 * GET /api/igi-portal/invoices — what IGI have issued, at €1,20 each.
 *
 * Grouped by month. The movements IGI recorded as a daily total without models
 * appear as their own line rather than being spread across models that did not
 * earn them.
 *
 * The payload is built by invoicesView() in lib/igi/portalViews.js, which a LoveLab
 * admin's preview of this screen also uses — so what Sam sees and what IGI see
 * cannot drift apart.
 */
export async function GET(request) {
  const auth = await requireIgi(request, 'igi-invoices');
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(invoicesView(await loadIgiWorld(auth.supabase)));
  } catch (err) {
    return fail('IGI-Portal/Invoices GET', err, 'Failed to load the invoices');
  }
}

import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { invoiceForMonth, FEE_EUR } from '@/lib/igi/derive';
import { monthKey } from '@/lib/igi/dates';

/**
 * GET /api/igi-portal/invoices — what IGI have issued, at €1,20 each.
 *
 * Grouped by month. The movements IGI recorded as a daily total without models
 * appear as their own line rather than being spread across models that did not
 * earn them.
 */
export async function GET(request) {
  const auth = await requireIgi(request, 'igi-invoices');
  if (auth.error) return auth.error;

  try {
    const world = await loadIgiWorld(auth.supabase);

    const closed = world.visits.filter((v) => v.status === 'closed');
    const months = [...new Set(closed.map((v) => monthKey(v.visit_date)))]
      .filter(Boolean)
      .sort()
      .reverse();

    return NextResponse.json({
      fee_eur: FEE_EUR,
      months: months.map((month) => {
        const invoice = invoiceForMonth(month, world.visits, world.lines);
        return {
          ...invoice,
          rows: invoice.rows.map((r) => ({
            ...r,
            serial: world.modelById.get(r.model_id)?.serial ?? null,
            name: world.modelById.get(r.model_id)?.name ?? 'Unknown model',
            stones: world.modelById.get(r.model_id)?.stones ?? null,
            carat: world.modelById.get(r.model_id)?.carat ?? null,
            shape: world.modelById.get(r.model_id)?.shape ?? null,
          })),
        };
      }),
    });
  } catch (err) {
    return fail('IGI-Portal/Invoices GET', err, 'Failed to load the invoices');
  }
}

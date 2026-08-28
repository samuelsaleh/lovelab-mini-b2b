import { NextResponse } from 'next/server';
import { requireIgi, fail } from '@/app/api/igi-portal/_lib/access';
import { loadIgiWorld } from '@/app/api/igi-portal/_lib/load';
import { visitTotal } from '@/lib/igi/derive';

/**
 * GET /api/igi-portal/history — what has already happened.
 *
 * Movements and production batches, newest first, read only.
 */
export async function GET(request) {
  const auth = await requireIgi(request, 'igi-history');
  if (auth.error) return auth.error;

  try {
    const world = await loadIgiWorld(auth.supabase);

    return NextResponse.json({
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
    return fail('IGI-Portal/History GET', err, 'Failed to load the history');
  }
}

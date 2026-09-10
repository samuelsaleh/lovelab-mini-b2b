import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import { dailyHistory } from '@/lib/igi/derive';

/**
 * GET /api/igi/daily — what was taken, day by day.
 *
 * A movement is the unit the two companies transact in; a day is the unit
 * anybody actually remembers in. "What went across on the 25th" used to mean
 * opening two movements and adding them up.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-daily');
  if (auth.error) return auth.error;

  try {
    const db = auth.adminSupabase;

    const [visits, lines, models] = await Promise.all([
      db.from('igi_visits')
        .select('id, visit_no, visit_date, status, date_suspect, unattributed_total')
        .order('visit_no', { ascending: true }),
      db.from('igi_visit_lines')
        .select('visit_id, model_id, qty_requested, qty_issued, qty_received'),
      db.from('igi_models').select('id, serial, name, stones, carat, shape, spec'),
    ]);

    for (const r of [visits, lines, models]) {
      if (r.error) return fail('IGI/Daily GET', r.error, 'Failed to load the daily history');
    }

    const byId = new Map(models.data.map((m) => [m.id, m]));

    return NextResponse.json({ days: dailyHistory(visits.data, lines.data, byId) });
  } catch (err) {
    return fail('IGI/Daily GET', err, 'Internal server error');
  }
}

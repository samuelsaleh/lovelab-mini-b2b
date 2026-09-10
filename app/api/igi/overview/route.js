import { NextResponse } from 'next/server';
import { requireLoveLab, fail } from '@/app/api/igi/_lib/access';
import {
  poolOf, shelfOf, askedRightNow, shelfStatus, poolStatus, unattributedTotal,
} from '@/lib/igi/derive';

/**
 * GET /api/igi/overview
 *
 * Everything the LoveLab dashboard and the stock screen need, in one read: per
 * model, what sits on our shelf and what IGI still holds, with both alert
 * rules applied.
 *
 * The figures are derived here rather than stored, so there is no second copy
 * of the truth to drift. See lib/igi/derive.js.
 */
export async function GET(request) {
  const auth = await requireLoveLab(request, 'igi-overview');
  if (auth.error) return auth.error;
  const { adminSupabase } = auth;

  try {
    const [models, batches, lines, visits, snapshots, descriptions] = await Promise.all([
      adminSupabase.from('igi_models')
        .select('id, serial, serial_full, name, stones, carat, shape, spec, state, qty_ordered, shelf_min, pool_min, sort_order')
        .order('sort_order', { ascending: true }),
      adminSupabase.from('igi_batches').select('model_id, qty'),
      adminSupabase.from('igi_visit_lines').select('visit_id, model_id, qty_requested, qty_issued, qty_received'),
      adminSupabase.from('igi_visits').select('id, visit_no, visit_date, status, unattributed_total, date_suspect')
        .order('visit_no', { ascending: true }),
      // Only the newest snapshot day is needed for a shelf figure, but two days
      // are read so the screen can show what moved overnight.
      adminSupabase.from('igi_shelf_snapshots')
        .select('snapshot_date, description, total_pcs, model_id')
        .order('snapshot_date', { ascending: false })
        .limit(400),
      adminSupabase.from('igi_descriptions').select('description, model_id, kind, last_seen_at'),
    ]);

    for (const r of [models, batches, lines, visits, snapshots, descriptions]) {
      if (r.error) return fail('IGI/Overview GET', r.error, 'Failed to load certificate stock');
    }

    const rows = models.data.map((m) => {
      const pool = m.state === 'in_use' ? poolOf(m.id, batches.data, lines.data) : null;
      const shelf = shelfOf(m.id, snapshots.data);
      return {
        ...m,
        pool,
        shelf,
        asked_now: askedRightNow(m.id, lines.data, visits.data),
        shelf_status: shelfStatus(m, shelf),
        pool_status: poolStatus(m, pool),
      };
    });

    const inUse = rows.filter((r) => r.state === 'in_use');
    const dates = [...new Set(snapshots.data.map((s) => s.snapshot_date))].sort().reverse();

    return NextResponse.json({
      models: rows,
      totals: {
        on_shelf: sum(inUse, (r) => r.shelf),
        at_igi: sum(inUse, (r) => r.pool),
        ordered: sum(inUse, (r) => r.qty_ordered),
        // Certificates IGI issued between 16 June and 28 July with no model
        // attached. Shown on its own, never folded into a model's figure.
        unattributed: unattributedTotal(visits.data),
        models_in_use: inUse.length,
        reserved: rows.filter((r) => r.state === 'reserved').length,
        awaiting_serial: rows.filter((r) => r.state === 'awaiting_serial').length,
        to_collect: inUse.filter((r) => r.shelf_status === 'collect').length,
        to_produce: inUse.filter((r) => r.pool_status === 'reorder').length,
        open_visits: visits.data.filter((v) => v.status !== 'closed').length,
      },
      shelf: {
        last_read: dates[0] || null,
        previous_read: dates[1] || null,
        // A description that was linked and has stopped appearing means somebody
        // renamed it upstream, and that model's shelf figure is frozen.
        unlinked: descriptions.data.filter((d) => d.kind === 'certificate' && !d.model_id).length,
      },
      visits: visits.data,
    });
  } catch (err) {
    return fail('IGI/Overview GET', err, 'Internal server error');
  }
}

function sum(rows, pick) {
  return rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0);
}

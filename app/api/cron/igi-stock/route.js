/**
 * Nightly certificate-shelf read.
 *
 * Reads LoveLab's packing stock once a night (configured in vercel.json) and
 * stores a dated snapshot per description, so each model's shelf figure arrives
 * without anyone typing it. Authenticates via the same x-vercel-cron-secret
 * header as /api/backup and /api/cron/health-check.
 *
 * Responses:
 *   200 { snapshot_date, lines_read, matched, ... }  on success
 *   401 { error: 'Unauthorized' }                     if CRON_SECRET fails
 *   500 { error }                                     on unhandled exceptions
 *
 * Side effects:
 *   - Upserts igi_shelf_snapshots for today (safe to re-run).
 *   - Records unseen descriptions in igi_descriptions for a human to link.
 *   - Records a health event when a mapped description stops appearing, when
 *     the payload looks truncated, or when the read fails outright.
 *
 * On any failure it writes nothing to igi_shelf_snapshots. Yesterday's figures
 * stand and the screens show them as stale, which is the honest answer.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { recordHealthEvent } from '@/lib/healthEvent';
import { syncShelfSnapshot } from '@/lib/igi/syncShelf';

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron igi-stock] CRON_SECRET env var is not set — all requests rejected.');
    return false;
  }
  const headerSecret = request.headers.get('x-vercel-cron-secret');
  return headerSecret === cronSecret;
}

export async function GET(request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminSupabase = createAdminClient();
    const summary = await syncShelfSnapshot(adminSupabase);

    if (summary.vanished_descriptions.length) {
      await recordHealthEvent({
        source: 'cron_igi_stock',
        severity: 'warn',
        message:
          `${summary.vanished_descriptions.length} mapped certificate description(s) `
          + 'no longer appear in packing-stock — likely renamed upstream. '
          + 'Those models keep their last known shelf figure until this is fixed.',
        context: { descriptions: summary.vanished_descriptions.slice(0, 20) },
      });
    }

    if (summary.truncated) {
      await recordHealthEvent({
        source: 'cron_igi_stock',
        severity: 'warn',
        message: 'packing-stock reported a different line count than it returned.',
        context: { reported: summary.reported_count, received: summary.lines_read },
      });
    }

    if (summary.new_descriptions.length) {
      await recordHealthEvent({
        source: 'cron_igi_stock',
        severity: 'info',
        message: `${summary.new_descriptions.length} new description(s) need linking to a model.`,
        context: { descriptions: summary.new_descriptions.slice(0, 20) },
      });
    }

    return NextResponse.json(summary);
  } catch (err) {
    await recordHealthEvent({
      source: 'cron_igi_stock',
      severity: 'error',
      message: err?.message || 'Nightly certificate-shelf read failed',
      context: { stack: err?.stack ? String(err.stack).slice(0, 1500) : null },
    });
    return NextResponse.json(
      { error: 'Shelf sync failed', detail: err?.message || 'unknown' },
      { status: 500 },
    );
  }
}

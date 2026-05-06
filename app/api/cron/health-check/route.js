/**
 * Daily health-check cron endpoint.
 *
 * Runs lib/healthCheck.runDailyHealthCheck once per day (configured in
 * vercel.json). Authenticates via the same x-vercel-cron-secret header as
 * /api/backup so only Vercel's scheduler can trigger it in production.
 *
 * Responses:
 *   200 { findings, started_at, finished_at }   on success
 *   401 { error: 'Unauthorized' }                if CRON_SECRET fails
 *   500 { error }                                on unhandled exceptions
 *
 * Side effects:
 *   - Each finding records a row in system_health_events.
 *   - Severities >= warn trigger an admin email via lib/healthEvent.js.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { runDailyHealthCheck } from '@/lib/healthCheck';
import { recordHealthEvent } from '@/lib/healthEvent';

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron health-check] CRON_SECRET env var is not set — all requests rejected.');
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
    const summary = await runDailyHealthCheck(adminSupabase);
    return NextResponse.json(summary);
  } catch (err) {
    // Record the runner failure itself so we don't lose visibility when the
    // cron crashes before any audit can record its own event.
    await recordHealthEvent({
      source: 'cron_health_check_route',
      severity: 'critical',
      message: err?.message || 'Daily health-check route threw',
      context: { stack: err?.stack ? String(err.stack).slice(0, 1500) : null },
    });
    return NextResponse.json(
      { error: 'Health check failed', detail: err?.message || 'unknown' },
      { status: 500 },
    );
  }
}

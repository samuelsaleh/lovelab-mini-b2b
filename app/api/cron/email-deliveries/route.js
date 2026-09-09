/**
 * Daily delivery sweep.
 *
 * The Resend webhook is the primary source of delivery outcomes. This cron is
 * the safety net: every tracked email that is still 'sent' / 'delayed' /
 * 'unknown' after ten minutes is looked up with the API key
 * (GET /emails/:id) and updated. Bounces found this way raise the same admin
 * alert the webhook would have. Authenticated exactly like /api/backup.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sweepPendingDeliveries } from '@/lib/emailDeliveries';
import { recordHealthEvent } from '@/lib/healthEvent';

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron email-deliveries] CRON_SECRET env var is not set — all requests rejected.');
    return false;
  }
  return request.headers.get('x-vercel-cron-secret') === cronSecret;
}

export async function GET(request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const startedAt = new Date().toISOString();
  try {
    const adminSupabase = createAdminClient();
    const summary = await sweepPendingDeliveries(adminSupabase, { limit: 200 });
    return NextResponse.json({ ...summary, started_at: startedAt, finished_at: new Date().toISOString() });
  } catch (err) {
    await recordHealthEvent({
      source: 'cron_email_deliveries',
      severity: 'error',
      message: err?.message || 'Delivery sweep crashed',
      context: { started_at: startedAt },
    }).catch(() => {});
    return NextResponse.json({ error: err?.message || 'Sweep failed' }, { status: 500 });
  }
}

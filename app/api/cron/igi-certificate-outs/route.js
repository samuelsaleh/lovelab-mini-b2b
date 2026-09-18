/**
 * Sync LoveLab Certificate Out → B2B + retry failed Certificate In receipts.
 *
 * Auth: x-vercel-cron-secret === CRON_SECRET (same as igi-stock).
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { recordHealthEvent } from '@/lib/healthEvent';
import { syncCertificateOuts } from '@/lib/igi/syncCertificateOuts';
import { retryFailedReceipts } from '@/lib/igi/pushReceipt';

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron igi-certificate-outs] CRON_SECRET env var is not set — all requests rejected.');
    return false;
  }
  const headerSecret = request.headers.get('x-vercel-cron-secret');
  return headerSecret === cronSecret;
}

export async function GET(request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = { outs: null, receipts: null };

  try {
    const adminSupabase = createAdminClient();

    try {
      summary.outs = await syncCertificateOuts(adminSupabase);
      if (summary.outs.unmatched?.length) {
        await recordHealthEvent({
          source: 'cron_igi_certificate_outs',
          severity: 'warn',
          message:
            `${summary.outs.unmatched.length} LoveLab certificate out line(s) `
            + 'could not be matched to an IGI serial.',
          context: { unmatched: summary.outs.unmatched },
        });
      }
    } catch (err) {
      summary.outs = { error: err?.message || 'out sync failed' };
      await recordHealthEvent({
        source: 'cron_igi_certificate_outs',
        severity: 'error',
        message: `Certificate out sync failed: ${err?.message || 'unknown'}`,
      });
    }

    try {
      summary.receipts = await retryFailedReceipts(adminSupabase);
    } catch (err) {
      summary.receipts = { error: err?.message || 'receipt retry failed' };
      await recordHealthEvent({
        source: 'cron_igi_certificate_outs',
        severity: 'warn',
        message: `Certificate In receipt retry failed: ${err?.message || 'unknown'}`,
      });
    }

    const failed = summary.outs?.error || summary.receipts?.error;
    return NextResponse.json(summary, { status: failed ? 500 : 200 });
  } catch (err) {
    await recordHealthEvent({
      source: 'cron_igi_certificate_outs',
      severity: 'error',
      message: err?.message || 'Certificate ERP sync cron failed',
    });
    return NextResponse.json(
      { error: 'Certificate ERP sync failed', detail: err?.message || 'unknown' },
      { status: 500 },
    );
  }
}

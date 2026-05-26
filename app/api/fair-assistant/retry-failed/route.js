import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';

// Resets failed drafts back to 'draft_ready' so the next /send call (which the
// client already auto-loops) picks them up. We deliberately don't trigger a
// send here — sending happens via /api/fair-assistant/send, which already
// loops to drain the queue. This endpoint just unlocks the failed ones.
export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'fair-retry' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const batchId = body.batchId;
  if (!batchId) {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }

  const { data: failedDrafts, error } = await auth.adminSupabase
    .from('fair_email_drafts')
    .select('id')
    .eq('batch_id', batchId)
    .eq('status', 'failed');

  if (error) {
    return NextResponse.json({ error: 'Failed to load failed drafts' }, { status: 500 });
  }

  if (!failedDrafts?.length) {
    return NextResponse.json({ error: 'No failed drafts to retry' }, { status: 400 });
  }

  const { error: updateErr } = await auth.adminSupabase
    .from('fair_email_drafts')
    .update({ status: 'draft_ready', error: null, updated_at: new Date().toISOString() })
    .eq('batch_id', batchId)
    .eq('status', 'failed');

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to reset draft statuses' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    retried: failedDrafts.length,
    message: `${failedDrafts.length} draft${failedDrafts.length === 1 ? '' : 's'} reset to draft_ready. Press Send to retry.`,
  });
}

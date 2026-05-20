import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { triggerN8nSendWebhook } from '@/lib/fair-assistant/n8n';

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

  await auth.adminSupabase
    .from('fair_email_drafts')
    .update({ status: 'draft_ready', error: null, updated_at: new Date().toISOString() })
    .eq('batch_id', batchId)
    .eq('status', 'failed');

  try {
    await triggerN8nSendWebhook({ batchId });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Retry trigger failed' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, retried: failedDrafts.length });
}

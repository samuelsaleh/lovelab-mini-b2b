import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { triggerN8nSendWebhook } from '@/lib/fair-assistant/n8n';

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'fair-send' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  const batchId = body.batchId;
  if (!batchId) {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }

  const { count, error: countErr } = await auth.adminSupabase
    .from('fair_email_drafts')
    .select('*', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('status', 'draft_ready');

  if (countErr) {
    return NextResponse.json({ error: 'Failed to count drafts' }, { status: 500 });
  }

  if (!count) {
    return NextResponse.json({ error: 'No drafts ready to send. Run generate-all first.' }, { status: 400 });
  }

  await auth.adminSupabase
    .from('fair_batches')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', batchId);

  try {
    await triggerN8nSendWebhook({ batchId });
  } catch (err) {
    console.error('[fair-send]', err.message);
    return NextResponse.json({ error: err.message || 'Failed to trigger send workflow' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, queued: count });
}

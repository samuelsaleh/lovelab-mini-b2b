import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { verifyFairWebhookSecret } from '@/lib/fair-assistant/auth';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request) {
  const authErr = verifyFairWebhookSecret(request);
  if (authErr) return authErr;

  const body = await request.json();
  const { event, batchId, leadId, draftId, error: callbackError } = body;

  if (!batchId || !leadId) {
    return NextResponse.json({ error: 'batchId and leadId are required' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  if (event === 'email_sent') {
    await adminSupabase
      .from('fair_email_drafts')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() })
      .eq('batch_id', batchId)
      .eq('lead_id', leadId);

    await adminSupabase
      .from('fair_leads')
      .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', leadId);

    const { count: sentCount } = await adminSupabase
      .from('fair_leads')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .eq('status', 'sent');

    await adminSupabase
      .from('fair_batches')
      .update({ total_sent: sentCount || 0, updated_at: new Date().toISOString() })
      .eq('id', batchId);

    return NextResponse.json({ ok: true, duplicate: false, draftId: draftId || null });
  }

  if (event === 'email_failed') {
    await adminSupabase
      .from('fair_email_drafts')
      .update({ status: 'failed', error: callbackError || 'Send failed', updated_at: new Date().toISOString() })
      .eq('batch_id', batchId)
      .eq('lead_id', leadId);

    await adminSupabase
      .from('fair_leads')
      .update({ status: 'failed', error: callbackError || 'Send failed', updated_at: new Date().toISOString() })
      .eq('id', leadId);

    return NextResponse.json({ ok: true });
  }

  if (event === 'send_complete') {
    await adminSupabase
      .from('fair_batches')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', batchId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
}

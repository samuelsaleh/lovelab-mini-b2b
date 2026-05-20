import { NextResponse } from 'next/server';
import { verifyFairWebhookSecret } from '@/lib/fair-assistant/auth';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * n8n send-outreach workflow calls this to fetch draft_ready emails for a batch.
 */
export async function GET(request) {
  const authErr = verifyFairWebhookSecret(request);
  if (authErr) return authErr;

  const batchId = request.nextUrl.searchParams.get('batchId');
  if (!batchId) {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data: drafts, error } = await adminSupabase
    .from('fair_email_drafts')
    .select(`
      id,
      batch_id,
      lead_id,
      subject,
      body_html,
      language,
      status,
      fair_leads (
        id,
        first_name,
        last_name,
        email,
        company,
        salesforce_id
      )
    `)
    .eq('batch_id', batchId)
    .eq('status', 'draft_ready');

  if (error) {
    console.error('[fair-drafts GET]', error.message);
    return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 });
  }

  return NextResponse.json({ drafts: drafts || [] });
}

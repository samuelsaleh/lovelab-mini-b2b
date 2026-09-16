/**
 * "Check deliveries now" for one fair batch (Sam, 15 Sep 2026).
 *
 * The Resend webhook is the live source, and the daily sweep was a Vercel
 * cron that no longer runs on the self-hosted server. This asks Resend, with
 * the API key, about every email sent for the batch and updates the drafts
 * (delivered / opened / clicked / bounced). An email sent before delivery
 * tracking existed gets its tracking row first, so old batches catch up too.
 *
 * POST /api/fair-assistant/batches/:id/refresh-deliveries → { checked, updated, untracked, errors }
 */

import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { emailDeliveriesAvailable, recordSend, refreshDelivery } from '@/lib/emailDeliveries';

const LIMIT = 200;

export async function POST(request, { params }) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'fair-refresh-deliveries' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const adminSupabase = auth.adminSupabase;

  if (!(await emailDeliveriesAvailable(adminSupabase))) {
    return NextResponse.json({ error: 'Delivery tracking is not set up — run supabase/migrations/20260909120000_email_deliveries.sql.' }, { status: 503 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not set on the server, so Resend cannot be asked.' }, { status: 503 });
  }

  const { data: drafts, error } = await adminSupabase
    .from('fair_email_drafts')
    .select('id, lead_id, message_id, subject, sent_at, status')
    .eq('batch_id', id)
    .eq('status', 'sent')
    .not('message_id', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(LIMIT);
  if (error) return NextResponse.json({ error: 'Failed to load the batch emails' }, { status: 500 });

  const leadIds = [...new Set((drafts || []).map((d) => d.lead_id).filter(Boolean))];
  const emailByLead = new Map();
  if (leadIds.length) {
    const { data: leads } = await adminSupabase.from('fair_leads').select('id, email').in('id', leadIds);
    for (const l of leads || []) emailByLead.set(l.id, l.email || null);
  }

  const summary = { checked: 0, updated: 0, untracked: 0, errors: 0, byStatus: {} };
  for (const draft of drafts || []) {
    let res = await refreshDelivery(adminSupabase, draft.message_id);
    if (!res.ok && res.reason === 'untracked') {
      // Sent before tracking existed: remember it now, then ask again.
      await recordSend(adminSupabase, {
        resendId: draft.message_id, kind: 'fair_outreach', draftId: draft.id,
        recipient: emailByLead.get(draft.lead_id) || null, subject: draft.subject || null, sentAt: draft.sent_at || null,
      });
      res = await refreshDelivery(adminSupabase, draft.message_id);
      if (res.ok) summary.untracked += 1;
    }
    summary.checked += 1;
    if (!res.ok) { summary.errors += 1; continue; }
    if (res.changed) summary.updated += 1;
    if (res.status) summary.byStatus[res.status] = (summary.byStatus[res.status] || 0) + 1;
  }
  return NextResponse.json(summary);
}

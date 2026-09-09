/**
 * "Check delivery now" — ask Resend about the emails behind one order or one
 * fair draft, with the API key, and update what the screens show.
 *
 * POST { document_id } | { draft_id } | { resend_id }
 * Admins only. Rate limited; each call is at most a handful of Resend GETs.
 */

import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUserContext } from '@/app/api/_lib/access';
import { emailDeliveriesAvailable, refreshDelivery, explainDelivery } from '@/lib/emailDeliveries';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'email-deliveries-refresh' });
  if (rateLimitRes) return rateLimitRes;

  const supabase = await createClient();
  const { user, isAdmin } = await getUserContext(supabase);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const adminSupabase = createAdminClient();
  if (!(await emailDeliveriesAvailable(adminSupabase))) {
    return NextResponse.json({ error: 'Delivery tracking is not set up — run supabase/migrations/20260909120000_email_deliveries.sql.' }, { status: 503 });
  }

  let query = adminSupabase.from('email_deliveries').select('resend_id, kind, recipient, status, sent_at');
  if (body.resend_id) {
    query = query.eq('resend_id', String(body.resend_id));
  } else if (body.document_id && UUID_RE.test(body.document_id)) {
    query = query.eq('document_id', body.document_id);
  } else if (body.draft_id && UUID_RE.test(body.draft_id)) {
    query = query.eq('draft_id', body.draft_id);
  } else {
    return NextResponse.json({ error: 'Provide document_id, draft_id or resend_id' }, { status: 400 });
  }

  const { data: rows, error } = await query.order('sent_at', { ascending: false }).limit(5);
  if (error) return NextResponse.json({ error: 'Failed to load deliveries' }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ deliveries: [], message: 'No tracked email for this item yet.' });

  const deliveries = [];
  for (const row of rows) {
    const res = await refreshDelivery(adminSupabase, row.resend_id);
    const status = res.ok ? res.status || row.status : row.status;
    const explained = explainDelivery(status);
    deliveries.push({
      resend_id: row.resend_id,
      kind: row.kind,
      recipient: row.recipient,
      status,
      label: explained.label,
      advice: explained.advice,
      refreshed: Boolean(res.ok),
      error: res.ok ? null : res.reason || 'refresh_failed',
    });
  }
  return NextResponse.json({ deliveries });
}

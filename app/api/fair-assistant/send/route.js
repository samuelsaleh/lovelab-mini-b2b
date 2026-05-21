import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { sendEmail } from '@/lib/send-email';
import { findB2BFileByPath } from '@/lib/b2b-files';

// Vercel Hobby functions have a ~10s wall-clock limit. Instead of capping
// the batch size, we time-box the loop: each worker checks an 8.5s deadline
// before picking up another draft, and the response returns `remaining` so
// the client can auto-loop until the queue is drained. This lets the user
// press Send once even with hundreds of drafts queued.
const CONCURRENCY = 8;
const TIME_BUDGET_MS = 8500;
const HARD_LIMIT = 500; // safety: never load more than 500 drafts per request

async function mapPoolWithDeadline(items, limit, deadlineAt, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      if (Date.now() >= deadlineAt) return;
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

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

  const startedAt = Date.now();
  const deadlineAt = startedAt + TIME_BUDGET_MS;

  // Load the batch first so we know which PDFs to attach to every email.
  const { data: batch } = await auth.adminSupabase
    .from('fair_batches')
    .select('id, attached_files')
    .eq('id', batchId)
    .single();

  // Materialize attachment buffers once, reuse across the whole send loop.
  // Files live in /public so we fetch them by absolute URL from this same
  // deployment — NEXT_PUBLIC_SITE_URL or the request origin both work.
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const attachmentPaths = Array.isArray(batch?.attached_files) ? batch.attached_files : [];
  const attachments = [];
  for (const path of attachmentPaths) {
    const file = findB2BFileByPath(path);
    if (!file) continue; // unknown path, ignore silently
    try {
      const fileUrl = `${siteOrigin.replace(/\/$/, '')}${path}`;
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) {
        console.error('[fair-send] attachment fetch failed', file.path, fileRes.status);
        continue;
      }
      const arrayBuf = await fileRes.arrayBuffer();
      attachments.push({ filename: file.name, content: Buffer.from(arrayBuf) });
    } catch (err) {
      console.error('[fair-send] attachment fetch error', file.path, err.message);
    }
  }

  // Pull this batch's draft_ready drafts together with their lead's email.
  const { data: drafts, error: draftsErr } = await auth.adminSupabase
    .from('fair_email_drafts')
    .select('id, subject, body_html, lead:fair_leads!inner(id, email, first_name, last_name, status)')
    .eq('batch_id', batchId)
    .eq('status', 'draft_ready')
    .limit(HARD_LIMIT);

  if (draftsErr) {
    console.error('[fair-send] load drafts:', draftsErr.message);
    return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 });
  }

  if (!drafts?.length) {
    return NextResponse.json({ error: 'No drafts ready to send. Run "Generate all drafts" first.' }, { status: 400 });
  }

  await auth.adminSupabase
    .from('fair_batches')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', batchId);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  await mapPoolWithDeadline(drafts, CONCURRENCY, deadlineAt, async (draft) => {
    const lead = draft.lead;
    const to = (lead?.email || '').trim();

    if (!to) {
      // No email address on the card — mark the draft as failed but don't
      // count it as a real send failure; the UI surfaces it as "skipped".
      skipped += 1;
      await auth.adminSupabase
        .from('fair_email_drafts')
        .update({
          status: 'failed',
          error: 'No email address on the lead',
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);
      return;
    }

    const result = await sendEmail({
      to,
      subject: draft.subject,
      html: draft.body_html,
      // Resend sender defaults to lib/email.getSenderFrom(); reply-to lets
      // recipients reply straight to Alberto's existing inbox.
      replyTo: 'alberto@love-lab.com',
      // PDFs/Excels the user picked in Outreach → Attachments. Materialized
      // once at the top of this request so we don't refetch per draft.
      attachments: attachments.length ? attachments : undefined,
    });

    if (result.sent) {
      sent += 1;
      await auth.adminSupabase
        .from('fair_email_drafts')
        .update({
          status: 'sent',
          message_id: result.message_id || null,
          sent_at: new Date().toISOString(),
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);
    } else {
      failed += 1;
      await auth.adminSupabase
        .from('fair_email_drafts')
        .update({
          status: 'failed',
          error: `${result.reason}${result.status ? ` (HTTP ${result.status})` : ''}${result.error ? ` — ${String(result.error).slice(0, 200)}` : ''}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);
    }
  });

  // Refresh batch counters and status.
  const [{ count: stillReady }, { count: totalSent }, { count: totalFailed }] = await Promise.all([
    auth.adminSupabase.from('fair_email_drafts').select('*', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'draft_ready'),
    auth.adminSupabase.from('fair_email_drafts').select('*', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'sent'),
    auth.adminSupabase.from('fair_email_drafts').select('*', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'failed'),
  ]);

  const nextStatus = stillReady ? 'sending' : 'complete';
  await auth.adminSupabase
    .from('fair_batches')
    .update({
      status: nextStatus,
      total_sent: totalSent || 0,
      total_failed: totalFailed || 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    skipped,
    remaining: stillReady || 0,
    message: stillReady
      ? `${sent} sent, ${failed} failed, ${skipped} skipped. ${stillReady} more drafts ready — press Send again to continue.`
      : `${sent} sent, ${failed} failed, ${skipped} skipped. Batch complete.`,
  });
}

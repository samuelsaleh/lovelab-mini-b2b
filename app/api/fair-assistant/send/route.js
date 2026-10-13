import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
import { sendEmail } from '@/lib/send-email';
import { findB2BFileByPath } from '@/lib/b2b-files';
import { packTemplateIdFromPath, resolvePackTemplate } from '@/lib/packTemplates';
import { publicAssetUrl } from '@/lib/publicAssetHref';
import { recordSend, blockedRecipients } from '@/lib/emailDeliveries';
import { resendPacer } from '@/lib/resendPacer';
import { mapPoolWithDeadline } from '@/lib/mapPoolWithDeadline';

// One call works for about CHUNK_SECONDS, then returns `remaining`; the screen
// keeps calling until the queue is drained (and shows "12 of 30 sent"). The
// pacing itself lives in lib/resendPacer.js: one send STARTS every 333 ms,
// never more than 3 per second, shared with every other mail the app sends.
const CONCURRENCY = 3;        // in flight at once: hides network latency; the pacer decides when each send starts
const SLICE = 6;              // drafts claimed at a time, so nothing sits claimed-but-unsent for long
const HARD_LIMIT = 500;       // safety: never touch more than 500 drafts per request
const STALE_SENDING_MS = 5 * 60 * 1000;   // a draft left in 'sending' this long was orphaned by a crashed call

const chunkSeconds = () => Number(process.env.FAIR_SEND_CHUNK_SECONDS) || 25;
const isTestBatch = (batch) => /^\s*\[TEST\]/i.test(batch?.name || '');

// Same draft + same text = same key, so Resend returns the first result if a
// retry (or a second call) sends it again within 24 h. Changed text = new key.
function idempotencyKeyFor(draft) {
  const hash = crypto.createHash('sha1').update(`${draft.subject}\n${draft.body_html}`).digest('hex').slice(0, 12);
  return `fair-${draft.id}-${hash}`;
}

async function mapPool(items, limit, fn) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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

  const deadlineAt = Date.now() + chunkSeconds() * 1000;

  // Load the batch first so we know which PDFs to attach to every email.
  const { data: batch } = await auth.adminSupabase
    .from('fair_batches')
    .select('id, name, attached_files')
    .eq('id', batchId)
    .single();

  // Materialize attachment buffers once, reuse across the whole send loop.
  // Files live in /public so we fetch them by absolute URL from this same
  // deployment — NEXT_PUBLIC_SITE_URL or the request origin both work.
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const attachmentPaths = Array.isArray(batch?.attached_files) ? batch.attached_files : [];
  // Resend caps attachments at ~40 MB per email. We stay safely under that
  // (35 MB) to leave headroom for the HTML body, headers, and encoding overhead.
  const RESEND_ATTACHMENT_BUDGET = 35 * 1024 * 1024;
  const attachments = [];
  let attachmentBytes = 0;
  const skippedAttachments = [];
  for (const path of attachmentPaths) {
    // Pack templates are generated/private — resolve their bytes via the
    // service role (no HTTP/auth round-trip), self-healing if missing.
    const packTemplateId = packTemplateIdFromPath(path);
    if (packTemplateId) {
      try {
        const resolved = await resolvePackTemplate(auth.adminSupabase, packTemplateId);
        if (!resolved) {
          skippedAttachments.push({ path, reason: 'unknown_path' });
          continue;
        }
        if (attachmentBytes + resolved.buffer.length > RESEND_ATTACHMENT_BUDGET) {
          return NextResponse.json({
            error: `Attachments too large. Selected files total ${Math.round((attachmentBytes + resolved.buffer.length) / 1024 / 1024)} MB; Resend limit is ~40 MB per email. Deselect a few files in the Attachments panel and try again.`,
            attachedBytes: attachmentBytes,
            rejectedFile: resolved.fileName,
          }, { status: 413 });
        }
        attachmentBytes += resolved.buffer.length;
        attachments.push({ filename: resolved.fileName, content: resolved.buffer });
      } catch (err) {
        console.error('[fair-send] pack template resolve error', path, err.message);
        skippedAttachments.push({ path, reason: 'fetch_error' });
      }
      continue;
    }

    const file = findB2BFileByPath(path);
    if (!file) {
      // Unknown path — could be a stale reference. Surface in response.
      skippedAttachments.push({ path, reason: 'unknown_path' });
      continue;
    }
    try {
      const fileUrl = publicAssetUrl(siteOrigin, path);
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) {
        console.error('[fair-send] attachment fetch failed', file.path, fileRes.status);
        skippedAttachments.push({ path, reason: `fetch_${fileRes.status}` });
        continue;
      }
      const arrayBuf = await fileRes.arrayBuffer();
      if (attachmentBytes + arrayBuf.byteLength > RESEND_ATTACHMENT_BUDGET) {
        // Adding this file would blow past Resend's limit and every email in
        // this batch would 413. Refuse the batch entirely — better than half-
        // sending some and corrupting the failed/sent counters.
        return NextResponse.json({
          error: `Attachments too large. Selected files total ${Math.round((attachmentBytes + arrayBuf.byteLength) / 1024 / 1024)} MB; Resend limit is ~40 MB per email. Deselect a few files in the Attachments panel and try again.`,
          attachedBytes: attachmentBytes,
          rejectedFile: file.name,
        }, { status: 413 });
      }
      attachmentBytes += arrayBuf.byteLength;
      attachments.push({ filename: file.name, content: Buffer.from(arrayBuf) });
    } catch (err) {
      console.error('[fair-send] attachment fetch error', file.path, err.message);
      skippedAttachments.push({ path, reason: 'fetch_error' });
    }
  }

  const db = auth.adminSupabase;
  const now = () => new Date().toISOString();

  // 0. Free drafts a crashed call left in 'sending' (safe: the idempotency key
  //    makes a second send of the same text return Resend's first answer).
  await db
    .from('fair_email_drafts')
    .update({ status: 'draft_ready', updated_at: now() })
    .eq('batch_id', batchId)
    .eq('status', 'sending')
    .lt('updated_at', new Date(Date.now() - STALE_SENDING_MS).toISOString());

  const readyCount = async () => {
    const { count } = await db.from('fair_email_drafts').select('*', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'draft_ready');
    return count || 0;
  };

  if (!(await readyCount())) {
    const { count: anyDrafts } = await db.from('fair_email_drafts').select('*', { count: 'exact', head: true }).eq('batch_id', batchId);
    if (!anyDrafts) {
      return NextResponse.json({ error: 'No drafts ready to send. Run "Generate all drafts" first.' }, { status: 400 });
    }
    // Everything is sent (or failed, or being sent by another call): pressing Send again is not an error.
    return NextResponse.json({
      ok: true, sent: 0, failed: 0, skipped: 0, deferred: 0, remaining: 0, blocked: null,
      perSecond: perSecondReport(),
      message: 'Nothing to send: every draft is already sent. Use "Retry failed" for the ones that failed.',
    });
  }

  await db.from('fair_batches').update({ status: 'sending', updated_at: now() }).eq('id', batchId);

  const testMode = isTestBatch(batch);
  const testRecipient = auth.user?.email || null;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;
  let blocked = null;
  let retryAfterMs = 0;
  let claimedTotal = 0;

  const setDraft = (id, patch) => db.from('fair_email_drafts').update({ ...patch, updated_at: now() }).eq('id', id);
  const release = (id, note) => setDraft(id, { status: 'draft_ready', error: note });

  // 1. Claim a few, 2. send them (paced), 3. mark each one, until the time is up.
  while (Date.now() < deadlineAt && claimedTotal < HARD_LIMIT && !blocked && !deferred) {
    const { data: candidates, error: candErr } = await db
      .from('fair_email_drafts').select('id').eq('batch_id', batchId).eq('status', 'draft_ready').limit(SLICE);
    if (candErr) {
      console.error('[fair-send] load drafts:', candErr.message);
      return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 });
    }
    if (!candidates?.length) break;

    // Atomic: only rows that are STILL draft_ready flip to 'sending'. A second call gets none of them.
    const { data: claimed, error: claimErr } = await db
      .from('fair_email_drafts')
      .update({ status: 'sending', updated_at: now() })
      .in('id', candidates.map((d) => d.id))
      .eq('status', 'draft_ready')
      .select('id, subject, body_html, lead:fair_leads!inner(id, email, first_name, last_name, status)');
    if (claimErr) {
      console.error('[fair-send] claim drafts:', claimErr.message);
      return NextResponse.json({ error: 'Failed to claim drafts' }, { status: 500 });
    }
    if (!claimed?.length) continue;           // another call took them; look again
    claimedTotal += claimed.length;

    // Never mail an address that bounced hard, complained, or is suppressed (a test batch only mails the admin).
    const blockedMap = testMode
      ? new Map()
      : await blockedRecipients(db, claimed.map((d) => d.lead?.email));

    await mapPool(claimed, CONCURRENCY, async (draft) => {
      const lead = draft.lead;
      const realTo = (lead?.email || '').trim();

      if (!realTo) {
        // No email address on the card — failed, but counted as "skipped", not a send failure.
        skipped += 1;
        await setDraft(draft.id, { status: 'failed', error: 'No email address on the lead' });
        return;
      }
      const blockedReason = blockedMap.get(realTo.toLowerCase());
      if (blockedReason) {
        skipped += 1;
        await setDraft(draft.id, { status: 'failed', error: `${blockedReason} — not sent` });
        return;
      }
      if (!draft.body_html || !String(draft.body_html).trim() || !draft.subject) {
        // A draft with no email in it (its translation was refused) must never reach Resend.
        skipped += 1;
        await setDraft(draft.id, { status: 'failed', error: 'No email content — run "Generate all drafts" so this lead gets a verified translation' });
        return;
      }
      if (testMode && !testRecipient) {
        failed += 1;
        await setDraft(draft.id, { status: 'failed', error: 'Test batch: your login has no email address to send the test to' });
        return;
      }

      const result = await sendEmail({
        to: testMode ? testRecipient : realTo,
        subject: testMode ? `[to: ${realTo}] ${draft.subject}` : draft.subject,
        html: draft.body_html,
        // Resend sender defaults to lib/email.getSenderFrom(); reply-to lets recipients
        // reply straight to the sales inbox (FAIR_REPLY_TO, alberto@love-lab.com until Sam picks another).
        replyTo: process.env.FAIR_REPLY_TO || 'alberto@love-lab.com',
        // PDFs/Excels the user picked in Outreach → Attachments. Materialized
        // once at the top of this request so we don't refetch per draft.
        attachments: attachments.length ? attachments : undefined,
        idempotencyKey: idempotencyKeyFor(draft),
      });

      if (result.sent) {
        sent += 1;
        await setDraft(draft.id, { status: 'sent', message_id: result.message_id || null, sent_at: now(), error: null });
        // Track the outcome (delivered / bounced / opened) — see lib/emailDeliveries.js.
        await recordSend(db, {
          resendId: result.message_id || null,
          kind: 'fair_outreach',
          draftId: draft.id,
          recipient: testMode ? testRecipient : realTo,
          subject: draft.subject,
        });
      } else if (result.reason === 'quota_exceeded') {
        // Waiting does not help: stop, keep the draft, say so.
        blocked = 'quota';
        await release(draft.id, 'Resend quota reached — nothing was lost. Press Send again once it has reset or the plan is upgraded.');
      } else if (result.retryable) {
        // Rate-limited or Resend unavailable after the retries: keep the draft, try again on the next call.
        deferred += 1;
        retryAfterMs = Math.max(retryAfterMs, result.retryAfterMs || 0);
        await release(draft.id, 'Waiting for Resend (rate limit) — will retry');
      } else {
        failed += 1;
        await setDraft(draft.id, {
          status: 'failed',
          error: `${result.reason}${result.status ? ` (HTTP ${result.status})` : ''}${result.error ? ` — ${String(result.error).slice(0, 200)}` : ''}`,
        });
      }
    });

    // Anything in this slice that a stop left claimed-but-unsent goes back (nothing is, today; belt and braces).
    if (blocked || deferred) {
      await db.from('fair_email_drafts').update({ status: 'draft_ready', updated_at: now() }).in('id', claimed.map((d) => d.id)).eq('status', 'sending');
    }
  }

  // Refresh batch counters and status.
  const [{ count: stillReady }, { count: totalSent }, { count: totalFailed }] = await Promise.all([
    db.from('fair_email_drafts').select('*', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'draft_ready'),
    db.from('fair_email_drafts').select('*', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'sent'),
    db.from('fair_email_drafts').select('*', { count: 'exact', head: true }).eq('batch_id', batchId).eq('status', 'failed'),
  ]);

  const remaining = stillReady || 0;
  await db
    .from('fair_batches')
    .update({ status: remaining ? 'sending' : 'complete', total_sent: totalSent || 0, total_failed: totalFailed || 0, updated_at: now() })
    .eq('id', batchId);

  const parts = [`${sent} sent, ${failed} failed, ${skipped} skipped.`];
  if (blocked === 'quota') parts.push("Resend's quota is reached: nothing was lost; press Send again once it has reset.");
  else if (deferred) parts.push(`${deferred} waiting for Resend's rate limit; they will be retried.`);
  else if (remaining) parts.push(`${remaining} more drafts ready — press Send again to continue.`);
  else parts.push('Batch complete.');

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    skipped,
    deferred,
    remaining,
    blocked,
    retryAfterMs: retryAfterMs || undefined,
    perSecond: perSecondReport(),
    message: parts.join(' '),
  });
}

// The pacer's rate, for the screen ("max 3 per second"); null when unlimited (tests, local dev).
function perSecondReport() {
  const n = resendPacer.perSecond;
  return Number.isFinite(n) && n > 0 ? n : null;
}

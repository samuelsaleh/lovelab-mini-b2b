/**
 * Email delivery tracking — what happened to an email after Resend took it.
 *
 * Sam, 9 Sept 2026: an order confirmation was accepted by Resend, delivered
 * to the three internal copies, and bounced for the client. Nobody knew.
 *
 * Every send now leaves a row in email_deliveries (recordSend). Resend then
 * tells us the outcome two ways:
 *   - push: the webhook at /api/webhooks/resend → applyResendEvent
 *   - pull: GET https://api.resend.com/emails/:id with the API key
 *           → refreshDelivery, run daily by /api/cron/email-deliveries for
 *             anything the webhook hasn't settled, and on demand.
 *
 * The outcome is mirrored onto the order (documents.metadata.client_email)
 * and onto the fair draft (fair_email_drafts.delivery_*) so the existing
 * screens can show it, and a bounce / complaint / failure records a health
 * event so an admin is emailed with what to do about it.
 *
 * Server-only.
 */

import { recordHealthEvent as defaultRecordHealthEvent } from '@/lib/healthEvent';

export const DELIVERY_STATUSES = [
  'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'suppressed', 'unknown',
];
export const BAD_STATUSES = new Set(['bounced', 'complained', 'failed', 'suppressed']);
export const PENDING_STATUSES = ['sent', 'delivery_delayed', 'unknown'];

const RESEND_API = 'https://api.resend.com';

// ── Table probe ─────────────────────────────────────────────────────────────
// Mirrors lib/agentIdColumn.js: never reference the table until the migration
// is applied, so a migration-behind environment keeps sending email as before.
let tableCache = null;
export async function emailDeliveriesAvailable(adminSupabase) {
  if (tableCache !== null) return tableCache;
  try {
    const query = adminSupabase.from('email_deliveries').select('id');
    if (!query || typeof query.limit !== 'function') { tableCache = false; return false; }
    const { error } = await query.limit(1);
    tableCache = !error;
  } catch {
    tableCache = false;
  }
  return tableCache;
}
export function _resetEmailDeliveriesProbe() { tableCache = null; }

// ── Meaning ─────────────────────────────────────────────────────────────────

/** Resend event/last_event name → our status. Opens and clicks imply delivery. */
export function statusFromResendEvent(eventType) {
  const t = String(eventType || '').replace(/^email\./, '');
  switch (t) {
    case 'sent': return 'sent';
    case 'delivered': return 'delivered';
    case 'opened':
    case 'clicked': return 'delivered';
    case 'delivery_delayed': return 'delivery_delayed';
    case 'bounced': return 'bounced';
    case 'complained': return 'complained';
    case 'failed': return 'failed';
    case 'suppressed': return 'suppressed';
    case 'queued':
    case 'scheduled': return 'sent';
    default: return 'unknown';
  }
}

/**
 * Plain words for a delivery outcome, with what to do about it.
 * @returns {{ label: string, tone: 'good'|'neutral'|'warn'|'bad', advice: string }}
 */
export function explainDelivery(status, { bounceType, bounceSubType, message } = {}) {
  const msg = String(message || '').trim();
  const low = msg.toLowerCase();
  switch (status) {
    case 'delivered':
      return { label: 'Delivered', tone: 'good', advice: 'Reached the client’s mail server.' };
    case 'sent':
      return { label: 'Sent', tone: 'neutral', advice: 'Accepted by Resend, waiting for the client’s mail server to confirm.' };
    case 'delivery_delayed':
      return {
        label: 'Delayed',
        tone: 'warn',
        advice: 'The client’s mail server is slow or temporarily refusing. Resend keeps retrying for up to 72 hours. If it is still delayed tomorrow, check the address with the client.',
      };
    case 'complained':
      return { label: 'Marked as spam', tone: 'bad', advice: 'The recipient reported it as spam. Do not email this address again without asking them first.' };
    case 'suppressed':
      return {
        label: 'Blocked by Resend',
        tone: 'bad',
        advice: 'Resend refuses to send to this address because it bounced before. Ask the client for another address, or remove it from the suppression list in the Resend dashboard.',
      };
    case 'failed':
      return { label: 'Not sent', tone: 'bad', advice: `Resend could not send it${msg ? `: ${msg}` : ''}. Try again; if it happens twice, check the Resend dashboard.` };
    case 'bounced': {
      let advice;
      if (String(bounceSubType || '').toLowerCase() === 'suppressed') {
        advice = 'Resend refuses to send to this address because it bounced before. Ask the client for another address, or remove it from the suppression list in the Resend dashboard.';
      } else if (/does not exist|no such user|user unknown|unknown user|not found|5\.1\.1|5\.1\.0|invalid recipient|recipient rejected|no mailbox/.test(low)) {
        advice = 'The address does not exist. Check the spelling with the client and send again.';
      } else if (/mailbox full|over quota|quota exceeded|5\.2\.2/.test(low)) {
        advice = 'The client’s mailbox is full. Ask them to clear space or give another address.';
      } else if (/too large|size limit|message size|exceeds.*size|5\.3\.4|552/.test(low)) {
        advice = 'The message is too large for the client’s mailbox. Send the confirmation again without the catalogue attachment.';
      } else if (/spam|blocked|blacklist|policy|reputation|5\.7\./.test(low)) {
        advice = 'The client’s mail server blocked it as spam or by policy. Ask them to allow dionne@love-lab.com, or use another address.';
      } else if (String(bounceType || '').toLowerCase() === 'transient' || /temporar|try again|greylist|4\.\d\.\d/.test(low)) {
        advice = 'A temporary problem on the client’s side. Send it again later; if it bounces again, check the address.';
      } else {
        advice = `Permanently rejected by the client’s mail server${msg ? `: ${msg}` : ''}. Check the address with the client.`;
      }
      return { label: 'Bounced', tone: 'bad', advice };
    }
    default:
      return { label: 'Unknown', tone: 'neutral', advice: 'No delivery information yet.' };
  }
}

// ── Mirrors ─────────────────────────────────────────────────────────────────

async function mirrorToDocument(adminSupabase, row) {
  if (!row?.document_id) return;
  const { data: doc } = await adminSupabase
    .from('documents')
    .select('id, metadata')
    .eq('id', row.document_id)
    .maybeSingle();
  if (!doc) return;
  const client_email = {
    resend_id: row.resend_id,
    recipient: row.recipient || null,
    status: row.status,
    detail: row.detail || null,
    advice: row.advice || null,
    sent_at: row.sent_at || null,
    last_event_at: row.last_event_at || null,
  };
  await adminSupabase
    .from('documents')
    .update({ metadata: { ...(doc.metadata || {}), client_email } })
    .eq('id', doc.id);
}

async function mirrorToDraft(adminSupabase, row) {
  if (!row?.draft_id) return;
  const payload = {
    delivery_status: row.status,
    delivery_error: BAD_STATUSES.has(row.status) || row.status === 'delivery_delayed'
      ? [row.detail, row.advice].filter(Boolean).join(' — ')
      : null,
    updated_at: new Date().toISOString(),
  };
  await adminSupabase.from('fair_email_drafts').update(payload).eq('id', row.draft_id);
}

async function alertIfBad(row, recordHealthEvent) {
  if (!BAD_STATUSES.has(row.status)) return;
  await recordHealthEvent({
    source: `email_delivery_${row.status}`,
    severity: 'error',
    message: `${labelForKind(row.kind)} to ${row.recipient || 'unknown address'} ${row.status}: ${row.detail || 'no detail from Resend'}`,
    context: {
      resendId: row.resend_id,
      kind: row.kind,
      documentId: row.document_id || null,
      draftId: row.draft_id || null,
      recipient: row.recipient || null,
      subject: row.subject || null,
      status: row.status,
      bounceType: row.bounce_type || null,
      bounceSubType: row.bounce_subtype || null,
      whatToDo: row.advice || null,
    },
  });
}

function labelForKind(kind) {
  switch (kind) {
    case 'order_confirmation': return 'Order confirmation';
    case 'fair_outreach': return 'Fair follow-up';
    case 'internal_notice': return 'Internal notice';
    default: return 'Email';
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Remember a send. Call right after Resend accepted the email.
 * Never throws; a missing table just means "not tracked".
 */
export async function recordSend(adminSupabase, { resendId, kind = 'other', documentId = null, draftId = null, recipient = null, subject = null, sentAt = null } = {}) {
  if (!resendId) return { ok: false, reason: 'no_resend_id' };
  try {
    if (!(await emailDeliveriesAvailable(adminSupabase))) return { ok: false, reason: 'table_missing' };
    const explained = explainDelivery('sent');
    const row = {
      resend_id: resendId,
      kind,
      document_id: documentId,
      draft_id: draftId,
      recipient: Array.isArray(recipient) ? recipient.join(', ') : recipient,
      subject,
      status: 'sent',
      advice: explained.advice,
      sent_at: sentAt || new Date().toISOString(),
    };
    const { error } = await adminSupabase
      .from('email_deliveries')
      .upsert(row, { onConflict: 'resend_id', ignoreDuplicates: true });
    if (error) throw error;
    // The order shows "emailed" straight away, before any webhook arrives.
    await mirrorToDocument(adminSupabase, row);
    return { ok: true };
  } catch (err) {
    console.error('[emailDeliveries] recordSend failed (non-blocking):', err?.message);
    return { ok: false, reason: 'error', error: err?.message };
  }
}

/**
 * Apply an outcome to a tracked email. Shared by the webhook and the poller.
 * Older events never overwrite newer ones.
 */
export async function applyDeliveryUpdate(adminSupabase, {
  resendId, status, detail = null, bounceType = null, bounceSubType = null, eventAt = null, checkedAt = null,
}, deps = {}) {
  const recordHealthEvent = deps.recordHealthEvent || defaultRecordHealthEvent;
  if (!resendId || !status) return { ok: false, reason: 'bad_input' };
  try {
    if (!(await emailDeliveriesAvailable(adminSupabase))) return { ok: false, reason: 'table_missing' };
    const { data: existing } = await adminSupabase
      .from('email_deliveries')
      .select('*')
      .eq('resend_id', resendId)
      .maybeSingle();
    if (!existing) return { ok: false, reason: 'untracked' };

    const eventTime = eventAt ? new Date(eventAt).getTime() : Date.now();
    const lastTime = existing.last_event_at ? new Date(existing.last_event_at).getTime() : 0;
    if (Number.isFinite(eventTime) && eventTime < lastTime) {
      return { ok: true, ignored: 'older_event', status: existing.status };
    }

    const previousStatus = existing.status;
    const explained = explainDelivery(status, { bounceType, bounceSubType, message: detail });
    const patch = {
      status,
      detail: detail || (status === previousStatus ? existing.detail : null),
      advice: explained.advice,
      bounce_type: bounceType || null,
      bounce_subtype: bounceSubType || null,
      last_event_at: eventAt || new Date().toISOString(),
      checked_at: checkedAt || existing.checked_at || null,
    };
    const { data: updated, error } = await adminSupabase
      .from('email_deliveries')
      .update(patch)
      .eq('resend_id', resendId)
      .select()
      .single();
    if (error) throw error;

    const row = updated || { ...existing, ...patch };
    await mirrorToDocument(adminSupabase, row);
    await mirrorToDraft(adminSupabase, row);
    const changed = previousStatus !== status;
    if (changed) await alertIfBad(row, recordHealthEvent);
    return { ok: true, status, changed };
  } catch (err) {
    console.error('[emailDeliveries] applyDeliveryUpdate failed:', err?.message);
    return { ok: false, reason: 'error', error: err?.message };
  }
}

/** Webhook payload from Resend → applyDeliveryUpdate. Ignores non-email events. */
export async function applyResendEvent(adminSupabase, event, deps = {}) {
  const type = event?.type;
  if (!type || !type.startsWith('email.')) return { ok: true, ignored: 'not_an_email_event' };
  const data = event.data || {};
  const status = statusFromResendEvent(type);
  if (status === 'unknown') return { ok: true, ignored: 'unhandled_event', type };
  if (type === 'email.opened' || type === 'email.clicked') {
    // Only a signal of delivery; never downgrade a terminal bad state.
    return applyDeliveryUpdate(adminSupabase, {
      resendId: data.email_id, status: 'delivered', eventAt: event.created_at || data.created_at || null,
    }, deps);
  }
  return applyDeliveryUpdate(adminSupabase, {
    resendId: data.email_id,
    status,
    detail: data.bounce?.message || data.failed?.reason || data.reason || null,
    bounceType: data.bounce?.type || null,
    bounceSubType: data.bounce?.subType || null,
    eventAt: event.created_at || data.created_at || null,
  }, deps);
}

// ── Pull path (API key) ─────────────────────────────────────────────────────

/** Ask Resend what happened to one email. Uses the same key as sending. */
export async function fetchResendEmail(resendId, { fetchImpl = fetch } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_api_key' };
  const res = await fetchImpl(`${RESEND_API}/emails/${encodeURIComponent(resendId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, reason: 'resend_error', status: res.status, error: body?.message || body?.error || null };
  return { ok: true, email: body };
}

export async function refreshDelivery(adminSupabase, resendId, deps = {}) {
  const fetched = await fetchResendEmail(resendId, { fetchImpl: deps.fetchImpl });
  if (!fetched.ok) return fetched;
  const lastEvent = fetched.email?.last_event;
  const status = statusFromResendEvent(lastEvent);
  const now = new Date().toISOString();
  if (status === 'unknown') {
    if (await emailDeliveriesAvailable(adminSupabase)) {
      await adminSupabase.from('email_deliveries').update({ checked_at: now }).eq('resend_id', resendId);
    }
    return { ok: true, status: 'unknown', lastEvent };
  }
  return applyDeliveryUpdate(adminSupabase, { resendId, status, checkedAt: now }, deps);
}

/**
 * Daily fallback for anything the webhook did not settle: every tracked email
 * still 'sent' / 'delayed' / 'unknown', older than 10 minutes and younger
 * than 7 days (Resend keeps retrying for 72 h). Bounded per run.
 */
export async function sweepPendingDeliveries(adminSupabase, { limit = 100, now = new Date(), fetchImpl, recordHealthEvent } = {}) {
  if (!(await emailDeliveriesAvailable(adminSupabase))) return { ok: false, reason: 'table_missing', checked: 0 };
  const olderThan = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const youngerThan = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await adminSupabase
    .from('email_deliveries')
    .select('resend_id, status')
    .in('status', PENDING_STATUSES)
    .lt('sent_at', olderThan)
    .gt('sent_at', youngerThan)
    .order('sent_at', { ascending: true })
    .limit(limit);
  if (error) return { ok: false, reason: 'query_failed', error: error.message, checked: 0 };

  const summary = { ok: true, checked: 0, changed: 0, errors: 0, byStatus: {} };
  for (const row of rows || []) {
    const res = await refreshDelivery(adminSupabase, row.resend_id, { fetchImpl, recordHealthEvent });
    summary.checked += 1;
    if (!res.ok) { summary.errors += 1; continue; }
    if (res.changed) summary.changed += 1;
    if (res.status) summary.byStatus[res.status] = (summary.byStatus[res.status] || 0) + 1;
  }
  return summary;
}

/** Pick the order-confirmation delivery to show on a document row. */
export function latestOrderDelivery(doc) {
  const list = Array.isArray(doc?.email_deliveries) ? doc.email_deliveries : [];
  const orders = list.filter((d) => !d.kind || d.kind === 'order_confirmation');
  if (orders.length) {
    return [...orders].sort((a, b) => new Date(b.sent_at || b.last_event_at || 0) - new Date(a.sent_at || a.last_event_at || 0))[0];
  }
  return doc?.metadata?.client_email || null;
}

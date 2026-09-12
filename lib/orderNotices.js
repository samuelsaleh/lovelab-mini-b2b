/**
 * Internal order notices — the emails that tell the office something
 * happened to an order: it was created, it was updated in place, or it
 * was emailed to the client.
 *
 * One helper for every site. The three places that used to send these each
 * wrote their own Resend call, and none of them read Resend's answer. The
 * Resend SDK does not throw on a rejected email — it returns `{ error }` —
 * so throwing that object away is how "Alberto stopped getting emails"
 * (Sam, 9 Sept 2026) went unnoticed for a week.
 *
 * Rules:
 *   - drafts never notify (not committed yet)
 *   - internal / consignment / write-off orders never notify (not revenue)
 *   - a send that does not go out records a health event (never silent)
 *   - never throws: the order is already saved, the notice is best-effort
 *
 * Server-only — it reaches for the service-role client and Resend.
 */

import { sendEmail as defaultSendEmail } from '@/lib/send-email';
import { recordHealthEvent as defaultRecordHealthEvent } from '@/lib/healthEvent';
import { getSenderFrom, getOrderNotificationRecipients } from '@/lib/email';
import { orderEventEmail } from '@/lib/email-templates';
import { recordSend } from '@/lib/emailDeliveries';

export const ORDER_NOTICE_KINDS = ['created', 'updated', 'sent_to_client'];

const SILENT_CHANNELS = new Set(['internal', 'consignment', 'delete_from_stock']);

/** Should the office hear about this document at all? */
export function shouldNotifyForDocument(document) {
  if (!document) return { ok: false, reason: 'no_document' };
  if (document.status === 'draft') return { ok: false, reason: 'draft' };
  if (SILENT_CHANNELS.has(document.order_channel)) return { ok: false, reason: 'channel' };
  return { ok: true };
}

async function lookupEventName(adminSupabase, eventId) {
  if (!eventId || !adminSupabase) return null;
  try {
    const { data } = await adminSupabase.from('events').select('name').eq('id', eventId).single();
    return data?.name || null;
  } catch {
    return null;
  }
}

async function lookupActorName(adminSupabase, actor) {
  const fallback = actor?.email || null;
  if (!actor?.id || !adminSupabase) return fallback;
  try {
    const { data } = await adminSupabase.from('profiles').select('full_name').eq('id', actor.id).single();
    return data?.full_name || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Send one internal notice. Resolves the folder name and the actor's name,
 * builds the email, sends it through lib/send-email (which reads Resend's
 * HTTP status), and records a health event if it did not go out.
 *
 * @param {object} adminSupabase  service-role client
 * @param {object} args
 * @param {'created'|'updated'|'sent_to_client'} args.kind
 * @param {object} args.document         the saved row (needs status, order_channel, client fields, total_amount, event_id)
 * @param {{id?: string, email?: string}} [args.actor]   who did it
 * @param {string} [args.recipient]      client address, for sent_to_client
 * @param {object} [args.replacedDocument]  the retired version, for updated
 * @param {object} [deps]                test injection: { sendEmail, recordHealthEvent }
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function notifyOrderEvent(
  adminSupabase,
  { kind, document, actor, recipient, replacedDocument } = {},
  deps = {},
) {
  const sendEmail = deps.sendEmail || defaultSendEmail;
  const recordHealthEvent = deps.recordHealthEvent || defaultRecordHealthEvent;
  const source = `order_notice_${kind || 'unknown'}`;

  try {
    if (!ORDER_NOTICE_KINDS.includes(kind)) return { sent: false, reason: 'bad_kind' };
    const gate = shouldNotifyForDocument(document);
    if (!gate.ok) return { sent: false, reason: gate.reason };
    // No key means a local/dev environment. The existing save paths skipped
    // silently here too; a missing key is a deploy problem, not an order one.
    if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'no_api_key' };

    const [eventName, actorName] = await Promise.all([
      lookupEventName(adminSupabase, document.event_id),
      lookupActorName(adminSupabase, actor),
    ]);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lovelab-b2b.vercel.app';
    const recipients = getOrderNotificationRecipients();
    const { subject, html } = orderEventEmail({
      kind,
      documentType: document.document_type,
      clientCompany: document.client_company,
      clientName: document.client_name,
      totalAmount: document.total_amount,
      eventName,
      actorName,
      recipient,
      replacedCreatedAt: replacedDocument?.created_at || null,
    }, siteUrl);

    const result = await sendEmail({ from: getSenderFrom(), to: recipients, subject, html });
    if (result?.sent && result.message_id) {
      // So a bouncing office address (Alberto's, 9 Sept 2026) is noticed too.
      await recordSend(adminSupabase, {
        resendId: result.message_id,
        kind: 'internal_notice',
        documentId: document.id || null,
        recipient: recipients,
        subject,
      });
    }
    if (!result?.sent) {
      await recordHealthEvent({
        source,
        severity: 'error',
        message: `Order notice (${kind}) did not go out: ${result?.reason || 'unknown'}`,
        context: {
          documentId: document.id || null,
          kind,
          recipients,
          status: result?.status ?? null,
          error: String(result?.error || '').slice(0, 500),
        },
      });
    }
    return result || { sent: false, reason: 'no_result' };
  } catch (err) {
    try {
      await recordHealthEvent({
        source,
        severity: 'error',
        message: err?.message || 'Order notice threw',
        context: { documentId: document?.id || null, kind },
      });
    } catch {
      // The health recorder is itself best-effort; nothing left to do.
    }
    return { sent: false, reason: 'threw', error: err?.message };
  }
}

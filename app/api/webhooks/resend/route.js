import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyResendSignature } from '@/lib/resendWebhook';
import { applyResendEvent } from '@/lib/emailDeliveries';
import { recordHealthEvent } from '@/lib/healthEvent';

/**
 * Resend → us. Resend POSTs here whenever an email we sent changes state
 * (delivered, delayed, bounced, complained, ...). Configured in the Resend
 * dashboard under Webhooks; the signing secret it shows goes into
 * RESEND_WEBHOOK_SECRET. See docs/email-delivery-status.md.
 *
 * The body must be read raw — the signature covers the exact bytes.
 */
export const runtime = 'nodejs';

export async function POST(request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhooks/resend] RESEND_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const verdict = verifyResendSignature({
    secret,
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signatureHeader: request.headers.get('svix-signature'),
    rawBody,
  });
  if (!verdict.ok) {
    return NextResponse.json({ error: 'Unauthorized', reason: verdict.reason }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }

  try {
    const adminSupabase = createAdminClient();
    const result = await applyResendEvent(adminSupabase, event);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Tell Resend we got it (so it doesn't retry forever) but never lose the failure.
    await recordHealthEvent({
      source: 'resend_webhook',
      severity: 'error',
      message: err?.message || 'Resend webhook handler threw',
      context: { type: event?.type || null, emailId: event?.data?.email_id || null },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: 'Handler failed' }, { status: 200 });
  }
}

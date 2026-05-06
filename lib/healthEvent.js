/**
 * Health-event recorder.
 *
 * Replaces silent `console.error` swallowing. Every meaningful failure goes
 * through `recordHealthEvent` so we get:
 *   1. A persistent audit row in public.system_health_events.
 *   2. An immediate admin email when severity is 'error' or 'critical'
 *      (throttled — same source+severity wins one email per 30 min).
 *
 * Schema lives in database-migrations/supabase-phase16-system-health-events.sql.
 *
 * Usage:
 *
 *   import { recordHealthEvent } from '@/lib/healthEvent';
 *
 *   try {
 *     await someRiskyThing();
 *   } catch (err) {
 *     await recordHealthEvent({
 *       source: 'documents_post_commission_hook',
 *       severity: 'error',
 *       message: err.message || 'Commission hook failed',
 *       context: { documentId, agentId, code: err.code },
 *     });
 *   }
 *
 * The helper is server-only — it imports the service-role admin client. Do
 * not call it from a client component.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/send-email';
import { getOrderNotificationRecipients } from '@/lib/email';

const ALLOWED_SEVERITIES = new Set(['info', 'warn', 'error', 'critical']);
const ALERT_THROTTLE_MINUTES = 30;

/**
 * Record a health event. Best-effort: never throws, always returns a result
 * object the caller can ignore.
 *
 * @param {object}  params
 * @param {string}  params.source       Short stable identifier ('snake_case' preferred).
 * @param {string}  params.severity     'info' | 'warn' | 'error' | 'critical'
 * @param {string}  params.message      One-line human summary.
 * @param {object}  [params.context]    Extra structured data (will be JSON-stringified).
 * @param {boolean} [params.alertAdmin] Override the default email behaviour.
 *                                      Default: true for severity ≥ 'error'.
 * @param {object}  [params.client]     Inject a Supabase client (for tests).
 * @param {Function}[params.mailer]     Inject sendEmail (for tests).
 *
 * @returns {Promise<{ ok: boolean, id?: string, alerted: boolean, throttled?: boolean, reason?: string }>}
 */
export async function recordHealthEvent(params) {
  const {
    source,
    severity,
    message,
    context = {},
    alertAdmin,
    client,
    mailer,
  } = params || {};

  if (!source || typeof source !== 'string') {
    return { ok: false, alerted: false, reason: 'invalid_source' };
  }
  if (!ALLOWED_SEVERITIES.has(severity)) {
    return { ok: false, alerted: false, reason: 'invalid_severity' };
  }
  if (!message || typeof message !== 'string') {
    return { ok: false, alerted: false, reason: 'invalid_message' };
  }

  const wantsAlert = alertAdmin === true
    || (alertAdmin !== false && (severity === 'error' || severity === 'critical'));

  const supabase = client || createAdminClient();
  const send = mailer || sendEmail;

  // 1. Insert the row. We never want this call to throw upward.
  let inserted = null;
  try {
    const { data, error } = await supabase
      .from('system_health_events')
      .insert({ source, severity, message, context })
      .select('id, created_at')
      .single();
    if (error) {
      // Last-resort visibility — at least put it in the function logs.
      // If this happens, the helper itself is broken; fix the migration.
      console.error('[healthEvent] insert failed:', error.message, { source, severity });
      return { ok: false, alerted: false, reason: 'insert_failed' };
    }
    inserted = data;
  } catch (err) {
    console.error('[healthEvent] insert threw:', err?.message, { source, severity });
    return { ok: false, alerted: false, reason: 'insert_threw' };
  }

  // 2. Optional admin alert.
  if (!wantsAlert) {
    return { ok: true, id: inserted.id, alerted: false };
  }

  // Throttle: skip if we already alerted on the same source+severity in the
  // last ALERT_THROTTLE_MINUTES.
  try {
    const cutoffIso = new Date(Date.now() - ALERT_THROTTLE_MINUTES * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('system_health_events')
      .select('id')
      .eq('source', source)
      .eq('severity', severity)
      .not('alerted_at', 'is', null)
      .gte('alerted_at', cutoffIso)
      .limit(1);

    if (recent && recent.length > 0) {
      return { ok: true, id: inserted.id, alerted: false, throttled: true };
    }
  } catch {
    // If the throttle query fails we still try to send — better one extra
    // alert than a missed alert.
  }

  // Send the email.
  let alerted = false;
  try {
    const recipients = getOrderNotificationRecipients();
    const subject = `[LoveLab ${severity.toUpperCase()}] ${source}: ${message}`.slice(0, 120);
    const html = renderAlertHtml({ source, severity, message, context, eventId: inserted.id, createdAt: inserted.created_at });
    const result = await send({ to: recipients, subject, html });
    alerted = !!result?.sent;
  } catch (err) {
    console.error('[healthEvent] alert send threw:', err?.message);
  }

  // Record the alert timestamp so the throttle picks it up.
  if (alerted) {
    try {
      await supabase
        .from('system_health_events')
        .update({ alerted_at: new Date().toISOString() })
        .eq('id', inserted.id);
    } catch {
      // Non-fatal.
    }
  }

  return { ok: true, id: inserted.id, alerted };
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAlertHtml({ source, severity, message, context, eventId, createdAt }) {
  const ctxJson = JSON.stringify(context || {}, null, 2);
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 8px; color: #1a1a1a;">LoveLab health alert — ${escapeHtml(severity)}</h2>
      <p style="margin: 0 0 16px; color: #555;">Something the app would normally swallow just failed. Please review.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #888; width: 90px;">Source</td><td><code>${escapeHtml(source)}</code></td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Severity</td><td>${escapeHtml(severity)}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Message</td><td>${escapeHtml(message)}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">When</td><td>${escapeHtml(createdAt)}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Event ID</td><td><code>${escapeHtml(eventId)}</code></td></tr>
      </table>
      <h3 style="margin: 24px 0 8px; font-size: 14px; color: #333;">Context</h3>
      <pre style="background: #f5f5f7; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto;">${escapeHtml(ctxJson)}</pre>
      <p style="margin-top: 24px; font-size: 12px; color: #aaa;">
        Throttled to one email per ${ALERT_THROTTLE_MINUTES} minutes per source+severity.
        Resolve in the admin panel to silence further alerts for this row.
      </p>
    </div>
  `;
}

export const __healthEventInternals = {
  ALLOWED_SEVERITIES,
  ALERT_THROTTLE_MINUTES,
  renderAlertHtml,
};

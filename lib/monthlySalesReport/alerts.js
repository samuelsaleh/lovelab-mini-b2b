/**
 * Alert emails when the monthly report has a problem. Goes to
 * MONTHLY_SALES_REPORT_ALERT_TO — Sam until that is set (25/09/2026).
 * Never to the report's other recipients.
 *
 *   level 'error'   — the report was NOT delivered, or only partly
 *   level 'warning' — delivered, but the data behind it needs a look
 *
 * This is the app's own alarm. If the app is down entirely it can't send
 * anything; the n8n workflow's alert covers that case.
 */

import { renderEmail, BRAND } from '../email-shell.js'
import { escapeHtml } from './format.js'
import { DEFAULT_REPORT_EMAIL, reportRecipients } from './emailDelivery.js'

export function renderAlert({ month, level, problems, delivered = {} }) {
  const bad = level === 'error'
  const subject = `${bad ? '⚠️' : 'ℹ️'} LoveLab sales report ${month || ''}: ${bad ? 'problem — check now' : 'delivered, data needs a look'}`
  const status = [
    delivered.drive !== undefined ? `<li>Google Drive (PDF): <strong>${delivered.drive ? 'uploaded' : 'NOT uploaded'}</strong></li>` : '',
    delivered.email !== undefined ? `<li>Email to recipients: <strong>${delivered.email ? 'sent' : 'NOT sent'}</strong></li>` : '',
  ].join('')
  const body = `
    <p style="margin:0 0 12px;">${bad ? 'The monthly sales report ran into a problem.' : 'The monthly sales report went out, but the data behind it has something worth checking.'}</p>
    ${status ? `<ul style="margin:0 0 12px;padding-left:20px;">${status}</ul>` : ''}
    <p style="margin:0 0 6px;font-weight:600;color:${BRAND.heading};">${bad ? 'What went wrong' : 'What to check'}</p>
    <ul style="margin:0 0 12px;padding-left:20px;">${problems.map((p) => `<li style="margin-bottom:6px;">${escapeHtml(p)}</li>`).join('')}</ul>
    <p style="margin:12px 0 0;font-size:13px;color:${BRAND.muted};">Re-run a month by hand: GET /api/cron/monthly-sales-report?month=YYYY-MM with the cron header, or locally: node scripts/monthly-sales-report.mjs --month YYYY-MM --source supabase.</p>`
  return { subject, html: renderEmail({ title: bad ? 'Sales report — problem' : 'Sales report — data check', preheader: problems[0] || '', bodyHtml: body }) }
}

/**
 * @param {object} args
 * @param {'error'|'warning'} args.level
 * @param {string[]} args.problems
 * @param {Function} args.send   sendEmail from lib/send-email.js
 */
export async function sendReportAlert({ month, level, problems, delivered, send, recipients = reportRecipients(process.env.MONTHLY_SALES_REPORT_ALERT_TO ?? DEFAULT_REPORT_EMAIL) }) {
  if (!problems?.length) return { sent: false, skipped: true, reason: 'nothing_to_report' }
  if (!recipients.length) return { sent: false, skipped: true, reason: 'no_alert_recipient' }
  const { subject, html } = renderAlert({ month, level, problems, delivered })
  try {
    return await send({ to: recipients, subject, html })
  } catch (err) {
    return { sent: false, reason: 'send_failed', error: err?.message || String(err) }
  }
}

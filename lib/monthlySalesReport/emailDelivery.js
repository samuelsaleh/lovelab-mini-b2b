/**
 * Send the monthly report email: the brief HTML as the body, the PDF
 * attached. The Drive folder gets only the PDF; this is the other channel.
 *
 * Recipients come from MONTHLY_SALES_REPORT_RECIPIENTS (comma separated).
 * Not set at all → Sam, for now (Rafi, 25/09/2026: the other addresses are
 * added later). Set but empty → nothing is sent.
 * Sample data is never emailed.
 */

import { salesReportFileName } from './drive.js'

/** Until the real list is configured, the report and its alerts go to Sam. */
export const DEFAULT_REPORT_EMAIL = 'sam@love-lab.com'

export function reportRecipients(raw = process.env.MONTHLY_SALES_REPORT_RECIPIENTS ?? DEFAULT_REPORT_EMAIL) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
}

/**
 * @param {object} args
 * @param {object} args.report   from buildReportData
 * @param {{ subject: string, html: string }} args.email  from renderMonthlyEmail
 * @param {Buffer} [args.pdf]    attached when present
 * @param {Function} args.send   sendEmail from lib/send-email.js (injected so this stays testable)
 */
export async function emailSalesReport({ report, email, pdf, send, recipients = reportRecipients() }) {
  if (report?.isSample) return { sent: false, skipped: true, reason: 'sample_data' }
  if (!recipients.length) return { sent: false, skipped: true, reason: 'no_recipients' }
  const attachments = pdf ? [{ filename: salesReportFileName(report), content: pdf }] : []
  const res = await send({ to: recipients, subject: email.subject, html: email.html, attachments })
  return { ...res, recipients: recipients.length, attached: attachments.length > 0 }
}

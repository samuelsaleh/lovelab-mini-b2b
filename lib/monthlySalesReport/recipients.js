/**
 * Who receives the report. Pure — shared by the app and the Google Apps
 * Script package.
 *
 * There is deliberately no built-in address: the repository is public, and
 * recipients are people's own inboxes. They are configured privately —
 * Script Properties in Apps Script (REPORT_RECIPIENTS), the server .env for
 * the app (MONTHLY_SALES_REPORT_RECIPIENTS). Nothing configured → no email.
 */

/** A comma-separated list → valid addresses; blanks and non-addresses dropped. */
export function reportRecipients(raw = process.env.MONTHLY_SALES_REPORT_RECIPIENTS) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
}

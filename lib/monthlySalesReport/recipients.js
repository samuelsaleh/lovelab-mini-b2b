/**
 * Who receives the report and its alerts. Pure — shared by the app and the
 * Google Apps Script package.
 */

/** Until the real list is configured, the report goes to Sam (25/09/2026). */
export const DEFAULT_REPORT_EMAIL = 'sam@love-lab.com'

/** A comma-separated list → valid addresses. Not set at all → Sam; set but empty → nobody. */
export function reportRecipients(raw = process.env.MONTHLY_SALES_REPORT_RECIPIENTS ?? DEFAULT_REPORT_EMAIL) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
}

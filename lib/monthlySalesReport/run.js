/**
 * One month's report, end to end: data → figures → email HTML + PDF.
 * Shared by the command-line script and the monthly cron route so both
 * produce exactly the same files. Never sends and never writes to the
 * database; delivery (Drive) is a separate, explicit step.
 */

import { buildReportData, shiftMonth } from './buildReportData.js'
import { renderMonthlyEmail } from './renderEmail.js'
import { renderReportPdf } from './pdfDirect.js'

const brusselsMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit' })

/** The last complete month in Antwerp time — what the report on the 1st covers. */
export function previousMonth(now = new Date()) {
  return shiftMonth(brusselsMonth.format(now).slice(0, 7), -1)
}

/**
 * @param {object} o
 * @param {object} o.model      normalised data from a data source
 * @param {string} o.month      'YYYY-MM'
 * @param {Uint8Array} [o.logoPng]  LoveLab wordmark for the PDF header
 * @param {Date}   [o.now]
 * @param {Function} [o.toPdf]  (report, opts) → PDF bytes (injectable for tests)
 */
export async function generateMonthlySalesReport({ model, month, logoPng, now = new Date(), toPdf = renderReportPdf }) {
  const report = buildReportData(model, month)
  const email = renderMonthlyEmail(report)
  const generatedAt = now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Brussels' })

  let pdf = null
  let pdfError = null
  try {
    pdf = await toPdf(report, { logoPng, generatedAt })
  } catch (err) {
    pdfError = err?.message || String(err)
  }
  return { report, email, pdf, pdfError }
}

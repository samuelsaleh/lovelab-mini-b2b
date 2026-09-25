/**
 * The monthly sales report, run by Google Apps Script in Rafi's Google
 * account — nothing on the LoveLab server (25/09/2026).
 *
 * Built into one file by scripts/build-apps-script.mjs and pushed to the
 * Apps Script project with clasp. Everything it runs is the app's own tested
 * code (lib/monthlySalesReport); this file only connects it to Apps Script:
 *
 *   read   Supabase REST, GET only (UrlFetchApp)            → never writes
 *   build  buildReportData · checkReport · email · PDF (pdf-lib, no browser)
 *   Drive  the PDF — only the PDF — into the Monthly Report folder (DriveApp)
 *   email  the brief HTML with the PDF attached (MailApp)
 *   alert  problems to the alert address (the script owner by default)
 *
 * Settings live in the script's private Script Properties, never in code:
 *   SUPABASE_URL, SUPABASE_KEY    database (read-only use)
 *   DRIVE_FOLDER_ID               "LoveLab Analytics / Monthly Report"
 *   REPORT_RECIPIENTS             optional; not set → sam@love-lab.com
 *   ALERT_TO                      optional; not set → the script owner
 */

import { normaliseSupabaseRows } from '../dataSources/supabase.js'
import { fetchSupabaseRowsRest } from '../dataSources/supabaseRest.js'
import { buildReportData, shiftMonth } from '../buildReportData.js'
import { checkReport } from '../checks.js'
import { renderMonthlyEmail } from '../renderEmail.js'
import { renderAlert } from '../alerts.js'
import { renderReportPdf, base64ToBytes } from '../pdfDirect.js'
import { salesReportFileName } from '../fileName.js'
import { DEFAULT_REPORT_EMAIL, reportRecipients } from '../recipients.js'
import LOGO_PNG_BASE64 from '../../../public/email/logo.png'

/* global PropertiesService, UrlFetchApp, DriveApp, MailApp, Utilities, Session, ScriptApp, Logger */

const TZ = 'Europe/Brussels'

function settings() {
  const p = PropertiesService.getScriptProperties()
  const recipients = p.getProperty('REPORT_RECIPIENTS')
  return {
    url: p.getProperty('SUPABASE_URL'),
    key: p.getProperty('SUPABASE_KEY'),
    folderId: p.getProperty('DRIVE_FOLDER_ID'),
    recipients: reportRecipients(recipients === null ? DEFAULT_REPORT_EMAIL : recipients),
    alertTo: reportRecipients(p.getProperty('ALERT_TO') || Session.getEffectiveUser().getEmail()),
  }
}

/** GET only. Throws with the status, never with the key. */
function fetchJson(url, headers) {
  const res = UrlFetchApp.fetch(url, { method: 'get', headers, muteHttpExceptions: true })
  const code = res.getResponseCode()
  if (code < 200 || code >= 300) throw new Error(`Supabase answered ${code}: ${res.getContentText().slice(0, 300)}`)
  return JSON.parse(res.getContentText())
}

/** Apps Script blobs want signed bytes. */
const toBlobBytes = (u8) => Array.from(u8, (b) => (b > 127 ? b - 256 : b))

export function lastCompleteMonth(now = new Date()) {
  return shiftMonth(Utilities.formatDate(now, TZ, 'yyyy-MM'), -1)
}

function sendAlert(cfg, month, level, problems, delivered) {
  if (!problems.length || !cfg.alertTo.length) return
  const { subject, html } = renderAlert({ month, level, problems, delivered })
  MailApp.sendEmail({ to: cfg.alertTo.join(','), subject, htmlBody: html, body: problems.join('\n'), name: 'LoveLab reports' })
}

/**
 * One month, end to end.
 * @param {object} [o]
 * @param {string} [o.month]        'YYYY-MM'; default = last complete month
 * @param {string[]} [o.recipients] override who gets the email (test runs)
 * @param {boolean} [o.skipDrive]   build and email only
 * @param {boolean} [o.skipEmail]   build and Drive only
 */
export async function runReport({ month, recipients, skipDrive = false, skipEmail = false } = {}) {
  const cfg = settings()
  month = month || lastCompleteMonth()
  const summary = { month }
  try {
    if (!cfg.url || !cfg.key) throw new Error('Script Properties SUPABASE_URL and SUPABASE_KEY are not set.')
    if (!cfg.folderId && !skipDrive) throw new Error('Script Property DRIVE_FOLDER_ID is not set.')

    const rows = await fetchSupabaseRowsRest({ url: cfg.url, key: cfg.key, fetchJson })
    const model = normaliseSupabaseRows(rows, { asOf: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') })
    const report = buildReportData(model, month)
    summary.sales = report.kpis.sales
    summary.orders = report.kpis.orders

    const checks = checkReport(report, model)
    summary.warnings = checks.warnings
    if (checks.errors.length) {
      sendAlert(cfg, month, 'error', ['The report failed its own checks, so it was NOT delivered:', ...checks.errors])
      summary.error = 'checks_failed'
      return summary
    }

    const email = renderMonthlyEmail(report)
    const pdf = await renderReportPdf(report, {
      logoPng: base64ToBytes(LOGO_PNG_BASE64),
      generatedAt: Utilities.formatDate(new Date(), TZ, 'd MMM yyyy, HH:mm'),
    })
    const fileName = salesReportFileName(report)
    const blob = () => Utilities.newBlob(toBlobBytes(pdf), 'application/pdf', fileName)

    const problems = []
    if (!skipDrive) {
      try {
        const folder = DriveApp.getFolderById(cfg.folderId)
        // A re-run replaces that month's PDF: the old copy goes to the Drive
        // trash (recoverable for 30 days), never deleted outright.
        const old = folder.getFilesByName(fileName)
        while (old.hasNext()) old.next().setTrashed(true)
        const file = folder.createFile(blob())
        summary.drive = { ok: true, fileName, url: file.getUrl() }
      } catch (err) {
        summary.drive = { ok: false, error: String(err && err.message || err) }
        problems.push(`PDF not saved to Google Drive: ${summary.drive.error}`)
      }
    }
    if (!skipEmail) {
      const to = recipients || cfg.recipients
      if (to.length) {
        try {
          MailApp.sendEmail({ to: to.join(','), subject: email.subject, htmlBody: email.html, body: email.text, attachments: [blob()], name: 'LoveLab reports' })
          summary.email = { sent: true, to: to.length }
        } catch (err) {
          summary.email = { sent: false, error: String(err && err.message || err) }
          problems.push(`Email not sent: ${summary.email.error}`)
        }
      } else {
        summary.email = { sent: false, reason: 'no_recipients' }
      }
    }

    if (problems.length) sendAlert(cfg, month, 'error', [...problems, ...checks.warnings], { drive: summary.drive?.ok, email: summary.email?.sent })
    else if (checks.warnings.length) sendAlert(cfg, month, 'warning', checks.warnings, { drive: summary.drive?.ok, email: summary.email?.sent })
    return summary
  } catch (err) {
    summary.error = String(err && err.message || err)
    try { sendAlert(cfg, month, 'error', [`The monthly sales report could not be built — nothing was delivered. ${summary.error}`]) } catch { /* nothing else to do */ }
    return summary
  } finally {
    Logger.log(JSON.stringify(summary))
  }
}

/** (Re)install the monthly schedule: 1st of each month, around 07:00 Brussels. */
export function installMonthlyTrigger() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'runMonthlySalesReport') ScriptApp.deleteTrigger(t)
  }
  ScriptApp.newTrigger('runMonthlySalesReport').timeBased().onMonthDay(1).atHour(7).inTimezone(TZ).create()
  Logger.log('Monthly trigger installed: 1st of the month, 07:00 Europe/Brussels')
}

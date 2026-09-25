/**
 * Monthly sales report cron endpoint.
 *
 * On the 1st of each month: builds last month's sales report from the
 * database (read-only), then
 *   - puts the PDF — only the PDF — in the shared Google Drive folder
 *     (GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID / <year>/)
 *   - emails the brief HTML with the PDF attached to
 *     MONTHLY_SALES_REPORT_RECIPIENTS (empty → no email).
 * Each channel reports its own outcome; one failing doesn't stop the other.
 *
 * Before delivering, the report checks itself (checks.js). If its totals
 * contradict each other it is NOT delivered. Any problem — database
 * unreadable, PDF failed, checks failed, Drive or email failed, or suspicious
 * data — emails an alert to MONTHLY_SALES_REPORT_ALERT_TO (Rafi).
 *
 * Triggered by the server crontab through scripts/run-cron.sh, or by n8n,
 * with the same x-vercel-cron-secret header as the other /api/cron routes.
 *
 *   GET /api/cron/monthly-sales-report              → last complete month
 *   GET /api/cron/monthly-sales-report?month=2026-08 → a specific month
 *
 * Responses:
 *   200 { month, sales, orders, drive, email, warnings, alert }   delivered (drive.ok / email.sent say what went out)
 *   400 { error }                         malformed ?month
 *   401 { error: 'Unauthorized' }         CRON_SECRET fails
 *   500 { error, alert }                  database, PDF or self-checks failed — nothing delivered
 */

import { timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { loadFromSupabase } from '@/lib/monthlySalesReport/dataSources/supabase'
import { generateMonthlySalesReport, previousMonth } from '@/lib/monthlySalesReport/run'
import { uploadSalesReportToDrive } from '@/lib/monthlySalesReport/drive'
import { emailSalesReport } from '@/lib/monthlySalesReport/emailDelivery'
import { checkReport } from '@/lib/monthlySalesReport/checks'
import { sendReportAlert } from '@/lib/monthlySalesReport/alerts'
import { sendEmail } from '@/lib/send-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron monthly-sales-report] CRON_SECRET env var is not set — all requests rejected.')
    return false
  }
  const given = Buffer.from(request.headers.get('x-vercel-cron-secret') || '')
  const expected = Buffer.from(cronSecret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function logoDataUri() {
  try {
    const png = await readFile(path.join(process.cwd(), 'public', 'email', 'logo.png'))
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return ''
  }
}

/** Stop here: alert Rafi and answer 500 so n8n alerts too. */
async function fail(month, problem, extra = {}) {
  console.error('[cron monthly-sales-report]', problem)
  const alert = await sendReportAlert({ month, level: 'error', problems: [problem], send: sendEmail })
  return NextResponse.json({ month, error: problem, alert, ...extra }, { status: 500 })
}

export async function GET(request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requested = new URL(request.url).searchParams.get('month')
  if (requested && !/^\d{4}-(0[1-9]|1[0-2])$/.test(requested)) {
    return NextResponse.json({ error: 'month must be YYYY-MM with a real month (01–12)' }, { status: 400 })
  }
  const month = requested || previousMonth()

  // 1. Data. A renamed or missing column surfaces here as a Supabase error.
  let model
  try {
    model = await loadFromSupabase({ client: createAdminClient() })
  } catch (err) {
    return fail(month, `Could not read the database — nothing was delivered. ${err?.message || err}`)
  }

  // 2. Report + PDF.
  let built
  try {
    built = await generateMonthlySalesReport({ model, month, logoSrc: await logoDataUri() })
  } catch (err) {
    return fail(month, `Could not build the report — nothing was delivered. ${err?.message || err}`)
  }
  const { report, email, pdf, pdfError } = built
  if (!pdf) return fail(month, `The PDF could not be made — nothing was delivered. ${pdfError}`)

  // 3. Self-checks. A report that contradicts itself never reaches Sam and the executives.
  const checks = checkReport(report, model)
  if (checks.errors.length) {
    console.error('[cron monthly-sales-report] checks failed:', checks.errors)
    const alert = await sendReportAlert({ month, level: 'error', problems: ['The report failed its own checks, so it was NOT delivered:', ...checks.errors], send: sendEmail })
    return NextResponse.json({ month, error: 'checks_failed', checks, alert }, { status: 500 })
  }

  // 4. Delivery: Drive gets only the PDF; the email is the HTML with the PDF attached.
  // Each channel runs even if the other fails.
  const drive = await uploadSalesReportToDrive({ buffer: pdf, report })
  const mail = await emailSalesReport({ report, email, pdf, send: sendEmail })

  const problems = []
  if (!drive.ok) problems.push(`PDF not uploaded to Google Drive: ${drive.error || drive.reason}.`)
  if (!mail.sent && mail.reason !== 'no_recipients') problems.push(`Email not sent: ${mail.error || mail.reason}.`)

  let alert = null
  if (problems.length) {
    alert = await sendReportAlert({ month, level: 'error', problems: [...problems, ...checks.warnings], delivered: { drive: !!drive.ok, email: !!mail.sent }, send: sendEmail })
  } else if (checks.warnings.length) {
    alert = await sendReportAlert({ month, level: 'warning', problems: checks.warnings, delivered: { drive: true, email: !!mail.sent }, send: sendEmail })
  }

  return NextResponse.json({
    month,
    sales: report.kpis.sales,
    orders: report.kpis.orders,
    partial: report.partial,
    drive,
    email: mail,
    warnings: checks.warnings,
    alert,
  })
}

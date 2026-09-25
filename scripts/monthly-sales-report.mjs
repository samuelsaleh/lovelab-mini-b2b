// Monthly sales report: brief HTML email + phone-width PDF.
//
// Usage:
//   node scripts/monthly-sales-report.mjs --month 2026-08 --source sample
//   node scripts/monthly-sales-report.mjs --month 2026-08 --source supabase   (needs .env.local)
//   node scripts/monthly-sales-report.mjs --month 2026-08 --source supabase --drive
//
//   --month   YYYY-MM, default = last complete month
//   --source  sample | supabase, default sample
//   --out     output folder, default out/monthly-sales-report/<month>
//   --drive   also put the PDF in the shared Drive folder
//             (GOOGLE_DRIVE_SALES_REPORTS_FOLDER_ID + Google credentials).
//             Off unless asked; sample data is never uploaded.
//
// Writes email.html, email.txt, report.html (PDF preview) and report.pdf.
// Never emails anything and never writes to the database.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadSample } from '../lib/monthlySalesReport/dataSources/sample.js'
import { loadFromSupabase } from '../lib/monthlySalesReport/dataSources/supabase.js'
import { generateMonthlySalesReport, previousMonth } from '../lib/monthlySalesReport/run.js'
import { uploadSalesReportToDrive } from '../lib/monthlySalesReport/drive.js'
import { checkReport } from '../lib/monthlySalesReport/checks.js'

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}

for (const f of ['.env.local', '.env']) {
  try { if (existsSync(f)) process.loadEnvFile(f) } catch { /* optional */ }
}

const month = arg('--month', previousMonth())
const source = arg('--source', 'sample')
const outDir = resolve(arg('--out', join('out', 'monthly-sales-report', month)))
const toDrive = process.argv.includes('--drive')

let model
if (source === 'sample') model = loadSample()
else if (source === 'supabase') model = await loadFromSupabase()
else {
  console.error(`Unknown --source "${source}" (use sample or supabase)`)
  process.exit(1)
}

const logoPath = resolve('public/email/logo.png')
const logoSrc = existsSync(logoPath) ? `data:image/png;base64,${readFileSync(logoPath).toString('base64')}` : ''
const { report, email, pdfHtml, pdf, pdfError } = await generateMonthlySalesReport({ model, month, logoSrc })

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'email.html'), email.html)
writeFileSync(join(outDir, 'email.txt'), `Subject: ${email.subject}\n\n${email.text}\n`)
writeFileSync(join(outDir, 'report.html'), pdfHtml)
if (pdf) writeFileSync(join(outDir, 'report.pdf'), pdf)

const k = report.kpis
console.log(`${report.monthLabel} · source: ${report.source}${report.isSample ? ' (SAMPLE DATA)' : ''}`)
console.log(`  sales ${k.sales} (${k.orders} orders) · B2B ${k.b2b} / B2C ${k.b2c} · commission owed ${k.commissionEarned} / paid ${k.commissionPaidOut} · fairs ${k.fairCount}`)
if (report.notes.length) console.log(`  notes: ${report.notes.join(' | ')}`)
console.log(`  subject: ${email.subject}`)
console.log(`  → ${outDir}/ email.html, email.txt, report.html, ${pdf ? 'report.pdf' : `report.pdf NOT written — ${pdfError} (report.html is the same page)`}`)

const checks = checkReport(report, model)
for (const e of checks.errors) console.log(`  ✖ CHECK FAILED: ${e}`)
for (const w of checks.warnings) console.log(`  ! data warning: ${w}`)
if (!checks.errors.length && !checks.warnings.length) console.log('  ✓ all checks passed')

if (toDrive) {
  if (checks.errors.length) {
    console.log('  Drive: NOT uploaded — the report failed its checks')
  } else if (!pdf) {
    console.log('  Drive: skipped — no PDF to upload')
  } else {
    const res = await uploadSalesReportToDrive({ buffer: pdf, report })
    console.log(res.ok ? `  Drive: uploaded "${res.fileName}" → ${res.webViewLink}` : `  Drive: NOT uploaded — ${res.error || res.reason}`)
  }
}

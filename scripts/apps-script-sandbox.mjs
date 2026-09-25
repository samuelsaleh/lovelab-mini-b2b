// Run the built Apps Script bundle in a Node `vm` context that has only what
// Google Apps Script has: plain JavaScript (incl. Intl), no setTimeout, no
// Buffer, no TextEncoder, no require, no fetch. Apps Script services are faked:
//   - UrlFetchApp → real read-only GETs (curl) to Supabase, from .env.local
//   - DriveApp / MailApp → record what would be saved and sent; nothing leaves
// Writes the PDF it would have saved to out/apps-script/sandbox-<month>.pdf.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

export async function runInSandbox(codePath, { month } = {}) {
  for (const f of ['.env.local', '.env']) {
    try { if (existsSync(f)) process.loadEnvFile(f) } catch { /* optional */ }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('sandbox needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')

  const saved = []
  const sent = []
  const props = { SUPABASE_URL: url, SUPABASE_KEY: key, DRIVE_FOLDER_ID: 'sandbox-folder' }
  const fmt = (d, tz, pattern) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]))
    const mon = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short' }).format(d)
    return pattern.replace('yyyy', parts.year).replace('MMM', mon).replace('MM', parts.month).replace('dd', parts.day).replace(/\bd\b/, String(Number(parts.day))).replace('HH', parts.hour).replace('mm', parts.minute)
  }
  const blob = (bytes, type, name) => ({ bytes, type, name })

  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    UrlFetchApp: {
      fetch: (u, o = {}) => {
        if (o.method && o.method.toLowerCase() !== 'get') throw new Error('sandbox: only GET is allowed')
        const args = ['-sS', '-w', '\n%{http_code}', ...Object.entries(o.headers || {}).flatMap(([h, v]) => ['-H', `${h}: ${v}`]), u]
        const out = execFileSync('curl', args, { maxBuffer: 64 * 1024 * 1024 }).toString()
        const i = out.lastIndexOf('\n')
        const body = out.slice(0, i)
        const code = Number(out.slice(i + 1))
        return { getResponseCode: () => code, getContentText: () => body }
      },
    },
    DriveApp: {
      getFolderById: () => ({
        getFilesByName: () => ({ hasNext: () => false }),
        createFile: (b) => { saved.push(b); return { getUrl: () => `sandbox://${b.name}` } },
      }),
    },
    MailApp: { sendEmail: (m) => { sent.push({ to: m.to, subject: m.subject, attachments: (m.attachments || []).map((a) => a.name), htmlLength: (m.htmlBody || '').length }) } },
    Utilities: { formatDate: fmt, newBlob: blob },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@sandbox.test' }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => { throw new Error('sandbox: no triggers') } },
    Logger: { log: (s) => console.log('  [Logger]', s) },
    console,
  })

  for (const g of ['setTimeout', 'Buffer', 'TextEncoder', 'TextDecoder', 'require', 'fetch', 'atob']) {
    if (vm.runInContext(`typeof ${g}`, context) !== 'undefined' && g !== 'setTimeout') throw new Error(`sandbox leak: ${g} exists`)
  }
  vm.runInContext(readFileSync(codePath, 'utf8'), context, { filename: 'Code.js' })
  const target = month || vm.runInContext('LoveLabReport.lastCompleteMonth()', context)
  const summary = await vm.runInContext(`LoveLabReport.runReport({ month: ${JSON.stringify(target)} })`, context)

  console.log('sandbox summary:', JSON.stringify({ ...summary, warnings: summary.warnings?.length }))
  console.log('would save to Drive:', saved.map((b) => `${b.name} (${b.bytes.length} bytes)`))
  console.log('would email:', JSON.stringify(sent))
  if (saved[0]) {
    const pdf = Buffer.from(Uint8Array.from(saved[0].bytes, (b) => (b < 0 ? b + 256 : b)))
    const out = `out/apps-script/sandbox-${target}.pdf`
    writeFileSync(out, pdf)
    console.log(`PDF written to ${out} — starts with ${pdf.subarray(0, 5).toString()}`)
  }
  return { summary, saved, sent }
}

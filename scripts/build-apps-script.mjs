// Build the monthly sales report for Google Apps Script.
//
//   node scripts/build-apps-script.mjs            → out/apps-script/{Code.js, appsscript.json}
//   node scripts/build-apps-script.mjs --check    → also run it in a sandbox that has only
//                                                    what Apps Script has (no setTimeout,
//                                                    Buffer, TextEncoder, require…), against
//                                                    fake Drive/Mail, reading the real
//                                                    database read-only via .env.local
//
// Then push with clasp from out/apps-script (see docs/monthly-sales-report.md).
// The bundle is the app's own code (lib/monthlySalesReport); nothing is rewritten.

import { build } from 'esbuild'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OUT = resolve('out/apps-script')
mkdirSync(OUT, { recursive: true })

// Apps Script's V8 has no timers or Node globals. pdf-lib and fontkit's
// bundled process.nextTick only use setTimeout to defer work "until later";
// a promise microtask does exactly that (running it synchronously deadlocks
// fontkit's nextTick queue — found by the sandbox check).
const banner = `/* LoveLab monthly sales report — built ${new Date().toISOString()} from lib/monthlySalesReport. Do not edit here; edit the repo and rebuild. */
var setTimeout = function (fn) { Promise.resolve().then(fn); return 0; };
var clearTimeout = function () {};
var process = { env: {} };
`

// Apps Script calls functions by name from the global scope.
const footer = `
function runMonthlySalesReport() { return LoveLabReport.runReport(); }
function testReportToMe() { return LoveLabReport.runReport({ month: LoveLabReport.lastCompleteMonth(), recipients: [Session.getEffectiveUser().getEmail()] }); }
function installMonthlyTrigger() { return LoveLabReport.installMonthlyTrigger(); }
`

await build({
  entryPoints: ['lib/monthlySalesReport/appsScript/main.js'],
  bundle: true,
  format: 'iife',
  globalName: 'LoveLabReport',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  target: 'es2019',
  minify: true,
  legalComments: 'none',
  loader: { '.png': 'base64' },
  external: ['@supabase/supabase-js'],
  banner: { js: banner },
  footer: { js: footer },
  outfile: join(OUT, 'Code.js'),
  logLevel: 'warning',
})
copyFileSync('lib/monthlySalesReport/appsScript/appsscript.json', join(OUT, 'appsscript.json'))
const size = readFileSync(join(OUT, 'Code.js')).length
console.log(`built ${join(OUT, 'Code.js')} (${(size / 1024).toFixed(0)} KB) + appsscript.json`)

if (process.argv.includes('--check')) {
  const { runInSandbox } = await import('./apps-script-sandbox.mjs')
  await runInSandbox(join(OUT, 'Code.js'))
}

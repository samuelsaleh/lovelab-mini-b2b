#!/usr/bin/env node
/**
 * Re-export every catalogue PDF at 300 dpi into public/catalogues/email/.
 *
 * WHY THIS EXISTS
 * The originals are print masters, 18–45 MB each. Base64 inflates an
 * attachment by a third, so a 22.6 MB catalogue travels as ~31 MB — under
 * Resend's 40 MB sending limit, but well over what a recipient's mailbox will
 * accept. iCloud caps an incoming message at 20 MB and Outlook around 25 MB;
 * Google accepts 50 MB inbound, which is why an order email on 6 Sep 2026
 * reached all three Google-hosted BCCs and bounced only for the iCloud client.
 *
 * 300 dpi ("/printer") is still print quality and is visually identical on a
 * screen, at roughly a third of the size. The originals stay untouched and are
 * what the app serves for download — only the email attachment uses these.
 *
 * Usage:  node scripts/build-email-catalogues.mjs [--check]
 *         --check  verifies the email copies exist and are current, no writing
 *
 * Requires Ghostscript (`brew install ghostscript`).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC_ROOT = path.join('public', 'catalogues')
const OUT_ROOT = path.join(SRC_ROOT, 'email')
const CHECK_ONLY = process.argv.includes('--check')

// Mirrors MAX_CATALOGUE_BYTES in lib/orderEmailCatalogue.js — anything above
// this cannot be attached and will be dropped in favour of a download link.
const BUDGET_MB = 11

function pdfsUnder(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'email') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...pdfsUnder(full))
    else if (entry.name.toLowerCase().endsWith('.pdf')) out.push(full)
  }
  return out
}

if (!existsSync(SRC_ROOT)) {
  console.error(`No catalogues directory at ${SRC_ROOT}`)
  process.exit(1)
}

if (!CHECK_ONLY) {
  try {
    execFileSync('gs', ['--version'], { stdio: 'ignore' })
  } catch {
    console.error('Ghostscript not found. Install it with: brew install ghostscript')
    process.exit(1)
  }
}

const mb = (bytes) => bytes / 1024 / 1024
let failures = 0

for (const src of pdfsUnder(SRC_ROOT)) {
  const rel = path.relative(SRC_ROOT, src)
  const out = path.join(OUT_ROOT, rel)
  mkdirSync(path.dirname(out), { recursive: true })

  if (CHECK_ONLY) {
    if (!existsSync(out)) {
      console.error(`MISSING  ${rel} — run without --check to build it`)
      failures++
      continue
    }
    if (statSync(out).mtimeMs < statSync(src).mtimeMs) {
      console.error(`STALE    ${rel} — the source is newer than the email copy`)
      failures++
      continue
    }
    const size = statSync(out).size
    const flag = mb(size) > BUDGET_MB ? 'OVER BUDGET' : 'ok'
    console.log(`${String(flag).padEnd(11)} ${mb(size).toFixed(1).padStart(5)} MB  ${rel}`)
    if (flag !== 'ok') failures++
    continue
  }

  execFileSync('gs', [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    '-dPDFSETTINGS=/printer',
    '-dNOPAUSE', '-dQUIET', '-dBATCH',
    `-sOutputFile=${out}`,
    src,
  ], { stdio: 'inherit' })

  const before = mb(statSync(src).size)
  const after = mb(statSync(out).size)
  const warn = after > BUDGET_MB ? '  ⚠ still over the attachment budget' : ''
  console.log(`${before.toFixed(1).padStart(5)} MB → ${after.toFixed(1).padStart(5)} MB   ${rel}${warn}`)
  if (after > BUDGET_MB) failures++
}

if (CHECK_ONLY && failures) {
  console.error(`\n${failures} catalogue(s) missing, stale or over the ${BUDGET_MB} MB budget.`)
  process.exit(1)
}
console.log(failures ? `\nDone, but ${failures} file(s) exceed the ${BUDGET_MB} MB budget.` : '\nDone.')

#!/usr/bin/env node
/**
 * Keep every catalogue PDF in public/catalogues small enough to email.
 *
 * WHY THIS EXISTS
 * Two limits bite, and neither is Resend's.
 *
 * 1. Recipient mailboxes. Base64 inflates an attachment by a third, so a
 *    22.6 MB catalogue travels as ~31 MB. Resend accepts 40 MB and Google
 *    accepts 50 MB inbound, but iCloud caps an incoming message at 20 MB and
 *    Outlook at around 25 MB. On 6 Sep 2026 that combination delivered an
 *    order email to all three internal BCCs and bounced the client's copy.
 *
 * 2. The serverless function. lib/orderEmailCatalogue.js reads its filename
 *    dynamically, so @vercel/nft bundles the WHOLE public/catalogues directory
 *    into api/documents/send-email. Keeping print masters next to email copies
 *    put that function at 256 MB against Vercel's 250 MB limit and failed the
 *    deploy. One copy of each catalogue, already small — that is the rule.
 *
 * 300 dpi ("/printer") is print quality and indistinguishable on screen at
 * about a third of the size. The editable masters live in Canva (see the
 * `canva` field on each entry in lib/catalogues.js), which is where a full
 * resolution export should come from if one is ever needed.
 *
 * Usage:  node scripts/build-email-catalogues.mjs [--check]
 *         --check  report only, exit 1 if anything is over budget
 *
 * Safe to re-run: a file already under budget is left untouched, so repeated
 * runs never re-compress an already-compressed catalogue.
 *
 * Requires Ghostscript (`brew install ghostscript`).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join('public', 'catalogues')
const CHECK_ONLY = process.argv.includes('--check')

// Mirrors MAX_CATALOGUE_BYTES in lib/orderEmailCatalogue.js.
const BUDGET_MB = 11
// Total weight the serverless function can carry (Vercel's cap is 250 MB and
// the app code needs room too).
const DIRECTORY_BUDGET_MB = 150

const mb = (bytes) => bytes / 1024 / 1024

function pdfsUnder(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...pdfsUnder(full))
    else if (entry.name.toLowerCase().endsWith('.pdf')) out.push(full)
  }
  return out
}

if (!existsSync(ROOT)) {
  console.error(`No catalogues directory at ${ROOT}`)
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

let failures = 0
let total = 0

for (const file of pdfsUnder(ROOT)) {
  const rel = path.relative(ROOT, file)
  const before = statSync(file).size

  if (mb(before) <= BUDGET_MB) {
    total += before
    console.log(`ok      ${mb(before).toFixed(1).padStart(5)} MB  ${rel}`)
    continue
  }

  if (CHECK_ONLY) {
    total += before
    failures++
    console.error(`OVER    ${mb(before).toFixed(1).padStart(5)} MB  ${rel}`)
    continue
  }

  const tmp = `${file}.compressing`
  execFileSync('gs', [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    '-dPDFSETTINGS=/printer',
    '-dNOPAUSE', '-dQUIET', '-dBATCH',
    `-sOutputFile=${tmp}`,
    file,
  ], { stdio: 'inherit' })

  const after = statSync(tmp).size
  if (after >= before) {
    // Ghostscript made it bigger — keep the original rather than bloat it.
    unlinkSync(tmp)
    total += before
    failures++
    console.error(`SKIPPED ${mb(before).toFixed(1).padStart(5)} MB  ${rel} — re-export did not shrink it`)
    continue
  }

  renameSync(tmp, file)
  total += after
  if (mb(after) > BUDGET_MB) failures++
  const warn = mb(after) > BUDGET_MB ? '  ⚠ still over budget' : ''
  console.log(`${mb(before).toFixed(1).padStart(5)} MB → ${mb(after).toFixed(1).padStart(5)} MB  ${rel}${warn}`)
}

console.log(`\npublic/catalogues: ${mb(total).toFixed(0)} MB total (budget ${DIRECTORY_BUDGET_MB} MB)`)
if (mb(total) > DIRECTORY_BUDGET_MB) {
  console.error('Over the directory budget — the send-email function will exceed Vercel\'s 250 MB limit.')
  failures++
}

if (failures) {
  console.error(`\n${failures} problem(s).`)
  process.exit(1)
}
console.log('Done.')

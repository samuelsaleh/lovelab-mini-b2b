#!/usr/bin/env node
/**
 * Render a PDF into the JPEG frames the Fair Slideshow player serves.
 *
 * The player never parses PDFs in the browser — it shows pre-rendered static
 * images, which is why a booth screen starts instantly and keeps running when
 * the venue wifi drops. Run this whenever a deck changes, then update `count`
 * in lib/slideshows.js to the number this prints.
 *
 * Usage:
 *   node scripts/build-slideshow-frames.mjs <deck-id> [pdf-path] [width]
 *
 *   node scripts/build-slideshow-frames.mjs lifestyle
 *   node scripts/build-slideshow-frames.mjs brand-fr "public/BRAND PRESENTATION DOCS/LoveLab_Presentation_Marque_FR.pdf"
 *
 * Requires poppler-utils (`brew install poppler`).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const SOURCES = {
  lifestyle: {
    pdf: 'public/BRAND PRESENTATION DOCS/LoveLab_Lifestyle_Slideshow.pdf',
    width: 1920,
  },
  'brand-en': {
    pdf: 'public/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf',
    width: 1400,
  },
  'brand-fr': {
    pdf: 'public/BRAND PRESENTATION DOCS/LoveLab_Presentation_Marque_FR.pdf',
    width: 1400,
  },
}

const [deckId, pdfArg, widthArg] = process.argv.slice(2)

if (!deckId) {
  console.error('Usage: node scripts/build-slideshow-frames.mjs <deck-id> [pdf-path] [width]')
  console.error('Known decks:', Object.keys(SOURCES).join(', '))
  process.exit(1)
}

const preset = SOURCES[deckId] || {}
const pdf = pdfArg || preset.pdf
const width = Number(widthArg || preset.width || 1600)

if (!pdf || !existsSync(pdf)) {
  console.error(`PDF not found: ${pdf || '(none given)'}`)
  process.exit(1)
}

try {
  execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' })
} catch {
  console.error('pdftoppm not found. Install poppler: brew install poppler')
  process.exit(1)
}

const outDir = path.join('public', 'slideshows', deckId)
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir)) {
    if (f.endsWith('.jpg')) rmSync(path.join(outDir, f))
  }
} else {
  mkdirSync(outDir, { recursive: true })
}

execFileSync(
  'pdftoppm',
  [
    '-jpeg', '-jpegopt', 'quality=82',
    '-scale-to-x', String(width), '-scale-to-y', '-1',
    pdf, path.join(outDir, 'slide'),
  ],
  { stdio: 'inherit' }
)

const frames = readdirSync(outDir).filter((f) => f.endsWith('.jpg')).sort()
console.log(`\n✓ ${frames.length} frames written to ${outDir}`)
console.log(`  Set  count: ${frames.length}  for deck "${deckId}" in lib/slideshows.js`)

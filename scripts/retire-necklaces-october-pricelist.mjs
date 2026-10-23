/**
 * Take the retired necklaces (Oct 2026) off Pricelist_LoveLab_2026_October.pdf.
 *
 * Retired: CUBIX, MULTI FIVE, MATCHY FANCY, SHAPY SHINE and HOLY necklaces
 * (RETIRED_COLLECTION_IDS in lib/catalog.js). Still sold: CUTY, MULTI THREE,
 * MULTI FOUR, SHAPY SPARKLE.
 *
 * The necklace table is vector text, so nothing is retyped:
 *   1. The retired blocks are removed with MuPDF redaction (text + row lines
 *      gone from the content stream, so a search or copy-paste cannot find
 *      them any more).
 *   2. The block that has to close the gap (the MULTI THREE heading on page 3,
 *      the SHAPY SPARKLE block on page 4) is cut out of a copy of the page in
 *      which everything else is redacted, and drawn back higher up, clipped to
 *      its own band. Same fonts, colours and lines as the original.
 *
 * Coordinates are PDF points from the top of the page (MuPDF's frame), read off
 * the October list. Run once: the script reads *.pre-necklace-retire.pdf when
 * present, so a re-run starts from the same original.
 *
 * Run: node scripts/retire-necklaces-october-pricelist.mjs
 */
import * as mupdf from 'mupdf'
import { PDFDocument, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LISTS = path.join(__dirname, '..', 'public', 'Price Lists')
const FILE = path.join(LISTS, 'Pricelist_LoveLab_2026_October.pdf')
const BACKUP = path.join(LISTS, 'Pricelist_LoveLab_2026_October.pre-necklace-retire.pdf')

const PAGE_W = 595.2756
const PAGE_H = 841.8898

// Per page (1-based): the band to wipe, and the block moved up into its top.
const EDITS = [
  // Page 3: CUBIX NECKLACE block (heading + 3 rows) out; MULTI THREE heading up.
  { page: 3, wipe: [638.0, 753.6], keep: [731.6, 753.4] },
  // Page 4: MULTI FIVE, MATCHY FANCY, SHAPY SHINE, SHAPY SPARKLE, HOLY out;
  // SHAPY SPARKLE (heading + 2 rows + its bottom rule) drawn where MULTI FIVE was.
  { page: 4, wipe: [222.9, 619.6], keep: [455.3, 525.25] },
]

function redact(bytes, rectsByPage) {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()
  for (const [pageNo, rects] of Object.entries(rectsByPage)) {
    const page = doc.loadPage(Number(pageNo) - 1)
    for (const [y0, y1] of rects) {
      const annot = page.createAnnotation('Redact')
      annot.setRect([0, y0, PAGE_W, y1])
    }
    page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE,
      mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE)
  }
  return new Uint8Array(doc.saveToBuffer('compress').asUint8Array())
}

async function main() {
  if (!fs.existsSync(BACKUP)) fs.copyFileSync(FILE, BACKUP)
  const original = new Uint8Array(fs.readFileSync(BACKUP))

  // The pages with the retired blocks wiped.
  const target = redact(original, Object.fromEntries(EDITS.map(e => [e.page, [e.wipe]])))
  // The pages with everything BUT the block to move wiped.
  const sources = redact(original, Object.fromEntries(EDITS.map(e => [e.page, [[0, e.keep[0]], [e.keep[1], PAGE_H]]])))

  const out = await PDFDocument.load(target)
  const src = await PDFDocument.load(sources)
  for (const e of EDITS) {
    const [embedded] = await out.embedPages([src.getPage(e.page - 1)])
    const page = out.getPage(e.page - 1)
    const dy = e.keep[0] - e.wipe[0] // points moved up
    const clipBottom = PAGE_H - e.keep[1] + dy
    page.pushOperators(pushGraphicsState(), rectangle(0, clipBottom, PAGE_W, e.keep[1] - e.keep[0]), clip(), endPath())
    page.drawPage(embedded, { x: 0, y: dy })
    page.pushOperators(popGraphicsState())
  }
  fs.writeFileSync(FILE, await out.save())
  console.log('Wrote', path.relative(process.cwd(), FILE))
}

main().catch((err) => { console.error(err); process.exit(1) })

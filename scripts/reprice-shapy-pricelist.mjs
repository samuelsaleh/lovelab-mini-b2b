/**
 * Apply the Aug 2026 Shapy reprice to the two designed 2026 price-list PDFs
 * (Pricelist_LoveLab_2026.pdf and Pricelist_LoveLab_2026_October.pdf), so the
 * printed lists match lib/catalog.js at pricelistYear '2026' / '2026-10'.
 *
 * Two different edits, because the two affected pages are not the same kind of
 * page:
 *
 *  - Page 2 (the SHAPY block) is already a 144-dpi raster — patch-ssrd-
 *    pricelist.mjs flattened it when it rewrote the D VVS rows. So the embedded
 *    image is pulled out at its native resolution (no re-rasterizing, no extra
 *    generation loss), the 11 SHAPY row interiors are painted out, and all 11
 *    rows are redrawn as real text. Redrawing the whole block — not only the
 *    rows whose numbers moved — is what makes the font, size and baseline
 *    uniform again; the earlier patch left the three D VVS rows a size small.
 *    The row separator lines sit on the band boundaries, so the erase boxes
 *    stop short of each edge (see ROW_INSET) and the rules survive.
 *
 *  - The necklace page (page 3 here, page 4 on the October list) is still
 *    vector text, so the cells that moved are edited in place: the glyph run
 *    of each SHAPY SHINE / SHAPY SPARKLE NECKLACE price is rewritten inside
 *    the content stream, reusing the page's own embedded Liberation Sans. That
 *    keeps the real font and leaves no stale number behind in the text layer —
 *    painting a white box over the old value would still let pdftotext, a copy
 *    -paste or a search turn up the old price. Every digit in this font is 556
 *    units wide, and each replacement swaps digits for digits, so the runs keep
 *    their original width and the columns stay aligned.
 *
 * The two lists were generated with different settings: the 2026 list sets its
 * numeric columns centred at 8.5pt, the October list right-aligns them at
 * 9.5pt. Both are Liberation Sans, which is metric-compatible with the
 * Helvetica standard font used to redraw.
 *
 * Requires pdfimages (poppler) + Pillow. Run: node scripts/reprice-shapy-pricelist.mjs
 */
import { PDFDocument, PDFName, StandardFonts, decodePDFRawStream, rgb } from 'pdf-lib'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LISTS = path.join(__dirname, '..', 'public', 'Price Lists')
const INK = rgb(0.227, 0.2, 0.251)

// The SHAPY block, top to bottom, at the new prices. Mirrors lib/catalog.js
// SSF / SSPF / SSRG / SSRD for pricelist '2026'.
const SHAPY_ROWS = [
  { name: 'SHAPY SHINE FANCY IGI',                  carat: '0,1', b2b: '€55',  b2c: '€180' },
  { name: 'SHAPY SHINE FANCY IGI',                  carat: '0,3', b2b: '€100', b2c: '€330' },
  { name: 'SHAPY SHINE FANCY IGI',                  carat: '0,5', b2b: '€155', b2c: '€600' },
  { name: 'SHAPY SPARKLE FANCY IGI',                carat: '0,7', b2b: '€400', b2c: '€750' },
  { name: 'SHAPY SPARKLE FANCY IGI',                carat: '1',   b2b: '€600', b2c: '€1.200' },
  { name: 'SHAPY SPARKLE ROUND (G/H VS) INHOUSE',   carat: '0,5', b2b: '€160', b2c: '€350' },
  { name: 'SHAPY SPARKLE ROUND (G/H VS) INHOUSE',   carat: '0,7', b2b: '€200', b2c: '€450' },
  { name: 'SHAPY SPARKLE ROUND (G/H VS) INHOUSE',   carat: '1',   b2b: '€260', b2c: '€700' },
  { name: 'SHAPY SPARKLE D VVS INHOUSE',            carat: '0,5', b2b: '€300', b2c: '€800' },
  { name: 'SHAPY SPARKLE D VVS INHOUSE',            carat: '0,7', b2b: '€400', b2c: '€1.000' },
  { name: 'SHAPY SPARKLE D VVS IGI',                carat: '1',   b2b: '€500', b2c: '€1.200' },
]

const TARGETS = [
  {
    file: 'Pricelist_LoveLab_2026.pdf',
    // ─── page 2 · SHAPY block (raster) ───
    shapy: {
      pageIndex: 1,
      fontSize: 8.5,
      align: 'center',
      nameX: 50.5197,
      caratX: 307.84,
      b2bX: 371.62,
      b2cX: 481.32,
      // Row bands and text baselines, both measured from the top of the page.
      bandTop: 85.68,
      bandPitch: 23.105,
      baselineTop: 99.75,
      baselinePitch: 23.0958,
      eraseX: 46,
      eraseW: 499,
    },
    // ─── page 3 · necklace cells (vector) ───
    // Each cell is pinned by its baseline and left edge in page points, so a
    // value that appears in more than one row (€660 does) cannot be hit by
    // accident.
    necklace: {
      pageIndex: 2,
      cells: [
        // SHAPY SHINE NECKLACE 0,5 — B2C only (its B2B did not move).
        { y: 415.41, x: 471.87, from: '€540', to: '€720' },
        // SHAPY SPARKLE NECKLACE 0,7 then 1,00 — both columns move.
        { y: 459.01, x: 362.17, from: '€288', to: '€480' },
        { y: 459.01, x: 471.87, from: '€660', to: '€900' },
        { y: 482.10, x: 362.17, from: '€390', to: '€720' },
        { y: 482.10, x: 468.32, from: '€1.020', to: '€1.440' },
      ],
    },
  },
  {
    file: 'Pricelist_LoveLab_2026_October.pdf',
    shapy: {
      pageIndex: 1,
      fontSize: 9.5,
      align: 'right',
      nameX: 52.5197,
      caratX: 320.09,
      b2bX: 408.42,
      b2cX: 542.75,
      bandTop: 102.24,
      bandPitch: 24.394,
      baselineTop: 116.80,
      baselinePitch: 24.3628,
      eraseX: 48,
      eraseW: 552,
    },
    necklace: {
      pageIndex: 3,
      cells: [
        { y: 446.85, x: 521.62, from: '€540', to: '€720' },
        { y: 491.82, x: 387.29, from: '€288', to: '€480' },
        { y: 491.82, x: 521.62, from: '€660', to: '€900' },
        { y: 516.19, x: 387.29, from: '€390', to: '€720' },
        { y: 516.19, x: 513.70, from: '€1.020', to: '€1.440' },
      ],
    },
  },
]

// Pull page N's single embedded image out at its native resolution. Going
// through pdfimages instead of pdftoppm keeps the raster exactly as designed —
// re-rendering it would compound the loss the first flattening already cost.
function extractPageImage(pdfPath, pageNumber, destPng) {
  const prefix = destPng.replace(/\.png$/, '')
  execFileSync('pdfimages', [
    '-png', '-f', String(pageNumber), '-l', String(pageNumber), pdfPath, prefix,
  ])
  const dir = path.dirname(prefix)
  const base = path.basename(prefix)
  const hits = fs.readdirSync(dir).filter((n) => n.startsWith(`${base}-`) && n.endsWith('.png'))
  if (hits.length !== 1) {
    throw new Error(`expected 1 embedded image on page ${pageNumber} of ${pdfPath}, got ${hits.length}`)
  }
  const produced = path.join(dir, hits[0])
  if (produced !== destPng) fs.renameSync(produced, destPng)
}

// White out the interior of every SHAPY row. ROW_INSET keeps the erase clear
// of the light rule on each band boundary: the rules are only ~0.5pt thick, but
// the band pitch is an average over 11 rows, so a tighter inset nicks the rule
// on whichever rows the averaging rounds against. The row text sits ~7.5pt in
// from either edge, so 2pt of clearance still erases every glyph.
const ROW_INSET = 2.0

function eraseRows(pngPath, spec, pageWidthPt, pageHeightPt) {
  const boxes = SHAPY_ROWS.map((_, k) => [
    spec.eraseX,
    spec.bandTop + k * spec.bandPitch + ROW_INSET,
    spec.eraseX + spec.eraseW,
    spec.bandTop + (k + 1) * spec.bandPitch - ROW_INSET,
  ])
  execFileSync('python3', ['-c', `
import json
from PIL import Image, ImageDraw
im = Image.open(${JSON.stringify(pngPath)}).convert('RGB')
sx = im.size[0] / ${pageWidthPt}
sy = im.size[1] / ${pageHeightPt}
d = ImageDraw.Draw(im)
for x0, y0, x1, y1 in json.loads(${JSON.stringify(JSON.stringify(boxes))}):
    d.rectangle([x0 * sx, y0 * sy, x1 * sx, y1 * sy], fill=(255, 255, 255))
im.save(${JSON.stringify(pngPath)})
`])
}

// Place `text` per the page's column convention: the 2026 list centres its
// numeric columns on x, the October list right-aligns them to x.
function drawCell(page, font, size, align, x, baseline, text) {
  const w = font.widthOfTextAtSize(text, size)
  const left = align === 'right' ? x - w : x - w / 2
  page.drawText(text, { x: left, y: baseline, size, font, color: INK })
}

// Both directions of the page's embedded-subset encoding, read off each font's
// ToUnicode CMap: glyph id → character (to read a run back) and character →
// glyph id (to write a new one).
function glyphMaps(doc, page) {
  const fonts = doc.context.lookup(page.node.Resources().get(PDFName.of('Font')))
  const out = {}
  for (const [name, ref] of fonts.entries()) {
    const toUnicode = doc.context.lookup(ref).get(PDFName.of('ToUnicode'))
    if (!toUnicode) continue
    const cmap = Buffer.from(
      decodePDFRawStream(doc.context.lookup(toUnicode)).decode(),
    ).toString('latin1')
    const toChar = {}
    for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        toChar[pair[1].toLowerCase()] = String.fromCharCode(parseInt(pair[2].slice(0, 4), 16))
      }
    }
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const r of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        const lo = parseInt(r[1], 16)
        const hi = parseInt(r[2], 16)
        const uni = parseInt(r[3].slice(0, 4), 16)
        for (let g = lo; g <= hi; g++) {
          toChar[g.toString(16).padStart(4, '0')] = String.fromCharCode(uni + g - lo)
        }
      }
    }
    const toGid = {}
    for (const [gid, ch] of Object.entries(toChar)) if (!(ch in toGid)) toGid[ch] = gid
    out[name.toString().slice(1)] = { toChar, toGid }
  }
  return out
}

// Rewrite the moved necklace prices inside the page's own content stream.
// Every show-text run is decoded through ToUnicode and matched on text AND
// position, so a value that repeats down the page (€660 does) can only be hit
// in the row it was pinned to.
function rewriteNecklaceCells(doc, spec) {
  const page = doc.getPages()[spec.pageIndex]
  const maps = glyphMaps(doc, page)
  const contentsRef = page.node.get(PDFName.of('Contents'))
  const stream = Buffer.from(
    decodePDFRawStream(doc.context.lookup(contentsRef)).decode(),
  ).toString('latin1')

  // The generator wraps the page in a half-scale CTM, so a Tm translation is
  // 0.75x the page point it lands on. Assert it rather than assume it.
  const SCALE = 0.75
  if (!stream.includes(`${SCALE} 0 0 ${SCALE} 0 0 cm`)) {
    throw new Error(`page ${spec.pageIndex + 1}: expected a ${SCALE} page CTM`)
  }

  const token = /\/(\w+)\s+[\d.]+\s+Tf|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|\[([^\]]*)\]\s*TJ/g
  const edits = []
  let font = null
  let tx = 0
  let ty = 0
  let m
  while ((m = token.exec(stream))) {
    if (m[1]) { font = m[1]; continue }
    if (m[6] !== undefined) { tx = Number(m[6]); ty = Number(m[7]); continue }
    const { toChar, toGid } = maps[font] || {}
    if (!toChar) continue
    const text = [...m[8].matchAll(/<([0-9a-fA-F]+)>/g)]
      .map((g) => toChar[g[1].toLowerCase()] ?? '�')
      .join('')
    const cell = spec.cells.find((c) => (
      c.from === text
      && Math.abs(tx * SCALE - c.x) < 0.5
      && Math.abs(ty * SCALE - c.y) < 0.5
    ))
    if (!cell) continue
    const gids = [...cell.to].map((ch) => {
      const gid = toGid[ch]
      if (!gid) throw new Error(`no glyph for "${ch}" in subset ${font}`)
      return `<${gid}>0`
    })
    edits.push({ cell, start: m.index, end: m.index + m[0].length, body: `[${gids.join('')}] TJ` })
  }

  for (const cell of spec.cells) {
    const hits = edits.filter((e) => e.cell === cell)
    if (hits.length !== 1) {
      throw new Error(`${cell.from} at (${cell.x}, ${cell.y}): expected 1 match, found ${hits.length}`)
    }
  }

  let patched = stream
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    patched = patched.slice(0, e.start) + e.body + patched.slice(e.end)
  }
  doc.context.assign(contentsRef, doc.context.flateStream(Buffer.from(patched, 'latin1')))
  return edits.length
}

async function patchOne(spec) {
  const full = path.join(LISTS, spec.file)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shapy-pdf-'))
  const pngPath = path.join(tmp, 'page.png')
  try {
    const src = await PDFDocument.load(fs.readFileSync(full))
    const pageCount = src.getPageCount()
    const { width, height } = src.getPages()[spec.shapy.pageIndex].getSize()

    // Edit the necklace page before copying it — copyPages snapshots the
    // content stream, so a later edit to `src` would not travel with it.
    const cells = rewriteNecklaceCells(src, spec.necklace)

    extractPageImage(full, spec.shapy.pageIndex + 1, pngPath)
    eraseRows(pngPath, spec.shapy, width, height)

    const out = await PDFDocument.create()
    const font = await out.embedFont(StandardFonts.Helvetica)
    const png = await out.embedPng(fs.readFileSync(pngPath))

    for (let i = 0; i < pageCount; i++) {
      // The SHAPY page is rebuilt from the cleaned raster so the old text
      // layer (the three D VVS rows the previous patch drew) is dropped.
      if (i === spec.shapy.pageIndex) {
        const s = spec.shapy
        const page = out.addPage([width, height])
        page.drawImage(png, { x: 0, y: 0, width, height })
        SHAPY_ROWS.forEach((row, k) => {
          const baseline = height - (s.baselineTop + k * s.baselinePitch)
          page.drawText(row.name, { x: s.nameX, y: baseline, size: s.fontSize, font, color: INK })
          drawCell(page, font, s.fontSize, s.align, s.caratX, baseline, row.carat)
          drawCell(page, font, s.fontSize, s.align, s.b2bX, baseline, row.b2b)
          drawCell(page, font, s.fontSize, s.align, s.b2cX, baseline, row.b2c)
        })
        continue
      }

      // Every other page — the already-edited necklace page included — is
      // copied across untouched.
      const [copied] = await out.copyPages(src, [i])
      out.addPage(copied)
    }

    fs.writeFileSync(full, await out.save())
    console.log(`repriced ${spec.file} (${SHAPY_ROWS.length} Shapy rows, ${cells} necklace cells)`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

for (const spec of TARGETS) {
  await patchOne(spec)
}

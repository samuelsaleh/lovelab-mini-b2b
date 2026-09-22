/**
 * Apply the Sep 2026 bracelet reprice to Pricelist_LoveLab_2026_October.pdf.
 *
 * Page 2 is a full-page DeviceRGB raster (SHAPY overlay was already redrawn
 * by reprice-shapy-pricelist.mjs). Moonlight + the trailing Sienna One 0.10 row
 * live in that raster — erase those bands and redraw. SHAPY overlay text is
 * redrawn too so rebuilding the page does not drop it.
 *
 * Page 3 (Sienna Two–Five + Iconix) is vector text — rewrite B2B/B2C glyph
 * runs in place, same technique as the necklace cells in the Shapy script.
 *
 * Necklaces and classic bracelet pages are left alone.
 *
 * Run: node scripts/reprice-october-bracelets.mjs
 */
import { PDFDocument, PDFName, StandardFonts, decodePDFRawStream, rgb } from 'pdf-lib'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LISTS = path.join(__dirname, '..', 'public', 'Price Lists')
const FILE = 'Pricelist_LoveLab_2026_October.pdf'
const INK = rgb(0.227, 0.2, 0.251)
const ROW_INSET = 2.0

// Same SHAPY overlay the Aug reprice drew — must be re-applied when page 2 is rebuilt.
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

const SHAPY = {
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
}

// Moonlight data rows + trailing Sienna One 0.10 on the same raster page.
// Baselines measured from the extracted page-2 PNG (top-of-page points).
const MOONLIGHT_ROWS = [
  { name: 'MOONLIGHT LONG',     carat: '0,05', b2b: '€67',  b2c: '€255' },
  { name: 'MOONLIGHT LONG',     carat: '0,1',  b2b: '€85',  b2c: '€255' },
  { name: 'MOONLIGHT LONG',     carat: '0,3',  b2b: '€120', b2c: '€360' },
  { name: 'MOONLIGHT MULTI',    carat: '0,2',  b2b: '€100', b2c: '€300' },
  { name: 'MOONLIGHT MULTI',    carat: '0,4',  b2b: '€165', b2c: '€495' },
  { name: 'MOONLIGHT MULTI',    carat: '0,7',  b2b: '€200', b2c: '€600' },
  { name: 'MOONLIGHT MULTI',    carat: '1,01', b2b: '€320', b2c: '€960' },
  { name: 'MOONLIGHT ORIGINAL', carat: '0,1',  b2b: '€70',  b2c: '€210' },
  { name: 'MOONLIGHT ORIGINAL', carat: '0,2',  b2b: '€90',  b2c: '€270' },
  { name: 'MOONLIGHT ORIGINAL', carat: '0,3',  b2b: '€120', b2c: '€360' },
  { name: 'MOONLIGHT ORIGINAL', carat: '0,5',  b2b: '€250', b2c: '€750' },
  { name: 'MOONLIGHT ORIGINAL', carat: '0,7',  b2b: '€300', b2c: '€900' },
  { name: 'MOONLIGHT ORIGINAL', carat: '1,01', b2b: '€460', b2c: '€1.380' },
  { name: 'SIENNA ONE',         carat: '0,1',  b2b: '€121', b2c: '€475' },
]

const MOONLIGHT = {
  ...SHAPY,
  // First LONG data row baseline (~402.9 pt from top); pitch ~25.0 pt.
  baselineTop: 402.9,
  baselinePitch: 25.0,
  bandTop: 388.4,
  bandPitch: 25.0,
  // Sienna One sits after a section header gap — override its band index.
  // Rows 0..12 are contiguous; row 13 (SI1) uses an absolute baseline.
  siennaOneBaselineTop: 748.9,
  siennaOneBandTop: 734.4,
}

// Page 3 vector cells — B2B/B2C only (SI1 0.30 kept; necklaces untouched).
const PAGE3_CELLS = [
  // SIENNA TWO
  { y: 122.05, x: 387.29, from: '€138', to: '€160' },
  { y: 122.05, x: 521.62, from: '€540', to: '€480' },
  // SIENNA THREE 0.15
  { y: 147.02, x: 392.57, from: '€78', to: '€90' },
  { y: 147.02, x: 521.62, from: '€295', to: '€270' },
  // SIENNA THREE 0.30
  { y: 172.00, x: 387.29, from: '€138', to: '€150' },
  { y: 172.00, x: 521.62, from: '€540', to: '€450' },
  // SIENNA FOUR 0.20
  { y: 196.97, x: 392.57, from: '€96', to: '€120' },
  // B2C 360 unchanged
  // SIENNA FOUR 0.40
  { y: 221.94, x: 387.29, from: '€172', to: '€190' },
  { y: 221.94, x: 521.62, from: '€675', to: '€570' },
  // SIENNA FIVE 0.25
  { y: 246.91, x: 388.00, from: '€114', to: '€130' },
  { y: 246.91, x: 521.62, from: '€430', to: '€390' },
  // SIENNA FIVE 0.50
  { y: 271.88, x: 387.29, from: '€196', to: '€225' },
  { y: 271.88, x: 521.62, from: '€765', to: '€675' },
  // FLOWER HEART
  { y: 317.16, x: 387.29, from: '€150', to: '€170' },
  { y: 317.16, x: 521.62, from: '€585', to: '€510' },
  // FLOWER MARQUISE
  { y: 341.52, x: 387.29, from: '€130', to: '€150' },
  { y: 341.52, x: 521.62, from: '€495', to: '€450' },
  // LINEA THREE
  { y: 365.88, x: 388.00, from: '€115', to: '€130' },
  { y: 365.88, x: 521.62, from: '€430', to: '€390' },
  // LINEA FIVE
  { y: 390.24, x: 387.29, from: '€175', to: '€195' },
  { y: 390.24, x: 521.62, from: '€675', to: '€585' },
  // RIVIERA FOUR 0.20
  { y: 414.61, x: 392.57, from: '€90', to: '€110' },
  { y: 414.61, x: 521.62, from: '€340', to: '€330' },
  // RIVIERA FOUR 0.40
  { y: 438.97, x: 388.00, from: '€115', to: '€130' },
  { y: 438.97, x: 521.62, from: '€430', to: '€390' },
  // RIVIERA EIGHT 0.40
  { y: 463.33, x: 388.00, from: '€115', to: '€140' },
  { y: 463.33, x: 521.62, from: '€430', to: '€420' },
  // RIVIERA EIGHT 0.80
  { y: 487.70, x: 387.29, from: '€150', to: '€175' },
  { y: 487.70, x: 521.62, from: '€585', to: '€525' },
  // ZAHA
  { y: 512.36, x: 387.29, from: '€126', to: '€140' },
  { y: 512.36, x: 521.62, from: '€495', to: '€420' },
]

function extractPageImage(doc, pageIndex, destPng) {
  const page = doc.getPages()[pageIndex]
  const res = page.node.Resources()
  const xobj = doc.context.lookup(res.get(PDFName.of('XObject')))
  if (!xobj) throw new Error(`page ${pageIndex + 1}: no XObject`)
  const entries = [...xobj.entries()]
  if (entries.length !== 1) throw new Error(`page ${pageIndex + 1}: expected 1 image, got ${entries.length}`)
  const stream = doc.context.lookup(entries[0][1])
  const dict = stream.dict
  const w = dict.get(PDFName.of('Width')).numberValue
  const h = dict.get(PDFName.of('Height')).numberValue
  const bytes = decodePDFRawStream(stream).decode()
  const raw = destPng.replace(/\.png$/, '.raw')
  fs.writeFileSync(raw, bytes)
  execFileSync('python3', ['-c', `
from PIL import Image
im = Image.frombytes('RGB', (${w}, ${h}), open(${JSON.stringify(raw)}, 'rb').read())
im.save(${JSON.stringify(destPng)})
`])
  fs.unlinkSync(raw)
  return { w, h }
}

function eraseBands(pngPath, bands, pageWidthPt, pageHeightPt) {
  execFileSync('python3', ['-c', `
import json
from PIL import Image, ImageDraw
im = Image.open(${JSON.stringify(pngPath)}).convert('RGB')
sx = im.size[0] / ${pageWidthPt}
sy = im.size[1] / ${pageHeightPt}
d = ImageDraw.Draw(im)
for x0, y0, x1, y1 in json.loads(${JSON.stringify(JSON.stringify(bands))}):
    d.rectangle([x0 * sx, y0 * sy, x1 * sx, y1 * sy], fill=(255, 255, 255))
im.save(${JSON.stringify(pngPath)})
`])
}

function drawCell(page, font, size, align, x, baseline, text) {
  const w = font.widthOfTextAtSize(text, size)
  const left = align === 'right' ? x - w : x - w / 2
  page.drawText(text, { x: left, y: baseline, size, font, color: INK })
}

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

function readStream(doc, page) {
  const c = page.node.get(PDFName.of('Contents'))
  if (c && typeof c.size === 'function') {
    // Multi-stream pages are not expected on the October list page 3, but
    // flatten just in case so the rewriter sees one buffer.
    let stream = ''
    const refs = []
    for (let i = 0; i < c.size(); i++) refs.push(c.get(i))
    for (const r of refs) {
      stream += Buffer.from(decodePDFRawStream(doc.context.lookup(r)).decode()).toString('latin1')
    }
    return { stream, contentsRef: refs.length === 1 ? refs[0] : null, multi: refs }
  }
  return { stream: Buffer.from(decodePDFRawStream(doc.context.lookup(c)).decode()).toString('latin1'), contentsRef: c, multi: null }
}

function rewriteCells(doc, pageIndex, cells) {
  const page = doc.getPages()[pageIndex]
  const maps = glyphMaps(doc, page)
  const { stream, contentsRef, multi } = readStream(doc, page)
  if (multi && multi.length !== 1) {
    throw new Error(`page ${pageIndex + 1}: multi-stream contents not supported for rewrite`)
  }
  const SCALE = 0.75
  if (!stream.includes(`${SCALE} 0 0 ${SCALE} 0 0 cm`)) {
    throw new Error(`page ${pageIndex + 1}: expected a ${SCALE} page CTM`)
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
    const cell = cells.find((c) => (
      c.from === text
      && Math.abs(tx * SCALE - c.x) < 0.5
      && Math.abs(ty * SCALE - c.y) < 0.5
    ))
    if (!cell) continue
    const gids = [...cell.to].map((ch) => {
      const gid = toGid[ch]
      if (!gid) throw new Error(`no glyph for "${ch}" in subset ${font} (replacing ${cell.from}→${cell.to})`)
      return `<${gid}>0`
    })
    edits.push({ cell, start: m.index, end: m.index + m[0].length, body: `[${gids.join('')}] TJ` })
  }

  for (const cell of cells) {
    const hits = edits.filter((e) => e.cell === cell)
    if (hits.length !== 1) {
      throw new Error(`${cell.from}→${cell.to} at (${cell.x}, ${cell.y}): expected 1 match, found ${hits.length}`)
    }
  }

  let patched = stream
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    patched = patched.slice(0, e.start) + e.body + patched.slice(e.end)
  }
  doc.context.assign(contentsRef, doc.context.flateStream(Buffer.from(patched, 'latin1')))
  return edits.length
}

function moonlightBands() {
  const bands = []
  // Contiguous Moonlight data rows 0..12
  for (let k = 0; k < MOONLIGHT_ROWS.length - 1; k++) {
    bands.push([
      MOONLIGHT.eraseX,
      MOONLIGHT.bandTop + k * MOONLIGHT.bandPitch + ROW_INSET,
      MOONLIGHT.eraseX + MOONLIGHT.eraseW,
      MOONLIGHT.bandTop + (k + 1) * MOONLIGHT.bandPitch - ROW_INSET,
    ])
  }
  // Sienna One 0.10 at the bottom of page 2
  bands.push([
    MOONLIGHT.eraseX,
    MOONLIGHT.siennaOneBandTop + ROW_INSET,
    MOONLIGHT.eraseX + MOONLIGHT.eraseW,
    MOONLIGHT.siennaOneBandTop + MOONLIGHT.bandPitch - ROW_INSET,
  ])
  return bands
}

async function main() {
  const full = path.join(LISTS, FILE)
  const backup = path.join(LISTS, FILE.replace(/\.pdf$/, '.pre-bracelet-reprice.pdf'))
  if (!fs.existsSync(backup)) fs.copyFileSync(full, backup)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oct-bracelet-'))
  const pngPath = path.join(tmp, 'page.png')
  try {
    const src = await PDFDocument.load(fs.readFileSync(full))
    const pageCount = src.getPageCount()
    const { width, height } = src.getPages()[SHAPY.pageIndex].getSize()

    const cells = rewriteCells(src, 2, PAGE3_CELLS)

    extractPageImage(src, SHAPY.pageIndex, pngPath)
    eraseBands(pngPath, moonlightBands(), width, height)

    const out = await PDFDocument.create()
    const font = await out.embedFont(StandardFonts.Helvetica)
    const png = await out.embedPng(fs.readFileSync(pngPath))

    for (let i = 0; i < pageCount; i++) {
      if (i === SHAPY.pageIndex) {
        const page = out.addPage([width, height])
        page.drawImage(png, { x: 0, y: 0, width, height })
        // Re-draw SHAPY overlay
        SHAPY_ROWS.forEach((row, k) => {
          const baseline = height - (SHAPY.baselineTop + k * SHAPY.baselinePitch)
          page.drawText(row.name, { x: SHAPY.nameX, y: baseline, size: SHAPY.fontSize, font, color: INK })
          drawCell(page, font, SHAPY.fontSize, SHAPY.align, SHAPY.caratX, baseline, row.carat)
          drawCell(page, font, SHAPY.fontSize, SHAPY.align, SHAPY.b2bX, baseline, row.b2b)
          drawCell(page, font, SHAPY.fontSize, SHAPY.align, SHAPY.b2cX, baseline, row.b2c)
        })
        // Moonlight + Sienna One
        MOONLIGHT_ROWS.forEach((row, k) => {
          const fromTop = k < MOONLIGHT_ROWS.length - 1
            ? MOONLIGHT.baselineTop + k * MOONLIGHT.baselinePitch
            : MOONLIGHT.siennaOneBaselineTop
          const baseline = height - fromTop
          page.drawText(row.name, { x: MOONLIGHT.nameX, y: baseline, size: MOONLIGHT.fontSize, font, color: INK })
          drawCell(page, font, MOONLIGHT.fontSize, MOONLIGHT.align, MOONLIGHT.caratX, baseline, row.carat)
          drawCell(page, font, MOONLIGHT.fontSize, MOONLIGHT.align, MOONLIGHT.b2bX, baseline, row.b2b)
          drawCell(page, font, MOONLIGHT.fontSize, MOONLIGHT.align, MOONLIGHT.b2cX, baseline, row.b2c)
        })
        continue
      }
      const [copied] = await out.copyPages(src, [i])
      out.addPage(copied)
    }

    fs.writeFileSync(full, await out.save())
    console.log(`repriced ${FILE} (${MOONLIGHT_ROWS.length} moonlight/sienna rows, ${cells} page-3 cells)`)
    console.log(`backup: ${backup}`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

await main()

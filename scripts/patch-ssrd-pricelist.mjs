/**
 * Rewrite the three Shapy Sparkle D VVS bracelet rows on the designed
 * 2026 and October price-list PDFs. Page 2 is rasterized, the old D VVS
 * lines are painted out, then the new lines are drawn as real text so
 * pdftotext / pdf-parse see only the new wording. Other pages are copied
 * unchanged. G/H and every other product stay as printed.
 *
 * New rows (lib/catalog.js SSRD 2026 / 2026-10):
 *   SHAPY SPARKLE D VVS INHOUSE   0,5   €200   €600
 *   SHAPY SPARKLE D VVS INHOUSE   0,7   €300   €900
 *   SHAPY SPARKLE D VVS IGI        1    €400   €1.200
 *
 * Requires pdftoppm + Pillow. Run: node scripts/patch-ssrd-pricelist.mjs
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LISTS = path.join(__dirname, '..', 'public', 'Price Lists')
const DPI = 144
const SCALE = DPI / 72
const INK = rgb(0.227, 0.2, 0.251)

const NEW_ROWS = [
  { name: 'SHAPY SPARKLE D VVS INHOUSE', carat: '0,5', b2b: '€200', b2c: '€600' },
  { name: 'SHAPY SPARKLE D VVS INHOUSE', carat: '0,7', b2b: '€300', b2c: '€900' },
  { name: 'SHAPY SPARKLE D VVS IGI', carat: '1', b2b: '€400', b2c: '€1.200' },
]

const TARGETS = [
  {
    file: 'Pricelist_LoveLab_2026.pdf',
    pageIndex: 1,
    fontSize: 7.5,
    yMins: [277.246, 300.342, 323.438],
    boxH: 9.5,
    nameX: 50.5,
    caratX: 301.9,
    caratXOne: 305.5,
    b2bX: 362.17,
    b2cX: 471.87,
    eraseX: 48,
    eraseW: 450,
  },
  {
    file: 'Pricelist_LoveLab_2026_October.pdf',
    pageIndex: 1,
    fontSize: 8.3,
    yMins: [303.7, 328.1, 352.4],
    boxH: 10.6,
    nameX: 52.5,
    caratX: 306.9,
    caratXOne: 314.8,
    b2bX: 387.3,
    b2cX: 521.6,
    eraseX: 50,
    eraseW: 500,
  },
]

function rasterizePage(pdfPath, pageNumber, destPng) {
  const prefix = destPng.replace(/\.png$/, '')
  execFileSync('pdftoppm', [
    '-png', '-r', String(DPI),
    '-f', String(pageNumber), '-l', String(pageNumber),
    pdfPath, prefix,
  ])
  // pdftoppm writes prefix-1.png or prefix-01.png
  const dir = path.dirname(prefix)
  const base = path.basename(prefix)
  const hit = fs.readdirSync(dir).find((n) => n.startsWith(`${base}-`) && n.endsWith('.png'))
  if (!hit) throw new Error(`pdftoppm produced no PNG for ${pdfPath}`)
  const produced = path.join(dir, hit)
  if (produced !== destPng) fs.renameSync(produced, destPng)
}

function eraseRowsOnPng(pngPath, spec) {
  execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
im = Image.open(${JSON.stringify(pngPath)}).convert('RGB')
d = ImageDraw.Draw(im)
scale = ${SCALE}
pad = 3
for y in ${JSON.stringify(spec.yMins)}:
    top = y * scale - pad
    bot = (y + ${spec.boxH}) * scale + pad
    left = ${spec.eraseX} * scale
    right = (${spec.eraseX} + ${spec.eraseW}) * scale
    d.rectangle([left, top, right, bot], fill=(255, 255, 255))
im.save(${JSON.stringify(pngPath)})
`])
}

function drawRow(page, height, font, spec, yMin, row) {
  const baseline = height - (yMin + spec.boxH) + 0.6
  const caratX = row.carat === '1' ? spec.caratXOne : spec.caratX
  const bits = [
    [row.name, spec.nameX],
    [row.carat, caratX],
    [row.b2b, spec.b2bX],
    [row.b2c, spec.b2cX],
  ]
  for (const [text, x] of bits) {
    page.drawText(text, { x, y: baseline, size: spec.fontSize, font, color: INK })
  }
}

async function patchOne(spec) {
  const full = path.join(LISTS, spec.file)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssrd-pdf-'))
  const pngPath = path.join(tmp, 'page.png')
  try {
    rasterizePage(full, spec.pageIndex + 1, pngPath)
    eraseRowsOnPng(pngPath, spec)

    const src = await PDFDocument.load(fs.readFileSync(full))
    const out = await PDFDocument.create()
    const pageCount = src.getPageCount()
    const { width, height } = src.getPages()[spec.pageIndex].getSize()
    const font = await out.embedFont(StandardFonts.Helvetica)
    const png = await out.embedPng(fs.readFileSync(pngPath))

    for (let i = 0; i < pageCount; i++) {
      if (i === spec.pageIndex) {
        const page = out.addPage([width, height])
        page.drawImage(png, { x: 0, y: 0, width, height })
        spec.yMins.forEach((yMin, idx) => drawRow(page, height, font, spec, yMin, NEW_ROWS[idx]))
        continue
      }
      const [copied] = await out.copyPages(src, [i])
      out.addPage(copied)
    }

    fs.writeFileSync(full, await out.save())
    console.log(`patched ${spec.file}`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

for (const spec of TARGETS) {
  await patchOne(spec)
}

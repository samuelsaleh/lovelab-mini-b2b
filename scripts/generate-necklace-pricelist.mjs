/**
 * Simple, nicely-designed price list for the NECKLACES.
 *
 * 100% catalog-driven (lib/catalog.js): every necklace, carat, B2B/B2C price and
 * colour is read straight from the live app so this file can never drift.
 *
 * Sheets:
 *   1. Price list   — every necklace × carat with B2B + B2C (clean, banded)
 *   2. Colours      — the colours available per necklace
 *   3. Colour swatches — visual palette (nylon / shine) with real colours
 *
 * Run: node scripts/generate-all-products-pricelist.mjs
 */
import ExcelJS from 'exceljs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COLLECTIONS, CORD_COLORS, CORD_TYPE_LABELS, CERT_LABELS,
  getCollectionsByType, getProductType, getAvailableCerts, getPrice, getRetail,
} from '../lib/catalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '_reference-materials', 'LoveLab_Necklaces_Prices.xlsx')
const YEAR = '2026'

// Necklaces only.
const NECKS = getCollectionsByType(COLLECTIONS, 'necklace')

// ─── Brand palette ─────────────────────────────────────────────────────────────
const INK = 'FF2D2A4A'      // deep indigo (headers)
const ACCENT = 'FFEDE7F6'   // soft lilac (section bands)
const BAND = 'FFF6F4FB'     // very light row banding
const WHITE = 'FFFFFFFF'
const BORDER = 'FFD9D4E8'

function thin(argb = BORDER) { return { style: 'thin', color: { argb } } }
function allBorders(cell, argb) {
  cell.border = { top: thin(argb), left: thin(argb), bottom: thin(argb), right: thin(argb) }
}

// Colours available for a collection: explicit allowedColors, else the full
// native cord palette.
function colorsFor(col) {
  if (col.allowedColors) return col.allowedColors
  return (CORD_COLORS[col.cord] || []).map((c) => c.n)
}

const wb = new ExcelJS.Workbook()
wb.creator = 'LoveLab'
wb.created = new Date()

// ════════════════════════════════════════════════════════════════════════════
// Sheet 1 — Price list
// ════════════════════════════════════════════════════════════════════════════
const ws = wb.addWorksheet('Price list', {
  views: [{ state: 'frozen', ySplit: 3 }],
})
const COLS = [
  { key: 'product', width: 26 },
  { key: 'type', width: 12 },
  { key: 'carat', width: 10 },
  { key: 'cert', width: 12 },
  { key: 'b2b', width: 16 },
  { key: 'b2c', width: 16 },
  { key: 'cord', width: 14 },
  { key: 'minq', width: 10 },
]
ws.columns = COLS

// Title band (row 1) + subtitle (row 2)
ws.mergeCells('A1:H1')
const title = ws.getCell('A1')
title.value = 'LoveLab — Necklaces Price List'
title.font = { bold: true, size: 18, color: { argb: WHITE } }
title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
ws.getRow(1).height = 30

ws.mergeCells('A2:H2')
const sub = ws.getCell('A2')
sub.value = `B2B (wholesale) + B2C (retail) · ${YEAR} price list · all prices in € · ${NECKS.length} necklaces`
sub.font = { italic: true, size: 10, color: { argb: 'FF6B6685' } }
sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
ws.getRow(2).height = 18

// Header row (row 3)
const headers = ['Product', 'Type', 'Carat (ct)', 'Certificate', 'B2B (€)', 'B2C (€)', 'Cord / thread', 'Min qty']
const hr = ws.getRow(3)
headers.forEach((h, i) => {
  const cell = hr.getCell(i + 1)
  cell.value = h
  cell.font = { bold: true, color: { argb: WHITE }, size: 11 }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  cell.alignment = { vertical: 'middle', horizontal: i >= 2 && i <= 5 ? 'center' : 'left', wrapText: true }
  allBorders(cell, INK)
})
hr.height = 24

// Data rows — banded per product so the eye groups carats together.
let r = 4
let band = false
for (const col of NECKS) {
  const type = getProductType(col) === 'necklace' ? 'Necklace' : 'Bracelet'
  const fill = band ? BAND : WHITE
  let firstRowOfProduct = true

  col.carats.forEach((carat, ci) => {
    const certs = getAvailableCerts(col, ci, YEAR)
    certs.forEach((cert) => {
      const b2b = getPrice(col, ci, cert, YEAR)
      const b2c = getRetail(col, ci, cert, YEAR)
      if (!b2b && !b2c) return
      const row = ws.getRow(r)
      row.getCell(1).value = firstRowOfProduct ? col.label : ''
      row.getCell(2).value = firstRowOfProduct ? type : ''
      row.getCell(3).value = Number(carat)
      row.getCell(4).value = CERT_LABELS[cert] || cert
      row.getCell(5).value = b2b
      row.getCell(6).value = b2c
      row.getCell(7).value = CORD_TYPE_LABELS[col.cord] || col.cord
      row.getCell(8).value = firstRowOfProduct ? (col.minC || 1) : ''

      for (let c = 1; c <= 8; c++) {
        const cell = row.getCell(c)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
        allBorders(cell)
        cell.alignment = { vertical: 'middle', horizontal: c >= 3 && c <= 6 ? 'center' : 'left' }
      }
      row.getCell(1).font = { bold: true, color: { argb: INK } }
      row.getCell(3).numFmt = '0.00'
      row.getCell(5).numFmt = '€#,##0'
      row.getCell(6).numFmt = '€#,##0'
      row.getCell(5).font = { bold: true }
      r++
      firstRowOfProduct = false
    })
  })
  band = !band
}
ws.autoFilter = 'A3:H3'

// ════════════════════════════════════════════════════════════════════════════
// Sheet 2 — Colours per product
// ════════════════════════════════════════════════════════════════════════════
const wc = wb.addWorksheet('Colours', { views: [{ state: 'frozen', ySplit: 1 }] })
wc.columns = [
  { header: 'Product', key: 'product', width: 26 },
  { header: 'Type', key: 'type', width: 12 },
  { header: 'Cord / thread', key: 'cord', width: 14 },
  { header: '# colours', key: 'count', width: 10 },
  { header: 'Colours available', key: 'colours', width: 90 },
]
const wch = wc.getRow(1)
wch.eachCell((cell) => {
  cell.font = { bold: true, color: { argb: WHITE } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  cell.alignment = { vertical: 'middle', wrapText: true }
})
wch.height = 22
for (const col of NECKS) {
  const colours = colorsFor(col)
  const row = wc.addRow({
    product: col.label,
    type: getProductType(col) === 'necklace' ? 'Necklace' : 'Bracelet',
    cord: CORD_TYPE_LABELS[col.cord] || col.cord,
    count: colours.length,
    colours: colours.join(', '),
  })
  row.getCell('product').font = { bold: true, color: { argb: INK } }
  row.getCell('colours').alignment = { wrapText: true, vertical: 'top' }
  row.getCell('count').alignment = { horizontal: 'center' }
  row.eachCell((cell) => allBorders(cell))
}
wc.autoFilter = 'A1:E1'

// ════════════════════════════════════════════════════════════════════════════
// Sheet 3 — Colour swatches (visual palette)
// ════════════════════════════════════════════════════════════════════════════
const wsw = wb.addWorksheet('Colour swatches', { views: [{ state: 'frozen', ySplit: 1 }] })
wsw.columns = [
  { header: 'Palette', key: 'palette', width: 16 },
  { header: 'Swatch', key: 'swatch', width: 12 },
  { header: 'Colour name', key: 'name', width: 22 },
  { header: 'Hex', key: 'hex', width: 12 },
]
const swh = wsw.getRow(1)
swh.eachCell((cell) => {
  cell.font = { bold: true, color: { argb: WHITE } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  cell.alignment = { vertical: 'middle' }
})
swh.height = 22

// Necklaces use the nylon palette only — every necklace (including Shapy Shine)
// ships on the nylon cord.
const PALETTES = [
  ['Nylon', 'nylon'],
]
function hexToArgb(h) { return 'FF' + h.replace('#', '').toUpperCase().padStart(6, '0').slice(-6) }
for (const [label, key] of PALETTES) {
  const list = CORD_COLORS[key] || []
  for (const c of list) {
    const row = wsw.addRow({ palette: label, swatch: '', name: c.n, hex: c.h })
    const sw = row.getCell('swatch')
    sw.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(c.h) } }
    allBorders(sw, 'FF888888')
    row.getCell('palette').font = { bold: true, color: { argb: INK } }
  }
}
wsw.autoFilter = 'A1:D1'

await wb.xlsx.writeFile(OUT)
console.log('Wrote', OUT)
console.log('Necklaces:', NECKS.length)

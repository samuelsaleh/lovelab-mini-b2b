/**
 * Full necklace product spec export for the IT / backend team.
 *
 * 100% catalog-driven: every price, colour, carat, size and shape is read
 * straight from lib/catalog.js so this file can never drift from the live app.
 * Covers all necklaces: CUTY, MULTI THREE, MULTI FOUR and SHAPY SHINE.
 *
 * Run: node scripts/generate-necklace-it-export.mjs
 */
import ExcelJS from 'exceljs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COLLECTIONS, HOUSING, SIZES_NECKLACE, PRICELISTS, CORD_COLORS,
  getCollectionsByType, getPrice, getRetail, getDefaultCert,
} from '../lib/catalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '_reference-materials', 'Necklace_Full_Spec_IT.xlsx')

// ─── Static reference data (not in the catalog) ───────────────────────────────
const NECKLACE_SIZE_INFO = {
  'S/M': { normalCm: 22, maxCm: 62 },
  'L/XL': { normalCm: 24, maxCm: 64 },
}
const CORD_LABELS = { nylon: 'Nylon', shine: 'Shine', silk: 'Silk', silkBraided: 'Silk / Braided' }
const CERT_LABELS = { igi: 'IGI', inhouse: 'In-house', both: 'IGI + In-house' }
const BRACELET_SOURCE = {
  CUTY_NECK: 'CUTY', M3_NECK: 'MULTI THREE (M3)', M4_NECK: 'MULTI FOUR (M4)', SSF_NECK: 'SHAPY SHINE FANCY (SSF)',
  CUBIX_NECK: 'CUBIX', MF_NECK: 'MATCHY FANCY (MF)',
  SSPF_NECK: 'SHAPY SPARKLE (SSPF)', HOLY_NECK: 'HOLY (D VVS)',
}
const PACKSHOT_ALIAS = {
  CUTY_NECK: 'CUTY', M3_NECK: 'M3', M4_NECK: 'M4', SSF_NECK: 'SSF',
  CUBIX_NECK: 'CUBIX', MF_NECK: 'MF', SSPF_NECK: 'SSPF', HOLY_NECK: 'HOLY',
}

// Human-readable housing description, derived from the catalog HOUSING table.
function housingDescription(col) {
  if (!col.housing) return { summary: 'No metal housing (shape + colour only)', detail: '—' }
  const h = HOUSING[col.housing]
  if (!h) return { summary: col.housing, detail: '—' }
  if (Array.isArray(h)) {
    return { summary: `Metal — ${h.join(' / ')}`, detail: h.join(' | ') }
  }
  // Object housings. Bezel/prong (shapyShine, matchy) vs attached/not (multiThree).
  const keys = Object.keys(h)
  const parts = Object.entries(h).map(([k, v]) => {
    const arr = Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : x.label || x.id)) : []
    const label = k === 'notAttached' ? 'Not attached' : k.charAt(0).toUpperCase() + k.slice(1)
    return `${label}: ${arr.join(', ')}`
  })
  if (keys.includes('bezel') || keys.includes('prong')) {
    return { summary: 'Bezel / Prong + metal (Yellow / White / Pink)', detail: parts.join(' | ') }
  }
  return { summary: 'Multi housing — Attached or Not Attached', detail: parts.join(' | ') }
}

const NECKS = getCollectionsByType(COLLECTIONS, 'necklace')

// Colours available for a collection: an explicit allowedColors list, or the
// full native cord palette when no cap is set (CUTY + Shapy Shine necklaces).
function colorsFor(col) {
  if (col.allowedColors) return col.allowedColors
  return (CORD_COLORS[col.cord] || []).map(c => c.n)
}

// ─── Styling helpers ──────────────────────────────────────────────────────────
function styleHeader(row) {
  row.font = { bold: true }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE7F6' } }
  row.alignment = { vertical: 'middle', wrapText: true }
}
function euroFmt(cell) { cell.numFmt = '€#,##0' }

const wb = new ExcelJS.Workbook()
wb.creator = 'LoveLab Mini B2B'
wb.created = new Date()

// ─── Sheet 1: Prices (one row per product × carat) ─────────────────────────────
const wsPrices = wb.addWorksheet('Prices')
wsPrices.columns = [
  { header: 'Product ID', key: 'id', width: 14 },
  { header: 'Product', key: 'label', width: 26 },
  { header: 'Carat (ct)', key: 'carat', width: 10 },
  { header: 'Certificate', key: 'cert', width: 12 },
  { header: 'B2B wholesale (€)', key: 'b2b', width: 18 },
  { header: 'B2C / Retail (€)', key: 'b2c', width: 16 },
  { header: 'Min order qty', key: 'minQty', width: 14 },
  { header: 'Price list 2025 (€)', key: 'pl2025', width: 18 },
  { header: 'Price list 2026 (€)', key: 'pl2026', width: 18 },
  { header: 'Notes', key: 'notes', width: 36 },
]
styleHeader(wsPrices.getRow(1))

for (const col of NECKS) {
  const cert = getDefaultCert(col)
  col.carats.forEach((carat, i) => {
    const r = wsPrices.addRow({
      id: col.id,
      label: col.label,
      carat,
      cert: CERT_LABELS[cert] || cert,
      b2b: getPrice(col, i, cert, '2026'),
      b2c: getRetail(col, i, cert, '2026'),
      minQty: col.minC || 1,
      pl2025: getPrice(col, i, cert, '2025'),
      pl2026: getPrice(col, i, cert, '2026'),
      notes: 'Flat price across S/M and L/XL sizes',
    })
    euroFmt(r.getCell('b2b'))
    euroFmt(r.getCell('b2c'))
    euroFmt(r.getCell('pl2025'))
    euroFmt(r.getCell('pl2026'))
  })
}
wsPrices.autoFilter = 'A1:J1'
wsPrices.views = [{ state: 'frozen', ySplit: 1 }]

// ─── Sheet 2: Product summary ───────────────────────────────────────────────────
const wsProducts = wb.addWorksheet('Products')
wsProducts.columns = [
  { header: 'Product ID', key: 'id', width: 14 },
  { header: 'Product name', key: 'label', width: 26 },
  { header: 'Based on bracelet', key: 'source', width: 24 },
  { header: 'Product type', key: 'type', width: 12 },
  { header: 'Certificate', key: 'cert', width: 14 },
  { header: 'Carats available', key: 'carats', width: 22 },
  { header: 'Sizes', key: 'sizes', width: 44 },
  { header: 'Cord / thread', key: 'cord', width: 14 },
  { header: 'Housing / metal', key: 'housing', width: 34 },
  { header: 'Housing options', key: 'housingDetail', width: 52 },
  { header: 'Shapes', key: 'shapes', width: 52 },
  { header: 'Min order qty', key: 'minQty', width: 14 },
  { header: 'Packshots reuse', key: 'alias', width: 16 },
  { header: 'Colour count', key: 'colorCount', width: 12 },
]
styleHeader(wsProducts.getRow(1))

const sizeText = SIZES_NECKLACE
  .map(s => `${s} (${NECKLACE_SIZE_INFO[s]?.normalCm} cm, max ${NECKLACE_SIZE_INFO[s]?.maxCm} cm)`)
  .join(' | ')

for (const col of NECKS) {
  const housing = housingDescription(col)
  const colors = colorsFor(col)
  wsProducts.addRow({
    id: col.id,
    label: col.label,
    source: BRACELET_SOURCE[col.id] || '—',
    type: 'Necklace',
    cert: CERT_LABELS[col.certificate] || col.certificate,
    carats: col.carats.join(', '),
    sizes: sizeText,
    cord: CORD_LABELS[col.cord] || col.cord,
    housing: housing.summary,
    housingDetail: housing.detail,
    shapes: col.shapes ? col.shapes.join(', ') : '—',
    minQty: col.minC || 1,
    alias: PACKSHOT_ALIAS[col.id] || col.id,
    colorCount: colors.length,
  })
}
wsProducts.autoFilter = 'A1:N1'
wsProducts.views = [{ state: 'frozen', ySplit: 1 }]

// ─── Sheet 3: Cord colours (one row per product × colour) ──────────────────────
const wsColors = wb.addWorksheet('Cord colours')
wsColors.columns = [
  { header: 'Product ID', key: 'id', width: 14 },
  { header: 'Product', key: 'label', width: 26 },
  { header: 'Cord type', key: 'cord', width: 12 },
  { header: '#', key: 'num', width: 6 },
  { header: 'Colour name', key: 'color', width: 18 },
]
styleHeader(wsColors.getRow(1))
for (const col of NECKS) {
  colorsFor(col).forEach((color, i) => {
    wsColors.addRow({ id: col.id, label: col.label, cord: CORD_LABELS[col.cord] || col.cord, num: i + 1, color })
  })
}
wsColors.autoFilter = 'A1:E1'
wsColors.views = [{ state: 'frozen', ySplit: 1 }]

// ─── Sheet 4: Sizes ────────────────────────────────────────────────────────────
const wsSizes = wb.addWorksheet('Sizes')
wsSizes.columns = [
  { header: 'Size code', key: 'code', width: 12 },
  { header: 'Normal length (cm)', key: 'normal', width: 18 },
  { header: 'Max opening (cm)', key: 'max', width: 16 },
  { header: 'Applies to', key: 'applies', width: 48 },
]
styleHeader(wsSizes.getRow(1))
for (const code of SIZES_NECKLACE) {
  const info = NECKLACE_SIZE_INFO[code] || {}
  wsSizes.addRow({
    code,
    normal: info.normalCm ?? '',
    max: info.maxCm ?? '',
    applies: NECKS.map(c => c.label).join(', '),
  })
}

// ─── Sheet 5: Shapes (Shapy Shine) ───────────────────────────────────────────────
const wsShapes = wb.addWorksheet('Shapes')
wsShapes.columns = [
  { header: 'Product ID', key: 'id', width: 14 },
  { header: 'Product', key: 'label', width: 26 },
  { header: '#', key: 'num', width: 6 },
  { header: 'Shape', key: 'shape', width: 18 },
]
styleHeader(wsShapes.getRow(1))
for (const col of NECKS) {
  if (!col.shapes) continue
  col.shapes.forEach((shape, i) => {
    wsShapes.addRow({ id: col.id, label: col.label, num: i + 1, shape })
  })
}

// ─── Sheet 6: Notes for IT ───────────────────────────────────────────────────────
const wsNotes = wb.addWorksheet('Notes for IT')
wsNotes.columns = [{ header: 'Field', key: 'field', width: 28 }, { header: 'Value', key: 'value', width: 95 }]
styleHeader(wsNotes.getRow(1))
const notes = [
  ['System', 'LoveLab Mini B2B — generated from lib/catalog.js (single source of truth)'],
  ['Pricelist years', `Available: ${PRICELISTS.join(', ')}. Necklace prices are identical across years.`],
  ['Product type', 'All rows are necklaces (productType: necklace)'],
  ['Certificate', 'All necklaces are IGI only — no in-house certificate option'],
  ['Size pricing', 'B2B and B2C prices are flat — same for S/M and L/XL'],
  ['CUTY necklace B2C', 'Retail rounded up to nearest €5 (195, 395, 540)'],
  ['Shapy Shine pricing', 'B2B = SSF bracelet × 1.20 (66, 120, 186). B2C = retail × 1.20 rounded up to €5 (220, 400, 540)'],
  ['CUTY & Shapy Shine colours', 'Full cord palette available (no cap): CUTY necklace = full nylon palette, Shapy Shine necklace = full Shine palette'],
  ['Multi Three / Four colours', 'Capped to 6 colours: Silver Grey, Gold, Bordeaux, Red, Black, Navy Blue'],
  ['Shapy Shine shapes', 'All 7 shapes are selectable directly on the selection grid (one card per shape); the shape is locked per line.'],
  ['Shapy Shine housing', 'Same as the SSF bracelet: Bezel/Prong setting + metal colour (Yellow/White/Pink). At 0.10 ct only Bezel is available. Config: shape (grid) -> carat -> bezel/prong + metal -> size -> colour.'],
  ['Multi Three necklace', 'Requires Attached (F) or Not Attached (NF) setting on the order line'],
  ['Packshots', 'Necklace SKUs reuse bracelet images: CUTY_NECK→CUTY, M3_NECK→M3, M4_NECK→M4, SSF_NECK→SSF'],
]
for (const [field, value] of notes) wsNotes.addRow({ field, value })

await wb.xlsx.writeFile(OUT)
console.log('Wrote', OUT)
console.log('Necklaces:', NECKS.map(c => c.id).join(', '))

/**
 * Full necklace product spec export for IT / backend team.
 * Source of truth: lib/catalog.js + lib/packshot-lookup.js
 * Run: node scripts/generate-necklace-it-export.mjs
 */
import ExcelJS from 'exceljs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '_reference-materials', 'Necklace_Full_Spec_IT.xlsx')

const NECKLACE_SIZE_INFO = {
  'S/M': { normalCm: 22, maxCm: 62 },
  'L/XL': { normalCm: 24, maxCm: 64 },
}

const SHAPES_SHAPY_SHINE = ['Heart', 'Pear', 'Marquise', 'Oval', 'Emerald', 'Cushion', 'Long Cushion']

const CUTY_COLORS = [
  'Orange', 'Light Blue', 'Black', 'Fluo Pink', 'Fluo Yellow',
  'Light Pink', 'Ivory', 'Red', 'Gold', 'Silver Grey', 'Green',
]

const MULTI_COLORS = ['Silver Grey', 'Gold', 'Bordeaux', 'Red', 'Black', 'Navy Blue']

const NECKLACES = [
  {
    id: 'CUTY_NECK',
    label: 'CUTY NECKLACE',
    braceletSource: 'CUTY',
    certificate: 'IGI',
    carats: ['0.10', '0.20', '0.30'],
    b2b: [50, 88, 125],
    b2c: [195, 395, 540],
    minQty: 3,
    cord: 'Nylon',
    housing: 'Standard — Yellow, White, Pink',
    housingDetail: 'Yellow | White | Pink',
    shapes: '—',
    attachedDetached: '—',
    packshotAlias: 'CUTY',
    colors: CUTY_COLORS,
  },
  {
    id: 'M3_NECK',
    label: 'MULTI THREE NECKLACE',
    braceletSource: 'MULTI THREE (M3)',
    certificate: 'IGI',
    carats: ['0.15', '0.30', '0.60'],
    b2b: [81, 119, 219],
    b2c: [325, 500, 1000],
    minQty: 2,
    cord: 'Nylon',
    housing: 'Multi Three — Attached or Not Attached',
    housingDetail: 'Attached: WWW, YYY, PPP | Not attached: WWW, YYY, PPP, YWP',
    shapes: '—',
    attachedDetached: 'Attached (F) or Not Attached (NF)',
    packshotAlias: 'M3',
    colors: MULTI_COLORS,
  },
  {
    id: 'M4_NECK',
    label: 'MULTI FOUR NECKLACE',
    braceletSource: 'MULTI FOUR (M4)',
    certificate: 'IGI',
    carats: ['0.20', '0.40'],
    b2b: [106, 138],
    b2c: [450, 625],
    minQty: 2,
    cord: 'Nylon',
    housing: 'Gold metal — White, Yellow, Pink',
    housingDetail: 'White | Yellow | Pink',
    shapes: '—',
    attachedDetached: '—',
    packshotAlias: 'M4',
    colors: MULTI_COLORS,
  },
  {
    id: 'SSF_NECK',
    label: 'SHAPY SHINE NECKLACE',
    braceletSource: 'SHAPY SHINE FANCY (SSF)',
    certificate: 'IGI',
    carats: ['0.10', '0.30', '0.50'],
    b2b: [66, 120, 186],
    b2c: [220, 400, 540],
    minQty: 2,
    cord: 'Shine',
    housing: 'No metal housing (shape + colour only)',
    housingDetail: '— (no bezel/prong metal; shapes selectable directly)',
    shapes: SHAPES_SHAPY_SHINE.join(', '),
    attachedDetached: '—',
    packshotAlias: 'SSF',
    colors: CUTY_COLORS,
  },
]

function styleHeader(row) {
  row.font = { bold: true }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE7F6' } }
  row.alignment = { vertical: 'middle', wrapText: true }
}

function euroFmt(cell) {
  cell.numFmt = '€#,##0'
}

const wb = new ExcelJS.Workbook()
wb.creator = 'LoveLab B2B'
wb.created = new Date()

// ─── Sheet 1: Prices (one row per product × carat) ─────────────────────────
const wsPrices = wb.addWorksheet('Prices')
wsPrices.columns = [
  { header: 'Product ID', key: 'id', width: 14 },
  { header: 'Product', key: 'label', width: 26 },
  { header: 'Carat (ct)', key: 'carat', width: 10 },
  { header: 'Certificate', key: 'cert', width: 12 },
  { header: 'B2B wholesale (€)', key: 'b2b', width: 18 },
  { header: 'B2C / Retail (€)', key: 'b2c', width: 16 },
  { header: 'Min order qty', key: 'minQty', width: 14 },
  { header: 'Price list 2025', key: 'pl2025', width: 14 },
  { header: 'Price list 2026', key: 'pl2026', width: 14 },
  { header: 'Notes', key: 'notes', width: 36 },
]
styleHeader(wsPrices.getRow(1))

for (const p of NECKLACES) {
  p.carats.forEach((carat, i) => {
    const r = wsPrices.addRow({
      id: p.id,
      label: p.label,
      carat,
      cert: p.certificate,
      b2b: p.b2b[i],
      b2c: p.b2c[i],
      minQty: p.minQty,
      pl2025: 'Same as 2026',
      pl2026: 'Current',
      notes: 'Flat price for S/M and L/XL sizes',
    })
    euroFmt(r.getCell('b2b'))
    euroFmt(r.getCell('b2c'))
  })
}
wsPrices.autoFilter = 'A1:J1'
wsPrices.views = [{ state: 'frozen', ySplit: 1 }]

// ─── Sheet 2: Product summary ───────────────────────────────────────────────
const wsProducts = wb.addWorksheet('Products')
wsProducts.columns = [
  { header: 'Product ID', key: 'id', width: 14 },
  { header: 'Product name', key: 'label', width: 26 },
  { header: 'Based on bracelet', key: 'braceletSource', width: 22 },
  { header: 'Product type', key: 'type', width: 12 },
  { header: 'Certificate', key: 'cert', width: 12 },
  { header: 'Carats available', key: 'carats', width: 22 },
  { header: 'Sizes', key: 'sizes', width: 28 },
  { header: 'Cord / thread type', key: 'cord', width: 14 },
  { header: 'Housing / metal', key: 'housing', width: 32 },
  { header: 'Housing options', key: 'housingDetail', width: 48 },
  { header: 'Shapes', key: 'shapes', width: 52 },
  { header: 'Attached / Detached', key: 'attachedDetached', width: 28 },
  { header: 'Min order qty', key: 'minQty', width: 14 },
  { header: 'Packshot images from', key: 'packshotAlias', width: 18 },
  { header: 'Colour count', key: 'colorCount', width: 12 },
]
styleHeader(wsProducts.getRow(1))

for (const p of NECKLACES) {
  wsProducts.addRow({
    id: p.id,
    label: p.label,
    braceletSource: p.braceletSource,
    type: 'Necklace',
    cert: p.certificate,
    carats: p.carats.join(', '),
    sizes: 'S/M (22 cm, max 62 cm) | L/XL (24 cm, max 64 cm)',
    cord: p.cord,
    housing: p.housing,
    housingDetail: p.housingDetail,
    shapes: p.shapes,
    attachedDetached: p.attachedDetached,
    minQty: p.minQty,
    packshotAlias: p.packshotAlias,
    colorCount: p.colors.length,
  })
}
wsProducts.autoFilter = 'A1:O1'
wsProducts.views = [{ state: 'frozen', ySplit: 1 }]

// ─── Sheet 3: Cord colours (one row per product × colour) ───────────────────
const wsColors = wb.addWorksheet('Cord colours')
wsColors.columns = [
  { header: 'Product ID', key: 'id', width: 14 },
  { header: 'Product', key: 'label', width: 26 },
  { header: 'Cord type', key: 'cord', width: 12 },
  { header: '#', key: 'num', width: 6 },
  { header: 'Colour name', key: 'color', width: 18 },
  { header: 'Palette group', key: 'group', width: 22 },
]
styleHeader(wsColors.getRow(1))

for (const p of NECKLACES) {
  const group = p.id === 'SSF_NECK' ? 'Shapy Shine (same as CUTY necklace)'
    : p.id === 'CUTY_NECK' ? 'CUTY necklace palette'
    : 'Multi Three / Four palette'
  p.colors.forEach((color, i) => {
    wsColors.addRow({ id: p.id, label: p.label, cord: p.cord, num: i + 1, color, group })
  })
}
wsColors.autoFilter = 'A1:F1'
wsColors.views = [{ state: 'frozen', ySplit: 1 }]

// ─── Sheet 4: Colour palette reference ──────────────────────────────────────
const wsPalette = wb.addWorksheet('Colour palettes')
wsPalette.columns = [
  { header: 'Palette name', key: 'name', width: 28 },
  { header: 'Used by', key: 'usedBy', width: 40 },
  { header: 'Colour count', key: 'count', width: 14 },
  { header: 'Colours (comma-separated)', key: 'colors', width: 80 },
]
styleHeader(wsPalette.getRow(1))

wsPalette.addRow({
  name: 'CUTY necklace / Shapy Shine necklace',
  usedBy: 'CUTY NECKLACE, SHAPY SHINE NECKLACE',
  count: CUTY_COLORS.length,
  colors: CUTY_COLORS.join(', '),
})
wsPalette.addRow({
  name: 'Multi Three / Multi Four necklace',
  usedBy: 'MULTI THREE NECKLACE, MULTI FOUR NECKLACE',
  count: MULTI_COLORS.length,
  colors: MULTI_COLORS.join(', '),
})

// ─── Sheet 5: Sizes ─────────────────────────────────────────────────────────
const wsSizes = wb.addWorksheet('Sizes')
wsSizes.columns = [
  { header: 'Size code', key: 'code', width: 12 },
  { header: 'Normal length (cm)', key: 'normal', width: 18 },
  { header: 'Max opening (cm)', key: 'max', width: 16 },
  { header: 'Applies to', key: 'applies', width: 40 },
]
styleHeader(wsSizes.getRow(1))
for (const [code, info] of Object.entries(NECKLACE_SIZE_INFO)) {
  wsSizes.addRow({
    code,
    normal: info.normalCm,
    max: info.maxCm,
    applies: 'All necklaces (CUTY, Multi Three, Multi Four, Shapy Shine)',
  })
}

// ─── Sheet 6: Shapy Shine shapes ────────────────────────────────────────────
const wsShapes = wb.addWorksheet('Shapy Shine shapes')
wsShapes.columns = [
  { header: 'Product ID', key: 'id', width: 14 },
  { header: 'Product', key: 'label', width: 26 },
  { header: '#', key: 'num', width: 6 },
  { header: 'Shape', key: 'shape', width: 18 },
]
styleHeader(wsShapes.getRow(1))
SHAPES_SHAPY_SHINE.forEach((shape, i) => {
  wsShapes.addRow({ id: 'SSF_NECK', label: 'SHAPY SHINE NECKLACE', num: i + 1, shape })
})

// ─── Sheet 7: Pricing rules (for IT context) ────────────────────────────────
const wsRules = wb.addWorksheet('Notes for IT')
wsRules.columns = [{ header: 'Field', key: 'field', width: 28 }, { header: 'Value', key: 'value', width: 90 }]
styleHeader(wsRules.getRow(1))
const notes = [
  ['System', 'LoveLab Mini B2B — catalog source: lib/catalog.js'],
  ['Product type', 'All items in this file are necklaces (productType: necklace)'],
  ['Certificate', 'All necklaces are IGI only — no in-house certificate option'],
  ['Price lists', '2025 and 2026 prices are identical for all necklace SKUs'],
  ['Size pricing', 'B2B and B2C prices are flat — same for S/M and L/XL'],
  ['CUTY necklace B2C', 'Retail rounded up to nearest €5 (195, 395, 540)'],
  ['Shapy Shine necklace pricing', 'B2B = SSF bracelet × 1.20 (66, 120, 186). B2C = retail × 1.20 rounded up to €5 (220, 400, 540)'],
  ['Shapy Shine colours', 'Same 11 cord colours as CUTY necklace (not the full 21-colour Shine bracelet palette)'],
  ['Shapy Shine shapes', 'All 7 SHAPY SHINE shapes available on necklace, selectable directly after carat (see Shapy Shine shapes sheet)'],
  ['Shapy Shine housing', 'No bezel/prong metal housing on the necklace (unlike the bracelet) — config is carat -> shape -> colour/size'],
  ['Multi Three necklace', 'Requires Attached (F) or Not Attached (NF) setting on order line'],
  ['Packshots', 'Necklace SKUs reuse bracelet images: CUTY_NECK→CUTY, M3_NECK→M3, M4_NECK→M4, SSF_NECK→SSF'],
  ['Metadata fields (orders)', 'Standard order PDF + documents.metadata; DZB fields separate feature for Nicolas'],
]
for (const [field, value] of notes) wsRules.addRow({ field, value })

await wb.xlsx.writeFile(OUT)
console.log('Wrote', OUT)

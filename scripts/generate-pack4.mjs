import ExcelJS from 'exceljs'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../public/LoveLab Excel Packs/LoveLab_Order_Template_Pack4.xlsx')

// ── Brand colours (match ReportsDashboard + existing packs) ─────────────────
const PLUM      = 'FF5D3A5E'
const PLUM_DARK = 'FF4A2545'
const WHITE     = 'FFFFFFFF'
const LIGHT_ROW = 'FFFFF9FF'
const ALT_ROW   = 'FFF5EFF5'
const TEXT_GRAY = 'FF4F4F4F'

// ── Pack 4 rows (from BuilderPage PACK4_ROWS) ────────────────────────────────
const PACK4_ROWS = [
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Heart',    bpColor: 'Yellow', setting: 'Bezel', size: 'M',   colorCord: 'Grey',       quantity: '1', unitPrice: '55',  cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Pear',     bpColor: 'Yellow', setting: 'Bezel', size: 'M',   colorCord: 'Red',        quantity: '1', unitPrice: '55',  cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Marquise', bpColor: 'White',  setting: 'Bezel', size: 'M',   colorCord: 'Navy Blue',  quantity: '1', unitPrice: '55',  cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Emerald',  bpColor: 'Yellow', setting: 'Bezel', size: 'M',   colorCord: 'Black',      quantity: '1', unitPrice: '55',  cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Oval',     bpColor: 'White',  setting: 'Bezel', size: 'M',   colorCord: 'Bordeaux',   quantity: '1', unitPrice: '55',  cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Oval',     bpColor: 'White',  setting: 'Prong', size: 'M',   colorCord: 'Gold',       quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Emerald',  bpColor: 'Yellow', setting: 'Prong', size: 'M',   colorCord: 'Lilac',      quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Pear',     bpColor: 'White',  setting: 'Prong', size: 'M',   colorCord: 'Light Pink', quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'MULTI FOUR',        carat: '0.20', shape: '',         bpColor: 'White',  setting: '',      size: 'M',   colorCord: 'Gold',       quantity: '1', unitPrice: '85',  cert: 'IGI' },
  { collection: 'MULTI FOUR',        carat: '0.20', shape: '',         bpColor: 'Yellow', setting: '',      size: 'M',   colorCord: 'Black',      quantity: '1', unitPrice: '85',  cert: 'IGI' },
  { collection: 'MULTI FOUR',        carat: '0.20', shape: '',         bpColor: 'Yellow', setting: '',      size: 'M',   colorCord: 'Bordeaux',   quantity: '1', unitPrice: '85',  cert: 'IGI' },
  { collection: 'MULTI THREE',       carat: '0.15', shape: '',         bpColor: '',       setting: 'LO',    size: '',    colorCord: 'Gold',       quantity: '1', unitPrice: '65',  cert: 'IGI' },
  { collection: 'MULTI THREE',       carat: '0.15', shape: '',         bpColor: 'WWW',    setting: 'F',     size: '',    colorCord: 'Black',      quantity: '1', unitPrice: '65',  cert: 'IGI' },
  { collection: 'MULTI THREE',       carat: '0.15', shape: '',         bpColor: 'YYY',    setting: 'F',     size: '',    colorCord: 'Bordeaux',   quantity: '1', unitPrice: '65',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.05', shape: '',         bpColor: 'Yellow', setting: '',      size: 'S/M', colorCord: 'Red',        quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.05', shape: '',         bpColor: 'Yellow', setting: '',      size: 'S/M', colorCord: 'Bordeaux',   quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.05', shape: '',         bpColor: 'White',  setting: '',      size: 'S/M', colorCord: 'Gold',       quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.05', shape: '',         bpColor: 'White',  setting: '',      size: 'S/M', colorCord: 'Black',      quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.05', shape: '',         bpColor: 'Yellow', setting: '',      size: 'S/M', colorCord: 'Silver Grey', quantity: '1', unitPrice: '30', cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.05', shape: '',         bpColor: 'White',  setting: '',      size: 'S/M', colorCord: 'Navy Blue',  quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.10', shape: '',         bpColor: 'Yellow', setting: '',      size: 'S/M', colorCord: 'Red',        quantity: '1', unitPrice: '40',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.10', shape: '',         bpColor: 'Yellow', setting: '',      size: 'S/M', colorCord: 'Bordeaux',   quantity: '1', unitPrice: '40',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.10', shape: '',         bpColor: 'White',  setting: '',      size: 'S/M', colorCord: 'Gold',       quantity: '1', unitPrice: '40',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.10', shape: '',         bpColor: 'White',  setting: '',      size: 'S/M', colorCord: 'Black',      quantity: '1', unitPrice: '40',  cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.10', shape: '',         bpColor: 'Yellow', setting: '',      size: 'S/M', colorCord: 'Silver Grey', quantity: '1', unitPrice: '40', cert: 'IGI' },
  { collection: 'CUBIX',             carat: '0.10', shape: '',         bpColor: 'White',  setting: '',      size: 'S/M', colorCord: 'Navy Blue',  quantity: '1', unitPrice: '40',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.05', shape: '',         bpColor: 'White',  setting: '',      size: 'M',   colorCord: 'Gold',       quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.05', shape: '',         bpColor: 'Yellow', setting: '',      size: 'M',   colorCord: 'Silver Grey', quantity: '1', unitPrice: '30', cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.05', shape: '',         bpColor: 'White',  setting: '',      size: 'M',   colorCord: 'Black',      quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.05', shape: '',         bpColor: 'White',  setting: '',      size: 'M',   colorCord: 'Navy Blue',  quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.05', shape: '',         bpColor: 'Yellow', setting: '',      size: 'M',   colorCord: 'Red',        quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.05', shape: '',         bpColor: 'Yellow', setting: '',      size: 'M',   colorCord: 'Bordeaux',   quantity: '1', unitPrice: '30',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.10', shape: '',         bpColor: 'White',  setting: '',      size: 'M',   colorCord: 'Gold',       quantity: '1', unitPrice: '40',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.10', shape: '',         bpColor: 'Yellow', setting: '',      size: 'M',   colorCord: 'Silver Grey', quantity: '1', unitPrice: '40', cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.10', shape: '',         bpColor: 'White',  setting: '',      size: 'M',   colorCord: 'Black',      quantity: '1', unitPrice: '40',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.10', shape: '',         bpColor: 'White',  setting: '',      size: 'M',   colorCord: 'Navy Blue',  quantity: '1', unitPrice: '40',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.10', shape: '',         bpColor: 'Yellow', setting: '',      size: 'M',   colorCord: 'Red',        quantity: '1', unitPrice: '40',  cert: 'IGI' },
  { collection: 'CUTY',              carat: '0.10', shape: '',         bpColor: 'Yellow', setting: '',      size: 'M',   colorCord: 'Bordeaux',   quantity: '1', unitPrice: '40',  cert: 'IGI' },
]

const COLUMNS = [
  { header: 'Collection',   key: 'collection', width: 22 },
  { header: 'Carat',        key: 'carat',      width: 10 },
  { header: 'Shape',        key: 'shape',      width: 14 },
  { header: 'Housing',      key: 'bpColor',    width: 12 },
  { header: 'Setting',      key: 'setting',    width: 12 },
  { header: 'Size',         key: 'size',       width: 8  },
  { header: 'Cord Color',   key: 'colorCord',  width: 16 },
  { header: 'Qty',          key: 'quantity',   width: 8  },
  { header: 'Unit Price €', key: 'unitPrice',  width: 14 },
  { header: 'Total €',      key: 'total',      width: 12 },
  { header: 'Cert',         key: 'cert',       width: 10 },
  { header: 'Reference',    key: 'reference',  width: 20 },
  { header: 'Notes',        key: 'notes',      width: 24 },
]

const NUM_COLS = COLUMNS.length
const LAST_COL_LETTER = String.fromCharCode(64 + NUM_COLS)

function border(color = PLUM) {
  const s = { style: 'thin', color: { argb: color } }
  return { top: s, left: s, bottom: s, right: s }
}

async function generate() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'LoveLab'
  wb.created = new Date()

  const ws = wb.addWorksheet('Pack 4 Order', {
    views: [{ state: 'frozen', ySplit: 8 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })

  ws.columns = COLUMNS.map(c => ({ width: c.width }))

  // ── Row 1: Brand title bar ───────────────────────────────────────────────
  ws.getRow(1).height = 42
  ws.mergeCells(`A1:${LAST_COL_LETTER}1`)
  const titleCell = ws.getCell('A1')
  titleCell.value = '✦  LoveLab'
  titleCell.font  = { bold: true, size: 20, color: { argb: WHITE }, name: 'Calibri' }
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } }
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 }

  // ── Row 2: Pack subtitle ─────────────────────────────────────────────────
  ws.getRow(2).height = 20
  ws.mergeCells(`A2:${LAST_COL_LETTER}2`)
  const subCell = ws.getCell('A2')
  subCell.value = 'Order Template — Pack 4   ·   SHAPY SHINE FANCY · MULTI FOUR · MULTI THREE · CUBIX · CUTY'
  subCell.font  = { size: 10, color: { argb: 'FFCFAECF' }, italic: true, name: 'Calibri' }
  subCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } }
  subCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 }

  // ── Row 3: Plum spacer ───────────────────────────────────────────────────
  ws.getRow(3).height = 6
  ws.mergeCells(`A3:${LAST_COL_LETTER}3`)
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } }

  // ── Row 4: Client info labels ────────────────────────────────────────────
  ws.getRow(4).height = 16
  const infoLabels = ['Client / Company', 'Contact Name', 'Date', 'PO / Ref']
  infoLabels.forEach((label, i) => {
    const cell = ws.getCell(4, i * 3 + 1)
    cell.value = label.toUpperCase()
    cell.font  = { size: 8, color: { argb: '8A6A7D' }, name: 'Calibri', bold: true }
    cell.alignment = { horizontal: 'left', vertical: 'middle' }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7FF' } }
    if (i < infoLabels.length - 1 && i * 3 + 3 <= NUM_COLS) {
      ws.mergeCells(4, i * 3 + 1, 4, Math.min(i * 3 + 3, NUM_COLS))
    }
  })

  // ── Row 5: Client info input cells ──────────────────────────────────────
  ws.getRow(5).height = 22
  const infoMerges = [[1,3],[4,6],[7,9],[10,12]]
  infoMerges.forEach(([s, e]) => {
    if (e <= NUM_COLS) ws.mergeCells(5, s, 5, Math.min(e, NUM_COLS))
    const cell = ws.getCell(5, s)
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBF8FF' } }
    cell.border = border('FFD8C8D8')
    cell.font   = { size: 10, name: 'Calibri', color: { argb: TEXT_GRAY } }
    cell.alignment = { vertical: 'middle', indent: 1 }
  })

  // ── Row 6: Spacer ────────────────────────────────────────────────────────
  ws.getRow(6).height = 8
  ws.mergeCells(`A6:${LAST_COL_LETTER}6`)
  ws.getCell('A6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0E8F0' } }

  // ── Row 7: Instructions ──────────────────────────────────────────────────
  ws.getRow(7).height = 16
  ws.mergeCells(`A7:${LAST_COL_LETTER}7`)
  const instrCell = ws.getCell('A7')
  instrCell.value = 'Fill in Qty and Reference columns. All other fields are pre-filled for Pack 4. Send to your LoveLab representative.'
  instrCell.font  = { size: 9, color: { argb: '8A6A7D' }, italic: true, name: 'Calibri' }
  instrCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F0F7' } }
  instrCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 }

  // ── Row 8: Column headers ────────────────────────────────────────────────
  ws.getRow(8).height = 24
  COLUMNS.forEach((col, i) => {
    const cell = ws.getCell(8, i + 1)
    cell.value = col.header
    cell.font  = { bold: true, size: 10, color: { argb: WHITE }, name: 'Calibri' }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = border('FF7A4F7C')
  })

  // ── Data rows ────────────────────────────────────────────────────────────
  let prevCollection = null
  PACK4_ROWS.forEach((row, i) => {
    const excelRow = i + 9
    const isAlt = i % 2 === 1
    const bgColor = isAlt ? ALT_ROW : LIGHT_ROW
    const isNewSection = row.collection !== prevCollection
    prevCollection = row.collection

    // Section divider: slightly stronger top border on collection change
    const topBorderStyle = isNewSection
      ? { style: 'medium', color: { argb: PLUM } }
      : { style: 'thin', color: { argb: 'FFE0D0E0' } }

    const values = [
      row.collection,
      row.carat ? `${row.carat} ct` : '',
      row.shape,
      row.bpColor,
      row.setting,
      row.size,
      row.colorCord,
      Number(row.quantity) || 1,
      Number(row.unitPrice),
      { formula: `H${excelRow}*I${excelRow}` },
      row.cert,
      '',
      '',
    ]

    const wsRow = ws.getRow(excelRow)
    wsRow.height = 20
    values.forEach((val, ci) => {
      const cell = ws.getCell(excelRow, ci + 1)
      cell.value = val
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
      cell.font  = { size: 10, name: 'Calibri', color: { argb: TEXT_GRAY } }
      cell.border = {
        top:    topBorderStyle,
        left:   { style: 'thin', color: { argb: 'FFE0D0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0D0E0' } },
        right:  { style: 'thin', color: { argb: 'FFE0D0E0' } },
      }
      // Numeric alignment
      if (ci === 7 || ci === 8 || ci === 9) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        if (ci === 8 || ci === 9) cell.numFmt = '€#,##0.00'
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      }
    })
  })

  // ── Totals row ───────────────────────────────────────────────────────────
  const totalRow = 9 + PACK4_ROWS.length
  ws.getRow(totalRow).height = 26
  const totalLabel = ws.getCell(totalRow, 1)
  ws.mergeCells(totalRow, 1, totalRow, 7)
  totalLabel.value = 'TOTAL ORDER VALUE'
  totalLabel.font  = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' }
  totalLabel.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } }
  totalLabel.alignment = { horizontal: 'right', vertical: 'middle', indent: 2 }

  // Qty total
  const qtyTotalCell = ws.getCell(totalRow, 8)
  qtyTotalCell.value = { formula: `SUM(H9:H${totalRow - 1})` }
  qtyTotalCell.font  = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' }
  qtyTotalCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } }
  qtyTotalCell.alignment = { horizontal: 'center', vertical: 'middle' }

  // Unit price total (blank, just colored)
  const upCell = ws.getCell(totalRow, 9)
  upCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } }

  // Grand total
  const grandTotalCell = ws.getCell(totalRow, 10)
  grandTotalCell.value  = { formula: `SUM(J9:J${totalRow - 1})` }
  grandTotalCell.numFmt = '€#,##0.00'
  grandTotalCell.font   = { bold: true, size: 13, color: { argb: WHITE }, name: 'Calibri' }
  grandTotalCell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } }
  grandTotalCell.alignment = { horizontal: 'center', vertical: 'middle' }
  grandTotalCell.border = border(WHITE)

  // Remaining total row cells
  for (let c = 11; c <= NUM_COLS; c++) {
    const cell = ws.getCell(totalRow, c)
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PLUM_DARK } }
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerRow = totalRow + 2
  ws.mergeCells(`A${footerRow}:${LAST_COL_LETTER}${footerRow}`)
  const footer = ws.getCell(`A${footerRow}`)
  footer.value = 'LoveLab  ·  hello@love-lab.com  ·  Generated by LoveLab B2B Platform'
  footer.font  = { size: 8, color: { argb: 'FFCCAACC' }, italic: true, name: 'Calibri' }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }

  await wb.xlsx.writeFile(OUT)
  console.log('✅  Written:', OUT)
}

generate().catch(err => { console.error(err); process.exit(1) })

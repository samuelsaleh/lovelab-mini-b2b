/**
 * One-shot: export the necklace price list (B2B wholesale + B2C retail) to an
 * .xlsx for the backend team. Retail values are the rounded-up-to-5 figures
 * now stored in lib/catalog.js. Run: node scripts/generate-necklace-pricelist.mjs
 */
import ExcelJS from 'exceljs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', '_reference-materials', 'Necklace_Prices_B2B_B2C.xlsx')

// Source of truth mirrors lib/catalog.js (necklaces, IGI-only, flat across sizes).
const ROWS = [
  ['CUTY NECKLACE', '0.10', 50, 195],
  ['CUTY NECKLACE', '0.20', 88, 395],
  ['CUTY NECKLACE', '0.30', 125, 540],
  ['MULTI THREE NECKLACE', '0.15', 81, 325],
  ['MULTI THREE NECKLACE', '0.30', 119, 500],
  ['MULTI THREE NECKLACE', '0.60', 219, 1000],
  ['MULTI FOUR NECKLACE', '0.20', 106, 450],
  ['MULTI FOUR NECKLACE', '0.40', 138, 625],
]

const wb = new ExcelJS.Workbook()
wb.creator = 'LoveLab'
wb.created = new Date()

const ws = wb.addWorksheet('Necklaces')
ws.columns = [
  { header: 'Product', key: 'product', width: 26 },
  { header: 'Carat', key: 'carat', width: 10 },
  { header: 'B2B (€)', key: 'b2b', width: 12 },
  { header: 'B2C / Retail (€)', key: 'b2c', width: 16 },
]

ws.getRow(1).font = { bold: true }
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE7F6' } }

for (const [product, carat, b2b, b2c] of ROWS) {
  const r = ws.addRow({ product, carat, b2b, b2c })
  r.getCell('b2b').numFmt = '€#,##0'
  r.getCell('b2c').numFmt = '€#,##0'
}

ws.autoFilter = 'A1:D1'
ws.views = [{ state: 'frozen', ySplit: 1 }]

await wb.xlsx.writeFile(OUT)
console.log('Wrote', OUT)

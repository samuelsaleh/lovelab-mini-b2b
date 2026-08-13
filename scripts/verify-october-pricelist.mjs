/**
 * Read-only check: does the app quote exactly what Sam's October workbook says?
 *
 * Reads _reference-materials/PricelistMoonlight_2026_B2C_rounded.xlsx (the file
 * Sam edited — Moonlight, Sienna and Iconix Za-Ha) and compares every row
 * against getPrice / getRetail at pricelistYear='2026-10'. The workbook itself
 * is the assertion, so a future edit to the spreadsheet is caught here rather
 * than by re-reading numbers off a PDF by eye.
 *
 * Product names are matched to collection ids by the same words the workbook
 * uses; the carat column is normalised (it mixes "0.05 ct" with "0,70 ct").
 *
 * Run: node scripts/verify-october-pricelist.mjs
 * Exits 1 on any mismatch, unmatched row, or unchecked October-only size.
 */
import ExcelJS from 'exceljs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COLLECTIONS, getAvailableCarats, getPrice, getRetail } from '../lib/catalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKBOOK = path.join(
  __dirname, '..', '_reference-materials', 'PricelistMoonlight_2026_B2C_rounded.xlsx',
)
const YEAR = '2026-10'

// Workbook "Product" text → catalog collection id. Longest match wins so
// "Moonlight Multi" is not swallowed by a shorter prefix.
const PRODUCT_TO_ID = [
  ['moonlight original', 'MFM'],
  ['moonlight long', 'MNO'],
  ['moonlight multi', 'MNH'],
  ['sienna one', 'SI1'],
  ['sienna two', 'SI2P'],
  ['sienna three', 'SI3'],
  ['sienna four', 'SI4'],
  ['sienna five', 'SI5'],
  ['iconix zaha', 'ZAHA'],
]

function collectionFor(productText) {
  const t = String(productText || '').toLowerCase()
  const hit = PRODUCT_TO_ID
    .filter(([needle]) => t.includes(needle))
    .sort((a, b) => b[0].length - a[0].length)[0]
  return hit ? hit[1] : null
}

// "0,70 ct" / "0.20 ct" / "1,10 ct" → the catalog's carat spelling ("0.70").
// Kept as a string because catalog carats are strings and "1.10" !== "1.1".
function normalizeCarat(raw) {
  const cleaned = String(raw ?? '').replace(/ct/i, '').replace(',', '.').trim()
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n)) return null
  // 1.01 keeps two decimals; everything else is a 2-decimal carat too, so a
  // single toFixed(2) covers the whole sheet.
  return n.toFixed(2)
}

function cellText(cell) {
  const v = cell?.value
  if (v == null) return ''
  if (typeof v === 'object') {
    if (v.result !== undefined) return String(v.result)
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('')
    if (v.text) return v.text
  }
  return String(v)
}

function cellNumber(cell) {
  const n = Number.parseFloat(cellText(cell).replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function col(id) {
  const c = COLLECTIONS.find((x) => x.id === id)
  if (!c) throw new Error(`No collection ${id}`)
  return c
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(WORKBOOK)

const problems = []
const checked = new Set()
let rowsRead = 0

for (const ws of wb.worksheets) {
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const product = cellText(row.getCell(1))
    if (!product || /^product$/i.test(product.trim())) return

    const id = collectionFor(product)
    if (!id) {
      problems.push(`row ${rowNumber}: "${product}" does not map to any collection`)
      return
    }

    const carat = normalizeCarat(cellText(row.getCell(4)))
    const b2c = cellNumber(row.getCell(6))
    const b2b = cellNumber(row.getCell(7))
    if (carat == null || b2b == null || b2c == null) {
      problems.push(`row ${rowNumber}: "${product}" has an unreadable carat/price`)
      return
    }

    rowsRead += 1
    const c = col(id)
    const idx = c.carats.indexOf(carat)
    if (idx < 0) {
      problems.push(`${id} ${carat} ct (row ${rowNumber}): size missing from the catalog`)
      return
    }

    checked.add(`${id}|${carat}`)
    const gotB2B = getPrice(c, idx, 'igi', YEAR)
    const gotB2C = getRetail(c, idx, 'igi', YEAR)
    if (gotB2B !== b2b) problems.push(`${id} ${carat} ct: B2B is €${gotB2B}, workbook says €${b2b}`)
    if (gotB2C !== b2c) problems.push(`${id} ${carat} ct: B2C is €${gotB2C}, workbook says €${b2c}`)
  })
}

// The workbook is the full October range for these collections, so anything the
// app still offers on the October list but the workbook does not list is a size
// that should have been retired.
for (const id of new Set(PRODUCT_TO_ID.map(([, v]) => v))) {
  for (const { carat } of getAvailableCarats(col(id), YEAR)) {
    if (!checked.has(`${id}|${carat}`)) {
      problems.push(`${id} ${carat} ct: offered on the October list but absent from the workbook`)
    }
  }
}

console.log(`Workbook : ${path.relative(process.cwd(), WORKBOOK)}`)
console.log(`Pricelist: ${YEAR}`)
console.log(`Rows read: ${rowsRead} · sizes checked: ${checked.size}`)

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}

console.log('\n✓ Every workbook row matches the catalog, and no extra sizes are offered.')

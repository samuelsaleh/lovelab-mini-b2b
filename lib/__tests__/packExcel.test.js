/**
 * lib/packExcel.js — generated order-template workbook is well-formed.
 *
 * We generate from a representative pack and re-load the buffer with ExcelJS to
 * assert the structural contract the download route + clients rely on:
 *   - a real .xlsx (loads without error),
 *   - branded header + label-aware subtitle,
 *   - one data row per form_rows entry,
 *   - a SUM() grand-total formula.
 * Plus edge cases: blank unit price, single collection, special chars in label.
 */

import ExcelJS from 'exceljs'
import { generatePackExcelBuffer } from '@/lib/packExcel'

const HEADER_ROW = 8
const FIRST_DATA_ROW = 9

function samplePack() {
  return {
    label: 'Pack 1',
    form_rows: [
      { collection: 'CUTY', carat: '0.05', shape: '', bpColor: 'White', setting: '', size: 'M', colorCord: 'Black', quantity: '2', unitPrice: '24', cert: 'In-house' },
      { collection: 'CUTY', carat: '0.10', shape: '', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '34', cert: 'In-house' },
      { collection: 'CUBIX', carat: '0.05', shape: '', bpColor: 'White', setting: '', size: 'S/M', colorCord: 'Red', quantity: '3', unitPrice: '24', cert: 'In-house' },
    ],
  }
}

async function load(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb.worksheets[0]
}

describe('generatePackExcelBuffer', () => {
  it('produces a valid xlsx with header, label subtitle and per-row data', async () => {
    const pack = samplePack()
    const buf = await generatePackExcelBuffer(pack)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(0)

    const ws = await load(buf)

    // Subtitle carries the pack label + its collections.
    const subtitle = String(ws.getCell('A2').value)
    expect(subtitle).toContain('Pack 1')
    expect(subtitle).toContain('CUTY')
    expect(subtitle).toContain('CUBIX')

    // Header row.
    expect(ws.getCell(HEADER_ROW, 1).value).toBe('Collection')
    expect(ws.getCell(HEADER_ROW, 10).value).toBe('Total €')

    // One data row per form_rows entry.
    expect(ws.getCell(FIRST_DATA_ROW, 1).value).toBe('CUTY')
    expect(ws.getCell(FIRST_DATA_ROW + 2, 1).value).toBe('CUBIX')

    // Qty / unit price are numeric; line total is a per-row formula.
    expect(ws.getCell(FIRST_DATA_ROW, 8).value).toBe(2)
    expect(ws.getCell(FIRST_DATA_ROW, 9).value).toBe(24)
    expect(ws.getCell(FIRST_DATA_ROW, 10).value.formula).toBe('H9*I9')

    // Totals row: SUM over the data range.
    const totalRow = FIRST_DATA_ROW + pack.form_rows.length
    expect(ws.getCell(totalRow, 1).value).toBe('TOTAL ORDER VALUE')
    expect(ws.getCell(totalRow, 10).value.formula).toMatch(/^SUM\(J9:J\d+\)$/)
  })

  it('handles blank unit price (defaults to 0) and a single-collection pack', async () => {
    const pack = {
      label: 'Solo',
      form_rows: [
        { collection: 'CUTY', carat: '0.05', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '', cert: 'In-house' },
      ],
    }
    const buf = await generatePackExcelBuffer(pack)
    const ws = await load(buf)
    expect(ws.getCell(FIRST_DATA_ROW, 9).value).toBe(0)
    expect(String(ws.getCell('A2').value)).toContain('Solo')
  })

  it('survives special characters in the label (sheet name is sanitised)', async () => {
    const pack = { label: 'PACK 6-RB/SYN [draft]', form_rows: [{ collection: 'CUTY', quantity: '1', unitPrice: '30' }] }
    const buf = await generatePackExcelBuffer(pack)
    const ws = await load(buf)
    expect(ws.name.length).toBeLessThanOrEqual(31)
    expect(String(ws.getCell('A2').value)).toContain('PACK 6-RB/SYN [draft]')
  })

  it('does not throw on an empty pack (no rows)', async () => {
    const buf = await generatePackExcelBuffer({ label: 'Empty', form_rows: [] })
    const ws = await load(buf)
    // Totals row sits right at the first data row position with a 0 grand total.
    expect(ws.getCell(FIRST_DATA_ROW, 1).value).toBe('TOTAL ORDER VALUE')
    expect(ws.getCell(FIRST_DATA_ROW, 10).value).toBe(0)
  })
})

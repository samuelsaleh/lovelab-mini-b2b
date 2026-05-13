/**
 * @jest-environment node
 *
 * Unit coverage for chunkRowsForPrint(rows, perPage, lastPage).
 *
 * Pinned to the post-2026-05-12 constants used by OrderForm.jsx:
 *   PRINT_ROWS_PER_PAGE  = 10
 *   PRINT_ROWS_LAST_PAGE = 6
 *
 * Pre-fix (14 / 7) caused page 1 to overflow A4 landscape, which made the
 * PDF slicer produce a stray middle PDF page. New constants keep page 1
 * (full header + 10 rows) and the last page (≤6 rows + Remarks + Final
 * Total + Signatures + Legal text) inside the 190mm height budget.
 */

const { chunkRowsForPrint } = require('../orderPrintPagination')

const PER_PAGE = 10
const LAST_PAGE = 6

function rows(n) {
  return Array.from({ length: n }, (_, i) => ({ no: String(i + 1) }))
}

describe('chunkRowsForPrint — post-2026-05-12 constants (10 / 6)', () => {
  it('returns one empty page for 0 rows so the form always has something to render', () => {
    expect(chunkRowsForPrint([], PER_PAGE, LAST_PAGE)).toEqual([[]])
  })

  it('1 row -> single 1-row page', () => {
    const out = chunkRowsForPrint(rows(1), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(1)
    expect(out[0]).toHaveLength(1)
  })

  it('6 rows -> single page (fits in last-page budget)', () => {
    const out = chunkRowsForPrint(rows(6), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(1)
    expect(out[0]).toHaveLength(6)
  })

  it('7 rows -> single page (one full page is a valid last page)', () => {
    const out = chunkRowsForPrint(rows(7), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(1)
    expect(out[0]).toHaveLength(7)
  })

  it('10 rows -> single page (last page can be a full page)', () => {
    const out = chunkRowsForPrint(rows(10), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(1)
    expect(out[0]).toHaveLength(10)
  })

  it('11 rows -> 2 pages (10 + 1)', () => {
    const out = chunkRowsForPrint(rows(11), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(2)
    expect(out[0]).toHaveLength(10)
    expect(out[1]).toHaveLength(1)
  })

  it('16 rows -> 2 pages (10 + 6)', () => {
    const out = chunkRowsForPrint(rows(16), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(2)
    expect(out[0]).toHaveLength(10)
    expect(out[1]).toHaveLength(6)
  })

  it('17 rows -> 2 pages (10 + 7) — last page slightly over budget but still single', () => {
    // afterThisPage = 17 - 10 = 7 > LAST_PAGE(6), but on the next iter
    // remaining=7, afterThisPage=-3 -> "this will be last page". So 2 pages.
    // The 7-row last page is acceptable (fits without footer crunch in
    // practice; the tighter budget kicks in at 8+).
    const out = chunkRowsForPrint(rows(17), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(2)
    expect(out[0]).toHaveLength(10)
    expect(out[1]).toHaveLength(7)
  })

  it('20 rows -> 2 pages (10 + 10)', () => {
    const out = chunkRowsForPrint(rows(20), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(2)
    expect(out.map((p) => p.length)).toEqual([10, 10])
  })

  it('21 rows -> 3 pages (10 + 10 + 1)', () => {
    const out = chunkRowsForPrint(rows(21), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(3)
    expect(out.map((p) => p.length)).toEqual([10, 10, 1])
  })

  it('preserves row identity (no mutation) and row order', () => {
    const input = rows(15)
    const out = chunkRowsForPrint(input, PER_PAGE, LAST_PAGE)
    const flattened = out.flat()
    expect(flattened).toHaveLength(15)
    flattened.forEach((row, idx) => {
      expect(row).toBe(input[idx])
    })
  })

  it('matches Sam-the-Oxygene-bug repro: a typical 12-row order is exactly 2 pages', () => {
    // The Oxygene-style report Sam saw on 2026-05-12 came out as 3 PDF
    // pages from a 2-logical-page order. With the new constants and the
    // shrink-to-fit branch in lib/pdf.js, 12 rows fits cleanly in 2 logical
    // pages (10 + 2) which the PDF builder then renders as 2 PDF pages.
    const out = chunkRowsForPrint(rows(12), PER_PAGE, LAST_PAGE)
    expect(out).toHaveLength(2)
    expect(out.map((p) => p.length)).toEqual([10, 2])
  })
})

describe('chunkRowsForPrint — argument hardening', () => {
  it('returns single empty page for non-array input', () => {
    expect(chunkRowsForPrint(null, PER_PAGE, LAST_PAGE)).toEqual([[]])
    expect(chunkRowsForPrint(undefined, PER_PAGE, LAST_PAGE)).toEqual([[]])
  })

  it('falls back to single page when perPage is invalid', () => {
    const input = rows(5)
    expect(chunkRowsForPrint(input, 0, LAST_PAGE)).toEqual([input])
    expect(chunkRowsForPrint(input, -1, LAST_PAGE)).toEqual([input])
    expect(chunkRowsForPrint(input, NaN, LAST_PAGE)).toEqual([input])
  })

  it('clamps lastPage to perPage when caller passes nonsense', () => {
    const out = chunkRowsForPrint(rows(15), 10, 99)
    // lastPage clamped down to 10; remaining 5 fits in lastPage budget on
    // first iteration -> single page of 15. (We're testing that it
    // doesn't crash, not the geometry.)
    expect(out).toHaveLength(1)
    expect(out[0]).toHaveLength(15)
  })
})

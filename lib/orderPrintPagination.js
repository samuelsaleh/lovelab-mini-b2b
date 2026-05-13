/**
 * Pure chunking helper for the order-form print PDF pagination.
 *
 * Extracted from `app/components/OrderForm.jsx` so it can be unit-tested
 * without spinning up the entire form. Both the in-component memo and any
 * server-side preview must call this same function so the row layout
 * matches what html2canvas eventually rasterises.
 *
 * Contract:
 *   - `rows` is an array of already-filled rows (callers filter empty rows
 *     before passing them in).
 *   - `perPage` is the row count target for "full" pages.
 *   - `lastPage` is the row count target for the final page (always smaller
 *     so there's room for the Remarks / Final Total / Signatures / Legal
 *     blocks). Must be `<= perPage`.
 *   - Returns an array of arrays. When `rows` is empty we return a single
 *     empty page so the caller still has *something* to render.
 *
 * The loop tries to keep the LAST page inside the `lastPage` budget without
 * starving earlier pages. If after laying out `perPage` rows on the current
 * page the remainder would still fit on a single last page, we proceed
 * with `perPage`. Otherwise the current page becomes the last one.
 */
export function chunkRowsForPrint(rows, perPage, lastPage) {
  if (!Array.isArray(rows) || rows.length === 0) return [[]]
  if (!Number.isFinite(perPage) || perPage <= 0) return [rows.slice()]
  if (!Number.isFinite(lastPage) || lastPage <= 0) lastPage = perPage
  if (lastPage > perPage) lastPage = perPage

  const out = []
  let i = 0
  while (i < rows.length) {
    const remaining = rows.length - i
    if (remaining <= lastPage) {
      out.push(rows.slice(i))
      break
    }
    const afterThisPage = remaining - perPage
    if (afterThisPage > 0 && afterThisPage <= lastPage) {
      out.push(rows.slice(i, i + perPage))
      i += perPage
    } else if (afterThisPage <= 0) {
      out.push(rows.slice(i))
      break
    } else {
      out.push(rows.slice(i, i + perPage))
      i += perPage
    }
  }
  return out
}

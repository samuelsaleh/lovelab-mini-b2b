/**
 * Out Memos helpers.
 * Agent / Party / Internal each show only that memo_type from party_masters.
 */

export const ALL_OUT_MEMO_TYPES = ['Agent', 'Party', 'Internal']

/** Euro in front, comma every thousand, point for cents. €194,122.00 */
export function fmtAmount(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—'
  return `€${Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Each filter loads only its own memo_type. */
export function memoTypesToFetch(memoType) {
  return ALL_OUT_MEMO_TYPES.includes(memoType) ? [memoType] : [memoType]
}

export function mergeMemoLists(lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const memo of list || []) {
      const id = memo?.memo_no
      if (id != null) {
        if (seen.has(id)) continue
        seen.add(id)
      }
      out.push(memo)
    }
  }
  return out
}

/** Stay on screen only if the new type matches the active filter. */
export function staysInCurrentFilter(currentFilter, nextType) {
  return currentFilter === nextType
}

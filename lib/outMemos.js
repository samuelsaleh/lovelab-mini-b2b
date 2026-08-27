/**
 * Out Memos helpers.
 *
 * Party is the "everyone" view: Agent + Party + Internal together, so a
 * company can be dragged onto Agent or Internal from one list.
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

export function isEveryoneMemoFilter(memoType) {
  return memoType === 'Party'
}

export function memoTypesToFetch(memoType) {
  return isEveryoneMemoFilter(memoType) ? [...ALL_OUT_MEMO_TYPES] : [memoType]
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

/** Party shows everyone, so a type change stays on screen. */
export function staysInCurrentFilter(currentFilter, nextType) {
  return currentFilter === 'Party' || currentFilter === nextType
}

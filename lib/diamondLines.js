/**
 * Order lines seen through the diamond: model, carat and shape.
 *
 * An order stores its lines in metadata.formState.rows. Reports and Analytics
 * both want to ask "how many 0.10 ct hearts did we sell" — so the filter has to
 * work per line, not per order. A document that mixes carats matches a carat
 * filter on its matching lines only, and its amount shrinks to those lines.
 */

import { matchCollectionLabel } from './collectionMatch.js'

export const EMPTY_DIAMOND_FILTER = { models: [], carats: [], shapes: [] }

const num = (v) => {
  const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const clean = (v) => String(v == null ? '' : v).trim()

/** One normalised line per saved order row. */
export function diamondLinesOf(doc) {
  const rows = doc?.metadata?.formState?.rows
  if (!Array.isArray(rows)) return []
  return rows.map((r) => {
    const collection = clean(r?.collection)
    return {
      // A hand-typed collection still groups under its catalogue label.
      model: matchCollectionLabel(collection) || collection,
      carat: clean(r?.carat),
      shape: clean(r?.shape),
      qty: Math.round(num(r?.quantity)),
      total: num(r?.total),
    }
  })
}

export function hasDiamondFilter(f = {}) {
  return Boolean(f.models?.length || f.carats?.length || f.shapes?.length)
}

export function lineMatchesDiamond(line, f = {}) {
  if (f.models?.length && !f.models.includes(line.model)) return false
  if (f.carats?.length && !f.carats.includes(line.carat)) return false
  if (f.shapes?.length && !f.shapes.includes(line.shape)) return false
  return true
}

export const sumLines = (lines) => lines.reduce(
  (acc, l) => ({ qty: acc.qty + l.qty, total: acc.total + l.total }),
  { qty: 0, total: 0 },
)

/**
 * The order's amount attributable to the lines that match.
 *
 * documents.total_amount is the grand total: discount, shipping, vitrine and
 * VAT included. Line totals are bare prices, so summing them would change the
 * number even when every line matches. Instead the real total is shared out
 * by each line's price (or piece count when prices are blank).
 */
export function proratedAmount(totalAmount, allLines, keptLines) {
  const total = Number(totalAmount) || 0
  if (keptLines.length === allLines.length) return total
  const all = sumLines(allLines)
  const kept = sumLines(keptLines)
  if (all.total > 0) return total * (kept.total / all.total)
  if (all.qty > 0) return total * (kept.qty / all.qty)
  return total * (keptLines.length / allLines.length)
}

/**
 * The document as the filter sees it: only matching rows kept, and the total
 * shrunk to their share. Returns null when nothing matches. With no filter set
 * the document comes back untouched.
 */
export function scopeDocToDiamond(doc, f) {
  if (!hasDiamondFilter(f)) return doc
  const rows = doc?.metadata?.formState?.rows
  if (!Array.isArray(rows)) return null
  const lines = diamondLinesOf(doc)
  const keep = rows.filter((_, i) => lineMatchesDiamond(lines[i], f))
  if (!keep.length) return null
  const kept = lines.filter((l) => lineMatchesDiamond(l, f))
  return {
    ...doc,
    total_amount: proratedAmount(doc.total_amount, lines, kept),
    metadata: { ...doc.metadata, formState: { ...doc.metadata.formState, rows: keep } },
  }
}

/** Picker options with piece counts: [{ value, count }], blanks left out. */
export function diamondOptions(docs) {
  const tallies = { models: new Map(), carats: new Map(), shapes: new Map() }
  for (const d of docs) {
    for (const l of diamondLinesOf(d)) {
      for (const [key, v] of [['models', l.model], ['carats', l.carat], ['shapes', l.shape]]) {
        if (v) tallies[key].set(v, (tallies[key].get(v) || 0) + l.qty)
      }
    }
  }
  const out = (m, cmp) => [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => cmp(a.value, b.value))
  return {
    models: out(tallies.models, (a, b) => a.localeCompare(b)),
    carats: out(tallies.carats, (a, b) => num(a) - num(b) || a.localeCompare(b)),
    shapes: out(tallies.shapes, (a, b) => a.localeCompare(b)),
  }
}

export const caratLabel = (c) => (c ? `${c} ct` : '')

/** "0.10 ct Heart" for each distinct carat + shape on the given lines. */
export function diamondSummary(lines) {
  const seen = new Set()
  for (const l of lines) {
    const t = [caratLabel(l.carat), l.shape].filter(Boolean).join(' ')
    if (t) seen.add(t)
  }
  return [...seen]
}

export function modelSummary(lines) {
  return [...new Set(lines.map((l) => l.model).filter(Boolean))]
}

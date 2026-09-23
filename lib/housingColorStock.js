/**
 * Housing colours: what was sold and what is still available, per colour.
 *
 * Sam, 23 Sep 2026. Nothing tracks housing stock — not the app, not the
 * ERP endpoints we can reach — so availability is derived from the orders:
 *
 *   available = internal orders (Antwerp Office, stock coming in)
 *             − B2B sold − B2C sold
 *
 * at colour level only. Drafts never count; consignment and write-offs are
 * ignored on purpose. Stock that came in before the app exists in no order,
 * so a colour can legitimately show negative — the dashboard says so.
 *
 * The housing colour of an order row is `row.bpColor`. Stored values are
 * messy ("White", "White Gold", "Bezel White", "Prongs white", "WW", "WWW",
 * "YWP", "Yellow + Yellow", the five mattes, junk) and are normalised here.
 * A piece counts once in its bucket, qty-weighted; a two- or three-metal
 * piece is its own "mixed" bucket rather than split into housings, so in
 * and out stay comparable.
 *
 * Pure; safe on client and server.
 */
import { eligibleDocs, rowQty } from './analyticsBreakdowns.js'

export const NOT_SPECIFIED = 'Not specified'

/** Fixed buckets, in display order, with a swatch. */
export const HOUSING_COLOR_BUCKETS = [
  { name: 'Yellow', hex: '#D9B25F' },
  { name: 'White', hex: '#DCDCDC' },
  { name: 'Pink', hex: '#E3A6A0' },
  { name: 'Yellow Matte', hex: '#C9A85C' },
  { name: 'White Matte', hex: '#C8C8C8' },
  { name: 'Pink Matte', hex: '#D4A19B' },
  { name: 'Gray Matte', hex: '#9C9C9C' },
  { name: 'Black Matte', hex: '#3A3A3A' },
]

const MIXED_HEX = '#B9A9C4'
const NOT_SPECIFIED_HEX = '#EEEEEE'
const METAL_ORDER = ['Yellow', 'White', 'Pink']
const LETTER = { y: 'Yellow', w: 'White', p: 'Pink' }

function singleMetal(word) {
  const w = word.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!w) return null
  if (w === 'yellow' || w === 'yellow gold' || w === 'gold') return 'Yellow'
  if (w === 'white' || w === 'white gold') return 'White'
  if (w === 'pink' || w === 'pink gold' || w === 'rose' || w === 'rose gold') return 'Pink'
  if (w === 'yellow matte' || w === 'matte yellow') return 'Yellow Matte'
  if (w === 'white matte' || w === 'matte white') return 'White Matte'
  if (w === 'pink matte' || w === 'matte pink' || w === 'rose matte') return 'Pink Matte'
  if (w === 'gray matte' || w === 'grey matte' || w === 'matte gray' || w === 'matte grey') return 'Gray Matte'
  if (w === 'black matte' || w === 'matte black') return 'Black Matte'
  return null
}

function mixedLabel(metals) {
  const distinct = [...new Set(metals)]
  if (distinct.length === 1) return distinct[0]
  return METAL_ORDER.filter((m) => distinct.includes(m)).join(' + ')
}

/**
 * Bucket name for a stored bpColor value. Never throws; unknown → NOT_SPECIFIED.
 */
export function normalizeHousingColor(raw) {
  let s = String(raw ?? '').trim().toLowerCase()
  if (!s) return NOT_SPECIFIED
  // Setting prefixes / suffixes are not a colour.
  s = s.replace(/^(bezel|prongs?)\s+/, '').replace(/\s+(bezel|prongs?)$/, '').trim()
  if (!s || s === 'bezel' || s === 'prong' || s === 'prongs') return NOT_SPECIFIED

  // "Yellow + Yellow", "White + White Bezel": one piece, several housings.
  if (s.includes('+')) {
    const parts = s.split('+').map((p) => p.replace(/\s+(bezel|prongs?)$/, '').trim()).filter(Boolean)
    const metals = parts.map(singleMetal)
    if (metals.length && metals.every(Boolean)) return mixedLabel(metals)
    return NOT_SPECIFIED
  }

  // Two/three-letter codes: WW, YYY, YWP, WYP…
  if (/^[wyp]{2,3}$/.test(s)) {
    return mixedLabel([...s].map((c) => LETTER[c]))
  }

  return singleMetal(s) || NOT_SPECIFIED
}

function hexFor(name) {
  if (name === NOT_SPECIFIED) return NOT_SPECIFIED_HEX
  const fixed = HOUSING_COLOR_BUCKETS.find((b) => b.name === name)
  return fixed ? fixed.hex : MIXED_HEX
}

function orderedNames(seen) {
  const fixed = HOUSING_COLOR_BUCKETS.map((b) => b.name)
  const mixed = [...seen].filter((n) => !fixed.includes(n) && n !== NOT_SPECIFIED).sort()
  const tail = seen.has(NOT_SPECIFIED) ? [NOT_SPECIFIED] : []
  return [...fixed, ...mixed, ...tail]
}

function tally(docs, into, seen) {
  for (const d of docs) {
    for (const row of d?.metadata?.formState?.rows || []) {
      const qty = rowQty(row)
      if (!qty) continue
      const name = normalizeHousingColor(row?.bpColor)
      seen.add(name)
      into.set(name, (into.get(name) || 0) + qty)
    }
  }
}

/**
 * Pieces sold per housing colour over the analytics-eligible documents
 * (drafts and non-revenue channels excluded, like every other section).
 * @returns {Array<{ name: string, hex: string, qty: number }>}
 */
export function buildHousingSold(docs) {
  const sold = new Map()
  const seen = new Set()
  tally(eligibleDocs(docs), sold, seen)
  return orderedNames(seen).map((name) => ({ name, hex: hexFor(name), qty: sold.get(name) || 0 }))
}

function isSent(d) {
  return d && d.status === 'sent' && !d.deleted_at
}

/**
 * Stock per housing colour derived from the orders.
 * @param {object[]} docs  sent documents of channels internal / b2b / b2c (others ignored)
 * @returns {Array<{ name: string, hex: string, in: number, out: number, available: number }>}
 */
export function buildHousingStock(docs) {
  const inbound = new Map()
  const outbound = new Map()
  const seen = new Set()
  const all = (docs || []).filter(isSent)
  tally(all.filter((d) => d.order_channel === 'internal'), inbound, seen)
  tally(all.filter((d) => d.order_channel === 'b2b' || d.order_channel === 'b2c'), outbound, seen)
  return orderedNames(seen).map((name) => {
    const i = inbound.get(name) || 0
    const o = outbound.get(name) || 0
    return { name, hex: hexFor(name), in: i, out: o, available: i - o }
  })
}

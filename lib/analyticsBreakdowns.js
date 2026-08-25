/**
 * Shared analytics breakdowns — colors (nylon / silk, full palettes + zeros)
 * and countries. Used by the dashboard AND the analytics chat tools so the
 * numbers cannot drift.
 *
 * Callers pass the same document set the dashboard already filtered
 * (no drafts, no internal / consignment / write-off / sample). `eligibleDocs`
 * re-applies that filter so a tool cannot accidentally count excluded rows.
 */

import { CORD_COLORS, normalizeCordColorName, parseMaterialLabel, getDefaultCordType } from './catalog.js'
import { exactCollection, matchCollectionLabel } from './collectionMatch.js'
import { normalizeCountry } from './countries.js'
import { EXCLUDED_ORDER_CHANNELS } from './organizations/teamStats.js'
import { aliasCordColorName, clientNameFromDoc } from './analyticsAliases.js'

export const NYLON_MATERIAL_KEYS = new Set(['nylon', 'braided', 'braidednylon', 'shine', 'holy'])
export const SILK_MATERIAL_KEYS = new Set(['silk'])

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export function isAnalyticsDoc(d) {
  if (!d) return false
  if (d.deleted_at) return false
  if (d.status === 'draft') return false
  if (EXCLUDED_ORDER_CHANNELS.includes(d.order_channel)) return false
  return true
}

export function eligibleDocs(docs) {
  return (docs || []).filter(isAnalyticsDoc)
}

export function rowQty(row) {
  const n = parseInt(String(row?.quantity ?? '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function rowRevenue(row) {
  const n = parseFloat(String(row?.total ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Resolve nylon vs silk from the saved row, then the collection default.
 * Shine / holy / braided nylon all roll up under Nylon — the commercial split
 * Sam asked for.
 */
export function resolveMaterialGroup(row, col) {
  const fromLabel = parseMaterialLabel(row?.material || '').cordType
  const raw = String(row?.cordType || fromLabel || col?.cord || '').trim().toLowerCase().replace(/[\s_-]/g, '')
  if (SILK_MATERIAL_KEYS.has(raw)) return 'silk'
  if (NYLON_MATERIAL_KEYS.has(raw)) return 'nylon'
  return null
}

export const COLOR_SORT_MODES = ['qty', 'revenue', 'name', 'chrono']

function seedPalette(palette) {
  return (palette || []).map((c) => ({
    name: c.n,
    hex: c.h || null,
    qty: 0,
    revenue: 0,
    catalog: true,
    firstSoldAt: null,
    lastSoldAt: null,
  }))
}

function bump(list, name, hex, qty, revenue, soldAt) {
  const key = String(name).trim().toLowerCase()
  if (!key) return
  let row = list.find((r) => r.name.toLowerCase() === key)
  if (!row) {
    row = { name, hex: hex || null, qty: 0, revenue: 0, catalog: false, firstSoldAt: null, lastSoldAt: null }
    list.push(row)
  }
  row.qty += qty
  row.revenue = round2(row.revenue + revenue)
  if (soldAt) {
    if (!row.firstSoldAt || soldAt < row.firstSoldAt) row.firstSoldAt = soldAt
    if (!row.lastSoldAt || soldAt > row.lastSoldAt) row.lastSoldAt = soldAt
  }
}

function soldAtOf(d) {
  return d?.created_at || d?.updated_at || d?.metadata?.formState?.date || null
}

export function sortColorList(list, mode = 'qty') {
  const rows = [...(list || [])]
  if (mode === 'name') {
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }
  if (mode === 'chrono') {
    return rows.sort((a, b) => {
      const aT = a.lastSoldAt || ''
      const bT = b.lastSoldAt || ''
      if (Boolean(aT) !== Boolean(bT)) return aT ? -1 : 1
      if (aT !== bT) return aT < bT ? 1 : -1
      return a.name.localeCompare(b.name)
    })
  }
  if (mode === 'revenue') {
    return rows.sort((a, b) => {
      const aSold = a.qty > 0
      const bSold = b.qty > 0
      if (aSold !== bSold) return aSold ? -1 : 1
      if (b.revenue !== a.revenue) return b.revenue - a.revenue
      return a.name.localeCompare(b.name)
    })
  }
  return rows.sort((a, b) => {
    const aSold = a.qty > 0
    const bSold = b.qty > 0
    if (aSold !== bSold) return aSold ? -1 : 1
    if (b.qty !== a.qty) return b.qty - a.qty
    return a.name.localeCompare(b.name)
  })
}

export function sortColorBreakdown(colors, mode = 'qty') {
  return {
    nylon: sortColorList(colors?.nylon, mode),
    silk: sortColorList(colors?.silk, mode),
    other: sortColorList(colors?.other, mode),
  }
}

function paletteHex(palette, name) {
  const hit = (palette || []).find((c) => c.n.toLowerCase() === String(name).toLowerCase())
  return hit?.h || null
}

function snapToGroupPalette(group, snappedName, col, cordType) {
  const dest = group === 'silk' ? CORD_COLORS.silk : CORD_COLORS.nylon
  const destHit = dest.find((c) => c.n.toLowerCase() === String(snappedName).toLowerCase())
  if (destHit) return { name: destHit.n, hex: destHit.h }
  const sourceHex = paletteHex(CORD_COLORS[col?.cord] || [], snappedName)
    || paletteHex(cordType ? CORD_COLORS[cordType] : [], snappedName)
  return { name: snappedName, hex: sourceHex }
}

/**
 * Full Nylon + Silk palettes with zeros, plus an Other bucket for sold
 * names that belong to neither palette and have no material group.
 */
export function buildColorBreakdown(docs) {
  const nylon = seedPalette(CORD_COLORS.nylon)
  const silk = seedPalette(CORD_COLORS.silk)
  const other = []

  for (const d of eligibleDocs(docs)) {
    for (const row of d.metadata?.formState?.rows || []) {
      const col = exactCollection(row?.collection)
      if (!col) continue
      const qty = rowQty(row)
      if (!qty) continue
      const rawColor = String(row.colorCord || '').trim()
      if (!rawColor) continue

      const cordType = row.cordType || parseMaterialLabel(row.material || '').cordType || getDefaultCordType(col)
      const aliased = aliasCordColorName(rawColor) || rawColor
      const snapped = normalizeCordColorName(col, cordType, aliased) || aliased
      const group = resolveMaterialGroup(row, col)
      const revenue = rowRevenue(row)
      const soldAt = soldAtOf(d)

      if (group === 'nylon') {
        const placed = snapToGroupPalette('nylon', snapped, col, cordType)
        bump(nylon, placed.name, placed.hex, qty, revenue, soldAt)
      } else if (group === 'silk') {
        const placed = snapToGroupPalette('silk', snapped, col, cordType)
        bump(silk, placed.name, placed.hex, qty, revenue, soldAt)
      } else {
        bump(other, snapped, null, qty, revenue, soldAt)
      }
    }
  }

  return {
    nylon: sortColorList(nylon),
    silk: sortColorList(silk),
    other: sortColorList(other),
  }
}

export function buildCountryBreakdown(docs) {
  const map = new Map()
  for (const d of eligibleDocs(docs)) {
    const name = normalizeCountry(d.metadata?.formState?.country)
    if (!map.has(name)) map.set(name, { name, count: 0, revenue: 0 })
    const entry = map.get(name)
    entry.count += 1
    entry.revenue = round2(entry.revenue + (Number(d.total_amount) || 0))
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name))
}

export function buildClientBreakdown(docs) {
  const map = new Map()
  for (const d of eligibleDocs(docs)) {
    const { key, name } = clientNameFromDoc(d)
    if (!map.has(key)) map.set(key, { name, orders: 0, revenue: 0 })
    const entry = map.get(key)
    entry.orders += 1
    entry.revenue = round2(entry.revenue + (Number(d.total_amount) || 0))
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name))
}

export function buildProductBreakdown(docs) {
  const map = new Map()
  for (const d of eligibleDocs(docs)) {
    for (const row of d.metadata?.formState?.rows || []) {
      const label = matchCollectionLabel(row?.collection)
      if (!label) continue
      const qty = rowQty(row)
      if (!qty) continue
      if (!map.has(label)) map.set(label, { name: label, qty: 0, revenue: 0 })
      const entry = map.get(label)
      entry.qty += qty
      entry.revenue = round2(entry.revenue + rowRevenue(row))
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
}

// One bar stays ~36px so Recharts can draw every Y label. Do not cap this —
// a 320px ceiling is what clipped CUTY and shifted Shine onto MULTI THREE.
export const PRODUCT_CHART_ROW_PX = 36
export const PRODUCT_CHART_AXIS_PX = 48

export function productChartHeight(count) {
  const n = Number(count) || 0
  if (n <= 0) return PRODUCT_CHART_AXIS_PX
  return n * PRODUCT_CHART_ROW_PX + PRODUCT_CHART_AXIS_PX
}

function countryOf(d) {
  return normalizeCountry(d.metadata?.formState?.country)
}

function eventNameOf(d) {
  return String(d.events?.name || d.metadata?.formState?.eventName || '').trim()
}

function rowMatchesCollection(row, collection) {
  if (!collection) return true
  const wanted = String(collection).trim()
  if (!wanted) return true
  const col = exactCollection(row?.collection)
  if (col && (col.id === wanted || col.label.toLowerCase() === wanted.toLowerCase())) return true
  const label = matchCollectionLabel(row?.collection)
  return label && label.toLowerCase() === wanted.toLowerCase()
}

function rowMatchesMaterial(row, col, material) {
  if (!material || material === 'all') return true
  return resolveMaterialGroup(row, col) === material
}

/**
 * Line-level filter. Country and fair are document-level; material and
 * collection apply to each order row. A document is kept only if it has at
 * least one matching line (or, when only country/fair are set, the doc itself).
 */
export function matchingLines(docs, filters = {}) {
  const { country, material, collection, fair } = filters
  const countryWanted = country ? normalizeCountry(country) : null
  const fairWanted = fair ? String(fair).trim().toLowerCase() : null
  const lines = []

  for (const d of eligibleDocs(docs)) {
    if (countryWanted && countryOf(d) !== countryWanted) continue
    if (fairWanted) {
      const idHit = d.event_id && d.event_id === fair
      const nameHit = eventNameOf(d).toLowerCase() === fairWanted
      if (!idHit && !nameHit) continue
    }

    const rows = d.metadata?.formState?.rows || []
    const needsLineFilter = Boolean(material && material !== 'all') || Boolean(collection)
    if (!needsLineFilter) {
      if (rows.length === 0) {
        lines.push({ doc: d, row: null, col: null })
        continue
      }
      for (const row of rows) {
        lines.push({ doc: d, row, col: exactCollection(row?.collection) })
      }
      continue
    }

    for (const row of rows) {
      const col = exactCollection(row?.collection)
      if (collection && !rowMatchesCollection(row, collection)) continue
      if (material && material !== 'all' && !rowMatchesMaterial(row, col, material)) continue
      lines.push({ doc: d, row, col })
    }
  }

  return lines
}

export function sliceAnalytics(docs, filters = {}) {
  const lines = matchingLines(docs, filters)
  const docIds = new Set(lines.map((l) => l.doc.id))
  const slicedDocs = eligibleDocs(docs).filter((d) => docIds.has(d.id))

  const colors = buildColorBreakdown(
    slicedDocs.map((d) => {
      if (!filters.material && !filters.collection) return d
      const keep = new Set(
        lines.filter((l) => l.doc.id === d.id && l.row).map((l) => l.row),
      )
      return {
        ...d,
        metadata: {
          ...(d.metadata || {}),
          formState: {
            ...(d.metadata?.formState || {}),
            rows: (d.metadata?.formState?.rows || []).filter((r) => keep.has(r)),
          },
        },
      }
    }),
  )

  const products = buildProductBreakdown(
    slicedDocs.map((d) => {
      if (!filters.material && !filters.collection) return d
      const keep = new Set(
        lines.filter((l) => l.doc.id === d.id && l.row).map((l) => l.row),
      )
      return {
        ...d,
        metadata: {
          ...(d.metadata || {}),
          formState: {
            ...(d.metadata?.formState || {}),
            rows: (d.metadata?.formState?.rows || []).filter((r) => keep.has(r)),
          },
        },
      }
    }),
  )

  const lineRevenue = lines.reduce((s, l) => s + (l.row ? rowRevenue(l.row) : Number(l.doc.total_amount) || 0), 0)
  const lineQty = lines.reduce((s, l) => s + (l.row ? rowQty(l.row) : 0), 0)

  return {
    filters,
    orders: docIds.size,
    pieces: lineQty,
    revenue: round2(lineRevenue),
    colors,
    products,
    countries: buildCountryBreakdown(slicedDocs),
  }
}

export const ANALYTICS_TOOLS = [
  {
    name: 'colors',
    description: 'Every Nylon and Silk cord color sold, including palette colors with 0 sales. Use this for color questions.',
    input_schema: {
      type: 'object',
      properties: {
        material: {
          type: 'string',
          enum: ['nylon', 'silk', 'all'],
          description: 'Which palette to return. Default all.',
        },
      },
    },
  },
  {
    name: 'countries',
    description: 'Every country that appears on a sold order, with order count and revenue. No top-N cut-off.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'products',
    description: 'Collections sold, by quantity and line revenue.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'clients',
    description: 'Companies on sold orders. Stage, DE, FR\'s Friends and Friends are already merged as Friends.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'slice',
    description: 'Cut the live orders by country, material (nylon/silk), collection, and/or fair, then return KPIs plus colors and products for that cut only.',
    input_schema: {
      type: 'object',
      properties: {
        country: { type: 'string', description: 'Country name, e.g. Germany' },
        material: { type: 'string', enum: ['nylon', 'silk'] },
        collection: { type: 'string', description: 'Collection id or label, e.g. CUTY or SHAPY SPARKLE FANCY' },
        fair: { type: 'string', description: 'Fair / event name or id' },
      },
    },
  },
  {
    name: 'compare',
    description: 'Side-by-side slice of two materials or two countries (orders, pieces, revenue, top colors, top products).',
    input_schema: {
      type: 'object',
      required: ['by', 'a', 'b'],
      properties: {
        by: { type: 'string', enum: ['material', 'country'] },
        a: { type: 'string', description: 'First side: nylon/silk, or a country name' },
        b: { type: 'string', description: 'Second side' },
      },
    },
  },
]

export function runAnalyticsTool(name, input, docs) {
  const args = input || {}
  if (name === 'colors') {
    const all = buildColorBreakdown(docs)
    if (args.material === 'nylon') return { nylon: all.nylon, other: all.other }
    if (args.material === 'silk') return { silk: all.silk, other: all.other }
    return all
  }
  if (name === 'countries') return buildCountryBreakdown(docs)
  if (name === 'products') return buildProductBreakdown(docs)
  if (name === 'clients') return buildClientBreakdown(docs)
  if (name === 'slice') return sliceAnalytics(docs, args)
  if (name === 'compare') {
    const by = args.by
    if (by !== 'material' && by !== 'country') {
      return { error: 'compare.by must be material or country' }
    }
    const left = sliceAnalytics(docs, { [by]: args.a })
    const right = sliceAnalytics(docs, { [by]: args.b })
    return { by, a: args.a, b: args.b, left, right }
  }
  return { error: `Unknown tool: ${name}` }
}

export function formatColorBreakdownForPrompt(colors) {
  const line = (r) => `${r.name}: ${r.qty} pcs, €${r.revenue}`
  const blocks = []
  if (colors.nylon?.length) {
    blocks.push('NYLON COLORS (full palette, zeros included):')
    blocks.push(colors.nylon.map(line).join('\n'))
  }
  if (colors.silk?.length) {
    blocks.push('SILK COLORS (full palette, zeros included):')
    blocks.push(colors.silk.map(line).join('\n'))
  }
  if (colors.other?.length) {
    blocks.push('OTHER COLORS: ' + colors.other.map(line).join(', '))
  }
  return blocks.join('\n')
}

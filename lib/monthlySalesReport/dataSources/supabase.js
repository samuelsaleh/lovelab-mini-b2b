/**
 * Real data from Supabase, in the report's normalised shape.
 *
 * Split in two so the rules can be tested without a database:
 *   - fetchSupabaseRows(client)   reads the five tables, nothing else
 *   - normaliseSupabaseRows(rows) applies the app's own rules (pure)
 *
 * The rules are the app's own, so sales and commission agree with the
 * commission ledger:
 *   - a sale is a non-deleted, non-draft `order` outside the excluded channels
 *     (lib/organizations/teamStats.js)
 *   - the order's month comes from the typed order date, then created_at
 *     (same order as parseOrderDate in lib/synaliaQuarter.js). The analytics
 *     dashboard dates by created_at instead, so an order entered after the
 *     fact can sit in a different month there.
 *   - the amount is net of VAT and shipping, exactly as the commission base in
 *     lib/commissionAttribution.js computes it
 *   - B2C is order_channel 'b2c'; everything else counts as B2B, as on the
 *     analytics dashboard
 *   - a cancelled commission never counts
 */

import { EXCLUDED_ORDER_CHANNELS } from '../../organizations/teamStats.js'

const PAGE = 1000

/**
 * Every row of a query, page by page. Pages are ordered by `id` — unique —
 * so no row can repeat or slip between two pages (a non-unique sort such as
 * created_at can, when many rows share a timestamp). De-duplicated by id as a
 * second guard: one row counted twice would inflate every total while all the
 * totals still agree with each other.
 */
export async function fetchAll(query) {
  const byId = new Map()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(`Supabase read failed: ${error.message}`)
    for (const row of data || []) byId.set(row.id, row)
    if (!data || data.length < PAGE) return [...byId.values()]
  }
}

// Only the parts of `metadata` the report uses — not the whole order form.
const DOCUMENT_COLUMNS = [
  'id, event_id, agent_id, client_company, client_name, document_type, status, order_channel, total_amount, created_at, deleted_at',
  'typed_date:metadata->formState->>date',
  'meta_date:metadata->>date',
  'tax_percent:metadata->>tax_percent',
  'form_tax_percent:metadata->formState->>taxPercent',
  'shipping_amount:metadata->>shipping_amount',
  'form_delivery_cost:metadata->formState->>deliveryCost',
  'rows:metadata->formState->rows',
].join(', ')

/** Back to the `metadata` shape the rules below read. */
function withMetadata({ typed_date, meta_date, tax_percent, form_tax_percent, shipping_amount, form_delivery_cost, rows, ...doc }) {
  return {
    ...doc,
    metadata: {
      date: meta_date ?? undefined,
      tax_percent: tax_percent ?? undefined,
      shipping_amount: shipping_amount ?? undefined,
      formState: { date: typed_date ?? undefined, taxPercent: form_tax_percent ?? undefined, deliveryCost: form_delivery_cost ?? undefined, rows: Array.isArray(rows) ? rows.map((r) => ({ total: r?.total })) : [] },
    },
  }
}

/** Reads only. Never writes. */
export async function fetchSupabaseRows(client) {
  const [documents, events, commissions, payments] = await Promise.all([
    fetchAll(() => client.from('documents').select(DOCUMENT_COLUMNS).eq('document_type', 'order').is('deleted_at', null)),
    fetchAll(() => client.from('events').select('id, name, type, start_date, end_date')),
    fetchAll(() => client.from('agent_commissions').select('id, agent_id, document_id, type, commission_amount, status, created_at')),
    fetchAll(() => client.from('agent_payments').select('id, agent_id, amount, payment_date')),
  ])

  // Agent names, in chunks so the id list never outgrows a URL. A failure
  // here must stop the run: silently losing names would send a report full
  // of "Unknown agent".
  const agentIds = [
    ...new Set([...documents.map((d) => d.agent_id), ...commissions.map((c) => c.agent_id), ...payments.map((p) => p.agent_id)].filter(Boolean)),
  ]
  const profiles = []
  for (let i = 0; i < agentIds.length; i += 150) {
    const { data, error } = await client.from('profiles').select('id, full_name, email').in('id', agentIds.slice(i, i + 150))
    if (error) throw new Error(`Supabase read failed (agent names): ${error.message}`)
    profiles.push(...(data || []))
  }

  return { documents: documents.map(withMetadata), events, profiles, commissions, payments }
}

const pad = (n) => String(n).padStart(2, '0')
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100

const brusselsDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' })

/** A timestamp as the calendar day it was in Antwerp. */
function dayInBrussels(value) {
  const t = Date.parse(value)
  return Number.isFinite(t) ? brusselsDay.format(new Date(t)) : null
}

// Month names as people in Antwerp, Paris and Milan type them.
const MONTH_NAMES = [
  ['jan', 'janv', 'janvier', 'januari', 'januar', 'gennaio', 'gen', 'enero', 'ene'],
  ['feb', 'fev', 'fév', 'fevr', 'févr', 'fevrier', 'février', 'februari', 'februar', 'febbraio', 'febrero'],
  ['mar', 'mars', 'maart', 'märz', 'marz', 'marzo', 'mrt'],
  ['apr', 'avr', 'avril', 'april', 'aprile', 'abril', 'abr'],
  ['may', 'mai', 'mei', 'maggio', 'mag', 'mayo'],
  ['jun', 'juin', 'juni', 'june', 'giugno', 'giu', 'junio'],
  ['jul', 'juil', 'juillet', 'juli', 'july', 'luglio', 'lug', 'julio'],
  ['aug', 'aout', 'août', 'augustus', 'august', 'agosto', 'ago'],
  ['sep', 'sept', 'septembre', 'september', 'settembre', 'set', 'septiembre'],
  ['oct', 'octobre', 'oktober', 'okt', 'october', 'ottobre', 'ott', 'octubre'],
  ['nov', 'novembre', 'november', 'noviembre'],
  ['dec', 'déc', 'decembre', 'décembre', 'december', 'dezember', 'dez', 'dicembre', 'dic', 'diciembre'],
]
const MONTH_BY_NAME = new Map(MONTH_NAMES.flatMap((names, i) => names.map((n) => [n, i + 1])))

function validDay(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
}

/**
 * A typed date → 'YYYY-MM-DD', or null if it can't be read. The field is
 * free text, so read it the way a Belgian user writes it: numbers are
 * day/month/year ("05/09/2026" is 5 September, never 9 May), and month names
 * may be French, Dutch or Italian ("24 mai 2026", "3 okt. 2026").
 */
export function parseTypedDay(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return validDay(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) return validDay(+m[3], +m[2], +m[1])
  m = s.match(/^(\d{1,2})(?:er|st|nd|rd|th)?[\s.]+([A-Za-zÀ-ÿ]+)\.?,?\s+(\d{4})$/i)
  if (m && MONTH_BY_NAME.has(m[2].toLowerCase())) return validDay(+m[3], MONTH_BY_NAME.get(m[2].toLowerCase()), +m[1])
  m = s.match(/^([A-Za-zÀ-ÿ]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m && MONTH_BY_NAME.has(m[1].toLowerCase())) return validDay(+m[3], MONTH_BY_NAME.get(m[1].toLowerCase()), +m[2])
  return null
}

/**
 * The order's calendar day, 'YYYY-MM-DD'. The typed date wins, as in
 * parseOrderDate; created_at (a real timestamp) is placed in Brussels time.
 */
export function orderDay(doc) {
  return orderDate(doc).day
}

/** { day, source }: source is 'typed', 'entry' (nothing typed) or 'typed_unreadable'. */
export function orderDate(doc) {
  const raw = doc?.metadata?.formState?.date || doc?.metadata?.date
  if (raw) {
    const day = parseTypedDay(raw)
    if (day) return { day, source: 'typed' }
    return { day: dayInBrussels(doc?.created_at), source: 'typed_unreadable' }
  }
  return { day: dayInBrussels(doc?.created_at), source: 'entry' }
}

/** Net of VAT and shipping — the commission base from lib/commissionAttribution.js. */
export function netOrderAmount(doc) {
  const total = Number(doc?.total_amount)
  if (!Number.isFinite(total) || total <= 0) return 0
  const rawTaxPct = Number(doc?.metadata?.tax_percent ?? doc?.metadata?.formState?.taxPercent ?? 0)
  const taxPct = Number.isFinite(rawTaxPct) && rawTaxPct > 0 && rawTaxPct < 100 ? rawTaxPct : 0
  const preTax = taxPct > 0 ? total / (1 + taxPct / 100) : total
  const rawShipping = Number(doc?.metadata?.shipping_amount ?? doc?.metadata?.formState?.deliveryCost ?? 0)
  const shipping = Number.isFinite(rawShipping) && rawShipping > 0 ? rawShipping : 0
  return Math.max(0, round2(preTax - shipping))
}

export function isReportableSale(doc) {
  if (!doc || doc.deleted_at) return false
  if (doc.document_type !== 'order') return false
  if (doc.status === 'draft') return false
  if (doc.order_channel && EXCLUDED_ORDER_CHANNELS.includes(doc.order_channel)) return false
  return true
}

/** Pure: raw table rows → the report's normalised model. */
export function normaliseSupabaseRows({ documents = [], events = [], profiles = [], commissions = [], payments = [] }, { asOf } = {}) {
  const sales = documents.filter(isReportableSale)
  const orders = sales
    .map((doc) => ({
      id: doc.id,
      ...(({ day, source }) => ({ date: day, dateSource: source }))(orderDate(doc)),
      channel: doc.order_channel === 'b2c' ? 'B2C' : 'B2B',
      amount: netOrderAmount(doc),
      eventId: doc.event_id || null,
      agentId: doc.agent_id || null,
      // Only used to count distinct clients; never printed.
      clientKey: String(doc.client_company || doc.client_name || '').trim().toLowerCase() || null,
      // For the data checks (checks.js): the channel as stored, and what the
      // order lines add up to, to spot totals entered in cents or left at €0.
      rawChannel: doc.order_channel || null,
      lineTotal: round2((doc.metadata?.formState?.rows || []).reduce((t, r) => t + (Number(r?.total) || 0), 0)),
    }))
    .filter((o) => o.date)

  const orderById = new Map(orders.map((o) => [o.id, o]))

  // Earned commission is dated by the sale it was earned on, so it lands in
  // the same month as that sale. Bonuses have no order and use their own date.
  const earned = commissions
    .filter((c) => c.status !== 'cancelled')
    .map((c) => {
      const order = c.document_id ? orderById.get(c.document_id) : null
      if (c.document_id && !order) return null // commission on a non-sale (draft, deleted, excluded channel)
      return {
        id: c.id,
        agentId: c.agent_id,
        orderId: order ? order.id : null,
        date: order ? order.date : dayInBrussels(c.created_at),
        amount: round2(c.commission_amount),
      }
    })
    .filter((c) => c && c.date)

  const paid = payments
    // payment_date is a timestamp: take its day in Brussels, not in UTC, so a
    // payment made just after midnight on the 1st lands in the right month.
    .map((p) => ({ id: p.id, agentId: p.agent_id, date: dayInBrussels(p.payment_date), amount: round2(p.amount) }))
    .filter((p) => p.date)

  return {
    source: 'supabase',
    amountBasis: 'net_ex_vat',
    dataThrough: asOf || dayInBrussels(new Date().toISOString()),
    orders,
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.type === 'fair' ? 'fair' : 'other',
      startDate: e.start_date || null,
      endDate: e.end_date || null,
    })),
    agents: profiles.map((p) => ({ id: p.id, name: p.full_name || p.email || 'Unnamed agent' })),
    commissions: earned,
    payments: paid,
  }
}

/**
 * Build a service-role client from the environment and load everything.
 * The key is read from process.env and never printed.
 */
export async function loadFromSupabase({ client, asOf } = {}) {
  let sb = client
  if (!sb) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('No database access configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
    }
    const { createClient } = await import('@supabase/supabase-js')
    sb = createClient(url, key, { auth: { persistSession: false } })
  }
  return normaliseSupabaseRows(await fetchSupabaseRows(sb), { asOf })
}

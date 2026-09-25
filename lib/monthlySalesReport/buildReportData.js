/**
 * Pure: the normalised model + a month → every figure the email and the PDF
 * show. No database, no network, no dates read from the clock; the same input
 * always gives the same report.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const TREND_MONTHS = 12
export const CHART_AGENTS = 8
// Orders with no selling agent: LoveLab's own direct sales, online B2C, and
// fair orders taken at LoveLab's stand. Not missing data.
export const UNASSIGNED = { id: null, name: 'No agent (direct & online)' }

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const pad = (n) => String(n).padStart(2, '0')

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const i = y * 12 + (m - 1) + delta
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`
}

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

function lastDayOf(month) {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

const inMonth = (month) => (row) => row.date && row.date.startsWith(month)
const sum = (rows, pick = (r) => r.amount) => round2(rows.reduce((t, r) => t + (Number(pick(r)) || 0), 0))

function pctChange(now, before) {
  if (!before) return null // no base to compare against — shown as "—", never as +∞%
  return Math.round(((now - before) / before) * 1000) / 10
}

/**
 * @param {object} model  normalised data (see dataSources/)
 * @param {string} month  'YYYY-MM'
 */
export function buildReportData(model, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) throw new Error(`Month must be YYYY-MM with a real month (01–12), got "${month}"`)
  const { orders = [], events = [], agents = [], commissions = [], payments = [] } = model
  const prevMonth = shiftMonth(month, -1)

  const monthOrders = orders.filter(inMonth(month))
  const prevOrders = orders.filter(inMonth(prevMonth))
  const monthEarned = commissions.filter(inMonth(month))
  const monthPaid = payments.filter(inMonth(month))

  const b2b = sum(monthOrders.filter((o) => o.channel === 'B2B'))
  const b2c = sum(monthOrders.filter((o) => o.channel === 'B2C'))
  const sales = round2(b2b + b2c)
  const salesPrev = sum(prevOrders)

  // ── 12-month trend, clipped to where the data starts ──────────────────
  const firstDataMonth = orders.reduce((min, o) => (o.date && (!min || o.date < min) ? o.date : min), null)?.slice(0, 7) || month
  const trend = []
  for (let i = TREND_MONTHS - 1; i >= 0; i--) {
    const m = shiftMonth(month, -i)
    if (m < firstDataMonth) continue
    const rows = orders.filter(inMonth(m))
    const mb2b = sum(rows.filter((o) => o.channel === 'B2B'))
    const mb2c = sum(rows.filter((o) => o.channel === 'B2C'))
    const [, mm] = m.split('-').map(Number)
    trend.push({ month: m, label: SHORT[mm - 1], year: m.slice(0, 4), b2b: mb2b, b2c: mb2c, total: round2(mb2b + mb2c), isReportMonth: m === month })
  }

  // ── Year to date (calendar year of the report month) ──────────────────
  const year = month.slice(0, 4)
  const ytdOrders = orders.filter((o) => o.date && o.date.startsWith(year) && o.date.slice(0, 7) <= month)
  const ytd = { b2b: sum(ytdOrders.filter((o) => o.channel === 'B2B')), b2c: sum(ytdOrders.filter((o) => o.channel === 'B2C')) }

  // ── Agents ────────────────────────────────────────────────────────────
  const nameById = new Map(agents.map((a) => [a.id, a.name]))
  const byAgent = new Map()
  const row = (agentId) => {
    const key = agentId || null
    if (!byAgent.has(key)) {
      byAgent.set(key, {
        agentId: key,
        name: key ? nameById.get(key) || 'Unknown agent' : UNASSIGNED.name,
        orders: 0,
        sales: 0,
        commissionEarned: 0,
        commissionPaidOut: 0,
      })
    }
    return byAgent.get(key)
  }
  for (const o of monthOrders) { const r = row(o.agentId); r.orders += 1; r.sales += o.amount }
  for (const c of monthEarned) row(c.agentId).commissionEarned += c.amount
  for (const p of monthPaid) row(p.agentId).commissionPaidOut += p.amount

  const agentRows = [...byAgent.values()]
    .map((r) => ({
      ...r,
      sales: round2(r.sales),
      commissionEarned: round2(r.commissionEarned),
      commissionPaidOut: round2(r.commissionPaidOut),
      share: sales ? Math.round((r.sales / sales) * 1000) / 10 : 0,
    }))
    // Named agents by sales; the unassigned bucket always last.
    .sort((a, b) => (a.agentId === null) - (b.agentId === null) || b.sales - a.sales || a.name.localeCompare(b.name))

  const named = agentRows.filter((r) => r.agentId !== null && r.sales > 0)
  // The chart shows the top agents only. The rest are summed into a note, not
  // an "Other" bar: one bar holding twelve agents would dwarf every named one.
  const agentChart = named.slice(0, CHART_AGENTS).map((r) => ({ name: r.name, value: r.sales }))
  const rest = named.slice(CHART_AGENTS)
  const agentChartRest = rest.length ? { count: rest.length, value: round2(rest.reduce((t, r) => t + r.sales, 0)) } : null

  // ── Fairs ─────────────────────────────────────────────────────────────
  // Every number per fair: orders, distinct clients, average and biggest
  // order, revenue, the agent commission it costs, and what LoveLab keeps.
  // Commission is matched by order, whatever month it was booked in.
  const fairById = new Map(events.filter((e) => e.kind === 'fair').map((e) => [e.id, e]))
  const commissionByOrder = new Map()
  for (const c of commissions) if (c.orderId) commissionByOrder.set(c.orderId, (commissionByOrder.get(c.orderId) || 0) + c.amount)
  const monthEnd = lastDayOf(month)

  function fairStats(rows) {
    const byFair = new Map()
    for (const o of rows) {
      const fair = fairById.get(o.eventId)
      if (!fair) continue
      if (!byFair.has(fair.id)) byFair.set(fair.id, { fair, orders: [] })
      byFair.get(fair.id).orders.push(o)
    }
    return [...byFair.values()]
      .map(({ fair, orders: fo }) => {
        const sales = sum(fo)
        const commission = sum(fo, (o) => commissionByOrder.get(o.id) || 0)
        const clients = new Set(fo.map((o) => o.clientKey || o.id)).size
        return {
          eventId: fair.id,
          name: fair.name,
          startDate: fair.startDate || null,
          endDate: fair.endDate || null,
          orders: fo.length,
          clients,
          sales,
          avgOrder: fo.length ? round2(sales / fo.length) : 0,
          biggestOrder: round2(Math.max(0, ...fo.map((o) => o.amount))),
          agentOrders: fo.filter((o) => o.agentId).length,
          commission,
          net: round2(sales - commission),
        }
      })
      .sort((a, b) => b.sales - a.sales)
  }

  // Fairs with orders dated this month, each with its running total since the fair.
  const toDate = fairStats(orders.filter((o) => o.date && o.date <= monthEnd))
  const toDateById = new Map(toDate.map((f) => [f.eventId, f]))
  const fairRows = fairStats(monthOrders).map((f) => ({ ...f, salesToDate: toDateById.get(f.eventId)?.sales ?? f.sales, ordersToDate: toDateById.get(f.eventId)?.orders ?? f.orders }))
  // Every fair of the calendar year so far, with its total revenue.
  const fairsYear = fairStats(orders.filter((o) => o.date && o.date.startsWith(month.slice(0, 4)) && o.date <= monthEnd))

  // ── Headline figures ──────────────────────────────────────────────────
  const commissionEarned = sum(monthEarned)
  const commissionPaidOut = sum(monthPaid)
  const lastDay = lastDayOf(month)
  const partial = Boolean(model.dataThrough && model.dataThrough < lastDay && model.dataThrough.startsWith(month))
  const beforeData = Boolean(model.dataThrough && model.dataThrough < `${month}-01`)

  const notes = []
  if (!monthOrders.length) notes.push(`No sales recorded for ${monthLabel(month)}.`)
  if (partial) notes.push(`Partial month — data up to ${model.dataThrough}.`)
  if (beforeData) notes.push(`${monthLabel(month)} is after the last day with data (${model.dataThrough}).`)

  return {
    month,
    monthLabel: monthLabel(month),
    prevMonth,
    prevMonthLabel: monthLabel(prevMonth),
    source: model.source || 'unknown',
    isSample: model.source === 'sample',
    amountBasis: model.amountBasis || 'as_recorded',
    dataThrough: model.dataThrough || null,
    partial,
    kpis: {
      sales,
      salesPrev,
      salesChangePct: pctChange(sales, salesPrev),
      orders: monthOrders.length,
      b2b,
      b2c,
      b2bShare: sales ? Math.round((b2b / sales) * 1000) / 10 : 0,
      b2bOrders: monthOrders.filter((o) => o.channel === 'B2B').length,
      b2cOrders: monthOrders.filter((o) => o.channel === 'B2C').length,
      commissionEarned,
      commissionPaidOut,
      fairCount: fairRows.length,
      topFair: fairRows[0] || null,
    },
    trend,
    channelSplit: { month: { b2b, b2c }, ytd },
    agents: agentRows,
    agentChart,
    agentChartRest,
    topAgents: named.slice(0, 3),
    fairs: fairRows,
    fairsYear,
    notes,
  }
}

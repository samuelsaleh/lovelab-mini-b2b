/**
 * Pure: sanity checks run on every report before it is delivered.
 *
 * errors   — the report contradicts itself (totals that don't add up). It
 *            must not go to Sam and the executives; Rafi is alerted instead.
 * warnings — the report is consistent but the data behind it looks wrong or
 *            has changed shape (a €0 order, an amount 100× too small, an
 *            order channel the report doesn't know). It is delivered, and
 *            Rafi gets the list so someone can fix the data at the source.
 *
 * Messages carry amounts, dates and event names only — never client names.
 */

import { euro, euroCents } from './format.js'

/** Order channels the report understands. Anything else is counted as B2B and flagged. */
export const KNOWN_CHANNELS = ['b2b', 'b2c']

const close = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.05

export function checkReport(report, model) {
  const errors = []
  const warnings = []
  const k = report.kpis

  // ── Internal consistency: every total must agree with every other ──
  if (!close(k.b2b + k.b2c, k.sales)) errors.push(`B2B ${euro(k.b2b)} + B2C ${euro(k.b2c)} does not equal net sales ${euro(k.sales)}.`)
  const agentSales = report.agents.reduce((t, a) => t + a.sales, 0)
  if (!close(agentSales, k.sales)) errors.push(`The agents table adds up to ${euro(agentSales)}, not net sales ${euro(k.sales)}.`)
  const agentOrders = report.agents.reduce((t, a) => t + a.orders, 0)
  if (agentOrders !== k.orders) errors.push(`The agents table counts ${agentOrders} orders, not ${k.orders}.`)
  const agentOwed = report.agents.reduce((t, a) => t + a.commissionEarned, 0)
  if (!close(agentOwed, k.commissionEarned)) errors.push(`Commission owed per agent adds up to ${euro(agentOwed)}, not ${euro(k.commissionEarned)}.`)
  const trendMonth = report.trend.find((t) => t.isReportMonth)
  if (trendMonth && !close(trendMonth.total, k.sales)) errors.push(`The sales-by-month chart shows ${euro(trendMonth.total)} for ${report.monthLabel}, not ${euro(k.sales)}.`)
  for (const f of report.fairs) {
    if (!close(f.net, f.sales - f.commission)) errors.push(`${f.name}: “LoveLab keeps” is not revenue minus commission.`)
  }
  const fairSales = report.fairs.reduce((t, f) => t + f.sales, 0)
  if (fairSales - k.sales > 0.05) errors.push(`Fair revenue ${euro(fairSales)} is more than total net sales ${euro(k.sales)}.`)

  // ── Data quality for the month's orders ─────────────────────────────
  const orders = (model.orders || []).filter((o) => o.date && o.date.startsWith(report.month))
  const eventIds = new Set((model.events || []).map((e) => e.id))
  const agentIds = new Set((model.agents || []).map((a) => a.id))
  const eventName = new Map((model.events || []).map((e) => [e.id, e.name]))
  const where = (o) => `${o.date}${eventName.get(o.eventId) ? `, ${eventName.get(o.eventId)}` : ''}`

  const zero = orders.filter((o) => !(o.amount > 0))
  if (zero.length) warnings.push(`${zero.length} order(s) recorded at €0: ${zero.map(where).join('; ')}. They add nothing to the totals.`)

  const scaled = orders.filter((o) => o.amount > 0 && o.lineTotal > 0 && o.lineTotal >= o.amount * 20)
  if (scaled.length) {
    warnings.push(`${scaled.length} order(s) whose recorded total is far below their order lines — likely entered in cents instead of euros: ${scaled.map((o) => `${euroCents(o.amount)} recorded vs ${euro(o.lineTotal)} of lines (${where(o)})`).join('; ')}.`)
  }

  const unknownChannel = orders.filter((o) => o.rawChannel && !KNOWN_CHANNELS.includes(o.rawChannel))
  if (unknownChannel.length) {
    const kinds = [...new Set(unknownChannel.map((o) => o.rawChannel))]
    warnings.push(`New order channel(s) the report does not know: ${kinds.join(', ')} (${unknownChannel.length} order(s), counted as B2B). The report's rules may need updating.`)
  }

  const lostEvent = orders.filter((o) => o.eventId && !eventIds.has(o.eventId))
  if (lostEvent.length) warnings.push(`${lostEvent.length} order(s) point to a fair or folder that no longer exists.`)

  const lostAgent = new Set([...orders.map((o) => o.agentId), ...(model.commissions || []).filter((c) => c.date?.startsWith(report.month)).map((c) => c.agentId)].filter((id) => id && !agentIds.has(id)))
  if (lostAgent.size) warnings.push(`${lostAgent.size} agent(s) with sales or commission this month have no profile, so they show as “Unknown agent”.`)

  const unreadable = (model.orders || []).filter((o) => o.dateSource === 'typed_unreadable' && o.date && o.date.startsWith(report.month))
  if (unreadable.length) warnings.push(`${unreadable.length} order(s) have a typed date the report could not read, so they were placed by the day they were entered instead: ${unreadable.map(where).join('; ')}.`)

  const future = orders.filter((o) => model.dataThrough && o.date > model.dataThrough)
  if (future.length) warnings.push(`${future.length} order(s) dated after today (${future.map((o) => o.date).join(', ')}).`)

  const prev = (model.orders || []).filter((o) => o.date && o.date.startsWith(report.prevMonth))
  if (!orders.length && prev.length) warnings.push(`No sales at all this month, though ${report.prevMonthLabel} had ${prev.length} — check the data is still arriving.`)

  return { errors, warnings }
}

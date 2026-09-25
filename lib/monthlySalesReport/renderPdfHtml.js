/**
 * Pure: report data → the report as one phone-width page of HTML, charts
 * inline as SVG. htmlToPdf.js prints it as a single long PDF page (no page
 * breaks) exactly as wide as this layout, so on an iPhone it fills the screen
 * width with readable text and simply scrolls — an A4 sheet shrinks to fit
 * the screen and its tables become unreadable (Rafi, 25/09).
 *
 * Layout, one column, top to bottom: header · four headline figures (2×2) ·
 * sales by month · sales by agent · B2B vs B2C · agents table · this month's
 * fairs (one block each) · every fair of the year · footer.
 */

/** Page width in mm; htmlToPdf.js prints at exactly this width. */
export const PAGE_WIDTH_MM = 120

import { BRAND } from '../email-shell.js'
import { AMOUNT_BASIS_LABEL, change, cost, count, dateRange, escapeHtml, euro, pct } from './format.js'
import { CHART, horizontalBars, splitBars, stackedColumns } from './svgCharts.js'

const legend = `<span class="key"><i style="background:${CHART.b2b}"></i>B2B</span><span class="key"><i style="background:${CHART.b2c}"></i>B2C</span>`

function kpi(label, value, sub) {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`
}

/** Exact B2B / B2C / total per month, under the chart. */
function trendTable(report) {
  if (!report.trend.length) return ''
  const t = report.trend.reduce((a, m) => ({ b2b: a.b2b + m.b2b, b2c: a.b2c + m.b2c, total: a.total + m.total }), { b2b: 0, b2c: 0, total: 0 })
  const rows = report.trend
    .map(
      (m) => `<tr${m.isReportMonth ? ' class="this-month"' : ''}>
        <td>${m.label} ${m.year}</td>
        <td class="num">${euro(m.b2b)}</td>
        <td class="num">${euro(m.b2c)}</td>
        <td class="num strong">${euro(m.total)}</td>
      </tr>`,
    )
    .join('')
  return `<table class="trend">
    <thead><tr><th>Month</th><th class="num"><i class="sw" style="background:${CHART.b2b}"></i>B2B</th><th class="num"><i class="sw" style="background:${CHART.b2c}"></i>B2C</th><th class="num">Total</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total ${report.trend.length} months</td><td class="num">${euro(t.b2b)}</td><td class="num">${euro(t.b2c)}</td><td class="num">${euro(t.total)}</td></tr></tfoot>
  </table>`
}

function agentsTable(report) {
  if (!report.agents.length) return '<p class="empty">No agent activity this month.</p>'
  const t = report.agents.reduce(
    (s, a) => ({ orders: s.orders + a.orders, sales: s.sales + a.sales, earned: s.earned + a.commissionEarned, paid: s.paid + a.commissionPaidOut }),
    { orders: 0, sales: 0, earned: 0, paid: 0 },
  )
  const rows = report.agents
    .map(
      (a) => `<tr${a.agentId === null ? ' class="muted-row"' : ''}>
        <td>${escapeHtml(a.name)}<div class="sub">${pct(a.share)} of sales</div></td>
        <td class="num">${count(a.orders)}</td>
        <td class="num">${euro(a.sales)}</td>
        <td class="num cost">${cost(a.commissionEarned)}</td>
        <td class="num cost">${cost(a.commissionPaidOut)}</td>
      </tr>`,
    )
    .join('')
  return `<table>
    <thead><tr><th>Agent</th><th class="num">Orders</th><th class="num">Sales</th><th class="num">Owed to<br>agent</th><th class="num">Paid to<br>agent</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${count(t.orders)}</td><td class="num">${euro(t.sales)}</td><td class="num cost">${cost(t.earned)}</td><td class="num cost">${cost(t.paid)}</td></tr></tfoot>
  </table>
  <p class="table-note">Owed to agent = commission LoveLab owes on this month’s sales (a cost). Paid to agent = commission LoveLab actually paid this month (a cost).</p>`
}

function fairBlock(f, title) {
  const item = (label, value, extra = '') => `<div class="fi"><span>${label}</span><strong${extra}>${value}</strong></div>`
  return `<div class="fair">
    <div class="fair-head">${title}</div>
    <div class="fair-grid">
      ${item('Revenue', euro(f.sales))}
      ${item('LoveLab keeps', euro(f.net))}
      ${item('Commission owed to agents', cost(f.commission), ' class="cost"')}
      ${item('Orders', `${count(f.orders)}${f.agentOrders !== undefined ? ` <em>(${f.agentOrders ? `${count(f.agentOrders)} via agents` : 'no agents'})</em>` : ''}`)}
      ${item('Clients', count(f.clients))}
      ${item('Average order', euro(f.avgOrder))}
      ${f.biggestOrder !== undefined ? item('Biggest order', euro(f.biggestOrder)) : ''}
    </div>
  </div>`
}

function fairsTable(report) {
  if (!report.fairs.length) return '<p class="empty">No fairs this month.</p>'
  return report.fairs
    .map((f) => {
      const heldEarlier = f.startDate && f.startDate.slice(0, 7) < report.month
      const note = heldEarlier
        ? `<p class="fair-note">This fair was held ${escapeHtml(dateRange(f.startDate, f.endDate))}. The figures above are the orders from it dated in ${escapeHtml(report.monthLabel)}; the fair’s total so far is ${euro(f.salesToDate)} from ${count(f.ordersToDate)} orders.</p>`
        : f.salesToDate > f.sales + 0.005
          ? `<p class="fair-note">Fair total so far, all months: ${euro(f.salesToDate)} from ${count(f.ordersToDate)} orders.</p>`
          : ''
      return fairBlock(f, `${escapeHtml(f.name)}${f.startDate ? ` <span>${dateRange(f.startDate, f.endDate)}</span>` : ''}`).replace(/<\/div>\s*$/, `${note}</div>`)
    })
    .join('')
}

function fairsYearTable(report) {
  const fairs = report.fairsYear || []
  if (!fairs.length) return '<p class="empty">No fair orders yet this year.</p>'
  const t = fairs.reduce((a, f) => ({ orders: a.orders + f.orders, sales: a.sales + f.sales, commission: a.commission + f.commission, net: a.net + f.net }), { orders: 0, sales: 0, commission: 0, net: 0 })
  const rows = fairs
    .map(
      (f) => `<tr${report.fairs.some((m) => m.eventId === f.eventId) ? ' class="this-month"' : ''}>
        <td>${escapeHtml(f.name)}<div class="sub">${f.startDate ? `${dateRange(f.startDate, f.endDate)} · ` : ''}${count(f.clients)} client${f.clients === 1 ? '' : 's'}</div></td>
        <td class="num">${count(f.orders)}</td>
        <td class="num">${euro(f.sales)}</td>
        <td class="num cost">${cost(f.commission)}</td>
        <td class="num strong">${euro(f.net)}</td>
      </tr>`,
    )
    .join('')
  return `<table>
    <thead><tr><th>Fair</th><th class="num">Orders</th><th class="num">Revenue</th><th class="num">Owed to<br>agents</th><th class="num">LoveLab<br>keeps</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total ${escapeHtml(report.month.slice(0, 4))}</td><td class="num">${count(t.orders)}</td><td class="num">${euro(t.sales)}</td><td class="num cost">${cost(t.commission)}</td><td class="num">${euro(t.net)}</td></tr></tfoot>
  </table>`
}

/**
 * @param {object} report  from buildReportData
 * @param {object} [o]
 * @param {string} [o.logoSrc]      image src for the wordmark (data: URI when printing)
 * @param {string} [o.generatedAt]  shown in the footer
 */
export function renderPdfHtml(report, { logoSrc = '', generatedAt = '' } = {}) {
  const k = report.kpis
  const salesWord = report.amountBasis === 'net_ex_vat' ? 'Net sales' : 'Sales'
  const monthShort = report.monthLabel.split(' ')[0]
  const vsPrev = k.salesChangePct === null ? `no ${report.prevMonthLabel.split(' ')[0]} sales to compare` : `${change(k.salesChangePct)} vs ${report.prevMonthLabel.split(' ')[0]} (${euro(k.salesPrev)})`

  const kpis = [
    kpi(salesWord, euro(k.sales), `${vsPrev} · ${count(k.orders)} orders`),
    kpi('B2B / B2C', `${pct(k.b2bShare)} <span class="slash">/</span> ${pct(k.sales ? 100 - k.b2bShare : 0)}`, `${euro(k.b2b)} B2B (${count(k.b2bOrders)}) · ${euro(k.b2c)} B2C (${count(k.b2cOrders)})`),
    kpi('Agent commission · cost', `<span class="cost">${cost(k.commissionEarned)}</span>`, `LoveLab owes its agents this on ${monthShort} sales · ${k.commissionPaidOut ? `${cost(k.commissionPaidOut)} actually paid to agents in ${monthShort}` : `nothing paid to agents yet in ${monthShort}`}`),
    k.topFair
      ? `<div class="kpi"><div class="kpi-label">Fair revenue · ${escapeHtml(monthShort)}</div>${report.fairs
          .map((f) => `<div class="kpi-fair"><span>${escapeHtml(f.name)}</span><strong>${euro(f.sales)}</strong></div>`)
          .join('')}<div class="kpi-sub">each fair separately · details below</div></div>`
      : kpi('Fairs', '—', 'No fairs this month'),
  ].join('')

  const splitRows = [
    { label: monthShort, ...report.channelSplit.month },
    { label: `${report.month.slice(0, 4)} to date`, ...report.channelSplit.ytd },
  ]

  // The header already says "Partial month"; don't repeat it under the figures.
  const pageNotes = report.notes.filter((n) => !n.startsWith('Partial month'))
  const notes = pageNotes.length ? `<div class="notes">${pageNotes.map(escapeHtml).join(' · ')}</div>` : ''
  const sourceLabel = report.isSample ? 'SAMPLE DATA — invented numbers, not LoveLab’s' : report.source === 'supabase' ? 'LoveLab database (live)' : escapeHtml(report.source)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LoveLab — ${escapeHtml(report.monthLabel)} sales report</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: ${BRAND.text}; font-size: 8.4pt; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: ${PAGE_WIDTH_MM}mm; padding: 7mm 6mm 6mm; display: flex; flex-direction: column; gap: 3.2mm; position: relative; overflow: hidden; }
  header { border-bottom: 1px solid ${BRAND.line}; padding-bottom: 3mm; }
  header img { height: 7mm; width: auto; display: block; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: 16pt; line-height: 1.15; color: ${BRAND.plum}; margin: 2mm 0 1mm; }
  header .meta { font-size: 7.6pt; color: ${BRAND.muted}; }
  .sample-flag { display: inline-block; margin: 1.5mm 0; padding: 1mm 2.5mm; border: 1px solid #E8B45A; background: #FFF4E5; color: #8A5A00; font-weight: 700; letter-spacing: 0.08em; font-size: 7.6pt; border-radius: 2px; }
  .watermark { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%) rotate(-60deg); font-size: 34pt; font-weight: 800; color: rgba(176, 128, 40, 0.09); white-space: nowrap; pointer-events: none; z-index: 5; }
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 2.4mm; }
  .kpi { border: 1px solid ${BRAND.line}; border-radius: 3px; padding: 2.2mm 3mm; }
  .kpi-label { font-size: 6.8pt; letter-spacing: 0.07em; text-transform: uppercase; color: ${BRAND.muted}; }
  .kpi-value { font-family: Georgia, 'Times New Roman', serif; font-size: 15pt; line-height: 1.2; color: ${BRAND.heading}; }
  .kpi-value .slash { color: ${BRAND.line}; }
  .kpi-sub { font-size: 7.2pt; line-height: 1.35; color: ${BRAND.text}; }
  .card { border: 1px solid ${BRAND.line}; border-radius: 3px; padding: 2.6mm 3mm 2.2mm; }
  .card h2 { font-size: 7.6pt; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: ${BRAND.heading}; margin: 0 0 2mm; display: flex; justify-content: space-between; align-items: center; gap: 2mm; }
  .card svg { display: block; width: 100%; height: auto; }
  .key { font-weight: 400; text-transform: none; letter-spacing: 0; color: ${BRAND.text}; margin-left: 2mm; font-size: 7.2pt; white-space: nowrap; }
  .key i { display: inline-block; width: 2.4mm; height: 2.4mm; border-radius: 1px; margin-right: 1mm; vertical-align: -0.3mm; }
  table { width: 100%; border-collapse: collapse; font-size: 7.8pt; }
  th { text-align: left; font-weight: 600; font-size: 6.4pt; letter-spacing: 0.03em; text-transform: uppercase; color: ${BRAND.muted}; border-bottom: 1px solid ${BRAND.line}; padding: 0 1mm 1mm; vertical-align: bottom; }
  td { padding: 1.1mm 1mm; border-bottom: 1px solid #f3eef4; color: ${BRAND.heading}; vertical-align: top; }
  td .sub { font-size: 6.6pt; color: ${BRAND.muted}; }
  tfoot td { font-weight: 700; border-top: 1px solid ${BRAND.muted}; border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong { font-weight: 700; }
  .cost { color: #9A3B2E; }
  tr.this-month td { background: #FBF6FB; }
  .muted-row td { color: ${BRAND.muted}; font-style: italic; }
  .table-note, .chart-note { margin: 1.5mm 0 0; font-size: 6.6pt; color: ${BRAND.muted}; }
  .empty { color: ${BRAND.muted}; margin: 1mm 0; }
  .notes { color: #8A5A00; font-weight: 600; font-size: 7.6pt; }
  table.trend { margin-top: 2.5mm; }
  table.trend td { padding: 0.8mm 1mm; }
  .sw { display: inline-block; width: 2.2mm; height: 2.2mm; border-radius: 1px; margin-right: 1mm; vertical-align: -0.2mm; }
  .fair { border-top: 1px solid ${BRAND.line}; padding: 2mm 0 1.5mm; }
  .fair:first-child { border-top: none; padding-top: 0; }
  .fair.total { border-top: 1px solid ${BRAND.muted}; background: #FBF6FB; margin: 0 -3mm -2.2mm; padding: 2mm 3mm; }
  .kpi-fair { display: flex; justify-content: space-between; gap: 2mm; font-size: 8pt; color: ${BRAND.heading}; padding: 0.6mm 0; border-bottom: 1px dotted #eee4ef; }
  .kpi-fair strong { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; font-weight: 400; white-space: nowrap; }
  .fair-note { margin: 1.2mm 0 0; font-size: 6.8pt; color: #8A5A00; }
  .fair-head { font-weight: 700; font-size: 8.6pt; color: ${BRAND.heading}; margin-bottom: 1.2mm; }
  .fair-head span { font-weight: 400; font-size: 7pt; color: ${BRAND.muted}; margin-left: 1.5mm; }
  .fair-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8mm 4mm; }
  .fi { display: flex; justify-content: space-between; gap: 2mm; font-size: 7.6pt; border-bottom: 1px dotted #eee4ef; padding-bottom: 0.6mm; }
  .fi span { color: ${BRAND.muted}; }
  .fi strong { color: ${BRAND.heading}; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .fi strong.cost { color: #9A3B2E; }
  .fi em { font-style: normal; font-weight: 400; color: ${BRAND.muted}; font-size: 6.6pt; }
  footer { border-top: 1px solid ${BRAND.line}; padding-top: 2mm; font-size: 6.4pt; line-height: 1.45; color: ${BRAND.muted}; }
  footer .source { margin-top: 1.2mm; }
</style>
</head>
<body>
<div class="page">
  ${report.isSample ? '<div class="watermark">SAMPLE DATA — NOT REAL</div>' : ''}
  <header>
    ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="LoveLab">` : ''}
    <h1>${escapeHtml(report.monthLabel)} — sales report</h1>
    ${report.isSample ? '<div class="sample-flag">SAMPLE DATA — NOT REAL</div>' : ''}
    <div class="meta">${report.partial ? `<strong>Partial month</strong> · data to ${escapeHtml(report.dataThrough)} · ` : ''}Amounts ${AMOUNT_BASIS_LABEL[report.amountBasis] || ''}</div>
  </header>

  <section class="kpis">${kpis}</section>
  ${notes}

  <div class="card"><h2><span>Sales by month</span><span>${legend}</span></h2>${stackedColumns(report.trend, { width: 340, height: 160, labelAll: true })}${trendTable(report)}</div>
  <div class="card"><h2><span>Sales by agent · ${escapeHtml(monthShort)}</span></h2>${horizontalBars(report.agentChart, { width: 340, height: 140 })}${report.agentChartRest ? `<div class="chart-note">+ ${report.agentChartRest.count} more agent${report.agentChartRest.count > 1 ? 's' : ''} · ${euro(report.agentChartRest.value)} — full list in the table below</div>` : ''}</div>
  <div class="card"><h2><span>B2B vs B2C</span><span>${legend}</span></h2>${splitBars(splitRows, { width: 340 })}</div>

  <div class="card"><h2><span>Agents · ${escapeHtml(report.monthLabel)}</span></h2>${agentsTable(report)}</div>
  <div class="card"><h2><span>Fairs · ${escapeHtml(report.monthLabel)}</span></h2>${fairsTable(report)}</div>
  <div class="card"><h2><span>All fairs · ${escapeHtml(report.month.slice(0, 4))} to date</span><span class="key">shaded = had orders this month</span></h2>${fairsYearTable(report)}</div>

  <footer>
    Confirmed orders only: no drafts, quotes, deleted orders, samples, consignment or internal stock moves. An order belongs to the month of its order date (else the day it was entered). Commission is money LoveLab pays its agents, so it is shown as a cost (−): “owed” = due on this month’s sales, including bonuses, not necessarily paid yet; “paid” = actually transferred to agents this month. “LoveLab keeps” = fair revenue minus the agent commission on it (stand and travel costs are not recorded, so not deducted).
    <div class="source">Source: ${sourceLabel}${generatedAt ? ` · Generated ${escapeHtml(generatedAt)}` : ''}</div>
  </footer>
</div>
</body>
</html>`
}

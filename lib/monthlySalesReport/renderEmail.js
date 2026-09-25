/**
 * Pure: report data → the brief monthly email. Ten seconds of reading:
 * four figures, the top three agents, and a pointer to the PDF.
 * Built inside the shared LoveLab shell so it matches every other email.
 */

import { renderEmail as renderShell, BRAND, FONT_BODY, FONT_HEADING } from '../email-shell.js'
import { AMOUNT_BASIS_LABEL, change, cost, count, escapeHtml, euro, pct } from './format.js'

const SAMPLE_BANNER = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
  <td align="center" style="padding:10px 12px;background:#FFF4E5;border:1px solid #E8B45A;border-radius:4px;font-family:${FONT_BODY};font-size:13px;font-weight:700;letter-spacing:0.08em;color:#8A5A00;">SAMPLE DATA — NOT REAL</td>
</tr></table>`

function tile(label, value, sub) {
  return `<td width="50%" valign="top" style="padding:6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.line};border-radius:4px;"><tr>
      <td style="padding:14px 16px;font-family:${FONT_BODY};">
        <div style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">${label}</div>
        <div style="font-family:${FONT_HEADING};font-size:24px;line-height:1.3;color:${BRAND.heading};margin-top:4px;">${value}</div>
        <div style="font-size:13px;line-height:1.5;color:${BRAND.text};margin-top:2px;">${sub}</div>
      </td>
    </tr></table>
  </td>`
}

/**
 * @param {object} report  from buildReportData
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderMonthlyEmail(report, { siteUrl = '' } = {}) {
  const k = report.kpis
  const subject = `${report.isSample ? '[SAMPLE] ' : ''}LoveLab — ${report.monthLabel} sales`
  const salesWord = report.amountBasis === 'net_ex_vat' ? 'Net sales' : 'Sales'

  const vsPrev = k.salesChangePct === null ? `no sales in ${report.prevMonthLabel} to compare` : `${change(k.salesChangePct)} vs ${report.prevMonthLabel.split(' ')[0]}`
  // Each fair on its own line with its own revenue — never added together.
  const fairTile = k.topFair
    ? `<td width="50%" valign="top" style="padding:6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.line};border-radius:4px;"><tr>
      <td style="padding:14px 16px;font-family:${FONT_BODY};">
        <div style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">Fair revenue</div>
        ${report.fairs
          .map(
            (f) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>
          <td style="font-size:13px;line-height:1.4;color:${BRAND.text};">${escapeHtml(f.name)}</td>
          <td align="right" style="font-family:${FONT_HEADING};font-size:18px;color:${BRAND.heading};white-space:nowrap;">${euro(f.sales)}</td>
        </tr></table>`,
          )
          .join('')}
      </td>
    </tr></table>
  </td>`
    : tile('Fairs', '—', 'No fairs this month')

  const tiles = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
    <tr>
      ${tile(salesWord, euro(k.sales), `${vsPrev} · ${count(k.orders)} orders`)}
      ${tile('B2B / B2C', `${pct(k.b2bShare)} / ${pct(k.sales ? 100 - k.b2bShare : 0)}`, `${euro(k.b2b)} B2B · ${euro(k.b2c)} B2C`)}
    </tr>
    <tr>
      ${tile('Agent commission · cost', `<span style="color:#9A3B2E;">${cost(k.commissionEarned)}</span>`, `LoveLab owes its agents this on ${report.monthLabel.split(' ')[0]} sales<br>${k.commissionPaidOut ? `${cost(k.commissionPaidOut)} actually paid to agents this month` : 'nothing paid to agents yet this month'}`)}
      ${fairTile}
    </tr>
  </table>`

  const agents = report.topAgents.length
    ? `<p style="margin:20px 0 6px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">Top agents</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
       ${report.topAgents
         .map(
           (a, i) => `<tr>
             <td style="padding:6px 0;border-bottom:1px solid ${BRAND.line};font-family:${FONT_BODY};font-size:15px;color:${BRAND.heading};">${i + 1}. ${escapeHtml(a.name)}</td>
             <td align="right" style="padding:6px 0;border-bottom:1px solid ${BRAND.line};font-family:${FONT_BODY};font-size:15px;color:${BRAND.heading};">${euro(a.sales)} <span style="color:${BRAND.muted};font-size:13px;">· ${pct(a.share)}</span></td>
           </tr>`,
         )
         .join('')}
       </table>`
    : ''

  const notes = report.notes.length
    ? `<p style="margin:16px 0 0;font-size:13px;color:#8A5A00;">${report.notes.map(escapeHtml).join('<br>')}</p>`
    : ''

  const body = `${report.isSample ? SAMPLE_BANNER : ''}
    ${tiles}
    ${agents}
    ${notes}
    <p style="margin:22px 0 0;font-size:15px;">The full one-page report, with charts and every agent and fair, is attached as a PDF.</p>
    <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">Amounts ${AMOUNT_BASIS_LABEL[report.amountBasis] || ''}. Confirmed orders only (no drafts, quotes, samples or internal stock moves).</p>`

  const html = renderShell({
    title: `${report.monthLabel} sales`,
    preheader: `${salesWord} ${euro(k.sales)} (${vsPrev}) · B2B ${pct(k.b2bShare)} · ${k.fairCount ? `${k.fairCount} fair${k.fairCount > 1 ? 's' : ''}` : 'no fairs'}`,
    bodyHtml: body,
    siteUrl,
  })

  const text = [
    report.isSample ? 'SAMPLE DATA — NOT REAL\n' : '',
    `LoveLab — ${report.monthLabel} sales`,
    `${salesWord}: ${euro(k.sales)} (${vsPrev}), ${k.orders} orders`,
    `B2B ${euro(k.b2b)} (${pct(k.b2bShare)}) · B2C ${euro(k.b2c)}`,
    `Agent commission (cost to LoveLab): owes ${cost(k.commissionEarned)} on this month's sales · paid to agents this month ${k.commissionPaidOut ? cost(k.commissionPaidOut) : '€0'}`,
    ...(k.topFair ? report.fairs.map((f) => `Fair — ${f.name}: ${euro(f.sales)} revenue, LoveLab keeps ${euro(f.net)} after agent commission`) : ['Fairs: none this month']),
    ...report.topAgents.map((a, i) => `${i + 1}. ${a.name} — ${euro(a.sales)}`),
    '',
    'Full report attached (PDF).',
  ].join('\n')

  return { subject, html, text }
}

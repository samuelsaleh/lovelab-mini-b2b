/**
 * The three emails a movement sends, as pure functions of the movement.
 *
 *   igiRequestEmail      LoveLab asked → IGI  ("make these")
 *   lovelabIssuedEmail   IGI made → LoveLab   ("come and collect; N fewer than asked")
 *   igiShortReturnEmail  LoveLab counted fewer than IGI made → IGI ("check your side")
 *
 * Sam, 18 Sept 2026. Each is sent once, at the event, through lib/igi/notify.js.
 *
 * The two addressed to IGI carry IGI's figures and LoveLab's ask, and nothing
 * else: never the shelf, never how fast anything sells. The tests grep for
 * "shelf" to keep it that way. Same rule as igiLevelEmail in levelAlerts.js.
 */
import { formatQty, modelSpec, visitRef } from './derive'
import { renderEmail, emailButton } from '@/lib/email-shell'
import { shortOnIssue, shortOnReturn } from './shortfall'

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const RED = '#b3261e'

function cell(s, extra = '') {
  return `<td style="padding:8px 10px;border-bottom:1px solid #e6e0e6;font-size:14px;${extra}">${s}</td>`
}
function head(s, extra = '') {
  return `<th style="text-align:left;padding:6px 10px;color:#888;font-weight:normal;font-size:12px;${extra}">${s}</th>`
}
function modelCell(l) {
  return cell(`<b>${escapeHtml(l.name)}</b><br><span style="color:#666;font-size:12px">${escapeHtml(l.serial || '')} · ${escapeHtml(modelSpec(l))}</span>`)
}
function table(headers, rows) {
  return `<table style="border-collapse:collapse;width:100%">
      <thead><tr>${headers.map(([h, right]) => head(h, right ? 'text-align:right' : '')).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`
}
function paragraph(s) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${s}</p>`
}
function plural(n, one, many = `${one}s`) {
  return `${formatQty(n)} ${n === 1 ? one : many}`
}

/**
 * To IGI: LoveLab have asked. Lines carry qty_requested and `held` (IGI's
 * own stock right now), so a line asking for more than they hold says so.
 */
export function igiRequestEmail({ visit, lines, siteUrl = 'https://b2b-lovelab.com' }) {
  const total = lines.reduce((t, l) => t + (l.qty_requested ?? 0), 0)
  const ref = visitRef(visit)
  const anyShort = lines.some((l) => l.held != null && l.qty_requested > l.held)
  const subject = `LoveLab ask for ${plural(total, 'certificate')} — ${ref}`
  const rows = lines.map((l) => {
    const gap = l.held != null ? Math.max(0, l.qty_requested - l.held) : 0
    return `<tr>
      ${modelCell(l)}
      ${cell(`<b>${formatQty(l.qty_requested)}</b>`, 'text-align:right')}
      ${cell(l.held == null ? '—' : formatQty(l.held), 'text-align:right')}
      ${anyShort ? cell(gap > 0 ? `<b style="color:${RED}">${formatQty(gap)}</b>` : '', 'text-align:right') : ''}
    </tr>`
  })
  const headers = [['Model'], ['Asked', true], ['You hold', true], ...(anyShort ? [['Short by', true]] : [])]
  const bodyHtml = `
    ${paragraph(`LoveLab ask you for <b>${plural(total, 'certificate')}</b> on ${plural(lines.length, 'model')}. It is on your To do as <b>${ref}</b>.`)}
    ${anyShort ? paragraph(`<span style="color:${RED}">Some lines ask for more than you hold.</span> Make what you can and put the real number in — LoveLab will see it.`) : ''}
    ${visit.note ? paragraph(`<i>“${escapeHtml(visit.note)}”</i>`) : ''}
    ${table(headers, rows)}
    <div style="margin-top:18px">${emailButton(`${siteUrl}/igi`, 'Open your To do')}</div>
    <p style="margin:18px 0 0;font-size:13px;color:#555">Record what you made under the request; LoveLab are told the same minute.</p>`
  return { subject, html: renderEmail({ title: subject, preheader: `${plural(total, 'certificate')} on ${plural(lines.length, 'model')}`, bodyHtml, siteUrl }) }
}

/**
 * To LoveLab: IGI have recorded what they made. The "come and collect"
 * signal, with every line fewer than asked in red.
 */
export function lovelabIssuedEmail({ visit, lines, siteUrl = 'https://b2b-lovelab.com' }) {
  const made = lines.reduce((t, l) => t + (l.qty_issued ?? 0), 0)
  const fewer = shortOnIssue(lines)
  const shortLines = lines.filter((l) => l.qty_issued != null && l.qty_issued < l.qty_requested)
  const ref = visitRef(visit)
  const subject = fewer > 0
    ? `IGI made ${ref}: ${plural(made, 'certificate')} — ${plural(shortLines.length, 'model')} fewer than asked`
    : `IGI made ${ref}: ${plural(made, 'certificate')}`
  const rows = lines.map((l) => {
    const gap = Math.max(0, l.qty_requested - (l.qty_issued ?? 0))
    return `<tr>
      ${modelCell(l)}
      ${cell(formatQty(l.qty_requested), 'text-align:right')}
      ${cell(`<b>${formatQty(l.qty_issued ?? 0)}</b>`, 'text-align:right')}
      ${cell(gap > 0 ? `<b style="color:${RED}">${formatQty(gap)}</b>` : '', 'text-align:right')}
    </tr>`
  })
  const bodyHtml = `
    ${paragraph(`IGI recorded <b>${plural(made, 'certificate')}</b> made on <b>${ref}</b>. They are ready to collect.`)}
    ${fewer > 0
      ? paragraph(`<span style="color:${RED}"><b>${plural(fewer, 'certificate')} fewer than asked</b> on ${plural(shortLines.length, 'model')}.</span> Nothing is carried over: the shelf still reads low, so the Dashboard will ask again on its own.`)
      : paragraph('Everything asked for was made.')}
    ${table([['Model'], ['Asked', true], ['Made', true], ['Fewer by', true]], rows)}
    <div style="margin-top:18px">${emailButton(`${siteUrl}/certificates/visits/${visit.id}`, 'Open the movement')}</div>
    <p style="margin:18px 0 0;font-size:13px;color:#555">Confirm the return on the movement page once the certificates are on the shelf.</p>`
  return { subject, html: renderEmail({ title: subject, preheader: fewer > 0 ? `${plural(fewer, 'certificate')} fewer than asked` : 'Ready to collect', bodyHtml, siteUrl }) }
}

/**
 * To IGI: LoveLab counted fewer than IGI recorded making. Only the lines
 * that are short, so the reader knows exactly what to look for.
 */
export function igiShortReturnEmail({ visit, lines, siteUrl = 'https://b2b-lovelab.com' }) {
  const missing = shortOnReturn(lines)
  const shortLines = lines.filter((l) => l.qty_received != null && l.qty_received < (l.qty_issued ?? 0))
  const ref = visitRef(visit)
  const subject = `${ref} came back short: ${plural(missing, 'certificate')} missing`
  const rows = shortLines.map((l) => `<tr>
      ${modelCell(l)}
      ${cell(formatQty(l.qty_issued ?? 0), 'text-align:right')}
      ${cell(formatQty(l.qty_received), 'text-align:right')}
      ${cell(`<b style="color:${RED}">${formatQty((l.qty_issued ?? 0) - l.qty_received)}</b>`, 'text-align:right')}
    </tr>`)
  const bodyHtml = `
    ${paragraph(`On <b>${ref}</b> LoveLab counted <b style="color:${RED}">${plural(missing, 'certificate')} fewer</b> than you recorded making, on ${plural(shortLines.length, 'model')}. Please check your side today — they may still be with you.`)}
    ${table([['Model'], ['You made', true], ['LoveLab counted', true], ['Missing', true]], rows)}
    <div style="margin-top:18px">${emailButton(`${siteUrl}/igi/history`, 'Open your History')}</div>
    <p style="margin:18px 0 0;font-size:13px;color:#555">Your stock already came down by what you recorded making. If the missing ones are still with you, correct the figure on My stock.</p>`
  return { subject, html: renderEmail({ title: subject, preheader: `${plural(missing, 'certificate')} missing on ${ref}`, bodyHtml, siteUrl }) }
}

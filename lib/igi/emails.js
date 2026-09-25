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
 * "shelf" to keep it that way.
 *
 * Three more go out on a clock (Sam, 24 Sept 2026), built at the end of this
 * file: morningDigestEmail (Liuba, daily), igiWeeklyEmail (IGI, Fridays),
 * orderDigestEmail (Alberto, every second Friday). And igiNewModelEmail when
 * LoveLab add a model.
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
/**
 * The same cell for IGI's eyes: serial big, LoveLab's name small. IGI work
 * by serial number (Sam, 24 Sept 2026); our names mean little to them.
 */
function serialCell(l) {
  return cell(`<b style="font-family:'SF Mono',Menlo,monospace;font-size:15px">${escapeHtml(l.serial || 'no serial yet')}</b><br><span style="color:#666;font-size:12px">${escapeHtml(l.name)} · ${escapeHtml(modelSpec(l))}</span>`)
}
function h2(s) {
  return `<h2 style="margin:22px 0 8px;font-size:16px;color:#3b2f3f">${s}</h2>`
}
function small(s) {
  return `<p style="margin:18px 0 0;font-size:13px;color:#555">${s}</p>`
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
      ${serialCell(l)}
      ${cell(`<b>${formatQty(l.qty_requested)}</b>`, 'text-align:right')}
      ${cell(l.held == null ? '—' : formatQty(l.held), 'text-align:right')}
      ${anyShort ? cell(gap > 0 ? `<b style="color:${RED}">${formatQty(gap)}</b>` : '', 'text-align:right') : ''}
    </tr>`
  })
  const headers = [['Serial'], ['Asked', true], ['You hold', true], ...(anyShort ? [['Short by', true]] : [])]
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
      ${serialCell(l)}
      ${cell(formatQty(l.qty_issued ?? 0), 'text-align:right')}
      ${cell(formatQty(l.qty_received), 'text-align:right')}
      ${cell(`<b style="color:${RED}">${formatQty((l.qty_issued ?? 0) - l.qty_received)}</b>`, 'text-align:right')}
    </tr>`)
  const bodyHtml = `
    ${paragraph(`On <b>${ref}</b> LoveLab counted <b style="color:${RED}">${plural(missing, 'certificate')} fewer</b> than you recorded making, on ${plural(shortLines.length, 'model')}. Please check your side today — they may still be with you.`)}
    ${table([['Serial'], ['You made', true], ['LoveLab counted', true], ['Missing', true]], rows)}
    <div style="margin-top:18px">${emailButton(`${siteUrl}/igi/history`, 'Open your History')}</div>
    <p style="margin:18px 0 0;font-size:13px;color:#555">Your stock already came down by what you recorded making. If the missing ones are still with you, correct the figure on My stock.</p>`
  return { subject, html: renderEmail({ title: subject, preheader: `${plural(missing, 'certificate')} missing on ${ref}`, bodyHtml, siteUrl }) }
}

/**
 * To IGI: LoveLab added a model; it needs an IGI serial before anything
 * else can happen to it (Sam, 24 Sept 2026: "2 needs to be a bit clearer").
 */
export function igiNewModelEmail({ models, siteUrl = 'https://b2b-lovelab.com' }) {
  const n = models.length
  const subject = `New certificate model${n === 1 ? '' : 's'} from LoveLab: please give ${n === 1 ? 'it' : 'them'} an IGI serial`
  const rows = models.map((x) => `<tr>
      ${cell(`<b>${escapeHtml(x.name)}</b>`)}
      ${cell(escapeHtml(x.stones ?? ''), 'text-align:right')}
      ${cell(x.carat != null ? Number(x.carat).toFixed(2) : '', 'text-align:right')}
      ${cell(escapeHtml(x.shape ?? ''), 'text-align:right')}
    </tr>`)
  const bodyHtml = `
    ${paragraph(`LoveLab have added <b>${n} new certificate model${n === 1 ? '' : 's'}</b> to their range. Before LoveLab can ask you for certificates on ${n === 1 ? 'it' : 'them'}, each needs its <b>IGI serial number</b> (like LGAJ6530), the way every existing model has one.`)}
    ${table([['Model'], ['Stones', true], ['Carat', true], ['Shape', true]], rows)}
    <p style="margin:16px 0 14px;font-size:15px;line-height:1.5"><b>What to do:</b> open your To do, find the model under <b>Give a serial</b>, type the serial you assign, press <b>Confirm serial</b>. That is all: LoveLab see it the same minute.</p>
    <div style="margin-top:4px">${emailButton(`${siteUrl}/igi`, 'Open your To do')}</div>`
  return { subject, html: renderEmail({ title: `${n} new model${n === 1 ? '' : 's'} to number`, preheader: models.map((x) => `${x.name} ${x.carat != null ? Number(x.carat).toFixed(2) : ''} ct`).join(', '), bodyHtml, siteUrl }) }
}

// ── The three scheduled mails (Sam, 24 Sept 2026) ───────────────────────────
// Each returns { subject, html, empty }; `empty` says there was nothing to
// say, and the runner decides whether an empty mail still goes (the morning
// one does, the other two do not).

const RED_B = (s) => `<b style="color:${RED}">${s}</b>`

function whenAgo(iso, now) {
  if (!iso) return ''
  const days = Math.floor((new Date(now) - new Date(iso)) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/**
 * Every morning to Liuba: what to go and collect at IGI, and what is ready
 * there. Nothing about ordering — that is Alberto's mail.
 * `collect`: models with shelf_status 'collect' carrying shelf, shelf_min and
 * `ask` (suggestedAsk). `ready`: movements in status issued.
 */
export function morningDigestEmail({ collect = [], ready = [], now = new Date().toISOString(), siteUrl = 'https://b2b-lovelab.com' }) {
  const n = collect.length
  const empty = n === 0 && ready.length === 0
  const subject = n > 0
    ? `Certificates this morning: ${plural(n, 'model')} to collect at IGI`
    : ready.length > 0
      ? `Certificates this morning: nothing below the level, ${plural(ready.length, 'movement')} ready at IGI`
      : 'Certificates this morning: nothing to collect'
  const rows = collect.map((m) => `<tr>
      ${modelCell(m)}
      ${cell(RED_B(formatQty(m.shelf)), 'text-align:right')}
      ${cell(formatQty(m.shelf_min ?? 25), 'text-align:right')}
      ${cell(`<b>${formatQty(m.ask)}</b>`, 'text-align:right')}
    </tr>`)
  const readyLines = ready.map((v) => {
    const made = v.lines.reduce((t, l) => t + (l.qty_issued ?? 0), 0)
    return `<p style="margin:6px 0 0;font-size:14px"><span style="color:#666">Ready to collect at IGI:</span> <b>${visitRef(v)}</b>, ${plural(made, 'certificate')}, made ${whenAgo(v.issued_at, now)}.</p>`
  }).join('')
  const bodyHtml = empty
    ? paragraph('Nothing is below the shelf level and nothing is waiting at IGI. Nothing to do today.')
    : `
    ${n > 0 ? `${h2('Go collect').replace('margin:22px 0 8px', 'margin:0 0 8px')}
    ${table([['Model'], ['On the shelf', true], ['Level', true], ['Ask IGI for', true]], rows)}` : ''}
    ${readyLines ? `<div style="margin-top:${n > 0 ? 16 : 0}px">${readyLines}</div>` : ''}
    <div style="margin-top:18px">${emailButton(`${siteUrl}/certificates`, 'Open the Dashboard')}</div>
    ${small('Every morning at 07:00, the Dashboard as it stands.')}`
  return { subject, empty, html: renderEmail({ title: subject, bodyHtml, siteUrl }) }
}

/**
 * Every Friday at 14:00 to IGI: three tables — what to produce, the requests
 * waiting for them line by line, the models to number. Serial first.
 */
export function igiWeeklyEmail({ produce = [], requests = [], toNumber = [], now = new Date().toISOString(), siteUrl = 'https://b2b-lovelab.com' }) {
  const empty = produce.length === 0 && requests.length === 0 && toNumber.length === 0
  const parts = []
  if (produce.length) parts.push(plural(produce.length, 'model') + ' to produce')
  if (requests.length) parts.push(plural(requests.length, 'request') + ' waiting')
  if (toNumber.length) parts.push(plural(toNumber.length, 'model') + ' to number')
  const subject = empty ? 'This week: nothing waiting for you' : `This week: ${parts.join(', ')}`
  let sectionNo = 0
  const section = (title) => h2(`${++sectionNo}. ${title}`).replace(sectionNo === 1 ? 'margin:22px 0 8px' : 'never', 'margin:0 0 8px')
  const produceRows = produce.map((m) => `<tr>
      ${serialCell(m)}
      ${cell(RED_B(formatQty(m.pool)), 'text-align:right')}
      ${cell(formatQty(m.order_min), 'text-align:right')}
      ${cell(RED_B(formatQty(m.order_min - m.pool)), 'text-align:right')}
    </tr>`)
  const requestRows = requests.flatMap((v) => v.lines.map((l, i) => `<tr>
      ${cell(i === 0 ? `<b>${visitRef(v)}</b><br><span style="color:#666;font-size:12px">asked ${whenAgo(v.requested_at || v.visit_date, now)}</span>` : '')}
      ${serialCell(l)}
      ${cell(`<b>${formatQty(l.qty_requested)}</b>`, 'text-align:right')}
    </tr>`))
  const numberRows = toNumber.map((x) => `<tr>
      ${cell(`<b>${escapeHtml(x.name)}</b><br><span style="color:#666;font-size:12px">no serial yet</span>`)}
      ${cell(escapeHtml(x.stones ?? ''), 'text-align:right')}
      ${cell(x.carat != null ? Number(x.carat).toFixed(2) : '', 'text-align:right')}
      ${cell(escapeHtml(x.shape ?? ''), 'text-align:right')}
    </tr>`)
  const bodyHtml = `
    ${produce.length ? `${section('Produce more')}${table([['Serial'], ['You hold', true], ['LoveLab want at least', true], ['Short by', true]], produceRows)}` : ''}
    ${requests.length ? `${section('Requests waiting for you')}${table([['Request'], ['Serial'], ['Asked', true]], requestRows)}` : ''}
    ${toNumber.length ? `${section('New models to number')}${table([['Model'], ['Stones', true], ['Carat', true], ['Shape', true]], numberRows)}` : ''}
    <div style="margin-top:18px">${emailButton(`${siteUrl}/igi`, 'Open your To do')}</div>
    ${small('Every Friday at 14:00, only when something is waiting. Record what you make under Add a batch; answer a request under the request itself.')}`
  return { subject, empty, html: renderEmail({ title: subject, bodyHtml, siteUrl }) }
}

/**
 * Every second Friday to Alberto: the models IGI hold fewer of than the
 * level, and what is waiting on IGI.
 */
export function orderDigestEmail({ order = [], waiting = [], now = new Date().toISOString(), siteUrl = 'https://b2b-lovelab.com' }) {
  const empty = order.length === 0
  const subject = empty
    ? 'Certificates to order at IGI: nothing below the level'
    : `Certificates to order at IGI: ${plural(order.length, 'model')} below the level`
  const rows = order.map((m) => `<tr>
      ${modelCell(m)}
      ${cell(RED_B(formatQty(m.pool)), 'text-align:right')}
      ${cell(formatQty(m.order_min), 'text-align:right')}
      ${cell(RED_B(formatQty(m.order_min - m.pool)), 'text-align:right')}
    </tr>`)
  const waitingLines = waiting.map((v) => {
    const asked = v.lines.reduce((t, l) => t + (l.qty_requested ?? 0), 0)
    return `<p style="margin:6px 0 0;font-size:14px"><span style="color:#666">Waiting on IGI:</span> <b>${visitRef(v)}</b>, ${plural(asked, 'certificate')}, asked ${whenAgo(v.requested_at || v.visit_date, now)}.</p>`
  }).join('')
  const bodyHtml = `
    ${paragraph('Every second Friday: the models IGI hold fewer of than the level we set. IGI have the same list on their To do and in their Friday mail.')}
    ${table([['Model'], ['IGI hold', true], ['Must hold', true], ['Short by', true]], rows)}
    ${waitingLines ? `<div style="margin-top:16px">${waitingLines}</div>` : ''}
    <div style="margin-top:18px">${emailButton(`${siteUrl}/certificates`, 'Open the Dashboard')}</div>
    ${small('Every two weeks, Friday 14:00. Nothing is sent when no model is below its level.')}`
  return { subject, empty, html: renderEmail({ title: subject, bodyHtml, siteUrl }) }
}

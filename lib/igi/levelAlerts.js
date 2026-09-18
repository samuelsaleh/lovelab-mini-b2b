/**
 * The emails that say a certificate model has fallen below a level.
 *
 * Sam, 10 Sept 2026: "we want to be alerted as well, so we can order new ones
 * with them if they don't react". Two of LoveLab's levels can be crossed:
 *
 *   shelf below shelf_min  → go collect (IGI already hold them)
 *   IGI's stock below order_min → order production from IGI
 *
 * Sam, 16 Sept 2026: IGI must be warned too. The second crossing also goes to
 * IGI's own users, in a separate email that carries their stock and the level
 * LoveLab want — never a shelf figure. Until IGI have an account there is
 * nobody to send it to, and it is skipped.
 *
 * Each crossing is announced once. igi_models.shelf_alerted_at and
 * order_alerted_at remember that the emails went out; they are cleared when
 * the figure is back above the level, so the next crossing is announced
 * again. Nothing is repeated every night while a model stays low — the
 * dashboard shows that.
 *
 * Runs after the nightly shelf read (app/api/cron/igi-stock). Pure parts are
 * separated so the arithmetic is testable without a database or a mailbox.
 */
import { poolOf, shelfOf, shelfStatus, orderStatus, formatQty, modelSpec } from './derive'
import { sendEmail as defaultSendEmail } from '@/lib/send-email'
import { getSenderFrom, getOrderNotificationRecipients, getAdminNotificationRecipients } from '@/lib/email'
import { renderEmail } from '@/lib/email-shell'

/** Which models crossed a level since the last email, and which came back. */
export function levelBreaches(models) {
  const shelf = []
  const order = []
  const recovered = { shelf: [], order: [] }
  for (const m of models) {
    if (m.state !== 'in_use') continue
    const shelfLow = m.shelf_status === 'collect'
    const orderLow = m.order_status === 'order'
    if (shelfLow && !m.shelf_alerted_at) shelf.push(m)
    if (!shelfLow && m.shelf_alerted_at) recovered.shelf.push(m)
    if (orderLow && !m.order_alerted_at) order.push(m)
    if (!orderLow && m.order_alerted_at) recovered.order.push(m)
  }
  return { shelf, order, recovered }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function rows(list, valueOf, levelOf) {
  return list.map((m) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${escapeHtml(m.name)}</b><br><span style="color:#666;font-size:12px">${escapeHtml(m.serial || '')} · ${escapeHtml(modelSpec(m))}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#b3261e"><b>${formatQty(valueOf(m))}</b></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#666">${formatQty(levelOf(m))}</td>
    </tr>`).join('')
}

/** Subject and body of the one email, from the breaches. */
export function levelAlertEmail({ shelf, order }, siteUrl = 'https://b2b-lovelab.com') {
  const parts = []
  if (shelf.length) parts.push(`${shelf.length} model${shelf.length === 1 ? '' : 's'} to collect`)
  if (order.length) parts.push(`${order.length} to order from IGI`)
  const subject = `Certificates: ${parts.join(', ')}`

  const section = (title, hint, list, valueHead, valueOf, levelOf) => list.length ? `
    <h3 style="margin:22px 0 6px;font-size:15px">${title}</h3>
    <p style="margin:0 0 8px;color:#555;font-size:13px">${hint}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr>
        <th style="text-align:left;padding:6px 10px;color:#888;font-weight:normal;font-size:12px">Model</th>
        <th style="text-align:right;padding:6px 10px;color:#888;font-weight:normal;font-size:12px">${valueHead}</th>
        <th style="text-align:right;padding:6px 10px;color:#888;font-weight:normal;font-size:12px">Your level</th>
      </tr></thead>
      <tbody>${rows(list, valueOf, levelOf)}</tbody>
    </table>` : ''

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:640px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#888">LoveLab · Certificates</p>
    <h2 style="margin:0 0 12px;font-size:19px">${escapeHtml(subject.replace('Certificates: ', ''))}</h2>
    ${section('Go collect', 'Below your alert level on the shelf. IGI already hold them — it is a walk across the road.', shelf, 'On the shelf', (m) => m.shelf, (m) => m.shelf_min ?? 25)}
    ${section('Order from IGI', 'IGI hold fewer than your level for them. Ask them to produce more.', order, 'IGI hold', (m) => m.pool, (m) => m.order_min)}
    <p style="margin:22px 0 0;font-size:13px;color:#555">
      Open the dashboard to send the request in one click: <a href="${siteUrl}/certificates">${siteUrl}/certificates</a><br>
      You get this once per crossing. It will not repeat while the figure stays low.
    </p>
  </div>`
  return { subject, html }
}

/**
 * The email IGI's users get for the same crossing: what they hold against
 * the level LoveLab want. Built on the shared shell like every other
 * automatic email, and deliberately blind to the shelf.
 */
export function igiLevelEmail(order, siteUrl = 'https://b2b-lovelab.com') {
  const n = order.length
  const subject = `LoveLab need more of ${n} model${n === 1 ? '' : 's'}`
  const cell = (s, extra = '') => `<td style="padding:8px 10px;border-bottom:1px solid #e6e0e6;font-size:14px;${extra}">${s}</td>`
  const rows = order.map((m) => `
    <tr>
      ${cell(`<b>${escapeHtml(m.name)}</b><br><span style="color:#666;font-size:12px">${escapeHtml(m.serial || '')} · ${escapeHtml(modelSpec(m))}</span>`)}
      ${cell(`<b style="color:#b3261e">${formatQty(m.pool)}</b>`, 'text-align:right')}
      ${cell(formatQty(m.order_min), 'text-align:right')}
      ${cell(formatQty(m.order_min - m.pool), 'text-align:right;color:#b3261e')}
    </tr>`).join('')
  const head = (s, extra = '') => `<th style="text-align:left;padding:6px 10px;color:#888;font-weight:normal;font-size:12px;${extra}">${s}</th>`
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.5">You hold fewer than LoveLab want you to keep on ${n === 1 ? 'this model' : 'these models'}. It is on your To do as <b>Produce more</b>.</p>
    <table style="border-collapse:collapse;width:100%">
      <thead><tr>${head('Model')}${head('You hold', 'text-align:right')}${head('LoveLab want at least', 'text-align:right')}${head('Short by', 'text-align:right')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:18px 0 0;font-size:13px;color:#555">
      Open your To do: <a href="${siteUrl}/igi" style="color:#5D3A5E">${siteUrl}/igi</a><br>
      You get this once per crossing. It will not repeat while the figure stays low.
    </p>`
  return { subject, html: renderEmail({ title: subject, preheader: `${n} model${n === 1 ? '' : 's'} below the level LoveLab want`, bodyHtml, siteUrl }) }
}

/** IGI's users: every profile flagged is_igi with an email. None until Michael has an account. */
export async function loadIgiRecipients(adminSupabase) {
  const { data, error } = await adminSupabase.from('profiles').select('email').eq('is_igi', true)
  if (error) throw new Error(error.message)
  return [...new Set((data || []).map((p) => String(p.email || '').trim().toLowerCase()).filter(Boolean))]
}

/** Reads the models with both figures and both statuses, as the overview does. */
export async function loadModelsWithStatus(adminSupabase) {
  const [models, batches, lines, snapshots, counts] = await Promise.all([
    adminSupabase.from('igi_models')
      .select('id, serial, name, stones, carat, shape, spec, state, shelf_min, order_min, shelf_alerted_at, order_alerted_at, sort_order')
      .order('sort_order', { ascending: true }),
    adminSupabase.from('igi_batches').select('model_id, qty'),
    adminSupabase.from('igi_visit_lines').select('model_id, qty_issued'),
    adminSupabase.from('igi_shelf_snapshots').select('snapshot_date, model_id, total_pcs').order('snapshot_date', { ascending: false }).limit(400),
    adminSupabase.from('igi_counts').select('model_id, delta'),
  ])
  const firstError = [models, batches, lines, snapshots, counts].find((r) => r.error)?.error
  if (firstError) throw new Error(firstError.message)

  return models.data.map((m) => {
    const pool = m.state === 'in_use' ? poolOf(m.id, batches.data, lines.data, counts.data) : null
    const shelf = shelfOf(m.id, snapshots.data)
    return { ...m, pool, shelf, shelf_status: shelfStatus(m, shelf), order_status: orderStatus(m, pool) }
  })
}

/**
 * Check every level, email LoveLab about new crossings — and IGI about the
 * ones on their stock — then remember that it was sent. Returns what happened
 * so the cron can report it.
 *
 * The stamp goes on only once every email that was due has gone. If IGI's
 * copy fails, LoveLab's repeats the next night, which is the visible sign
 * that something is wrong rather than a warning silently lost.
 */
export async function runLevelAlerts(adminSupabase, deps = {}) {
  const sendEmail = deps.sendEmail || defaultSendEmail
  const now = deps.now ? new Date(deps.now) : new Date()
  const siteUrl = deps.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://b2b-lovelab.com'

  const models = deps.models || await loadModelsWithStatus(adminSupabase)
  const breaches = levelBreaches(models)
  const summary = {
    emailed: false,
    igi_emailed: false,
    shelf: breaches.shelf.map((m) => m.id),
    order: breaches.order.map((m) => m.id),
    recovered: breaches.recovered.shelf.length + breaches.recovered.order.length,
    recipients: [],
    igi_recipients: [],
  }

  // Back above the level: forget the alert so the next crossing is announced.
  const stamp = async (ids, patch) => {
    if (!ids.length) return
    const { error } = await adminSupabase.from('igi_models').update(patch).in('id', ids)
    if (error) throw new Error(error.message)
  }
  await stamp(breaches.recovered.shelf.map((m) => m.id), { shelf_alerted_at: null })
  await stamp(breaches.recovered.order.map((m) => m.id), { order_alerted_at: null })

  if (!breaches.shelf.length && !breaches.order.length) return summary

  const recipients = [...new Set([
    ...(deps.recipients || [...getOrderNotificationRecipients(), ...getAdminNotificationRecipients()]),
  ].filter(Boolean))]
  summary.recipients = recipients
  if (!recipients.length) {
    summary.reason = 'no_recipients'
    return summary
  }

  const { subject, html } = levelAlertEmail(breaches, siteUrl)
  const result = await sendEmail({ from: getSenderFrom(), to: recipients, subject, html })
  if (!result?.sent) {
    summary.reason = result?.reason || 'send_failed'
    return summary
  }
  summary.emailed = true

  // IGI's copy, for the crossings on their stock. No account yet means no one
  // to tell, and that is not a failure.
  if (breaches.order.length) {
    const igiRecipients = deps.igiRecipients !== undefined
      ? deps.igiRecipients
      : await loadIgiRecipients(adminSupabase)
    summary.igi_recipients = igiRecipients
    if (igiRecipients.length) {
      const igi = igiLevelEmail(breaches.order, siteUrl)
      const igiResult = await sendEmail({ from: getSenderFrom(), to: igiRecipients, subject: igi.subject, html: igi.html })
      if (!igiResult?.sent) {
        summary.igi_reason = igiResult?.reason || 'send_failed'
        return summary
      }
      summary.igi_emailed = true
    }
  }

  const at = now.toISOString()
  await stamp(breaches.shelf.map((m) => m.id), { shelf_alerted_at: at })
  await stamp(breaches.order.map((m) => m.id), { order_alerted_at: at })
  return summary
}

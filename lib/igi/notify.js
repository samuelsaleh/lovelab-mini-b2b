/**
 * Telling the other side of the road what just happened.
 *
 * Sam, 18 Sept 2026: "michael@igi.org receives an email when we send an
 * order, and I receive an error if the email failed." And on short
 * deliveries: tell people at the two moments it matters, carry nothing.
 *
 *   notifyIgiOfRequest      LoveLab asked            → IGI's addresses
 *   notifyLovelabOfIssue    IGI recorded what they made → LoveLab's
 *   notifyIgiOfShortReturn  LoveLab counted fewer than IGI made → IGI's
 *
 * IGI's addresses are every login flagged is_igi plus every address in
 * IGI_EMAILS (Sam chose both, so Michael is reached before he has a login).
 * LoveLab's are the order and admin notification lists.
 *
 * None of these throws and none of them can fail the movement they report
 * on. The first one is the one that must not go quietly wrong: it stamps
 * igi_visits.notified_at on success and notify_error on failure (the
 * movement page shows either, with a "Send the email again" button), and a
 * failure also emails LoveLab's admins and records a health event. The other
 * two record a health event and stop; their recipient is LoveLab in one
 * case and a courtesy in the other.
 *
 * Every dependency can be injected, so the tests run without a mailbox.
 */
import { sendEmail as defaultSendEmail } from '@/lib/send-email'
import { getSenderFrom, getOrderNotificationRecipients, getAdminNotificationRecipients } from '@/lib/email'
import { getIgiEmails } from '@/lib/auth/igiEmails'
import { recordHealthEvent as defaultHealth } from '@/lib/healthEvent'
import { poolOf, visitRef } from './derive'
import { shortOnReturn } from './shortfall'
import { igiRequestEmail, lovelabIssuedEmail, igiShortReturnEmail, igiNewModelEmail } from './emails'

function dedupe(list) {
  return [...new Set(list.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))]
}

/** IGI's logins: every profile flagged is_igi with an email. */
export async function loadIgiRecipients(adminSupabase) {
  const { data, error } = await adminSupabase.from('profiles').select('email').eq('is_igi', true)
  if (error) throw new Error(error.message)
  return dedupe((data || []).map((p) => p.email))
}

/** Every IGI login, plus every address named in IGI_EMAILS. */
export async function igiRecipients(db, env = process.env) {
  let logins = []
  try {
    logins = await loadIgiRecipients(db)
  } catch {
    // An unreadable profiles table must not stop the email: the env list still stands.
  }
  return dedupe([...logins, ...getIgiEmails(env)])
}

/** LoveLab's own people: whoever gets order notices, plus the admins. */
export function lovelabRecipients() {
  return dedupe([...getOrderNotificationRecipients(), ...getAdminNotificationRecipients().all])
}

/** Why a send failed, in one line a person can act on. */
export function describeFailure(result) {
  if (!result) return 'No answer from the email service'
  if (result.reason === 'no_api_key') return 'Email is not configured on this server (no RESEND_API_KEY)'
  if (result.reason === 'no_recipients') return 'No IGI address to send to'
  const status = result.status ? ` (HTTP ${result.status})` : ''
  const detail = result.error ? `: ${String(result.error).slice(0, 200)}` : ''
  return `${result.reason || 'send_failed'}${status}${detail}`
}

/** One movement with its lines and models, as the emails need them. */
async function loadVisitForEmail(db, visitId) {
  const { data: visit, error: visitErr } = await db
    .from('igi_visits')
    .select('id, visit_no, visit_date, status, note')
    .eq('id', visitId)
    .maybeSingle()
  if (visitErr) throw new Error(visitErr.message)
  if (!visit) throw new Error('Movement not found')

  const [lines, models, batches, allLines, counts] = await Promise.all([
    db.from('igi_visit_lines').select('id, model_id, qty_requested, qty_issued, qty_received').eq('visit_id', visitId),
    db.from('igi_models').select('id, serial, name, stones, carat, shape'),
    db.from('igi_batches').select('model_id, qty'),
    db.from('igi_visit_lines').select('model_id, qty_issued'),
    db.from('igi_counts').select('model_id, delta'),
  ])
  for (const r of [lines, models, batches, allLines, counts]) {
    if (r.error) throw new Error(r.error.message)
  }
  const byId = new Map((models.data || []).map((m) => [m.id, m]))
  return {
    visit,
    lines: (lines.data || []).map((l) => {
      const m = byId.get(l.model_id) || {}
      return {
        ...l,
        serial: m.serial ?? null,
        name: m.name ?? 'Unknown model',
        stones: m.stones ?? null,
        carat: m.carat ?? null,
        shape: m.shape ?? null,
        held: poolOf(l.model_id, batches.data || [], allLines.data || [], counts.data || []),
      }
    }),
  }
}

async function stamp(db, visitId, patch) {
  try {
    await db.from('igi_visits').update(patch).eq('id', visitId)
  } catch {
    // The stamp is bookkeeping; the email result is what the caller reports.
  }
}

/**
 * LoveLab asked: email IGI. Returns { sent, reason?, recipients, notified_at? }.
 */
export async function notifyIgiOfRequest(db, { visitId, siteUrl }, deps = {}) {
  const send = deps.sendEmail || defaultSendEmail
  const health = deps.recordHealthEvent || defaultHealth
  const now = deps.now || new Date().toISOString()
  let visit = null
  try {
    const loaded = await loadVisitForEmail(db, visitId)
    visit = loaded.visit
    const recipients = deps.recipients || await igiRecipients(db, deps.env)
    if (!recipients.length) {
      await stamp(db, visitId, { notify_error: describeFailure({ reason: 'no_recipients' }) })
      return { sent: false, reason: 'no_recipients', recipients: [] }
    }

    const { subject, html } = igiRequestEmail({ visit, lines: loaded.lines, siteUrl })
    const result = await send({ to: recipients, subject, html, from: getSenderFrom('LoveLab certificates') })

    if (result?.sent) {
      await stamp(db, visitId, { notified_at: now, notify_error: null })
      return { sent: true, recipients, notified_at: now }
    }

    const why = describeFailure(result)
    await stamp(db, visitId, { notify_error: why })
    await tellAdmins({ send, health, visit, why, siteUrl, recipients })
    return { sent: false, reason: result?.reason || 'send_failed', error: why, recipients }
  } catch (err) {
    const why = err?.message || 'Could not build the email'
    await stamp(db, visitId, { notify_error: why })
    await tellAdmins({ send: deps.sendEmail || defaultSendEmail, health, visit: visit || { id: visitId, visit_no: '?' }, why, siteUrl, recipients: [] })
    return { sent: false, reason: 'error', error: why, recipients: [] }
  }
}

/** The request did not reach IGI: one plain email to LoveLab's admins, and a health event. */
async function tellAdmins({ send, health, visit, why, siteUrl, recipients }) {
  const ref = visit.visit_no === '?' ? 'a request' : visitRef(visit)
  const message = `Order ${ref} did not reach IGI: ${why}`
  try {
    await health({
      source: 'igi_request_email',
      severity: 'error',
      message,
      context: { visit_id: visit.id, recipients },
      alertAdmin: false,
    })
  } catch {
    // best effort
  }
  const admins = lovelabRecipients()
  if (!admins.length) return
  try {
    await send({
      to: admins,
      subject: `Certificates: ${message}`,
      html: `<p>${escape(message)}.</p><p>The request itself is saved. Open the movement and press <b>Send the email again</b>${visit.id ? `: <a href="${siteUrl}/certificates/visits/${visit.id}">${siteUrl}/certificates/visits/${visit.id}</a>` : ''}.</p>`,
      from: getSenderFrom('LoveLab certificates'),
    })
  } catch {
    // Nothing left to try; the health event carries it.
  }
}

function escape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * IGI recorded what they made: email LoveLab. Returns { sent, reason? }.
 */
export async function notifyLovelabOfIssue(db, { visitId, siteUrl }, deps = {}) {
  const send = deps.sendEmail || defaultSendEmail
  const health = deps.recordHealthEvent || defaultHealth
  try {
    const { visit, lines } = await loadVisitForEmail(db, visitId)
    const recipients = deps.recipients || lovelabRecipients()
    if (!recipients.length) return { sent: false, reason: 'no_recipients' }
    const { subject, html } = lovelabIssuedEmail({ visit, lines, siteUrl })
    const result = await send({ to: recipients, subject, html, from: getSenderFrom('LoveLab certificates') })
    if (result?.sent) return { sent: true, recipients }
    const why = describeFailure(result)
    await health({ source: 'igi_issued_email', severity: 'warn', message: `LoveLab were not emailed that IGI made ${visitRef(visit)}: ${why}`, context: { visit_id: visit.id } })
    return { sent: false, reason: result?.reason || 'send_failed', error: why }
  } catch (err) {
    return { sent: false, reason: 'error', error: err?.message }
  }
}

/**
 * LoveLab counted fewer than IGI made: email IGI. Returns { sent, reason?, missing }.
 */
export async function notifyIgiOfShortReturn(db, { visitId, siteUrl }, deps = {}) {
  const send = deps.sendEmail || defaultSendEmail
  const health = deps.recordHealthEvent || defaultHealth
  try {
    const { visit, lines } = await loadVisitForEmail(db, visitId)
    const missing = shortOnReturn(lines)
    if (missing === 0) return { sent: false, reason: 'nothing_short', missing: 0 }
    const recipients = deps.recipients || await igiRecipients(db, deps.env)
    if (!recipients.length) return { sent: false, reason: 'no_recipients', missing }
    const { subject, html } = igiShortReturnEmail({ visit, lines, siteUrl })
    const result = await send({ to: recipients, subject, html, from: getSenderFrom('LoveLab certificates') })
    if (result?.sent) return { sent: true, recipients, missing }
    const why = describeFailure(result)
    await health({ source: 'igi_short_return_email', severity: 'warn', message: `IGI were not emailed that ${visitRef(visit)} came back short: ${why}`, context: { visit_id: visit.id } })
    return { sent: false, reason: result?.reason || 'send_failed', error: why, missing }
  } catch (err) {
    return { sent: false, reason: 'error', error: err?.message, missing: null }
  }
}

/**
 * LoveLab added a model: email IGI to number it (Sam, 24 Sept 2026). One
 * mail per model. Returns { sent, reason?, recipients }.
 */
export async function notifyIgiOfNewModel(db, { modelId, siteUrl }, deps = {}) {
  const send = deps.sendEmail || defaultSendEmail
  const health = deps.recordHealthEvent || defaultHealth
  try {
    const { data: model, error } = await db
      .from('igi_models').select('id, name, stones, carat, shape, state').eq('id', modelId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!model) throw new Error('Model not found')
    const recipients = deps.recipients || await igiRecipients(db, deps.env)
    if (!recipients.length) return { sent: false, reason: 'no_recipients', recipients: [] }
    const { subject, html } = igiNewModelEmail({ models: [model], siteUrl })
    const result = await send({ to: recipients, subject, html, from: getSenderFrom('LoveLab certificates') })
    if (result?.sent) return { sent: true, recipients }
    const why = describeFailure(result)
    await health({ source: 'igi_new_model_email', severity: 'warn', message: `IGI were not emailed about the new model ${model.name}: ${why}`, context: { model_id: model.id } })
    return { sent: false, reason: result?.reason || 'send_failed', error: why, recipients }
  } catch (err) {
    return { sent: false, reason: 'error', error: err?.message, recipients: [] }
  }
}

/** The base URL for links in an email, from the request when the env does not say. */
export function siteUrlFor(request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')
  try {
    return new URL(request.url).origin
  } catch {
    return 'https://b2b-lovelab.com'
  }
}

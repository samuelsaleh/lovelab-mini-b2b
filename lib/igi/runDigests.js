/**
 * The three scheduled certificate emails (Sam, 24 Sept 2026).
 *
 *   morning     every day at 07:00 to Liuba: what to go and collect at IGI
 *   igi_weekly  every Friday at 14:00 to IGI: produce, requests, models to number
 *   order       every second Friday at 14:00 to Alberto: what to order at IGI
 *
 * The clock is read by the cron route (app/api/cron/igi-mail); these runners
 * only know how to send one mail once. "Once" is the igi_digest_sends table:
 * a runner inserts its row before sending, and a duplicate key means the
 * mail already went today, so a second cron tick, a redeploy in the same
 * hour or a manual re-run sends nothing. The row is removed again if the
 * send itself fails, so the next tick retries.
 *
 * These replaced the nightly "once per crossing" level emails, which said the
 * same thing at a moment nobody chose. Every dependency can be injected.
 */
import { sendEmail as defaultSendEmail } from '@/lib/send-email'
import { getSenderFrom } from '@/lib/email'
import { recordHealthEvent as defaultHealth } from '@/lib/healthEvent'
import { suggestedAsk } from './derive'
import { loadModelsWithStatus, loadOpenVisits, awaitingSerial } from './status'
import { igiRecipients } from './notify'
import { morningDigestEmail, igiWeeklyEmail, orderDigestEmail } from './emails'

export const MORNING_DEFAULT_RECIPIENTS = ['liuba.lovelab@gmail.com']
export const ORDER_DEFAULT_RECIPIENTS = ['alberto@love-lab.com']

function envList(name, fallback, env = process.env) {
  const raw = (env[name] || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return raw.length ? [...new Set(raw)] : fallback
}

/** Antwerp's calendar date for a moment, as YYYY-MM-DD. */
export function brusselsDateOf(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
}

/** Reserve today's slot for a kind. Returns false when it was already taken. */
async function reserve(db, kind, sentOn, recipients, subject) {
  const { error } = await db.from('igi_digest_sends').insert({ kind, sent_on: sentOn, recipients, subject })
  if (!error) return true
  if (error.code === '23505' || /duplicate key/i.test(error.message || '')) return false
  throw new Error(error.message)
}

async function release(db, kind, sentOn) {
  try {
    await db.from('igi_digest_sends').delete().eq('kind', kind).eq('sent_on', sentOn)
  } catch {
    // The row staying means one missed retry, not a wrong figure.
  }
}

async function deliver(db, deps, { kind, recipients, mail, source, siteUrl }) {
  const send = deps.sendEmail || defaultSendEmail
  const health = deps.recordHealthEvent || defaultHealth
  const now = deps.now || new Date().toISOString()
  const sentOn = brusselsDateOf(now)

  if (!recipients.length) return { kind, sent: false, reason: 'no_recipients', recipients: [] }
  if (mail.empty && !deps.sendWhenEmpty) return { kind, sent: false, reason: 'nothing_to_say', recipients }

  const fresh = await reserve(db, kind, sentOn, recipients, mail.subject)
  if (!fresh) return { kind, sent: false, reason: 'already_sent_today', recipients, sent_on: sentOn }

  const result = await send({ to: recipients, subject: mail.subject, html: mail.html, from: getSenderFrom('LoveLab certificates') })
  if (result?.sent) return { kind, sent: true, recipients, subject: mail.subject, sent_on: sentOn }

  await release(db, kind, sentOn)
  const why = `${result?.reason || 'send_failed'}${result?.status ? ` (HTTP ${result.status})` : ''}`
  try {
    await health({ source, severity: 'error', message: `Scheduled certificate email "${mail.subject}" did not go out: ${why}`, context: { kind, recipients, siteUrl } })
  } catch {
    // best effort
  }
  return { kind, sent: false, reason: result?.reason || 'send_failed', error: why, recipients }
}

function siteUrlFrom(deps) {
  return deps.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://app.lovelab-antwerp.com'
}

/** Every morning to Liuba. Sent even when there is nothing to collect. */
export async function runMorningDigest(db, deps = {}) {
  const siteUrl = siteUrlFrom(deps)
  const now = deps.now || new Date().toISOString()
  const models = deps.models || await loadModelsWithStatus(db)
  const visits = deps.visits || await loadOpenVisits(db, models)
  const collect = models
    .filter((m) => m.state === 'in_use' && m.shelf_status === 'collect')
    .map((m) => ({ ...m, ask: suggestedAsk(m).qty }))
  const ready = visits.filter((v) => v.status === 'issued' && !v.correction)
  const mail = morningDigestEmail({ collect, ready, now, siteUrl })
  const recipients = deps.recipients || envList('IGI_MORNING_EMAILS', MORNING_DEFAULT_RECIPIENTS, deps.env)
  const r = await deliver(db, { ...deps, sendWhenEmpty: true }, { kind: 'morning', recipients, mail, source: 'igi_morning_digest', siteUrl })
  return { ...r, counts: { collect: collect.length, ready: ready.length } }
}

/** Every Friday at 14:00 to IGI. Nothing goes when nothing is waiting. */
export async function runIgiWeekly(db, deps = {}) {
  const siteUrl = siteUrlFrom(deps)
  const now = deps.now || new Date().toISOString()
  const models = deps.models || await loadModelsWithStatus(db)
  const visits = deps.visits || await loadOpenVisits(db, models)
  const produce = models.filter((m) => m.state === 'in_use' && m.order_status === 'order')
  const requests = visits.filter((v) => v.status === 'requested' && !v.correction)
  const toNumber = awaitingSerial(models)
  const mail = igiWeeklyEmail({ produce, requests, toNumber, now, siteUrl })
  const recipients = deps.recipients || await igiRecipients(db, deps.env)
  const r = await deliver(db, deps, { kind: 'igi_weekly', recipients, mail, source: 'igi_weekly_digest', siteUrl })
  return { ...r, counts: { produce: produce.length, requests: requests.length, to_number: toNumber.length } }
}

/** Every second Friday at 14:00 to Alberto. Nothing goes when no model is below its level. */
export async function runOrderDigest(db, deps = {}) {
  const siteUrl = siteUrlFrom(deps)
  const now = deps.now || new Date().toISOString()
  const models = deps.models || await loadModelsWithStatus(db)
  const visits = deps.visits || await loadOpenVisits(db, models)
  const order = models.filter((m) => m.state === 'in_use' && m.order_status === 'order')
  const waiting = visits.filter((v) => v.status === 'requested' && !v.correction)
  const mail = orderDigestEmail({ order, waiting, now, siteUrl })
  const recipients = deps.recipients || envList('IGI_ORDER_EMAILS', ORDER_DEFAULT_RECIPIENTS, deps.env)
  const r = await deliver(db, deps, { kind: 'order', recipients, mail, source: 'igi_order_digest', siteUrl })
  return { ...r, counts: { order: order.length, waiting: waiting.length } }
}

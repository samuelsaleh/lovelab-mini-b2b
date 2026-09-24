/**
 * The three scheduled certificate emails (Sam, 24 Sept 2026): what each says,
 * when it stays silent, and that none goes out twice in a day.
 */
import { morningDigestEmail, igiWeeklyEmail, orderDigestEmail, igiNewModelEmail } from '../igi/emails'
import { runMorningDigest, runIgiWeekly, runOrderDigest, brusselsDateOf } from '../igi/runDigests'

const base = { state: 'in_use', stones: '1', carat: 0.5, shape: 'Round', shelf_min: 25, order_min: 100 }
const SHAPY = { ...base, id: 'a', serial: 'LGAJ6552', name: 'Shapy Shine', shelf: 2, pool: 41, shelf_status: 'collect', order_status: 'order' }
const CUBIX = { ...base, id: 'b', serial: 'LGAJ6530', name: 'Cuty-Cubix', shelf: 1006, pool: 11020, shelf_status: 'fine', order_status: 'fine', order_min: 3500 }
const MULTI = { ...base, id: 'c', serial: 'LGAJ6536', name: 'Multi Three', shelf: 90, pool: 71, shelf_status: 'fine', order_status: 'order' }
const WAITING = { ...base, id: 'd', serial: null, name: 'Full Moonlight', state: 'awaiting_serial', shelf: null, pool: null, shelf_status: 'unmapped', order_status: 'unknown' }
const NOW = '2026-09-25T12:00:00.000Z'   // Friday 25 Sept 2026, 14:00 in Antwerp

const REQUESTED = { id: 'v33', visit_no: 33, visit_date: '2026-09-22', status: 'requested', requested_at: '2026-09-22T08:00:00Z', correction: false,
  lines: [{ ...CUBIX, model_id: 'b', qty_requested: 100, qty_issued: null }, { ...SHAPY, model_id: 'a', qty_requested: 500, qty_issued: null }] }
const ISSUED = { id: 'v32', visit_no: 32, visit_date: '2026-09-23', status: 'issued', issued_at: '2026-09-24T09:00:00Z', correction: false,
  lines: [{ ...CUBIX, model_id: 'b', qty_requested: 171, qty_issued: 171 }] }

describe('morningDigestEmail — Liuba, every morning', () => {
  it('lists what to collect and what is ready, and never what to order', () => {
    const { subject, html, empty } = morningDigestEmail({ collect: [{ ...SHAPY, ask: 48 }], ready: [ISSUED], now: NOW, siteUrl: 'https://app.test' })
    expect(empty).toBe(false)
    expect(subject).toBe('Certificates this morning: 1 model to collect at IGI')
    expect(html).toContain('Shapy Shine')
    expect(html).toMatch(/Ask IGI for/)
    expect(html).toMatch(/48/)
    expect(html).toMatch(/Ready to collect at IGI:.*V-032.*171 certificates, made yesterday/)
    expect(html).not.toMatch(/Order at IGI|Must hold/)
    expect(html).toContain('https://app.test/certificates')
  })
  it('still has something to say when nothing needs doing', () => {
    const { subject, html, empty } = morningDigestEmail({ collect: [], ready: [], now: NOW })
    expect(empty).toBe(true)
    expect(subject).toBe('Certificates this morning: nothing to collect')
    expect(html).toMatch(/Nothing to do today/)
  })
})

describe('igiWeeklyEmail — IGI, Fridays', () => {
  it('has three tables, serial first, and counts them in the subject', () => {
    const { subject, html, empty } = igiWeeklyEmail({ produce: [SHAPY, MULTI], requests: [REQUESTED], toNumber: [WAITING], now: NOW, siteUrl: 'https://app.test' })
    expect(empty).toBe(false)
    expect(subject).toBe('This week: 2 models to produce, 1 request waiting, 1 model to number')
    expect(html).toMatch(/1\. Produce more/)
    expect(html).toMatch(/2\. Requests waiting for you/)
    expect(html).toMatch(/3\. New models to number/)
    // Serial big, name small (IGI work by serial).
    expect(html).toMatch(/<b style="font-family:'SF Mono'[^>]*>LGAJ6552<\/b><br><span[^>]*>Shapy Shine/)
    expect(html).toMatch(/V-033/)
    expect(html).toMatch(/asked 3 days ago/)
    expect(html).toContain('Full Moonlight')
    expect(html.toLowerCase()).not.toContain('shelf')
  })
  it('numbers only the sections that exist, and is empty when all are', () => {
    const one = igiWeeklyEmail({ produce: [], requests: [REQUESTED], toNumber: [], now: NOW })
    expect(one.subject).toBe('This week: 1 request waiting')
    expect(one.html).toMatch(/1\. Requests waiting for you/)
    expect(one.html).not.toMatch(/Produce more/)
    expect(igiWeeklyEmail({ now: NOW }).empty).toBe(true)
  })
})

describe('orderDigestEmail — Alberto, every second Friday', () => {
  it('lists the models IGI hold below the level, with what is waiting on them', () => {
    const { subject, html, empty } = orderDigestEmail({ order: [SHAPY, MULTI], waiting: [REQUESTED], now: NOW })
    expect(empty).toBe(false)
    expect(subject).toBe('Certificates to order at IGI: 2 models below the level')
    expect(html).toMatch(/Must hold/)
    expect(html).toMatch(/Waiting on IGI:.*V-033.*600 certificates, asked 3 days ago/)
  })
  it('is empty when nothing is below', () => {
    expect(orderDigestEmail({ order: [], waiting: [REQUESTED], now: NOW }).empty).toBe(true)
  })
})

describe('igiNewModelEmail', () => {
  it('says what a model is, why it needs a serial, and the three steps', () => {
    const { subject, html } = igiNewModelEmail({ models: [WAITING], siteUrl: 'https://app.test' })
    expect(subject).toBe('New certificate model from LoveLab: please give it an IGI serial')
    expect(html).toMatch(/IGI serial number/)
    expect(html).toMatch(/Give a serial/)
    expect(html).toMatch(/Confirm serial/)
    expect(html).toContain('https://app.test/igi')
    expect(html.toLowerCase()).not.toContain('shelf')
  })
})

/** A service-role stand-in with the igi_digest_sends table and its primary key. */
function db() {
  const sends = []
  return {
    sends,
    from(table) {
      if (table !== 'igi_digest_sends') throw new Error(`unexpected read of ${table}`)
      return {
        insert: async (row) => {
          if (sends.some((s) => s.kind === row.kind && s.sent_on === row.sent_on)) {
            return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          }
          sends.push(row); return { error: null }
        },
        delete: () => ({ eq: (_c, kind) => ({ eq: async (_d, on) => { const i = sends.findIndex((s) => s.kind === kind && s.sent_on === on); if (i >= 0) sends.splice(i, 1); return { error: null } } }) }),
      }
    },
  }
}

const MODELS = [SHAPY, CUBIX, MULTI, WAITING]

describe('runMorningDigest', () => {
  it('emails Liuba by default, with the collect list, and marks the day', async () => {
    const d = db()
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const r = await runMorningDigest(d, { models: MODELS, visits: [REQUESTED, ISSUED], sendEmail, now: NOW, env: {} })
    expect(r).toMatchObject({ kind: 'morning', sent: true, recipients: ['liuba.lovelab@gmail.com'], sent_on: '2026-09-25', counts: { collect: 1, ready: 1 } })
    expect(sendEmail.mock.calls[0][0].subject).toBe('Certificates this morning: 1 model to collect at IGI')
    expect(d.sends).toHaveLength(1)
  })
  it('goes out even when there is nothing to collect', async () => {
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const r = await runMorningDigest(db(), { models: [CUBIX], visits: [], sendEmail, now: NOW, env: {} })
    expect(r.sent).toBe(true)
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/nothing to collect/)
  })
  it('never sends twice the same day', async () => {
    const d = db()
    const sendEmail = jest.fn(async () => ({ sent: true }))
    await runMorningDigest(d, { models: MODELS, visits: [], sendEmail, now: NOW, env: {} })
    const again = await runMorningDigest(d, { models: MODELS, visits: [], sendEmail, now: '2026-09-25T13:00:00.000Z', env: {} })
    expect(again).toMatchObject({ sent: false, reason: 'already_sent_today' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })
  it('frees the day again when the send fails, and records it', async () => {
    const d = db()
    const recordHealthEvent = jest.fn(async () => ({ ok: true }))
    const r = await runMorningDigest(d, { models: MODELS, visits: [], sendEmail: async () => ({ sent: false, reason: 'network_error' }), recordHealthEvent, now: NOW, env: {} })
    expect(r).toMatchObject({ sent: false, reason: 'network_error' })
    expect(d.sends).toHaveLength(0)
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'igi_morning_digest', severity: 'error' }))
  })
  it('takes its recipients from IGI_MORNING_EMAILS when set', async () => {
    const sendEmail = jest.fn(async () => ({ sent: true }))
    await runMorningDigest(db(), { models: MODELS, visits: [], sendEmail, now: NOW, env: { IGI_MORNING_EMAILS: 'Liuba@love-lab.com, sam@love-lab.com' } })
    expect(sendEmail.mock.calls[0][0].to).toEqual(['liuba@love-lab.com', 'sam@love-lab.com'])
  })
})

describe('runIgiWeekly', () => {
  it('emails IGI the three lists', async () => {
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const r = await runIgiWeekly(db(), { models: MODELS, visits: [REQUESTED, ISSUED], sendEmail, now: NOW, recipients: ['michael@igi.org'] })
    expect(r).toMatchObject({ kind: 'igi_weekly', sent: true, counts: { produce: 2, requests: 1, to_number: 1 } })
    expect(sendEmail.mock.calls[0][0].to).toEqual(['michael@igi.org'])
    expect(sendEmail.mock.calls[0][0].subject).toBe('This week: 2 models to produce, 1 request waiting, 1 model to number')
  })
  it('sends nothing when nothing is waiting', async () => {
    const sendEmail = jest.fn()
    const r = await runIgiWeekly(db(), { models: [CUBIX], visits: [], sendEmail, now: NOW, recipients: ['michael@igi.org'] })
    expect(r).toMatchObject({ sent: false, reason: 'nothing_to_say' })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('runOrderDigest', () => {
  it('emails Alberto by default with the models below the level', async () => {
    const sendEmail = jest.fn(async () => ({ sent: true }))
    const r = await runOrderDigest(db(), { models: MODELS, visits: [REQUESTED], sendEmail, now: NOW, env: {} })
    expect(r).toMatchObject({ kind: 'order', sent: true, recipients: ['alberto@love-lab.com'], counts: { order: 2, waiting: 1 } })
  })
  it('sends nothing when no model is below', async () => {
    const sendEmail = jest.fn()
    const r = await runOrderDigest(db(), { models: [CUBIX], visits: [REQUESTED], sendEmail, now: NOW, env: {} })
    expect(r).toMatchObject({ sent: false, reason: 'nothing_to_say' })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('brusselsDateOf', () => {
  it('is the Antwerp calendar date, not UTC', () => {
    expect(brusselsDateOf('2026-09-25T22:30:00.000Z')).toBe('2026-09-26')
    expect(brusselsDateOf('2026-01-15T23:30:00.000Z')).toBe('2026-01-16')
  })
})

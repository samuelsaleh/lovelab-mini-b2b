/**
 * @jest-environment node
 *
 * POST /api/fair-assistant/send — the safe send path (Rafi, 13 Oct 2026).
 *  - drafts are CLAIMED (draft_ready -> sending) before sending, so two calls never send the same mail
 *  - every send carries an Idempotency-Key, so a retry can never double-send
 *  - a rate-limited mail goes back to draft_ready ("will retry"), never to failed
 *  - a quota 429 stops the loop and loses nothing
 *  - pressing Send when everything is sent sends nothing and is not an error
 *  - a batch whose name starts with [TEST] mails only the logged-in admin
 */
const sendEmail = jest.fn()
const recordSend = jest.fn().mockResolvedValue({ ok: true })
jest.mock('@/lib/send-email', () => ({ sendEmail: (...a) => sendEmail(...a) }))
const blockedRecipients = jest.fn().mockResolvedValue(new Map())
jest.mock('@/lib/emailDeliveries', () => ({ recordSend: (...a) => recordSend(...a), blockedRecipients: (...a) => blockedRecipients(...a) }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))
jest.mock('@/lib/b2b-files', () => ({ findB2BFileByPath: jest.fn(() => null) }))
jest.mock('@/lib/packTemplates', () => ({ packTemplateIdFromPath: jest.fn(() => null), resolvePackTemplate: jest.fn() }))
jest.mock('@/lib/publicAssetHref', () => ({ publicAssetUrl: jest.fn((x) => x) }))

// ---- a tiny stateful Supabase: select / update / in / eq / lt / limit / single, with the lead join
let tables
function from(name) {
  const st = { filters: [], patch: null, op: 'select', limit: null, head: false, single: false, join: false }
  const q = {
    select(cols = '*', opts = {}) { st.join = /fair_leads!inner/.test(cols); st.head = Boolean(opts.head); st.wantRows = true; return q },
    update(patch) { st.op = 'update'; st.patch = patch; return q },
    eq(c, v) { st.filters.push((r) => r[c] === v); return q },
    in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return q },
    lt(c, v) { st.filters.push((r) => r[c] < v); return q },
    order() { return q },
    limit(n) { st.limit = n; return q },
    single() { st.single = true; return q },
    then(res, rej) { return Promise.resolve(exec()).then(res, rej) },
  }
  function exec() {
    let rows = tables[name].filter((r) => st.filters.every((f) => f(r)))
    if (st.limit != null) rows = rows.slice(0, st.limit)
    if (st.op === 'update') {
      rows.forEach((r) => Object.assign(r, st.patch))
      if (!st.wantRows) return { error: null }
    }
    if (st.head) return { count: rows.length, error: null }
    let out = rows.map((r) => ({ ...r }))
    if (st.join) {
      out = out.map((r) => ({ ...r, lead: tables.fair_leads.find((l) => l.id === r.lead_id) })).filter((r) => r.lead)
    }
    if (st.single) return out[0] ? { data: out[0], error: null } : { data: null, error: { message: 'not found' } }
    return { data: out, error: null }
  }
  return q
}
const adminSupabase = { from: jest.fn(from) }
const admin = { email: 'rafi@lovelab-antwerp.com' }
jest.mock('@/lib/fair-assistant/server', () => ({ requireFairAdmin: jest.fn(async () => ({ user: admin, adminSupabase })) }))
const { resendPacer } = require('@/lib/resendPacer')

const { POST } = require('../fair-assistant/send/route')
const call = (batchId = 'b1') => POST(new global.Request('http://localhost/api/fair-assistant/send', { method: 'POST', body: JSON.stringify({ batchId }), headers: { 'Content-Type': 'application/json' } }))

function seed({ n = 5, batch = {} } = {}) {
  tables = {
    fair_batches: [{ id: 'b1', name: 'Paris fair', status: 'drafting', attached_files: [], total_sent: 0, total_failed: 0, ...batch }],
    fair_leads: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, batch_id: 'b1', email: `p${i}@shop.com`, first_name: `P${i}`, last_name: 'X', status: 'extracted' })),
    fair_email_drafts: Array.from({ length: n }, (_, i) => ({ id: `d${i}`, batch_id: 'b1', lead_id: `l${i}`, subject: `Hi ${i}`, body_html: `<p>${i}</p>`, status: 'draft_ready', error: null, updated_at: new Date().toISOString() })),
  }
}
const status = (id) => tables.fair_email_drafts.find((d) => d.id === id).status
const statuses = () => tables.fair_email_drafts.map((d) => d.status)

beforeEach(() => {
  jest.clearAllMocks(); process.env.FAIR_SEND_CHUNK_SECONDS = '5'
  resendPacer.configure({ perSecond: Infinity })
  sendEmail.mockImplementation(async () => ({ sent: true, message_id: 're_1' }))
  seed()
})

describe('send route', () => {
  test('sends every ready draft once, marks them sent, records delivery tracking, reports the pacing', async () => {
    resendPacer.configure({ perSecond: 3 }); resendPacer.configure({ perSecond: Infinity })
    const res = await call(); const body = await res.json()
    expect(body).toMatchObject({ ok: true, sent: 5, failed: 0, skipped: 0, remaining: 0, deferred: 0 })
    expect(statuses()).toEqual(Array(5).fill('sent'))
    expect(sendEmail).toHaveBeenCalledTimes(5)
    expect(recordSend).toHaveBeenCalledTimes(5)
    expect(tables.fair_batches[0]).toMatchObject({ status: 'complete', total_sent: 5, total_failed: 0 })
  })

  test('reports the per-second cap the pacer is set to (the screen shows "max 3 per second")', async () => {
    resendPacer.configure({ perSecond: 3 })
    jest.spyOn(resendPacer, 'wait').mockResolvedValue()
    const body = await (await call()).json()
    expect(body.perSecond).toBe(3)
  })

  test('every send carries an Idempotency-Key built from the draft id and its content', async () => {
    await call()
    const keys = sendEmail.mock.calls.map(([a]) => a.idempotencyKey)
    expect(new Set(keys).size).toBe(5)
    keys.forEach((k, i) => expect(k).toMatch(new RegExp(`^fair-d${i}-[0-9a-f]{12}$`)))
    // same draft, changed text => a different key (a deliberate re-send is not blocked)
    seed(); tables.fair_email_drafts[0].body_html = '<p>changed</p>'
    sendEmail.mockClear(); await call()
    expect(sendEmail.mock.calls[0][0].idempotencyKey).not.toBe(keys[0])
  })

  test('the key changes when the recipient changes (a corrected lead email is not refused by Resend as a reused key)', async () => {
    await call(); const first = sendEmail.mock.calls[0][0].idempotencyKey
    seed(); tables.fair_leads[0].email = 'corrected@shop.com'
    sendEmail.mockClear(); await call()
    expect(sendEmail.mock.calls[0][0].idempotencyKey).not.toBe(first)
  })

  test('two simultaneous calls send each draft exactly once in total', async () => {
    seed({ n: 20 })
    const [a, b] = await Promise.all([call(), call()])
    const sum = (await a.json()).sent + (await b.json()).sent
    expect(sum).toBe(20)
    expect(sendEmail).toHaveBeenCalledTimes(20)
    expect(new Set(sendEmail.mock.calls.map(([x]) => x.idempotencyKey)).size).toBe(20)
  })

  test('pressing Send when everything is already sent sends 0 and is not an error', async () => {
    await call(); sendEmail.mockClear()
    const res = await call(); const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, sent: 0, remaining: 0 })
    expect(body.message).toMatch(/already sent/i)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  test('no drafts at all is still the old "generate first" error', async () => {
    tables.fair_email_drafts = []
    const res = await call()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Generate all drafts/)
  })

  test('a rate-limited mail goes back to draft_ready with a "will retry" note, never to failed, and the call stops', async () => {
    sendEmail.mockImplementation(async () => ({ sent: false, reason: 'rate_limited', status: 429, retryable: true, retryAfterMs: 4000 }))
    const body = await (await call()).json()
    expect(body.sent).toBe(0); expect(body.failed).toBe(0)
    expect(body.deferred).toBeGreaterThan(0)
    expect(body.retryAfterMs).toBe(4000)
    expect(body.remaining).toBe(5)
    expect(statuses().every((s) => s === 'draft_ready')).toBe(true)
    expect(tables.fair_email_drafts[0].error).toMatch(/will retry/i)
    expect(tables.fair_batches[0].status).toBe('sending')
  })

  test('a quota error stops the loop, reports blocked: "quota", and nothing is marked failed', async () => {
    let n = 0
    sendEmail.mockImplementation(async () => (++n <= 2 ? { sent: true, message_id: `re_${n}` } : { sent: false, reason: 'quota_exceeded', status: 429, retryable: false }))
    const body = await (await call()).json()
    expect(body).toMatchObject({ sent: 2, failed: 0, blocked: 'quota' })
    expect(body.remaining).toBe(3)
    expect(statuses().filter((s) => s === 'failed')).toHaveLength(0)
    expect(statuses().filter((s) => s === 'sent')).toHaveLength(2)
  })

  test('a permanent Resend error (bad address) marks only that draft failed, with the reason', async () => {
    sendEmail.mockImplementation(async ({ to }) => (to === 'p1@shop.com' ? { sent: false, reason: 'resend_error', status: 422, error: 'invalid to' } : { sent: true, message_id: 'ok' }))
    const body = await (await call()).json()
    expect(body).toMatchObject({ sent: 4, failed: 1 })
    expect(status('d1')).toBe('failed')
    expect(tables.fair_email_drafts[1].error).toMatch(/resend_error.*422/)
  })

  test('a lead without an email, or a draft without content, is skipped and never sent', async () => {
    tables.fair_leads[0].email = ''
    tables.fair_email_drafts[2].body_html = ''
    const body = await (await call()).json()
    expect(body).toMatchObject({ sent: 3, skipped: 2 })
    expect(status('d0')).toBe('failed'); expect(status('d2')).toBe('failed')
    expect(sendEmail).toHaveBeenCalledTimes(3)
  })

  test('drafts a crashed call left in "sending" for over 5 minutes are freed and sent', async () => {
    tables.fair_email_drafts[0].status = 'sending'; tables.fair_email_drafts[0].updated_at = new Date(Date.now() - 6 * 60000).toISOString()
    tables.fair_email_drafts[1].status = 'sending'; tables.fair_email_drafts[1].updated_at = new Date().toISOString()     // fresh: another call is on it
    const body = await (await call()).json()
    expect(status('d0')).toBe('sent')
    expect(status('d1')).toBe('sending')
    expect(body.sent).toBe(4)
  })

  test('an address that bounced or complained earlier is skipped and never sent', async () => {
    blockedRecipients.mockResolvedValueOnce(new Map([['p1@shop.com', 'This address bounced on an earlier mail']]))
    const body = await (await call()).json()
    expect(body).toMatchObject({ sent: 4, skipped: 1, failed: 0 })
    expect(status('d1')).toBe('failed')
    expect(tables.fair_email_drafts[1].error).toMatch(/bounced.*not sent/i)
    expect(sendEmail.mock.calls.map(([a]) => a.to)).not.toContain('p1@shop.com')
  })

  test('a [TEST] batch does not look up bounces (it only mails the admin)', async () => {
    seed({ batch: { name: '[TEST] check' } })
    await call()
    expect(blockedRecipients).not.toHaveBeenCalled()
  })

  test('a [TEST] batch mails only the logged-in admin, with the real address in the subject', async () => {
    seed({ batch: { name: '[TEST] Paris dry run' } })
    await call()
    sendEmail.mock.calls.forEach(([a], i) => {
      expect(a.to).toBe('rafi@lovelab-antwerp.com')
      expect(a.subject).toBe(`[to: p${i}@shop.com] Hi ${i}`)
    })
  })

  test('a call works for about FAIR_SEND_CHUNK_SECONDS, then returns what is left', async () => {
    process.env.FAIR_SEND_CHUNK_SECONDS = '0.05'
    seed({ n: 40 })
    sendEmail.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 20)); return { sent: true, message_id: 'x' } })
    const body = await (await call()).json()
    expect(body.sent).toBeGreaterThan(0); expect(body.sent).toBeLessThan(40)
    expect(body.remaining).toBe(40 - body.sent)
    expect(statuses().filter((s) => s === 'sending')).toHaveLength(0)     // nothing left claimed but unsent
  })

  test('a batch that cannot be read sends nothing (fails closed; it could have been a [TEST] batch)', async () => {
    tables.fair_batches = []
    const res = await call()
    expect(res.status).toBe(404)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(statuses().every((s) => s === 'draft_ready')).toBe(true)
  })
})

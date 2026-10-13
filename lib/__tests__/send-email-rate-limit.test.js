/**
 * @jest-environment node
 *
 * sendEmail against Resend's limits (verified in Resend's docs, 12 Oct 2026):
 *  - a 429 can be a RATE limit (wait and retry) or a QUOTA (waiting does not help)
 *  - the Idempotency-Key header makes a retry safe: Resend returns the first result
 */
function res(status, body = {}, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

describe('lib/send-email.js — rate limits, retries, idempotency', () => {
  let sendEmail, resendPacer, originalFetch

  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers()
    process.env.RESEND_API_KEY = 'test_key'
    process.env.SENDER_EMAIL = 'alberto@love-lab.com'
    originalFetch = global.fetch
    ;({ sendEmail } = require('../send-email'))
    ;({ resendPacer } = require('../resendPacer'))
  })
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers() })

  const args = { to: 'x@y.com', subject: 's', html: 'h' }

  it('sends the Idempotency-Key header when given one, and none otherwise', async () => {
    const seen = []
    global.fetch = jest.fn(async (_u, init) => { seen.push(init.headers); return res(200, { id: 'r_1' }) })
    await sendEmail({ ...args, idempotencyKey: 'fair-d1-abc' })
    await sendEmail(args)
    expect(seen[0]['Idempotency-Key']).toBe('fair-d1-abc')
    expect(seen[1]['Idempotency-Key']).toBeUndefined()
  })

  it('429 then 200: waits as long as retry-after says, retries once, sends once, same key', async () => {
    const keys = []
    global.fetch = jest.fn()
      .mockImplementationOnce(async (_u, init) => { keys.push(init.headers['Idempotency-Key']); return res(429, { name: 'rate_limit_exceeded' }, { 'retry-after': '2' }) })
      .mockImplementationOnce(async (_u, init) => { keys.push(init.headers['Idempotency-Key']); return res(200, { id: 're_9' }) })
    const p = sendEmail({ ...args, idempotencyKey: 'k1' })
    await jest.advanceTimersByTimeAsync(1999)
    expect(global.fetch).toHaveBeenCalledTimes(1)          // still waiting
    await jest.advanceTimersByTimeAsync(2)
    const r = await p
    expect(r).toEqual({ sent: true, message_id: 're_9' })
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(keys).toEqual(['k1', 'k1'])
  })

  it('429 on every attempt: gives up after 4 tries as retryable "rate_limited", never as a hard failure', async () => {
    global.fetch = jest.fn(async () => res(429, { name: 'rate_limit_exceeded' }))
    const p = sendEmail({ ...args, idempotencyKey: 'k2' })
    await jest.advanceTimersByTimeAsync(60000)
    const r = await p
    expect(global.fetch).toHaveBeenCalledTimes(4)
    expect(r).toMatchObject({ sent: false, reason: 'rate_limited', status: 429, retryable: true })
    expect(r.retryAfterMs).toBeGreaterThan(0)
  })

  it('quota 429 is not retried and is not retryable', async () => {
    for (const name of ['monthly_quota_exceeded', 'daily_quota_exceeded']) {
      global.fetch = jest.fn(async () => res(429, { name, message: 'quota' }))
      const r = await sendEmail(args)
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(r).toMatchObject({ sent: false, reason: 'quota_exceeded', status: 429, retryable: false })
    }
  })

  it('a 4xx that is not a rate limit (bad address) is not retried', async () => {
    global.fetch = jest.fn(async () => res(422, { name: 'validation_error' }))
    const r = await sendEmail(args)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ sent: false, reason: 'resend_error', status: 422 })
    expect(r.retryable).toBeFalsy()
  })

  it('500 then 200 is retried; a network error then 200 is retried', async () => {
    global.fetch = jest.fn().mockImplementationOnce(async () => res(500, {})).mockImplementationOnce(async () => res(200, { id: 'a' }))
    let p = sendEmail(args); await jest.advanceTimersByTimeAsync(5000)
    expect(await p).toMatchObject({ sent: true, message_id: 'a' })

    global.fetch = jest.fn().mockImplementationOnce(async () => { throw new Error('socket hang up') }).mockImplementationOnce(async () => res(200, { id: 'b' }))
    p = sendEmail(args); await jest.advanceTimersByTimeAsync(5000)
    expect(await p).toMatchObject({ sent: true, message_id: 'b' })
  })

  it('a rate limit pushes the shared pacer back so other senders wait too', async () => {
    const spy = jest.spyOn(resendPacer, 'pushBack')
    global.fetch = jest.fn().mockImplementationOnce(async () => res(429, { name: 'rate_limit_exceeded' }, { 'retry-after': '3' })).mockImplementationOnce(async () => res(200, { id: 'z' }))
    const p = sendEmail(args); await jest.advanceTimersByTimeAsync(4000); await p
    expect(spy).toHaveBeenCalledWith(3000)
  })

  it('every send waits for its pacer slot', async () => {
    const wait = jest.spyOn(resendPacer, 'wait')
    global.fetch = jest.fn(async () => res(200, { id: 'p' }))
    await sendEmail(args); await sendEmail(args)
    expect(wait).toHaveBeenCalledTimes(2)
  })
})

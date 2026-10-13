/**
 * @jest-environment node
 */
function res(status, body = {}, headers = {}) {
  const r = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
  r.clone = () => r
  return r
}

describe('lib/resendFetch.js', () => {
  let resendFetch, originalFetch
  beforeEach(() => {
    jest.resetModules()
    originalFetch = global.fetch
    ;({ resendFetch } = require('../resendFetch'))
  })
  afterEach(() => { global.fetch = originalFetch })
  const sleep = jest.fn(async () => {})

  it('posts to the Resend emails endpoint and returns the response', async () => {
    global.fetch = jest.fn(async () => res(200, { id: 'r1' }))
    const r = await resendFetch({ method: 'POST', body: '{}' }, { sleep })
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.resend.com/emails')
    expect(r.ok).toBe(true)
  })

  it('retries a rate-limit 429 after Retry-After, then succeeds', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(res(429, { name: 'rate_limit_exceeded' }, { 'retry-after': '2' }))
      .mockResolvedValueOnce(res(200, { id: 'r2' }))
    const r = await resendFetch({ method: 'POST' }, { sleep })
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(2000)
    expect(r.ok).toBe(true)
  })

  it('does not retry a quota 429', async () => {
    global.fetch = jest.fn(async () => res(429, { name: 'monthly_quota_exceeded' }))
    const r = await resendFetch({ method: 'POST' }, { sleep })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(r.status).toBe(429)
  })

  it('does not retry a 4xx such as a bad address', async () => {
    global.fetch = jest.fn(async () => res(422, { name: 'validation_error' }))
    await resendFetch({ method: 'POST' }, { sleep })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not repeat a 5xx without an Idempotency-Key (the mail may already have gone out)', async () => {
    global.fetch = jest.fn(async () => res(503))
    const r = await resendFetch({ method: 'POST' }, { maxAttempts: 3, sleep })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(r.status).toBe(503)
  })

  it('repeats a 5xx when the request carries an Idempotency-Key, and gives up after maxAttempts', async () => {
    global.fetch = jest.fn(async () => res(503))
    const r = await resendFetch({ method: 'POST', headers: { 'Idempotency-Key': 'k' } }, { maxAttempts: 3, sleep })
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(r.status).toBe(503)
  })

  it('caps a huge Retry-After at 30 s so one answer cannot freeze every sender', async () => {
    sleep.mockClear()
    global.fetch = jest.fn().mockResolvedValueOnce(res(429, { name: 'rate_limit_exceeded' }, { 'retry-after': '3600' })).mockResolvedValueOnce(res(200))
    await resendFetch({ method: 'POST' }, { sleep })
    expect(sleep).toHaveBeenCalledWith(30000)
  })

  it('timeoutMs aborts a hung request (the clock starts after the pacer slot)', async () => {
    global.fetch = jest.fn((_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))))
    await expect(resendFetch({ method: 'POST' }, { timeoutMs: 20, sleep })).rejects.toThrow('aborted')
  })
})

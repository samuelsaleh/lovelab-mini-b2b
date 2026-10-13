/**
 * @jest-environment node
 */
const { createAnthropicMessage } = require('../ai/anthropic')

const resp = (status, body, headers = {}) => ({ ok: status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body })
const OK = resp(200, { content: [{ type: 'text', text: 'hello' }] })
const args = { system: 's', messages: [{ role: 'user', content: 'x' }] }

describe('createAnthropicMessage retries', () => {
  let orig
  beforeEach(() => { orig = global.fetch; process.env.ANTHROPIC_API_KEY = 'k' })
  afterEach(() => { global.fetch = orig })
  const sleep = jest.fn(async () => {})

  it('does not retry by default', async () => {
    global.fetch = jest.fn(async () => resp(429, { error: { message: 'rate' } }))
    await expect(createAnthropicMessage({ ...args, sleep })).rejects.toThrow('rate')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('retries 429 then succeeds, waiting for Retry-After', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(resp(429, { error: { message: 'rate' } }, { 'retry-after': '3' })).mockResolvedValueOnce(OK)
    const r = await createAnthropicMessage({ ...args, retries: 3, sleep })
    expect(r.text).toBe('hello')
    expect(sleep).toHaveBeenCalledWith(3000)
  })

  it('retries 529 overloaded with growing waits', async () => {
    sleep.mockClear()
    global.fetch = jest.fn().mockResolvedValueOnce(resp(529, { error: { message: 'busy' } })).mockResolvedValueOnce(resp(529, { error: { message: 'busy' } })).mockResolvedValueOnce(OK)
    await createAnthropicMessage({ ...args, retries: 3, sleep })
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000])
  })

  it('never retries a 400', async () => {
    global.fetch = jest.fn(async () => resp(400, { error: { message: 'bad request' } }))
    await expect(createAnthropicMessage({ ...args, retries: 3, sleep })).rejects.toThrow('bad request')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('gives up after the retries and throws the last error', async () => {
    global.fetch = jest.fn(async () => resp(503, { error: { message: 'down' } }))
    await expect(createAnthropicMessage({ ...args, retries: 2, sleep })).rejects.toThrow('down')
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })
})

/**
 * @jest-environment node
 *
 * Pins the AbortSignal contract for sendEmail. Without this wiring, the
 * 8-second timeout in sendBrandedAuthLink was a no-op — slow Resend calls
 * could hang until Vercel killed the function.
 */

describe('lib/send-email.js — AbortSignal forwarding', () => {
  let sendEmail
  let originalFetch

  beforeEach(() => {
    jest.resetModules()
    process.env.RESEND_API_KEY = 'test_key'
    process.env.SENDER_EMAIL = 'alberto@love-lab.com'
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('forwards the signal option to fetch', async () => {
    let captured = null
    global.fetch = jest.fn(async (_url, init) => {
      captured = init
      return { ok: true, status: 200, json: async () => ({ id: 'r_1' }), text: async () => '' }
    })
    ;({ sendEmail } = require('../send-email'))
    const ac = new AbortController()
    const result = await sendEmail({ to: 'x@y.com', subject: 's', html: 'h', signal: ac.signal })
    expect(result.sent).toBe(true)
    expect(captured.signal).toBe(ac.signal)
  })

  it('returns { sent: false, reason: "aborted" } when fetch aborts', async () => {
    global.fetch = jest.fn(async (_url, init) => {
      // Simulate fetch honoring the signal: throw an AbortError synchronously
      // when the controller has already aborted.
      if (init?.signal?.aborted) {
        const err = new Error('aborted')
        err.name = 'AbortError'
        throw err
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' }
    })
    ;({ sendEmail } = require('../send-email'))
    const ac = new AbortController()
    ac.abort()
    const result = await sendEmail({ to: 'x@y.com', subject: 's', html: 'h', signal: ac.signal })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('aborted')
  })

  it('omits signal field when not provided (no regression on existing callers)', async () => {
    let captured = null
    global.fetch = jest.fn(async (_url, init) => {
      captured = init
      return { ok: true, status: 200, json: async () => ({ id: 'r_1' }), text: async () => '' }
    })
    ;({ sendEmail } = require('../send-email'))
    await sendEmail({ to: 'x@y.com', subject: 's', html: 'h' })
    expect(captured.signal).toBeUndefined()
  })
})

/**
 * @jest-environment node
 */
const { verifyFairWebhookSecret } = require('../fair-assistant/auth')
const req = (h) => ({ headers: { get: (k) => (h ? h[k.toLowerCase()] ?? null : null) } })

describe('verifyFairWebhookSecret', () => {
  afterEach(() => { delete process.env.FAIR_WEBHOOK_SECRET })
  it('503 when no secret is configured (fails closed)', () => {
    expect(verifyFairWebhookSecret(req({ 'x-fair-auth': 'x' })).status).toBe(503)
  })
  it('401 for a missing, wrong or differently-sized secret', () => {
    process.env.FAIR_WEBHOOK_SECRET = 'abc123'
    for (const h of [null, { 'x-fair-auth': 'abc124' }, { 'x-fair-auth': 'abc12' }, { 'x-fair-auth': '' }]) {
      expect(verifyFairWebhookSecret(req(h)).status).toBe(401)
    }
  })
  it('passes the right secret', () => {
    process.env.FAIR_WEBHOOK_SECRET = 'abc123'
    expect(verifyFairWebhookSecret(req({ 'x-fair-auth': 'abc123' }))).toBeNull()
  })
})

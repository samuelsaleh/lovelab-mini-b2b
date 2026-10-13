/**
 * @jest-environment node
 */
jest.mock('@/lib/fair-assistant/server', () => ({ requireFairAdmin: jest.fn(async () => ({ user: {}, adminSupabase: {} })) }))
jest.mock('@/lib/google-drive', () => ({ getFolderInfo: jest.fn() }))
jest.mock('@/lib/fair-assistant/aiHealth', () => ({ checkAnthropicKey: jest.fn(async () => ({ status: 'ok', detail: '' })) }))

const { GET } = require('../fair-assistant/diagnose/route')

describe('diagnose', () => {
  let orig
  beforeEach(() => {
    orig = global.fetch
    process.env.RESEND_API_KEY = 'k'; process.env.SENDER_EMAIL = 'hello@love-lab.com'
    process.env.FAIR_N8N_WEBHOOK_URL = 'https://n8n.example.com/webhook/secret-path'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com'
    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN; delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY; delete process.env.FAIR_DRIVE_INBOX_FOLDER_ID
  })
  afterEach(() => { global.fetch = orig })

  test('reports the n8n host (not the secret path), pacing and Resend tracking flags', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, headers: { get: (k) => (k === 'ratelimit-policy' ? '10;w=1' : null) },
      json: async () => ({ data: [{ name: 'love-lab.com', open_tracking: false, click_tracking: false }] }),
    }))
    const body = await (await GET()).json()
    expect(body.n8nHost).toBe('n8n.example.com')
    expect(JSON.stringify(body)).not.toContain('secret-path')
    expect(body.callbackUrl).toBe('https://app.example.com/api/fair-assistant/callback')
    expect(body.resend).toMatchObject({ keySet: true, limitPolicy: '10;w=1', domain: 'love-lab.com', openTracking: false, clickTracking: false })
  })

  test('a Resend outage is reported, not thrown', async () => {
    global.fetch = jest.fn(async () => { throw new Error('boom') })
    const body = await (await GET()).json()
    expect(body.resend.error).toBe('boom')
  })
})

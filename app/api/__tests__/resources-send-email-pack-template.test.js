/**
 * @jest-environment node
 *
 * /api/resources/send-email — pack-template attachment branch.
 *
 * Pack order templates live in a private bucket, so the route must resolve
 * their bytes via the service-role helper (resolvePackTemplate) rather than an
 * HTTP fetch of a public path. These tests pin that wiring:
 *   - a pack-template path attaches the resolved bytes + clean filename,
 *   - a missing pack template returns 404,
 *   - a path that is neither a pack template nor an allowed public path is 400.
 */

const mockResolve = jest.fn()
jest.mock('@/lib/packTemplates', () => ({
  packTemplateIdFromPath: (p) => {
    const m = /^\/api\/pack-templates\/([^/]+)\/download$/.exec(String(p || ''))
    return m ? m[1] : null
  },
  resolvePackTemplate: (...a) => mockResolve(...a),
}))
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn().mockReturnValue({ tag: 'admin' }),
}))
jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-1' }, isAdmin: true }),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))
jest.mock('@/lib/email', () => ({
  getSenderFrom: () => 'LoveLab <hello@love-lab.com>',
  getAdminNotificationRecipients: () => ({ all: [] }),
}))
jest.mock('@/lib/email-templates', () => ({
  clientResourcesEmail: () => ({ subject: 'Your files', html: '<p>hi</p>' }),
}))

const { POST } = require('../resources/send-email/route')

function req(body) {
  return {
    url: 'http://localhost/api/resources/send-email',
    json: jest.fn().mockResolvedValue(body),
    headers: new Map(),
  }
}

let fetchMock
beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key'
  mockResolve.mockReset()
  fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'email-123' }),
    text: async () => '',
  })
  global.fetch = fetchMock
})

describe('POST /api/resources/send-email — pack templates', () => {
  it('attaches a pack template via the service-role resolver (no public fetch)', async () => {
    mockResolve.mockResolvedValue({
      buffer: Buffer.from('xlsx-bytes'),
      fileName: 'LoveLab_Order_Template_Pack_1.xlsx',
    })

    const res = await POST(req({
      to: 'client@example.com',
      files: [{ name: 'Pack 1', path: '/api/pack-templates/abc-123/download' }],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(true)

    // resolvePackTemplate was called with the admin client + extracted id.
    expect(mockResolve).toHaveBeenCalledWith({ tag: 'admin' }, 'abc-123')

    // Exactly one fetch — the Resend call. No HTTP fetch of a public asset.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const payload = JSON.parse(opts.body)
    expect(payload.attachments).toHaveLength(1)
    expect(payload.attachments[0].filename).toBe('LoveLab_Order_Template_Pack_1.xlsx')
    expect(payload.attachments[0].content).toBe(Buffer.from('xlsx-bytes').toString('base64'))
  })

  it('returns 404 when the pack template cannot be resolved', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await POST(req({
      to: 'client@example.com',
      files: [{ name: 'Gone', path: '/api/pack-templates/missing/download' }],
    }))
    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a path that is neither a pack template nor an allowed public path', async () => {
    const res = await POST(req({
      to: 'client@example.com',
      files: [{ name: 'evil', path: '/etc/passwd' }],
    }))
    expect(res.status).toBe(400)
  })
})

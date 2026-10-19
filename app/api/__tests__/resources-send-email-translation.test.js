/**
 * @jest-environment node
 *
 * /api/resources/send-email — translated-document attachment branch (admin only).
 */
const mockTranslated = jest.fn()
const mockCtx = jest.fn()
jest.mock('@/lib/doc-translate/library', () => ({
  translationIdFromPath: (p) => { const m = /^\/api\/doc-translations\/([^/]+)\/file$/.exec(String(p || '')); return m ? m[1] : null },
  getTranslatedFile: (...a) => mockTranslated(...a),
}))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn().mockResolvedValue({}), createAdminClient: jest.fn().mockReturnValue({ tag: 'admin' }) }))
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => mockCtx(...a) }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))
jest.mock('@/lib/email', () => ({ getSenderFrom: () => 'LoveLab <hello@love-lab.com>', getAdminNotificationRecipients: () => ({ all: [] }) }))
jest.mock('@/lib/email-templates', () => ({ clientResourcesEmail: () => ({ subject: 'Your files', html: '<p>hi</p>' }) }))

const { POST } = require('../resources/send-email/route')
const req = (body) => ({ url: 'http://localhost/api/resources/send-email', json: jest.fn().mockResolvedValue(body), headers: new Map() })
const PATH = '/api/doc-translations/abc-123/file'

let fetchMock
beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key'
  mockTranslated.mockReset().mockResolvedValue({ buffer: Buffer.from('pdf-bytes'), fileName: 'LoveLab Brand Presentation — English — French.pdf' })
  mockCtx.mockReset().mockResolvedValue({ user: { id: 'admin-1' }, isAdmin: true })
  fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-1' }), text: async () => '' })
  global.fetch = fetchMock
})

describe('POST /api/resources/send-email — translated documents', () => {
  it('attaches a translated document from storage (no public fetch) under its display name', async () => {
    const res = await POST(req({ to: 'client@example.com', files: [{ name: 'x', path: PATH }] }))
    expect(res.status).toBe(200)
    expect(mockTranslated).toHaveBeenCalledWith({ tag: 'admin' }, 'abc-123')
    expect(fetchMock).toHaveBeenCalledTimes(1) // only the Resend call
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent.attachments).toEqual([{ filename: 'LoveLab Brand Presentation — English — French.pdf', content: Buffer.from('pdf-bytes').toString('base64') }])
  })

  it('404s when the translated document is gone', async () => {
    mockTranslated.mockResolvedValue(null)
    expect((await POST(req({ to: 'client@example.com', files: [{ name: 'x', path: PATH }] }))).status).toBe(404)
  })

  it('keeps agents out: only admins may attach a translated document', async () => {
    mockCtx.mockResolvedValue({ user: { id: 'agent-1' }, isAdmin: false })
    const res = await POST(req({ to: 'client@example.com', files: [{ name: 'x', path: PATH }] }))
    expect(res.status).toBe(403)
    expect(mockTranslated).not.toHaveBeenCalled()
  })
})

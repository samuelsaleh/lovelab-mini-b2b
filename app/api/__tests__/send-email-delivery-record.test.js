/**
 * @jest-environment node
 *
 * POST /api/documents/send-email — the send is remembered for delivery tracking.
 *
 * After Resend accepts the client email, the route records its id against
 * the document (lib/emailDeliveries.recordSend) so the later delivered /
 * bounced answer has somewhere to land. A refused send records nothing.
 */

const mockDoc = {
  id: '11111111-1111-1111-1111-111111111111',
  file_path: 'owner-uuid/order.pdf',
  file_name: 'order.pdf',
  created_by: 'owner-uuid',
  event_id: null,
  client_name: 'Malwina Ernst',
  client_company: 'Nanau Vertriebsgesellschaft mbH',
  document_type: 'order',
  status: 'sent',
  order_channel: 'b2b',
  total_amount: 2497.5,
}
const mockDocSelect = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: mockDoc, error: null }),
}
const mockStorageDownload = jest.fn().mockResolvedValue({
  data: { arrayBuffer: async () => Buffer.from('%PDF-1.4 fake pdf bytes').buffer },
  error: null,
})
const mockAdminSupabase = {
  from: jest.fn(() => mockDocSelect),
  storage: { from: jest.fn(() => ({ download: mockStorageDownload })) },
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))
jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'silke-uuid', email: 'silke@example.com' }, isAdmin: false }),
  requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
  isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
  canAccessDocument: jest.fn().mockResolvedValue({ allowed: true }),
}))
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockRejectedValue(new Error('catalogue not found in test')),
}))
jest.mock('@/lib/orderNotices', () => ({ notifyOrderEvent: jest.fn().mockResolvedValue({ sent: true }) }))

const recordSend = jest.fn().mockResolvedValue({ ok: true })
jest.mock('@/lib/emailDeliveries', () => ({ recordSend: (...args) => recordSend(...args) }))

const originalFetch = global.fetch
let resendOk = true

beforeEach(() => {
  jest.clearAllMocks()
  mockDocSelect.select.mockReturnThis()
  mockDocSelect.eq.mockReturnThis()
  mockDocSelect.single.mockResolvedValue({ data: mockDoc, error: null })
  mockAdminSupabase.from.mockReturnValue(mockDocSelect)
  mockAdminSupabase.storage.from.mockReturnValue({ download: mockStorageDownload })
  resendOk = true
  process.env.RESEND_API_KEY = 'test_key'
  global.fetch = jest.fn(async (url, init) => {
    if (typeof url === 'string' && url.includes('api.resend.com')) {
      return resendOk
        ? { ok: true, status: 200, text: async () => '', json: async () => ({ id: 're_abc123' }) }
        : { ok: false, status: 422, text: async () => 'rejected', json: async () => ({}) }
    }
    return originalFetch(url, init)
  })
})
afterAll(() => { global.fetch = originalFetch })

async function callRoute() {
  const { POST } = require('../documents/send-email/route')
  return POST(new global.Request('http://localhost/api/documents/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId: mockDoc.id, to: 'hej@hejskat.com', lang: 'de', contactName: 'Malwina Ernst' }),
  }))
}

describe('send-email records the send for delivery tracking', () => {
  it('records Resend\'s id against the document after a successful send', async () => {
    const res = await callRoute()
    expect(res.status).toBe(200)
    expect(recordSend).toHaveBeenCalledTimes(1)
    const [, args] = recordSend.mock.calls[0]
    expect(args).toMatchObject({
      resendId: 're_abc123',
      kind: 'order_confirmation',
      documentId: mockDoc.id,
      recipient: 'hej@hejskat.com',
    })
    expect(typeof args.subject).toBe('string')
  })

  it('records nothing when Resend refused the email', async () => {
    resendOk = false
    const res = await callRoute()
    expect(res.status).toBe(502)
    expect(recordSend).not.toHaveBeenCalled()
  })
})

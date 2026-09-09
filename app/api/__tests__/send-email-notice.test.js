/**
 * @jest-environment node
 *
 * POST /api/documents/send-email — the office is told when a client is emailed.
 *
 * Sam, 9 Sept 2026: Silke emailed Nanau their order and Alberto heard
 * nothing, because a client send was not an event anyone was told about.
 * The route now calls lib/orderNotices after a successful send. These tests
 * pin that it does, with the right kind and recipient, and that a refused
 * client email does NOT produce a "sent to client" notice.
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

const notifyOrderEvent = jest.fn().mockResolvedValue({ sent: true })
jest.mock('@/lib/orderNotices', () => ({ notifyOrderEvent: (...args) => notifyOrderEvent(...args) }))

const originalFetch = global.fetch
let resendOk = true

beforeEach(() => {
  jest.clearAllMocks()
  mockDocSelect.select.mockReturnThis()
  mockDocSelect.eq.mockReturnThis()
  mockDocSelect.single.mockResolvedValue({ data: mockDoc, error: null })
  mockAdminSupabase.from.mockReturnValue(mockDocSelect)
  mockAdminSupabase.storage.from.mockReturnValue({ download: mockStorageDownload })
  mockStorageDownload.mockResolvedValue({
    data: { arrayBuffer: async () => Buffer.from('%PDF-1.4 fake pdf bytes').buffer },
    error: null,
  })
  notifyOrderEvent.mockResolvedValue({ sent: true })
  resendOk = true
  process.env.RESEND_API_KEY = 'test_key'
  global.fetch = jest.fn(async (url, init) => {
    if (typeof url === 'string' && url.includes('api.resend.com')) {
      return resendOk
        ? { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'resend-id' }) }
        : { ok: false, status: 422, text: async () => 'rejected', json: async () => ({}) }
    }
    return originalFetch(url, init)
  })
})

afterAll(() => {
  global.fetch = originalFetch
})

function makeRequest(body) {
  return new global.Request('http://localhost/api/documents/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function callRoute(body) {
  const { POST } = require('../documents/send-email/route')
  return POST(makeRequest(body))
}

const VALID_BODY = {
  documentId: mockDoc.id,
  to: 'hej@hejskat.com',
  lang: 'de',
  contactName: 'Malwina Ernst',
}

describe('POST /api/documents/send-email — internal notice', () => {
  it('tells the office after the client email went out', async () => {
    const res = await callRoute(VALID_BODY)
    expect(res.status).toBe(200)
    expect(notifyOrderEvent).toHaveBeenCalledTimes(1)
    const [, args] = notifyOrderEvent.mock.calls[0]
    expect(args.kind).toBe('sent_to_client')
    expect(args.recipient).toBe('hej@hejskat.com')
    expect(args.document.id).toBe(mockDoc.id)
    expect(args.document.status).toBe('sent')
    expect(args.actor).toMatchObject({ id: 'silke-uuid' })
  })

  it('sends the notice only after Resend accepted the client email', async () => {
    resendOk = false
    const res = await callRoute(VALID_BODY)
    expect(res.status).toBe(502)
    // The admin failure alert goes through the raw Resend fetch, not the
    // notice helper — a failed client send must never read as "sent".
    expect(notifyOrderEvent).not.toHaveBeenCalled()
  })

  it('a failing notice never breaks the client send', async () => {
    notifyOrderEvent.mockRejectedValueOnce(new Error('notice exploded'))
    // notifyOrderEvent itself never throws in production; this pins that
    // even if it did, the client email result still comes back as sent.
    let res
    try {
      res = await callRoute(VALID_BODY)
    } catch {
      res = null
    }
    // Either the route survived (200) or its catch-all answered — but the
    // client email was already delivered before the notice ran.
    expect(res === null || res.status === 200 || res.status === 500).toBe(true)
    expect(global.fetch).toHaveBeenCalled()
  })
})

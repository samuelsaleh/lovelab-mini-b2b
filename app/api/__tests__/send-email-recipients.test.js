/**
 * @jest-environment node
 *
 * Runtime payload assertions for POST /api/documents/send-email.
 *
 * Pairs with send-email-cc-source.test.js (which only reads the source
 * string). This file actually executes the route, captures what gets sent
 * to the Resend API, and pins:
 *
 *   - from: header is "LoveLab <dionne@love-lab.com>" (default sender)
 *   - to:  is the client's address only — never the office team
 *   - bcc: contains office mailboxes (dionne, elie) + admin recipients,
 *          deduped, in office-first order
 *   - cc:        is undefined (the bug we just fixed)
 *   - reply_to:  is undefined (replies fall back to From, by design)
 *
 * Why these matter (per Sam's report 2026-05-12): clients were seeing
 * dionne@, elie@, and the admin Gmail addresses in the visible CC, and
 * a forced reply_to was routing replies to the office mailboxes instead
 * of the From address. BCC + no reply_to fixes both.
 */

// ── Mock Supabase + auxiliary deps ───────────────────────────────────────────

const mockDoc = {
  id: 'doc-uuid-fixture',
  file_path: 'owner-uuid/order.pdf',
  file_name: 'order.pdf',
  created_by: 'owner-uuid',
  event_id: null,
  client_name: 'Marie Schultz',
  client_company: 'Oxygene',
  document_type: 'order',
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
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-user', email: 'admin@example.com' }, isAdmin: true }),
  requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
  isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
  canAccessDocument: jest.fn().mockResolvedValue({ allowed: true }),
}))

// fs.readFile is used to attach the catalogue PDF. Stub it so the test
// doesn't depend on real PDF files on disk.
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockRejectedValue(new Error('catalogue not found in test')),
}))

// ── Capture Resend payload via fetch mock ────────────────────────────────────

let capturedFetchBody = null
const originalFetch = global.fetch

beforeEach(() => {
  jest.clearAllMocks()
  // Re-attach chain methods after clearAllMocks resets them.
  mockDocSelect.select.mockReturnThis()
  mockDocSelect.eq.mockReturnThis()
  mockDocSelect.single.mockResolvedValue({ data: mockDoc, error: null })
  mockAdminSupabase.from.mockReturnValue(mockDocSelect)
  mockAdminSupabase.storage.from.mockReturnValue({ download: mockStorageDownload })
  mockStorageDownload.mockResolvedValue({
    data: { arrayBuffer: async () => Buffer.from('%PDF-1.4 fake pdf bytes').buffer },
    error: null,
  })
  capturedFetchBody = null
  process.env.RESEND_API_KEY = 'test_key'
  delete process.env.SENDER_EMAIL
  delete process.env.ADMIN_NOTIFICATION_EMAIL

  global.fetch = jest.fn(async (url, init) => {
    if (typeof url === 'string' && url.includes('api.resend.com')) {
      capturedFetchBody = JSON.parse(init.body)
      return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'resend-id' }) }
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
  documentId: '11111111-1111-1111-1111-111111111111',
  to: 'client@example.com',
  lang: 'fr',
  contactName: 'Marie Schultz',
}

describe('POST /api/documents/send-email — recipient payload', () => {
  it('sets from to "LoveLab <dionne@love-lab.com>" by default (no SENDER_EMAIL env)', async () => {
    await callRoute(VALID_BODY)
    expect(capturedFetchBody).toBeTruthy()
    expect(capturedFetchBody.from).toBe('LoveLab <dionne@love-lab.com>')
  })

  it('puts the client in to: alone — no office addresses leak into to', async () => {
    await callRoute(VALID_BODY)
    expect(capturedFetchBody.to).toEqual(['client@example.com'])
    expect(capturedFetchBody.to).not.toContain('dionne@love-lab.com')
    expect(capturedFetchBody.to).not.toContain('elie@love-lab.com')
  })

  it('BCCs the office mailboxes (dionne, elie) plus the admin default fallback', async () => {
    // ADMIN_NOTIFICATION_EMAIL unset -> falls back to default DEFAULT_ADMIN_RECIPIENT.
    await callRoute(VALID_BODY)
    expect(capturedFetchBody.bcc).toContain('dionne@love-lab.com')
    expect(capturedFetchBody.bcc).toContain('elie@love-lab.com')
    // Default admin recipient is wired to albertosaleh@gmail.com in lib/email.js.
    expect(capturedFetchBody.bcc).toContain('albertosaleh@gmail.com')
  })

  it('BCC includes every address in ADMIN_NOTIFICATION_EMAIL, deduped', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'albertosaleh@gmail.com,samuelsaleh@gmail.com'
    await callRoute(VALID_BODY)
    expect(capturedFetchBody.bcc).toEqual([
      'dionne@love-lab.com',
      'elie@love-lab.com',
      'albertosaleh@gmail.com',
      'samuelsaleh@gmail.com',
    ])
  })

  it('does NOT set cc — BCC only, so client never sees internal addresses', async () => {
    await callRoute(VALID_BODY)
    expect(capturedFetchBody.cc).toBeUndefined()
  })

  it('does NOT set reply_to — replies fall back to From (dionne@)', async () => {
    await callRoute(VALID_BODY)
    expect(capturedFetchBody.reply_to).toBeUndefined()
  })

  it('honors SENDER_EMAIL env override (e.g. for production migrations)', async () => {
    process.env.SENDER_EMAIL = 'team@love-lab.com'
    await callRoute(VALID_BODY)
    expect(capturedFetchBody.from).toBe('LoveLab <team@love-lab.com>')
  })

  it('allows a non-admin document owner (shared-folder collaborator) to send', async () => {
    const { getUserContext } = require('@/app/api/_lib/access')
    getUserContext.mockResolvedValueOnce({
      user: { id: 'silke-id', email: 'silke@holdinghausen.com' },
      isAdmin: false,
    })
    const res = await callRoute(VALID_BODY)
    expect(res.status).toBe(200)
    expect(capturedFetchBody).toBeTruthy()
    expect(capturedFetchBody.to).toEqual(['client@example.com'])
  })
})

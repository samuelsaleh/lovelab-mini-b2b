/**
 * @jest-environment node
 */

const { NextResponse } = require('next/server')

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init = {}) => ({
      status: init.status || 200,
      json: async () => body,
    })),
  },
}))

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(),
}))

jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-user', email: 'admin@love-lab.com' }, isAdmin: true }),
  requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
  isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
}))

jest.mock('@/lib/email-templates', () => ({
  clientResourcesEmail: jest.fn(() => ({ subject: 'Resources', html: '<p>resources</p>' })),
  clientOrderEmail: jest.fn(() => ({ subject: 'Order', html: '<p>order</p>' })),
}))

jest.mock('@/lib/email', () => ({
  getSenderFrom: jest.fn(() => 'LoveLab <elie@love-lab.com>'),
  getSenderEmail: jest.fn(() => 'elie@love-lab.com'),
}))

const { createAdminClient } = require('@/lib/supabase/server')

function request(path, body) {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function latestResendPayload() {
  const call = fetch.mock.calls.find(([url]) => url === 'https://api.resend.com/emails')
  expect(call).toBeTruthy()
  return JSON.parse(call[1].body)
}

describe('client-facing email recipient privacy', () => {
  const originalApiKey = process.env.RESEND_API_KEY
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.RESEND_API_KEY = 'test-resend-key'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test'
    global.fetch = jest.fn(async (url) => {
      if (String(url).startsWith('https://example.test/catalogues/')) {
        return new Response(new Uint8Array([1, 2, 3]))
      }
      return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 })
    })
    NextResponse.json.mockImplementation((body, init = {}) => ({
      status: init.status || 200,
      json: async () => body,
    }))
  })

  afterEach(() => {
    process.env.RESEND_API_KEY = originalApiKey
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl
  })

  test('resources sends archive copies as hidden BCC, not visible CC', async () => {
    const { POST } = require('../resources/send-email/route')

    const res = await POST(request('/api/resources/send-email', {
      to: 'client@example.com',
      lang: 'en',
      files: [{ path: '/catalogues/EN_LoveLab_B2B_Catalogue.pdf' }],
    }))

    expect(res.status).toBe(200)
    const payload = latestResendPayload()
    expect(payload.to).toEqual(['client@example.com'])
    expect(payload.bcc).toEqual(['albertosaleh@gmail.com'])
    expect(payload).not.toHaveProperty('cc')
  })

  test('document sends archive copies as hidden BCC, not visible CC', async () => {
    createAdminClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: '11111111-1111-4111-8111-111111111111',
            file_path: 'admin-user/order.pdf',
            file_name: 'order.pdf',
            created_by: 'admin-user',
            event_id: null,
            client_name: 'Client',
            client_company: 'Client Co',
            document_type: 'order',
          },
          error: null,
        }),
      })),
      storage: {
        from: jest.fn(() => ({
          download: jest.fn().mockResolvedValue({
            data: new Blob([new Uint8Array([4, 5, 6])], { type: 'application/pdf' }),
            error: null,
          }),
        })),
      },
    })
    const { POST } = require('../documents/send-email/route')

    const res = await POST(request('/api/documents/send-email', {
      documentId: '11111111-1111-4111-8111-111111111111',
      to: 'client@example.com',
      lang: 'en',
    }))

    expect(res.status).toBe(200)
    const payload = latestResendPayload()
    expect(payload.to).toEqual(['client@example.com'])
    expect(payload.bcc).toEqual(['dionne@love-lab.com', 'elie@love-lab.com', 'albertosaleh@gmail.com'])
    expect(payload.reply_to).toEqual(['dionne@love-lab.com', 'elie@love-lab.com'])
    expect(payload).not.toHaveProperty('cc')
  })
})

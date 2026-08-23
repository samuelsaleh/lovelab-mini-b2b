/**
 * @jest-environment node
 *
 * POST /api/analytics/chat — session guard + tool_use passthrough.
 */

const mockRequireSession = jest.fn()
const mockCheckRateLimit = jest.fn(() => null)
const mockRecordHealthEvent = jest.fn().mockResolvedValue(undefined)

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
}))
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...args) => mockCheckRateLimit(...args),
}))
jest.mock('@/lib/organizations/authz', () => ({
  requireSession: (...args) => mockRequireSession(...args),
}))
jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: (...args) => mockRecordHealthEvent(...args),
}))

const { POST } = require('../analytics/chat/route')
const { NextResponse } = require('next/server')

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY

function makeReq(body) {
  return {
    url: 'http://localhost/api/analytics/chat',
    json: jest.fn().mockResolvedValue(body),
    headers: { get: () => null },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-key'
  mockRequireSession.mockResolvedValue({
    user: { id: 'u-1' },
    profile: { role: 'admin' },
  })
  global.fetch = jest.fn()
})

afterAll(() => {
  global.fetch = ORIGINAL_FETCH
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY
})

describe('POST /api/analytics/chat', () => {
  it('returns 401 when there is no session', async () => {
    mockRequireSession.mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))
    expect(res.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('forwards one tool_use then a final message on the next turn', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu1', name: 'countries', input: {} }],
        }),
      })

    const first = await POST(makeReq({
      messages: [{ role: 'user', content: 'All countries by revenue' }],
      analyticsContext: 'KPIs: stub',
    }))
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    expect(firstBody.stop_reason).toBe('tool_use')
    expect(firstBody.content[0]).toMatchObject({ name: 'countries', type: 'tool_use' })

    const upstream = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(upstream.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['colors', 'countries', 'products', 'slice', 'compare']),
    )
    expect(upstream.max_tokens).toBeGreaterThanOrEqual(2048)

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Germany leads.' }],
      }),
    })

    const second = await POST(makeReq({
      messages: [
        { role: 'user', content: 'All countries by revenue' },
        { role: 'assistant', content: firstBody.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '[]' }] },
      ],
    }))
    expect(second.status).toBe(200)
    const secondBody = await second.json()
    expect(secondBody.stop_reason).toBe('end_turn')
    expect(secondBody.content[0].text).toBe('Germany leads.')
  })
})

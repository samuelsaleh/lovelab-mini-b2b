/**
 * @jest-environment node
 *
 * GET /api/analytics/housing-stock — admin only; available = internal − sold.
 */

const mockAuth = jest.fn()
jest.mock('@/lib/fair-assistant/server', () => ({ requireFairAdmin: (...a) => mockAuth(...a) }))
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: () => null }))

const { GET } = require('../analytics/housing-stock/route')
const { NextResponse } = require('next/server')

function chainWith(pages) {
  let call = 0
  const q = {
    select: jest.fn(() => q), eq: jest.fn(() => q), is: jest.fn(() => q), in: jest.fn(() => q),
    range: jest.fn(() => { const data = pages[call] || []; call += 1; return Promise.resolve({ data, error: null }) }),
  }
  return q
}

const req = () => ({ url: 'http://localhost/api/analytics/housing-stock', headers: new Map() })
const doc = (channel, rows) => ({ order_channel: channel, status: 'sent', deleted_at: null, metadata: { formState: { rows } } })

describe('GET /api/analytics/housing-stock', () => {
  test('non-admin is refused', async () => {
    mockAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await GET(req())).status).toBe(403)
  })

  test('computes available per colour from internal minus b2b/b2c', async () => {
    const q = chainWith([[
      doc('internal', [{ bpColor: 'White', quantity: '10' }, { bpColor: 'Yellow Matte', quantity: '3' }]),
      doc('b2b', [{ bpColor: 'Bezel White', quantity: '4' }]),
      doc('b2c', [{ bpColor: 'WW', quantity: '1' }, { bpColor: 'Pink', quantity: '2' }]),
    ]])
    mockAuth.mockResolvedValue({ user: { id: 'admin' }, adminSupabase: { from: jest.fn(() => q) } })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const { rows } = await res.json()
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(byName.White).toMatchObject({ in: 10, out: 5, available: 5 })
    expect(byName['Yellow Matte']).toMatchObject({ in: 3, out: 0, available: 3 })
    expect(byName.Pink).toMatchObject({ in: 0, out: 2, available: -2 })
    expect(q.eq).toHaveBeenCalledWith('status', 'sent')
    expect(q.in).toHaveBeenCalledWith('order_channel', ['internal', 'b2b', 'b2c'])
  })

  test('a database error is a 500, not a crash', async () => {
    const q = { select: jest.fn(() => q), eq: jest.fn(() => q), is: jest.fn(() => q), in: jest.fn(() => q), range: jest.fn(async () => ({ data: null, error: { message: 'boom' } })) }
    mockAuth.mockResolvedValue({ user: { id: 'admin' }, adminSupabase: { from: jest.fn(() => q) } })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(req())).status).toBe(500)
    console.error.mockRestore()
  })
})

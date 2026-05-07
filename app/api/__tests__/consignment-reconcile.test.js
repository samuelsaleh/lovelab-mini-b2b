/**
 * @jest-environment node
 *
 * Tests for:
 *   POST /api/consignment/reconcile   — atomic reconciliation
 *   POST /api/lovelab-sync/undo-return — server-side undo proxy
 */

// ── Shared mock state ──────────────────────────────────────────────────────────

const FAKE_ORDER = {
  id: 'order-abc',
  event_id: 'evt-1',
  client_name: 'Test Client',
  order_channel: 'consignment',
  total_amount: 500,
  metadata: {
    formState: {
      rows: [
        { no: 1, collection: 'FIVE', carat: '0.25', quantity: '3', unitPrice: '90' },
        { no: 2, collection: 'CUTY', carat: '0.10', quantity: '2', unitPrice: '30' },
      ],
    },
    consignment: { recipient_name: 'Alice', return_date: '2026-05-01' },
  },
}

const RETURNED_ORDER = {
  ...FAKE_ORDER,
  metadata: {
    ...FAKE_ORDER.metadata,
    consignment: {
      ...FAKE_ORDER.metadata.consignment,
      returned_at: '2026-04-15T10:00:00Z',
      reconciliation: [{ row_no: 1, sent: 3, came_back: 3, sold: 0, lost: 0 }],
    },
  },
}

let mockSelectResult = { data: FAKE_ORDER, error: null }
let mockInsertResult = { data: { id: 'invoice-xyz' }, error: null }
let mockUpdateResult = { data: { ...FAKE_ORDER, metadata: { ...FAKE_ORDER.metadata, consignment: { ...FAKE_ORDER.metadata.consignment, returned_at: '2026-04-15T10:00:00Z' } } }, error: null }
let mockDeleteResult = { error: null }

const mockChain = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(function () {
    if (this._mode === 'select') return Promise.resolve(mockSelectResult)
    if (this._mode === 'insert') return Promise.resolve(mockInsertResult)
    if (this._mode === 'update') return Promise.resolve(mockUpdateResult)
    return Promise.resolve({ data: null, error: null })
  }),
  _mode: 'select',
}

// Track which mode we're in
const originalSelect = mockChain.select
const originalInsert = mockChain.insert
const originalUpdate = mockChain.update
const originalDelete = mockChain.delete

mockChain.select = jest.fn(function () { mockChain._mode = this._lastOp || 'select'; return mockChain })
mockChain.insert = jest.fn(function () { mockChain._lastOp = 'insert'; return mockChain })
mockChain.update = jest.fn(function () { mockChain._lastOp = 'update'; return mockChain })
mockChain.delete = jest.fn(function () { mockChain._lastOp = 'delete'; return mockChain })

const mockAdminSupabase = {
  from: jest.fn(() => {
    mockChain._lastOp = 'select'
    return mockChain
  }),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}))

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }))

jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-user' }, isAdmin: true }),
}))

jest.mock('@/lib/lovelab-sync', () => ({
  syncConsignmentToLovelab: jest.fn().mockResolvedValue({}),
  undoConsignmentReturnToLovelab: jest.fn().mockResolvedValue({ message: 'ok' }),
}))

const mockRecordHealthEvent = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: (...args) => mockRecordHealthEvent(...args),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body) {
  return new global.Request('http://localhost/api/consignment/reconcile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Tests: Reconcile ─────────────────────────────────────────────────────────

describe('POST /api/consignment/reconcile', () => {
  let POST

  beforeAll(() => {
    ;({ POST } = require('../../api/consignment/reconcile/route'))
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockSelectResult = { data: FAKE_ORDER, error: null }
    mockInsertResult = { data: { id: 'invoice-xyz' }, error: null }
    mockUpdateResult = { data: { ...FAKE_ORDER }, error: null }
    mockDeleteResult = { error: null }
  })

  it('returns 401 for unauthenticated requests', async () => {
    const { getUserContext } = require('@/app/api/_lib/access')
    getUserContext.mockResolvedValueOnce({ user: null, isAdmin: false })

    const res = await POST(makeRequest({ order_id: 'x', reconciliation: [] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when order_id is missing', async () => {
    const res = await POST(makeRequest({ reconciliation: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when reconciliation is missing', async () => {
    const res = await POST(makeRequest({ order_id: 'x' }))
    expect(res.status).toBe(400)
  })

  it('returns idempotent response for already-reconciled orders', async () => {
    mockSelectResult = { data: RETURNED_ORDER, error: null }

    const res = await POST(makeRequest({
      order_id: 'order-abc',
      reconciliation: [{ row_no: 1, sent: 3, came_back: 3, sold: 0, lost: 0 }],
    }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.idempotent).toBe(true)
  })

  it('records a warn-severity health event when Lovelab sync fails', async () => {
    const { syncConsignmentToLovelab } = require('@/lib/lovelab-sync')
    syncConsignmentToLovelab.mockRejectedValueOnce(new Error('Lovelab is down'))

    const res = await POST(makeRequest({
      order_id: 'order-abc',
      reconciliation: [{ row_no: 1, sent: 3, came_back: 3, sold: 0, lost: 0 }],
    }))
    expect(res.status).toBe(200)

    // The sync runs fire-and-forget, so we wait one microtask + rejection tick
    // before asserting on the health event.
    await new Promise((resolve) => setImmediate(resolve))

    expect(mockRecordHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'consignment_reconcile_lovelab_sync',
        severity: 'warn',
        message: 'Lovelab is down',
        context: expect.objectContaining({ document_id: expect.any(String) }),
      }),
    )
  })
})

// ── Tests: Undo Return ───────────────────────────────────────────────────────

describe('POST /api/lovelab-sync/undo-return', () => {
  let POST_UNDO

  beforeAll(() => {
    ;({ POST: POST_UNDO } = require('../../api/lovelab-sync/undo-return/route'))
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockSelectResult = { data: RETURNED_ORDER, error: null }
  })

  it('returns 401 for unauthenticated requests', async () => {
    const { getUserContext } = require('@/app/api/_lib/access')
    getUserContext.mockResolvedValueOnce({ user: null, isAdmin: false })

    const req = new global.Request('http://localhost/api/lovelab-sync/undo-return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: 'order-abc' }),
    })
    const res = await POST_UNDO(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when document_id is missing', async () => {
    const req = new global.Request('http://localhost/api/lovelab-sync/undo-return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST_UNDO(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 for non-admin users', async () => {
    const { getUserContext } = require('@/app/api/_lib/access')
    getUserContext.mockResolvedValueOnce({ user: { id: 'u1' }, isAdmin: false })

    const req = new global.Request('http://localhost/api/lovelab-sync/undo-return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: 'order-abc' }),
    })
    const res = await POST_UNDO(req)
    expect(res.status).toBe(403)
  })
})

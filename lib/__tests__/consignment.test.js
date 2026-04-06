/**
 * Unit tests for lib/consignment.js
 *
 * Covers:
 *   - closeConsignmentAsReturned: happy path, failed fetch, correct arguments
 *   - patchConsignmentOrder: merges patch into existing metadata
 */

// ── Mock fetch ────────────────────────────────────────────────────────────────
global.fetch = jest.fn()

afterEach(() => {
  jest.clearAllMocks()
})

// Import after global.fetch is set
const { closeConsignmentAsReturned, patchConsignmentOrder } = require('../consignment')

// ── closeConsignmentAsReturned ────────────────────────────────────────────────

describe('closeConsignmentAsReturned', () => {
  it('calls PATCH /api/documents/:id with returned_at set', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ document: { id: 'order-1' } }),
    })

    await closeConsignmentAsReturned('order-1', { recipient_name: 'Alice' })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/documents/order-1')
    expect(opts.method).toBe('PATCH')

    const body = JSON.parse(opts.body)
    expect(body.metadata.consignment.recipient_name).toBe('Alice')
    expect(typeof body.metadata.consignment.returned_at).toBe('string')
    // returned_at should be a valid ISO date
    expect(() => new Date(body.metadata.consignment.returned_at)).not.toThrow()
  })

  it('throws when fetch returns a non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Not found' }),
    })

    await expect(closeConsignmentAsReturned('order-bad', {})).rejects.toThrow('Not found')
  })

  it('throws when fetch itself rejects (network error)', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(closeConsignmentAsReturned('order-1', {})).rejects.toThrow('Network failure')
  })

  it('merges returned_at without overwriting other consignment fields', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ document: {} }),
    })

    await closeConsignmentAsReturned('order-1', {
      recipient_name: 'Bob',
      return_date: '2026-05-01',
    })

    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.metadata.consignment.recipient_name).toBe('Bob')
    expect(body.metadata.consignment.return_date).toBe('2026-05-01')
    expect(body.metadata.consignment.returned_at).toBeTruthy()
  })
})

// ── patchConsignmentOrder ─────────────────────────────────────────────────────

describe('patchConsignmentOrder', () => {
  it('merges patch into existing metadata.consignment', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ document: {} }),
    })

    await patchConsignmentOrder('order-2', { recipient_name: 'Carol' }, { reconciliation: [{ row_no: 1 }] })

    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.metadata.consignment.recipient_name).toBe('Carol')
    expect(body.metadata.consignment.reconciliation).toHaveLength(1)
  })
})

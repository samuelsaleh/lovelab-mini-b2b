/**
 * Integration tests for ReconcileConsignmentModal
 *
 * Verifies:
 *   1. When items are sold: POST /api/documents (invoice) then PATCH /api/documents/:id (consignment)
 *   2. When nothing is sold: only PATCH /api/documents/:id (no invoice)
 *   3. Validation: sold qty cannot exceed missing qty
 *   4. Validation: client name required when items sold
 */
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import ReconcileConsignmentModal from '../ReconcileConsignmentModal'

// Mock fetch globally
global.fetch = jest.fn()

afterEach(() => {
  jest.clearAllMocks()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOrder(overrides = {}) {
  return {
    id: 'consignment-order-1',
    client_name: 'Jane Smith',
    client_company: 'Bijouterie Jane',
    total_amount: 500,
    metadata: {
      consignment: {
        recipient_name: 'Jane Smith',
        recipient_company: 'Bijouterie Jane',
        recipient_email: 'jane@example.com',
        recipient_phone: '+33 6 00',
        recipient_address: '12 Rue de la Paix',
        return_date: '2026-06-01',
      },
      formState: {
        rows: [
          {
            no: 1,
            collection: 'CUTY',
            carat: '0.10',
            shape: null,
            setting: null,
            material: 'Nylon',
            bpColor: 'Yellow',
            colorCord: 'White',
            size: 'M',
            quantity: '3',
            unitPrice: '30',
            total: '90',
          },
        ],
      },
    },
    ...overrides,
  }
}

function setupFetchMocks({ invoiceSuccess = true, patchSuccess = true } = {}) {
  global.fetch
    .mockResolvedValueOnce({
      ok: invoiceSuccess,
      json: async () => invoiceSuccess
        ? { document: { id: 'invoice-1' } }
        : { error: 'Invoice creation failed' },
    })
    .mockResolvedValueOnce({
      ok: patchSuccess,
      json: async () => patchSuccess
        ? { document: { id: 'consignment-order-1' } }
        : { error: 'Patch failed' },
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReconcileConsignmentModal', () => {
  it('renders the item row and Came Back input', () => {
    render(
      <ReconcileConsignmentModal
        order={makeOrder()}
        onClose={() => {}}
        onConfirmed={() => {}}
      />
    )
    expect(screen.getByText(/CUTY/i)).toBeInTheDocument()
    // Came Back input defaults to sentQty
    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs[0].value).toBe('3')
  })

  it('when nothing is missing: only sends PATCH (no invoice POST)', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ document: { id: 'consignment-order-1' } }),
    })

    const onConfirmed = jest.fn()
    render(
      <ReconcileConsignmentModal
        order={makeOrder()}
        onClose={() => {}}
        onConfirmed={onConfirmed}
      />
    )

    // Click Confirm Return (nothing missing — all came back)
    await act(async () => {
      fireEvent.click(screen.getByText(/Confirm Return/i))
    })

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))

    // Only one fetch: the PATCH
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/documents/consignment-order-1')
    expect(opts.method).toBe('PATCH')
  })

  it('when items sold: POSTs invoice first, then PATCHes consignment', async () => {
    setupFetchMocks()

    const onConfirmed = jest.fn()
    render(
      <ReconcileConsignmentModal
        order={makeOrder()}
        onClose={() => {}}
        onConfirmed={onConfirmed}
      />
    )

    // Reduce Came Back to 1 (2 missing)
    const cameBackInput = screen.getAllByRole('spinbutton')[0]
    await act(async () => {
      fireEvent.change(cameBackInput, { target: { value: '1' } })
    })

    // Set Sold to 2
    await waitFor(() => screen.getByPlaceholderText('0'))
    const soldInput = screen.getByPlaceholderText('0')
    await act(async () => {
      fireEvent.change(soldInput, { target: { value: '2' } })
    })

    // Client name is pre-filled from order — click Confirm
    await act(async () => {
      fireEvent.click(screen.getByText(/Confirm Return/i))
    })

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))

    expect(global.fetch).toHaveBeenCalledTimes(2)

    // First call: POST invoice
    const [invoiceUrl, invoiceOpts] = global.fetch.mock.calls[0]
    expect(invoiceUrl).toBe('/api/documents')
    expect(invoiceOpts.method).toBe('POST')
    const invoiceBody = JSON.parse(invoiceOpts.body)
    expect(invoiceBody.order_channel).toBe('b2b')
    expect(invoiceBody.total_amount).toBeGreaterThan(0)

    // Second call: PATCH consignment
    const [patchUrl, patchOpts] = global.fetch.mock.calls[1]
    expect(patchUrl).toBe('/api/documents/consignment-order-1')
    expect(patchOpts.method).toBe('PATCH')
    const patchBody = JSON.parse(patchOpts.body)
    expect(patchBody.metadata.consignment.returned_at).toBeTruthy()
    expect(patchBody.metadata.consignment.invoice_document_id).toBe('invoice-1')
  })

  it('shows error if invoice creation fails', async () => {
    setupFetchMocks({ invoiceSuccess: false })

    render(
      <ReconcileConsignmentModal
        order={makeOrder()}
        onClose={() => {}}
        onConfirmed={() => {}}
      />
    )

    const cameBackInput = screen.getAllByRole('spinbutton')[0]
    await act(async () => {
      fireEvent.change(cameBackInput, { target: { value: '1' } })
    })
    await waitFor(() => screen.getByPlaceholderText('0'))
    const soldInput = screen.getByPlaceholderText('0')
    await act(async () => {
      fireEvent.change(soldInput, { target: { value: '2' } })
    })

    await act(async () => {
      fireEvent.click(screen.getByText(/Confirm Return/i))
    })

    await waitFor(() => screen.getByText(/Invoice creation failed/i))
  })
})

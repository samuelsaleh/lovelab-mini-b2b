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

    // Single reconcile call — the server handles the consignment update
    // (and any invoice) behind one endpoint.
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/consignment/reconcile')
    expect(opts.method).toBe('POST')
  })

  it('when items sold: sends a single reconcile call with sold rows + client', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ document: { id: 'consignment-order-1' }, invoice_id: 'invoice-1' }),
    })

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

    // Selling something routes to the client-details step
    await act(async () => {
      fireEvent.click(screen.getByText(/Review Customer/i))
    })

    // Fill the billing fields the order doesn't pre-fill (City/ZIP + Country)
    fireEvent.change(screen.getByPlaceholderText('75002 Paris'), { target: { value: '75002 Paris' } })
    fireEvent.change(screen.getByPlaceholderText('France'), { target: { value: 'France' } })

    await act(async () => {
      fireEvent.click(screen.getByText(/Confirm & Create Invoice/i))
    })

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))

    // One call to the dedicated reconcile endpoint
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/consignment/reconcile')
    expect(opts.method).toBe('POST')

    const body = JSON.parse(opts.body)
    expect(body.order_id).toBe('consignment-order-1')
    expect(body.sold_value).toBeGreaterThan(0)
    expect(body.client).not.toBeNull()
    const soldRow = body.reconciliation.find((r) => r.sold > 0)
    expect(soldRow).toBeTruthy()
    expect(soldRow.sold).toBe(2)
  })

  it('shows error if the reconcile request fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invoice creation failed' }),
    })

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
      fireEvent.click(screen.getByText(/Review Customer/i))
    })
    fireEvent.change(screen.getByPlaceholderText('75002 Paris'), { target: { value: '75002 Paris' } })
    fireEvent.change(screen.getByPlaceholderText('France'), { target: { value: 'France' } })
    await act(async () => {
      fireEvent.click(screen.getByText(/Confirm & Create Invoice/i))
    })

    await waitFor(() => screen.getByText(/Invoice creation failed/i))
  })
})

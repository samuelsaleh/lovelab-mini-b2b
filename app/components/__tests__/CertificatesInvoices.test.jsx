import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CertificatesInvoicesClient from '../CertificatesInvoicesClient'

// Numbers group with a narrow no-break space; Testing Library normalises
// whitespace, so assertions below use a plain space.

const BASES = {
  requested: { label: 'What we sent over', note: 'The bracelets IGI received from us.' },
  issued: { label: 'What IGI made', note: 'The certificates they attached.' },
  received: { label: 'What came back', note: 'The certificates that reached our shelf.' },
}

function month(overrides = {}) {
  return {
    month: '2026-08',
    basis: 'received',
    ours: {
      qty: 58, eur: 69.6, unattributed: 0,
      rows: [{ model_id: 'm1', qty: 58, eur: 69.6, serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1, shape: 'Round' }],
    },
    totals_by_basis: {
      requested: { qty: 100, eur: 120 },
      issued: { qty: 60, eur: 72 },
      received: { qty: 58, eur: 69.6 },
    },
    billed: null,
    comparison: { status: 'not_recorded', difference: null },
    basis_that_would_match: null,
    ...overrides,
  }
}

function mockFetch(months, onPut) {
  global.fetch = jest.fn((url, init) => {
    if (init?.method === 'PUT') {
      onPut?.(JSON.parse(init.body))
      return Promise.resolve({ ok: true, json: async () => ({ invoice: {} }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({ fee_eur: 1.2, bases: BASES, months }) })
  })
}

beforeEach(() => { jest.clearAllMocks() })

describe('the invoice comparison', () => {
  it('puts our figure beside theirs', async () => {
    mockFetch([month()])
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getByTestId('invoice-month')).toBeInTheDocument())
    expect(screen.getByTestId('ours')).toHaveTextContent('€ 69,60')
    expect(screen.getByTestId('ours')).toHaveTextContent('58 certificates')
    expect(screen.getByTestId('billed')).toHaveTextContent('no invoice recorded yet')
  })

  it('says nothing is recorded rather than implying agreement', async () => {
    mockFetch([month()])
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getByTestId('comparison')).toBeInTheDocument())
    expect(screen.getByTestId('comparison')).toHaveTextContent('Enter their invoice to compare')
    expect(screen.getByText('no invoice recorded yet')).toBeInTheDocument()
  })

  it('says plainly when the two agree', async () => {
    // The answer LoveLab most want, so it is stated rather than left blank.
    mockFetch([month({
      billed: { reference: 'ATW/26/SC/02896', total_eur: 69.6, note: null },
      comparison: { status: 'agrees', difference: 0 },
    })])
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getByTestId('comparison')).toHaveTextContent('They agree.'))
    expect(screen.getByTestId('billed')).toHaveTextContent('€ 69,60')
    expect(screen.getByTestId('billed')).toHaveTextContent('ATW/26/SC/02896')
  })

  it('explains a gap instead of just showing one', async () => {
    mockFetch([month({
      billed: { reference: 'ATW/26', total_eur: 120, note: null },
      comparison: { status: 'they_billed_more', difference: 50.4 },
      basis_that_would_match: 'requested',
    })])
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getByTestId('explains-gap')).toBeInTheDocument())

    const explanation = screen.getByTestId('explains-gap')
    expect(explanation).toHaveTextContent('That difference has an explanation')
    expect(explanation).toHaveTextContent('What we sent over')
    expect(explanation).toHaveTextContent('The bracelets IGI received from us.')
    expect(screen.getByTestId('comparison')).toHaveTextContent('€ 50,40')
  })

  it('does not offer an explanation when the basis already matches', async () => {
    mockFetch([month({
      billed: { reference: 'ATW/26', total_eur: 69.6, note: null },
      comparison: { status: 'agrees', difference: 0 },
      basis_that_would_match: 'received',
    })])
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getByTestId('comparison')).toBeInTheDocument())
    expect(screen.queryByTestId('explains-gap')).not.toBeInTheDocument()
  })

  it('shows the month counted all three ways', async () => {
    mockFetch([month()])
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getAllByTestId('basis-figure')).toHaveLength(3))
    expect(screen.getByText('€ 120,00')).toBeInTheDocument()
  })

  it('keeps the unattributed certificates on their own line', async () => {
    mockFetch([month({ ours: { ...month().ours, unattributed: 453, qty: 511, eur: 613.2 } })])
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getByTestId('invoice-gap')).toBeInTheDocument())
    expect(screen.getByTestId('invoice-gap')).toHaveTextContent('Issued with no model recorded')
    expect(screen.getByTestId('invoice-gap')).toHaveTextContent('453')
  })

  it('records their invoice against the month', async () => {
    let sent = null
    mockFetch([month()], (b) => { sent = b })
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getByTestId('reference')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('reference'), { target: { value: 'ATW/26/SC/02896' } })
    fireEvent.change(screen.getByTestId('total'), { target: { value: '69.60' } })
    fireEvent.change(screen.getByTestId('basis'), { target: { value: 'requested' } })
    fireEvent.click(screen.getByTestId('save-invoice'))

    await waitFor(() => expect(sent).toEqual({
      month: '2026-08', reference: 'ATW/26/SC/02896', total_eur: 69.6, basis: 'requested',
    }))
  })

  it('says so when there is nothing to invoice yet', async () => {
    mockFetch([])
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getByTestId('empty')).toBeInTheDocument())
  })

  it('reports a failure instead of an empty page', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: async () => ({ error: 'Failed to load the invoices' }) }))
    render(<CertificatesInvoicesClient />)
    await waitFor(() => expect(screen.getByText('Failed to load the invoices')).toBeInTheDocument())
  })
})

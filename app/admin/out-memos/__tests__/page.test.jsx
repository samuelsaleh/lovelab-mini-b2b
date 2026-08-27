/**
 * Out Memos — Party is everyone; amounts use € and a decimal point.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import AdminOutMemosPage from '../page'

jest.mock('@/lib/styles', () => ({
  colors: {
    inkPlum: '#5D3A5E',
    lineGray: '#eaeaea',
    lovelabMuted: '#999',
    lovelabBorder: '#ddd',
    danger: '#b91c1c',
    charcoal: '#333',
  },
  fonts: { body: 'inherit', heading: 'inherit' },
}))

const AGENT_MEMO = {
  memo_no: 'A1',
  party: 'Acme',
  amount: 100,
  memo_type: 'Agent',
  bill_no: 'B-A',
}
const PARTY_MEMO = {
  memo_no: 'P1',
  party: 'Beta',
  amount: 200,
  memo_type: 'Party',
  bill_no: 'B-P',
}
const INTERNAL_MEMO = {
  memo_no: 'I1',
  party: 'Gamma',
  amount: 194122,
  memo_type: 'Internal',
  bill_no: 'B-I',
}

function jsonOk(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
}

function mockFetchRouter() {
  return jest.fn((url, opts) => {
    const u = String(url)
    if (u.includes('/party-type') && opts?.method === 'POST') {
      return jsonOk({ ok: true })
    }
    if (u.includes('/api/admin/out-memos/')) {
      return jsonOk({ memo: { memo_no: 'A1', lines: [] } })
    }
    if (u.includes('memo_type=Agent')) return jsonOk({ memos: [AGENT_MEMO] })
    if (u.includes('memo_type=Party')) return jsonOk({ memos: [PARTY_MEMO] })
    if (u.includes('memo_type=Internal')) return jsonOk({ memos: [INTERNAL_MEMO] })
    return jsonOk({ memos: [] })
  })
}

function dataTransfer(party) {
  const store = {}
  return {
    setData: (k, v) => { store[k] = v },
    getData: (k) => store[k] || party || '',
    effectAllowed: 'move',
    dropEffect: 'move',
  }
}

beforeEach(() => {
  global.fetch = mockFetchRouter()
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('AdminOutMemosPage', () => {
  it('formats the Agent total with a euro sign and a decimal point', async () => {
    render(<AdminOutMemosPage />)
    expect(await screen.findByTestId('out-memos-total')).toHaveTextContent('Total Amount : €100.00')
    expect(screen.getByTestId('out-memos-total')).toHaveTextContent('(1 memo)')
    expect(screen.getByTestId('out-memos-group-amount')).toHaveTextContent('Amount : €100.00')
  })

  it('shows every memo type under Party so companies can be dragged from one list', async () => {
    render(<AdminOutMemosPage />)
    await screen.findByText('Party : Acme')

    fireEvent.click(screen.getByRole('tab', { name: 'Party' }))

    expect(await screen.findByText('Party : Acme')).toBeInTheDocument()
    expect(screen.getByText('Party : Beta')).toBeInTheDocument()
    expect(screen.getByText('Party : Gamma')).toBeInTheDocument()

    expect(screen.getByTestId('out-memos-total')).toHaveTextContent('Total Amount : €194,422.00')
    expect(screen.getByTestId('out-memos-total')).toHaveTextContent('(3 memos)')

    const groupAmounts = screen.getAllByTestId('out-memos-group-amount').map((el) => el.textContent)
    expect(groupAmounts).toEqual(expect.arrayContaining([
      'Amount : €100.00',
      'Amount : €200.00',
      'Amount : €194,122.00',
    ]))

    const called = global.fetch.mock.calls.map((c) => String(c[0]))
    expect(called.some((u) => u.includes('memo_type=Agent'))).toBe(true)
    expect(called.some((u) => u.includes('memo_type=Party'))).toBe(true)
    expect(called.some((u) => u.includes('memo_type=Internal'))).toBe(true)
  })

  it('keeps the company in Party after a drop onto Internal', async () => {
    render(<AdminOutMemosPage />)
    await screen.findByText('Party : Acme')
    fireEvent.click(screen.getByRole('tab', { name: 'Party' }))
    await screen.findByText('Party : Beta')
    const acme = screen.getByText('Party : Acme')

    const card = acme.closest('article')
    const dt = dataTransfer('Acme')
    fireEvent.dragStart(card, { dataTransfer: dt })
    fireEvent.drop(screen.getByRole('tab', { name: 'Internal' }), { dataTransfer: dt })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/out-memos/party-type',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ party: 'Acme', memo_type: 'Internal' }),
        }),
      )
    })

    expect(screen.getByText('Party : Acme')).toBeInTheDocument()
    expect(screen.getByText('Party : Beta')).toBeInTheDocument()
    await waitFor(() => {
      expect(within(screen.getByText('Party : Acme').closest('article')).getByText('Type : Internal')).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Party' })).toHaveAttribute('aria-selected', 'true')
  })

  it('removes the company from Agent after a drop onto Internal', async () => {
    render(<AdminOutMemosPage />)
    const acme = await screen.findByText('Party : Acme')

    const card = acme.closest('article')
    const dt = dataTransfer('Acme')
    fireEvent.dragStart(card, { dataTransfer: dt })
    fireEvent.drop(screen.getByRole('tab', { name: 'Internal' }), { dataTransfer: dt })

    await waitFor(() => {
      expect(screen.queryByText('Party : Acme')).not.toBeInTheDocument()
    })
  })
})

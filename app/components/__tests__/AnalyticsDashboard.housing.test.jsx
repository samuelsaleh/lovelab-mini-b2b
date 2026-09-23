/**
 * AnalyticsDashboard — "Housing colours": pieces sold per housing colour,
 * plus the available column when the admin stock endpoint answers.
 */

import { render, screen, waitFor, within } from '@testing-library/react'

jest.mock('recharts', () => ({
  ComposedChart: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div>{children}</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => null, Bar: () => null, Area: () => null, Cell: () => null,
  XAxis: () => null, YAxis: () => null, Tooltip: () => null, Legend: () => null, CartesianGrid: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))
jest.mock('../AnalyticsChatPanel', () => ({ __esModule: true, default: () => null }))

import AnalyticsDashboard from '../AnalyticsDashboard'

function orderDoc(id, channel, rows) {
  return {
    id, document_type: 'order', status: 'sent', order_channel: channel, total_amount: 100,
    created_at: '2026-05-04T09:00:00Z', client_company: 'Buyer Co', client_name: 'Buyer', event_id: null, events: null,
    metadata: { formState: { country: 'Germany', rows } },
  }
}

const DOCS = [
  orderDoc('d1', 'b2b', [{ collection: 'CUTY', bpColor: 'White', quantity: '3', total: '300' }, { collection: 'CUTY', bpColor: 'Bezel Yellow', quantity: '2', total: '200' }]),
  orderDoc('d2', 'b2c', [{ collection: 'CUTY', bpColor: 'YWP', quantity: '1', total: '100' }]),
]

const STOCK = {
  rows: [
    { name: 'Yellow', hex: '#D9B25F', in: 10, out: 2, available: 8 },
    { name: 'White', hex: '#DCDCDC', in: 1, out: 3, available: -2 },
  ],
}

function mockFetch({ stock }) {
  global.fetch = jest.fn((url) => {
    const u = String(url)
    if (u.startsWith('/api/documents')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: DOCS }) })
    if (u.startsWith('/api/events')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    if (u.startsWith('/api/analytics/housing-stock')) {
      return stock
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(stock) })
        : Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: 'Forbidden' }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

describe('AnalyticsDashboard — Housing colours', () => {
  it('shows pieces sold per housing colour, with unsold colours at 0', async () => {
    mockFetch({ stock: null })
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByText('Housing colours')).toBeInTheDocument(), { timeout: 8000 })
    const table = screen.getByTestId('housing-table')
    expect(within(table).getByTestId('housing-row-White')).toHaveTextContent('3')
    expect(within(table).getByTestId('housing-row-Yellow')).toHaveTextContent('2')
    expect(within(table).getByTestId('housing-row-Yellow + White + Pink')).toHaveTextContent('1')
    expect(within(table).getByTestId('housing-row-Gray Matte')).toHaveTextContent('0')
    expect(within(table).queryByText('Available')).not.toBeInTheDocument()
  }, 12000)

  it('shows the available column from the admin endpoint, negatives included', async () => {
    mockFetch({ stock: STOCK })
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByText('Housing colours')).toBeInTheDocument(), { timeout: 8000 })
    await waitFor(() => expect(screen.getByText('Available')).toBeInTheDocument(), { timeout: 8000 })
    expect(screen.getByTestId('housing-available-Yellow')).toHaveTextContent('8')
    expect(screen.getByTestId('housing-available-White')).toHaveTextContent('−2')
    expect(screen.getByTestId('housing-available-Pink')).toHaveTextContent('0')
    expect(screen.getByText(/Available = internal/)).toBeInTheDocument()
  }, 12000)
})

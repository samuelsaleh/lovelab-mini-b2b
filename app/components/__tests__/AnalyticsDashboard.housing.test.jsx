/**
 * AnalyticsDashboard — "Housing colours": pieces sold per housing colour.
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

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const u = String(url)
    if (u.startsWith('/api/documents')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: DOCS }) })
    if (u.startsWith('/api/events')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
})

describe('AnalyticsDashboard — Housing colours', () => {
  it('shows pieces sold per housing colour, with unsold colours at 0, and nothing else', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByText('Housing colours')).toBeInTheDocument(), { timeout: 8000 })
    const table = screen.getByTestId('housing-table')
    expect(within(table).getByTestId('housing-row-White')).toHaveTextContent('3')
    expect(within(table).getByTestId('housing-row-Yellow')).toHaveTextContent('2')
    expect(within(table).getByTestId('housing-row-Yellow + White + Pink')).toHaveTextContent('1')
    expect(within(table).getByTestId('housing-row-Gray Matte')).toHaveTextContent('0')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Colour', 'Sold'])
    expect(screen.queryByText('Available')).not.toBeInTheDocument()
    expect(screen.queryByText('Ordered in')).not.toBeInTheDocument()
    expect(global.fetch.mock.calls.some(([u]) => String(u).includes('housing-stock'))).toBe(false)
  }, 12000)
})

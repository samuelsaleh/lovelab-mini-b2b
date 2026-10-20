/**
 * AnalyticsDashboard — model, carat and shape filters and "Diamond by model".
 */
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'

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

const orderDoc = (id, rows, total) => ({
  id, document_type: 'order', status: 'sent', order_channel: 'b2b', total_amount: total,
  created_at: '2026-05-04T09:00:00Z', client_company: `Buyer ${id}`, client_name: 'Buyer', event_id: null, events: null,
  metadata: { formState: { country: 'Germany', rows } },
})

const DOCS = [
  orderDoc('d1', [
    { collection: 'CUTY', carat: '0.10', shape: 'Round', quantity: '6', total: '600' },
    { collection: 'CUTY', carat: '0.20', shape: 'Heart', quantity: '4', total: '800' },
  ], 1400),
  orderDoc('d2', [{ collection: 'CUBIX', carat: '0.10', shape: 'Round', quantity: '3', total: '300' }], 300),
]

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const u = String(url)
    if (u.startsWith('/api/documents')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: DOCS }) })
    if (u.startsWith('/api/events')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
})

async function renderAnalytics() {
  render(<AnalyticsDashboard />)
  await waitFor(() => expect(screen.getByText('Diamond by model')).toBeInTheDocument(), { timeout: 8000 })
}

describe('AnalyticsDashboard — diamond', () => {
  it('counts pieces per model and carat', async () => {
    await renderAnalytics()
    const table = screen.getByTestId('diamond-table')
    expect(within(table).getByTestId('diamond-cell-CUTY-0.10')).toHaveTextContent('6')
    expect(within(table).getByTestId('diamond-cell-CUTY-0.20')).toHaveTextContent('4')
    expect(within(table).getByTestId('diamond-cell-CUBIX-0.10')).toHaveTextContent('3')
  }, 12000)

  it('a shape filter narrows every panel to the matching lines', async () => {
    await renderAnalytics()
    fireEvent.click(screen.getByRole('button', { name: /^shapes:/i }))
    fireEvent.click(screen.getByLabelText(/^Heart/))
    const table = screen.getByTestId('diamond-table')
    expect(within(table).queryByText('CUBIX')).not.toBeInTheDocument()
    expect(within(table).getByTestId('diamond-cell-CUTY-0.20')).toHaveTextContent('4')
    expect(screen.getByText('matching lines')).toBeInTheDocument()
  }, 12000)

  it('clicking a cell filters on that model and carat', async () => {
    await renderAnalytics()
    fireEvent.click(screen.getByTestId('diamond-cell-CUBIX-0.10'))
    expect(screen.getByRole('button', { name: /^models: CUBIX/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^carats: 0\.10 ct/i })).toBeInTheDocument()
  }, 12000)
})

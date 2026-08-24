/**
 * Visitor demo login must not show any analytics numbers — euros, order
 * counts, pieces, vitrines, or document totals.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { setHideRevenue } from '@/lib/utils'

jest.mock('recharts', () => ({
  ComposedChart: ({ children }) => <div data-testid="composed-chart">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Bar: () => null,
  Area: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  defs: () => null,
  linearGradient: () => null,
  stop: () => null,
}))

jest.mock('../AnalyticsChatPanel', () => ({
  __esModule: true,
  default: () => null,
}))

import AnalyticsDashboard from '../AnalyticsDashboard'

const DOC = {
  id: 'd1',
  document_type: 'order',
  status: 'sent',
  order_channel: 'b2b',
  total_amount: 2585,
  created_at: '2026-05-04T09:00:00Z',
  client_company: 'Wholesale GmbH',
  client_name: 'Buyer',
  event_id: 'ev1',
  events: { name: 'Milano' },
  metadata: {
    formState: {
      country: 'Germany',
      rows: [{ collection: 'CUTY', colorCord: 'Black', quantity: '7', total: '2585' }],
    },
  },
}

beforeEach(() => {
  setHideRevenue(true)
  global.fetch = jest.fn((url) => {
    if (String(url).startsWith('/api/documents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: [DOC] }) })
    }
    if (String(url).startsWith('/api/events')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [{ id: 'ev1', name: 'Milano', type: 'fair' }] }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
})

afterEach(() => {
  setHideRevenue(false)
})

describe('AnalyticsDashboard visitor hide', () => {
  test('keeps the analytics layout but prints no live numbers', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByText('Total Revenue')).toBeInTheDocument(), { timeout: 8000 })

    expect(screen.getAllByText('Orders').length).toBeGreaterThan(0)
    expect(screen.queryByText('Export Excel')).not.toBeInTheDocument()
    expect(screen.queryByText('Ask AI')).not.toBeInTheDocument()
    expect(screen.queryByText(/2.?585/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^7$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/1 document/)).not.toBeInTheDocument()
    expect(screen.queryByText(/1 quote/)).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  }, 12000)
})

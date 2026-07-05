/**
 * AnalyticsDashboard — Sales Timeline grouping + B2C channel scope.
 *
 * bucketTimeline (pure):
 *   ✓ day grouping: one bucket per calendar day, orders counted per day
 *   ✓ week grouping: docs in the same Mon–Sun week share one bucket
 *   ✓ month grouping: docs in the same month share one bucket
 *   ✓ buckets sorted chronologically; invalid dates skipped
 *
 * Dashboard channel scope (rendered with recharts mocked):
 *   ✓ B2C toggle filters to order_channel === 'b2c' only (KPIs change)
 *   ✓ B2C view relabels sections (Top Customers, B2C Revenue, Customers KPI)
 *   ✓ B2B toggle excludes b2c documents
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// recharts uses DOM measurements that hang in jsdom — stub out
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
}))

jest.mock('../AnalyticsChatPanel', () => ({
  __esModule: true,
  default: () => null,
}))

import AnalyticsDashboard, { bucketTimeline } from '../AnalyticsDashboard'

// ─── bucketTimeline (pure) ──────────────────────────────────────────────
describe('bucketTimeline', () => {
  const doc = (created_at, total = 100) => ({ created_at, total_amount: total })

  it('groups by day with per-day order counts', () => {
    const rows = bucketTimeline([
      doc('2026-05-04T09:00:00Z', 100),
      doc('2026-05-04T15:00:00Z', 50),
      doc('2026-05-06T10:00:00Z', 200),
    ], 'day')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ sortKey: '2026-05-04', orders: 2, revenue: 150 })
    expect(rows[1]).toMatchObject({ sortKey: '2026-05-06', orders: 1, revenue: 200 })
  })

  it('groups by week starting Monday', () => {
    // Mon 2026-05-04, Sun 2026-05-10 → same week. Mon 2026-05-11 → next week.
    const rows = bucketTimeline([
      doc('2026-05-04T09:00:00Z', 100),
      doc('2026-05-10T09:00:00Z', 50),
      doc('2026-05-11T09:00:00Z', 25),
    ], 'week')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ sortKey: '2026-05-04', orders: 2, revenue: 150 })
    expect(rows[1]).toMatchObject({ sortKey: '2026-05-11', orders: 1, revenue: 25 })
    expect(rows[0].date).toMatch(/^wk /)
  })

  it('groups by month', () => {
    const rows = bucketTimeline([
      doc('2026-04-02T09:00:00Z', 100),
      doc('2026-04-28T09:00:00Z', 100),
      doc('2026-05-01T09:00:00Z', 300),
    ], 'month')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ sortKey: '2026-04', orders: 2, revenue: 200 })
    expect(rows[1]).toMatchObject({ sortKey: '2026-05', orders: 1, revenue: 300 })
  })

  it('sorts chronologically and skips invalid dates', () => {
    const rows = bucketTimeline([
      doc('2026-06-10T09:00:00Z'),
      doc('not-a-date'),
      doc('2026-06-01T09:00:00Z'),
    ], 'day')
    expect(rows.map(r => r.sortKey)).toEqual(['2026-06-01', '2026-06-10'])
  })
})

// ─── Dashboard channel scope ────────────────────────────────────────────
const B2B_DOC = {
  id: 'd1', document_type: 'order', status: 'sent', order_channel: 'b2b',
  total_amount: 1000, created_at: '2026-05-04T09:00:00Z',
  client_company: 'Wholesale GmbH', client_name: 'Buyer',
  event_id: 'ev1', events: { name: 'Milano' },
  metadata: { formState: { country: 'Germany', rows: [] } },
}
const B2C_DOC = {
  id: 'd2', document_type: 'order', status: 'sent', order_channel: 'b2c',
  total_amount: 95, created_at: '2026-05-05T09:00:00Z',
  client_company: '', client_name: 'Albane Armand',
  event_id: 'ev2', events: { name: 'ONLINE B2C' },
  metadata: { formState: { country: 'FR', rows: [] } },
}

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (String(url).startsWith('/api/documents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: [B2B_DOC, B2C_DOC] }) })
    }
    if (String(url).startsWith('/api/events')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
})

describe('AnalyticsDashboard — channel scope', () => {
  it('B2C scope shows only b2c revenue and relabels the view', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByText('Total Revenue')).toBeInTheDocument(), { timeout: 8000 })

    fireEvent.click(screen.getByRole('button', { name: 'B2C' }))

    // KPI relabeled + only the €95 b2c order counted
    expect(await screen.findByText('B2C Revenue')).toBeInTheDocument()
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getByText('unique buyers')).toBeInTheDocument()
    expect(screen.getByText(/Top Customers/)).toBeInTheDocument()
    expect(screen.getByText('B2C Sales Timeline')).toBeInTheDocument()
    // Fair chart + vitrines hidden in B2C scope
    expect(screen.queryByText('Revenue per Fair')).not.toBeInTheDocument()
    expect(screen.queryByText('Vitrines')).not.toBeInTheDocument()
    // The b2c customer appears; the wholesale client does not
    expect(screen.getAllByText('Albane Armand').length).toBeGreaterThan(0)
    expect(screen.queryByText('Wholesale GmbH')).not.toBeInTheDocument()
  }, 12000)

  it('B2B scope excludes b2c documents', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByText('Total Revenue')).toBeInTheDocument(), { timeout: 8000 })

    fireEvent.click(screen.getByRole('button', { name: 'B2B' }))

    expect(screen.getAllByText('Wholesale GmbH').length).toBeGreaterThan(0)
    expect(screen.queryByText('Albane Armand')).not.toBeInTheDocument()
  }, 12000)

  it('Day / Week / Month toggle is rendered on the timeline', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(screen.getByText('Total Revenue')).toBeInTheDocument(), { timeout: 8000 })
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument()
  }, 12000)
})

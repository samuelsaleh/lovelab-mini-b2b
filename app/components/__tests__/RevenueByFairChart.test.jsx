/**
 * RevenueByFairChart — pure presentation of revenue_by_event data, extracted
 * from TeamDashboard so the admin org page can render it from stats it already
 * fetched. Recharts is mocked (jsdom measurement hangs).
 */

import { render, screen } from '@testing-library/react'

jest.mock('recharts', () => ({
  BarChart: ({ data, children }) => (
    <div data-testid="bar-chart" data-rows={JSON.stringify(data.map((d) => d.name))}>{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  CartesianGrid: () => null,
}))

import RevenueByFairChart from '../RevenueByFairChart'

describe('RevenueByFairChart', () => {
  it('shows the empty state when there is no event revenue', () => {
    render(<RevenueByFairChart data={[]} />)
    expect(screen.getByTestId('team-revenue-by-event')).toBeInTheDocument()
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
  })

  it('renders at most eight fairs and truncates long names', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      event_id: `e${i}`,
      name: i === 0 ? 'An Extremely Long Fair Name In Paris' : `Fair ${i}`,
      revenue: 1000 - i,
    }))
    render(<RevenueByFairChart data={data} />)

    const rows = JSON.parse(screen.getByTestId('bar-chart').getAttribute('data-rows'))
    expect(rows.length).toBe(8)
    expect(rows[0]).toBe('An Extremely Long ...')
  })

  it('tolerates missing data entirely', () => {
    render(<RevenueByFairChart />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })
})

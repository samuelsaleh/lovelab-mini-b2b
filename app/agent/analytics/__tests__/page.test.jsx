/**
 * /agent/analytics smoke test
 *
 * The page reuses the admin AnalyticsDashboard component (RLS scopes the
 * underlying API calls to the current agent). This test stubs the heavy
 * dashboard so we just verify the route mounts it cleanly inside a
 * Suspense boundary — a regression here would mean an agent clicking
 * "Analytics" in the sidebar gets a blank page instead of charts.
 */

import { render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}))

jest.mock('@/app/components/AnalyticsDashboard', () => ({
  __esModule: true,
  default: ({ initialEventId }) => (
    <div data-testid="analytics-dashboard" data-initial-event={initialEventId || ''} />
  ),
}))

import AgentAnalyticsPage from '../page'

describe('/agent/analytics', () => {
  it('mounts the AnalyticsDashboard component', () => {
    render(<AgentAnalyticsPage />)
    expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument()
  })

  it('passes the event search param through to the dashboard', () => {
    render(<AgentAnalyticsPage />)
    // No `?event=` in the mocked URLSearchParams → empty string
    expect(screen.getByTestId('analytics-dashboard').dataset.initialEvent).toBe('')
  })
})

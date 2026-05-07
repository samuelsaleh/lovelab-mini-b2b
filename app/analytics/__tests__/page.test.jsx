/**
 * /analytics smoke test
 *
 * The analytics page renders the rich AnalyticsDashboard (Revenue per Fair,
 * country / product / client breakdowns, vitrine, KPIs). Auth is enforced
 * downstream by the /api/documents RLS policy that the dashboard fetches.
 *
 * This test stubs the dashboard so we don't pull in its 700-line dependency
 * tree, and just asserts the page mounts the dashboard inside a Suspense
 * boundary and forwards the optional ?event=... query param.
 */

import { render, screen } from '@testing-library/react'

const mockGet = jest.fn()

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (...args) => mockGet(...args) }),
}))

jest.mock('@/app/components/AnalyticsDashboard', () => {
  const Mock = ({ initialEventId }) => (
    <div data-testid="analytics-dashboard">{initialEventId || 'no-event'}</div>
  )
  Mock.displayName = 'MockAnalyticsDashboard'
  return Mock
})

import Analytics from '../page'

beforeEach(() => { mockGet.mockReset() })

describe('/analytics page', () => {
  it('renders the AnalyticsDashboard with no event id by default', () => {
    mockGet.mockReturnValue(null)
    render(<Analytics />)
    expect(screen.getByTestId('analytics-dashboard')).toHaveTextContent('no-event')
  })

  it('forwards the ?event=... query param to the dashboard', () => {
    mockGet.mockImplementation((key) => (key === 'event' ? 'evt-123' : null))
    render(<Analytics />)
    expect(screen.getByTestId('analytics-dashboard')).toHaveTextContent('evt-123')
  })
})

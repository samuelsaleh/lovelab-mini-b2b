/**
 * AgentSelfView — compact (iPhone / iPad portrait) layout.
 *
 * Guarantees the Phase 2 agent-portal overhaul:
 *   - On compact viewports the component still renders its data (KPIs, tabs,
 *     commission history) so nothing is lost when iPad uses the phone layout.
 *   - Tab strip buttons meet the 44px touch-target minimum.
 */

import { render, screen, waitFor, act } from '@testing-library/react'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/agent',
}))

// Force the compact (phone / iPad portrait) layout branch.
jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => true,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: true, isTablet: false, isDesktop: false, isCompact: true }),
}))

jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'agent-1', email: 'agent@test.com' },
    profile: {
      id: 'agent-1', email: 'agent@test.com', full_name: 'Agent Test',
      is_agent: true, agent_status: 'active', commission_rate: 10, organization_id: null,
    },
    loading: false,
  }),
}))

jest.mock('@/app/hooks/useOrgData', () => ({
  useOrgData: () => ({ orgDetails: null, orgLedger: null, orgMembers: [], reload: jest.fn() }),
}))

jest.mock('../ContractChatPanel', () => ({ __esModule: true, default: () => <div data-testid="contract-chat-panel" /> }))
jest.mock('../AgentFolderBrowser', () => ({ __esModule: true, default: () => <div data-testid="agent-folder-browser" /> }))

const COMMISSIONS = [{
  id: 'c1', type: 'order', status: 'pending', customer_paid_at: null,
  order_total: 1000, commission_amount: 100, commission_rate: 10,
  created_at: '2026-04-01T10:00:00Z', document: { client_company: 'Acme', client_name: 'John' },
}]
const SUMMARY = {
  total_earned: 100, ready_to_pay: 0, awaiting_customer: 100, ready_to_pay_count: 0,
  awaiting_customer_count: 1, paid_amount: 0, total_paid_out: 0, order_count: 1, bonus_count: 0,
}

beforeEach(() => {
  mockPush.mockClear()
  global.fetch = jest.fn((url) => {
    const u = String(url)
    if (u.includes('/api/commissions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ commissions: COMMISSIONS, summary: SUMMARY, agent_profile: { commission_rate: 10 } }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ payments: [], documents: [], reports: [] }) })
  })
})

import AgentSelfView from '../AgentSelfView'

describe('AgentSelfView — compact layout', () => {
  it('still renders KPIs, tabs and commission data on compact viewports', async () => {
    await act(async () => { render(<AgentSelfView defaultTab="financials" />) })
    await waitFor(() => expect(screen.getByText('READY TO PAY')).toBeInTheDocument())
    expect(screen.getByText('Financials')).toBeInTheDocument()
    expect(screen.getByText('Commission History')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('gives tab-strip buttons a >= 44px touch target', async () => {
    await act(async () => { render(<AgentSelfView defaultTab="financials" />) })
    await waitFor(() => expect(screen.getByText('Financials')).toBeInTheDocument())
    const tab = screen.getByText('Financials').closest('button')
    expect(tab).toHaveStyle({ minHeight: '44px' })
  })
})

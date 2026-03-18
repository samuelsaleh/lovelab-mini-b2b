/**
 * AgentAnalytics — defaultTab prop tests
 *
 * Strategy: mock recharts (causes DOM measurement hangs in jsdom),
 * ContractChatPanel (calls scrollIntoView), and AgentFolderBrowser.
 * Then verify tab bar is shown/hidden based on defaultTab.
 */

import { render, screen, waitFor } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    profile: { id: 'agent1', is_agent: true, agent_status: 'active', organization_id: null },
    loading: false,
  }),
}))

jest.mock('@/app/hooks/useOrgData', () => ({
  useOrgData: () => ({ orgDetails: null, orgLedger: null, orgMembers: [], reload: jest.fn() }),
}))

jest.mock('../ContractChatPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="contract-chat-panel" />,
}))

jest.mock('../AgentFolderBrowser', () => ({
  __esModule: true,
  default: () => <div data-testid="agent-folder-browser" />,
}))

// recharts uses DOM measurements that hang in jsdom — stub out
jest.mock('recharts', () => ({
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  CartesianGrid: () => null,
}))

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      commissions: [], summary: {}, agent_profile: {}, payments: [], invitations: [],
    }),
  })
)

import AgentAnalytics from '../AgentAnalytics'

describe('AgentAnalytics — defaultTab prop', () => {
  it('shows tab bar when no defaultTab is provided', async () => {
    render(<AgentAnalytics />)
    await waitFor(() => expect(screen.queryByText('Overview')).toBeInTheDocument(), { timeout: 8000 })
    expect(screen.getByText('Commission History')).toBeInTheDocument()
    expect(screen.getByText('My Orders')).toBeInTheDocument()
  }, 10000)

  it('hides tab bar when defaultTab="history"', async () => {
    render(<AgentAnalytics defaultTab="history" />)
    // After data loads, tab bar buttons must not be present
    await waitFor(() => expect(screen.queryByText('My Orders')).not.toBeInTheDocument(), { timeout: 8000 })
    expect(screen.queryByText('Payouts')).not.toBeInTheDocument()
  }, 10000)

  it('hides tab bar when defaultTab="folder"', async () => {
    render(<AgentAnalytics defaultTab="folder" />)
    await waitFor(() => expect(screen.queryByText('Commission History')).not.toBeInTheDocument(), { timeout: 8000 })
    expect(screen.queryByText('Overview')).not.toBeInTheDocument()
  }, 10000)

  it('hides tab bar when defaultTab="overview"', async () => {
    render(<AgentAnalytics defaultTab="overview" />)
    await waitFor(() => expect(screen.queryByText('My Orders')).not.toBeInTheDocument(), { timeout: 8000 })
    expect(screen.queryByText('Payouts')).not.toBeInTheDocument()
  }, 10000)
})

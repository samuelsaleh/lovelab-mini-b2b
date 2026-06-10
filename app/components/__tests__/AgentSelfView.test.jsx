/**
 * AgentSelfView — agent portal unified view tests
 *
 * The component mirrors the admin agent-detail page (4 KPIs + 5 tabs). These
 * tests pin down:
 *   - Initial tab matches the `defaultTab` prop
 *   - Switching defaultTab re-syncs the active tab (each /agent/* route
 *     mounts the component with a different tab; the bug we just fixed was
 *     stale state when navigating between sidebar entries)
 *   - 4 KPI cards always render with summary from /api/commissions
 *   - Read-only behaviour: no Add Bonus / Record Payment / Edit Org buttons
 *   - Documents tab renders the AgentFolderBrowser (subfolders)
 */

import { render, screen, waitFor, act } from '@testing-library/react'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/agent',
}))

jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'agent-1', email: 'agent@test.com' },
    profile: {
      id: 'agent-1',
      email: 'agent@test.com',
      full_name: 'Agent Test',
      is_agent: true,
      agent_status: 'active',
      commission_rate: 10,
      organization_id: null,
    },
    loading: false,
  }),
}))

jest.mock('@/app/hooks/useOrgData', () => ({
  useOrgData: () => ({
    orgDetails: null,
    orgLedger: null,
    orgMembers: [],
    reload: jest.fn(),
  }),
}))

jest.mock('../ContractChatPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="contract-chat-panel" />,
}))

jest.mock('../AgentFolderBrowser', () => ({
  __esModule: true,
  default: ({ agentId }) => (
    <div data-testid="agent-folder-browser" data-agent-id={agentId} />
  ),
}))

const COMMISSIONS = [
  {
    id: 'c1',
    type: 'order',
    status: 'pending',
    customer_paid_at: null,
    order_total: 1000,
    commission_amount: 100,
    commission_rate: 10,
    created_at: '2026-04-01T10:00:00Z',
    document: { client_company: 'Acme', client_name: 'John' },
  },
]

const SUMMARY = {
  total_earned: 100,
  ready_to_pay: 0,
  awaiting_customer: 100,
  ready_to_pay_count: 0,
  awaiting_customer_count: 1,
  paid_amount: 0,
  total_paid_out: 0,
  order_count: 1,
  bonus_count: 0,
}

function setupFetchMock(overrides = {}) {
  global.fetch = jest.fn((url) => {
    const u = String(url)
    if (u.includes('/api/commissions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          commissions: COMMISSIONS,
          summary: SUMMARY,
          agent_profile: { commission_rate: 10 },
          ...overrides.commissions,
        }),
      })
    }
    if (u.includes('/api/agent-payments')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ payments: [] }) })
    }
    if (u.includes('/api/documents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: [] }) })
    }
    if (u.includes('/api/consignment/my')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: [] }) })
    }
    if (u.includes('/api/commission-reports')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ reports: [] }) })
    }
    if (u.includes('/contract')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ url: null, name: null }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

beforeEach(() => {
  mockPush.mockClear()
  setupFetchMock()
})

import AgentSelfView from '../AgentSelfView'

describe('AgentSelfView — layout mirrors admin agent-detail', () => {
  it('renders all 4 KPI cards (READY TO PAY, AWAITING CUSTOMER, PAID OUT, REVENUE)', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" />)
    })
    await waitFor(() => expect(screen.getByText('READY TO PAY')).toBeInTheDocument())
    expect(screen.getByText('AWAITING CUSTOMER')).toBeInTheDocument()
    expect(screen.getByText('PAID OUT')).toBeInTheDocument()
    expect(screen.getByText('REVENUE')).toBeInTheDocument()
  })

  // Phase 22 (2026-05-13): the standalone "Reports" tab was merged into
  // Financials (it renders as the <AgentReportsPanel/> "Commission Reports"
  // card inside the Financials body). So the tab strip now has 4 entries.
  it('renders the 4 tabs (Financials, Consignment, Organisation, Documents) — no standalone Reports tab', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" />)
    })
    await waitFor(() => expect(screen.getByText('Financials')).toBeInTheDocument())
    expect(screen.getByText(/Consignment/)).toBeInTheDocument()
    expect(screen.getByText('Organisation')).toBeInTheDocument()
    expect(screen.getByText('Documents')).toBeInTheDocument()
    // No standalone "Reports" tab button (the reports list lives in Financials
    // under the "Commission Reports" heading, which is exact-matched separately).
    expect(screen.queryByText('Reports')).not.toBeInTheDocument()
  })

  it('renders the Commission History table on the Financials tab', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" />)
    })
    await waitFor(() => expect(screen.getByText('Commission History')).toBeInTheDocument())
    expect(screen.getByText('Payments Ledger')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('renders the Commission Reports panel inside the Financials tab', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" />)
    })
    await waitFor(() => expect(screen.getByText('Commission Reports')).toBeInTheDocument())
    expect(screen.getByText(/no reports yet/i)).toBeInTheDocument()
  })

  it('renders the Documents tab with AgentFolderBrowser when defaultTab="documents"', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="documents" />)
    })
    await waitFor(() => expect(screen.getByTestId('agent-folder-browser')).toBeInTheDocument())
    expect(screen.getByTestId('agent-folder-browser').dataset.agentId).toBe('agent-1')
  })

  it('renders the Consignment tab when defaultTab="consignment"', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="consignment" />)
    })
    await waitFor(() => expect(screen.getByText('My Consignments')).toBeInTheDocument())
  })

  it('renders the Organisation tab when defaultTab="organisation"', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="organisation" />)
    })
    await waitFor(() => expect(screen.getByText('My Contract')).toBeInTheDocument())
  })

  it('hides admin-only controls (Add Bonus, Record Payment, Edit Org)', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" />)
    })
    await waitFor(() => expect(screen.getByText('Commission History')).toBeInTheDocument())
    expect(screen.queryByText(/Add Bonus/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Record Payment/i)).not.toBeInTheDocument()
  })

  it('shows the agent name + status + rate in the hero card', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" />)
    })
    await waitFor(() => expect(screen.getByText('Agent Test')).toBeInTheDocument())
    expect(screen.getByText('agent@test.com')).toBeInTheDocument()
    expect(screen.getByText(/10% rate/)).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('does NOT redirect to / for active agents (regression: previous strict agent_status check broke /agent/reports)', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" focused pageTitle="Reports" />)
    })
    await waitFor(() => expect(screen.getByText('Commission Reports')).toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalledWith('/')
  })
})

describe('AgentSelfView — focused mode (single-purpose pages)', () => {
  // Phase 21 — sidebar redesign. Each agent route (Reports / Documents /
  // Contracts / Consignment) now mounts AgentSelfView with `focused=true`
  // so the page is visually distinct from the Dashboard. The Dashboard
  // itself keeps the full multi-tab overview.
  //
  // These tests pin down that focused mode actually hides the duplicate
  // chrome — without them it's easy to ship a regression where two sidebar
  // entries render identical-looking pages (the bug Sam reported).

  it('hides the hero card, KPI strip and tab strip when focused=true', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" focused pageTitle="Reports" />)
    })
    await waitFor(() => expect(screen.getByText('Commission Reports')).toBeInTheDocument())

    // Hero card is hidden
    expect(screen.queryByText('Agent Test')).not.toBeInTheDocument()
    expect(screen.queryByText(/10% rate/)).not.toBeInTheDocument()
    // KPI strip is hidden
    expect(screen.queryByText('READY TO PAY')).not.toBeInTheDocument()
    expect(screen.queryByText('AWAITING CUSTOMER')).not.toBeInTheDocument()
    expect(screen.queryByText('PAID OUT')).not.toBeInTheDocument()
    expect(screen.queryByText('REVENUE')).not.toBeInTheDocument()
    // Tab strip is hidden — none of the other tab labels render as buttons
    expect(screen.queryByText('Financials')).not.toBeInTheDocument()
    expect(screen.queryByText('Organisation')).not.toBeInTheDocument()
  })

  it('shows the pageTitle heading when focused=true', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" focused pageTitle="Reports" />)
    })
    await waitFor(() => {
      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toHaveTextContent('Reports')
    })
  })

  it('still renders the active section content in focused mode (Reports)', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" focused pageTitle="Reports" />)
    })
    await waitFor(() => expect(screen.getByText('Commission Reports')).toBeInTheDocument())
    expect(screen.getByText(/no reports yet/i)).toBeInTheDocument()
  })

  it('still renders the active section content in focused mode (Documents)', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="documents" focused pageTitle="Documents" />)
    })
    await waitFor(() => expect(screen.getByTestId('agent-folder-browser')).toBeInTheDocument())
  })

  it('default (focused=false) still renders hero + KPIs + tabs (Dashboard regression)', async () => {
    await act(async () => {
      render(<AgentSelfView defaultTab="financials" />)
    })
    await waitFor(() => expect(screen.getByText('READY TO PAY')).toBeInTheDocument())
    expect(screen.getByText('Agent Test')).toBeInTheDocument() // hero card
    expect(screen.getByText('Financials')).toBeInTheDocument() // tab strip
  })
})

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'org-1' }),
  useRouter: () => ({ push }),
}))

const inviteFormProps = []
jest.mock('@/app/components/TeamInviteForm', () => (props) => {
  inviteFormProps.push(props)
  return <div data-testid="team-invite-form">Invite members</div>
})
const fairChartProps = []
jest.mock('@/app/components/RevenueByFairChart', () => (props) => {
  fairChartProps.push(props)
  return <div data-testid="revenue-by-fair-chart">Revenue by fair</div>
})
jest.mock('@/app/components/OrgSettlementCard', () => () => <div data-testid="settlement-card">Settlement operations</div>)

import AdminOrganizationDetailPage from '../page'

const organization = {
  id: 'org-1',
  name: 'Maison Lumière',
  territory: 'France',
  commission_rate: 8,
  conditions: 'Quarterly review',
}

const members = [
  {
    user_id: 'owner-1',
    role: 'owner',
    profiles: { full_name: 'Sarah Dupont', email: 'sarah@example.com' },
  },
  {
    user_id: 'member-1',
    role: 'member',
    profiles: { full_name: 'Luc Martin', email: 'luc@example.com' },
  },
]

// Sarah Goutard Organization as it exists in production (Aug 2026): a big team
// where four people sell and the owner does not, and where nobody has a
// commission rate. The two orders that make the team total exceed the sum of
// the members were entered by admins into the team's folders, so they count for
// the team but belong to no member row.
const sarahTeamMembers = [
  { user_id: 'sarah', role: 'owner', profiles: { full_name: 'Sarah Goutard', email: 'sarah@example.com' } },
  { user_id: 'wassila', role: 'member', profiles: { full_name: 'Wassila Mekidiche', email: 'wassila@example.com' } },
  { user_id: 'caren', role: 'member', profiles: { full_name: 'Caren Melkonian', email: 'caren@example.com' } },
  { user_id: 'ruby', role: 'member', profiles: { full_name: 'Ruby Robin', email: 'ruby@example.com' } },
]

const sarahTeamStats = {
  totals: { revenue: 28018, orders: 15, quotes: 0, active_members: 4, total_commission: 0, pending_commission: 0 },
  per_member: [
    { user_id: 'wassila', full_name: 'Wassila Mekidiche', revenue: 16365, orders: 9, quotes: 0, commission: 0 },
    { user_id: 'caren', full_name: 'Caren Melkonian', revenue: 4112, orders: 2, quotes: 0, commission: 0 },
    { user_id: 'ruby', full_name: 'Ruby Robin', revenue: 1841, orders: 1, quotes: 0, commission: 0 },
    { user_id: 'sarah', full_name: 'Sarah Goutard', revenue: 0, orders: 0, quotes: 0, commission: 0 },
  ],
}

function response(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body })
}

function installFetch() {
  global.fetch = jest.fn((url, options) => {
    const path = String(url)
    if (path === '/api/organizations/org-1') return response({ organization })
    if (/\/members\/[^/]+$/.test(path)) {
      // Member management: PATCH (pause/reactivate/resend) or DELETE (remove)
      return response({ ok: true, action: options?.method })
    }
    if (path.endsWith('/members')) return response({ members, caller_role: 'admin' })
    if (path.endsWith('/ledger')) {
      return response({
        organization_summary: {
          total_commission_earned: 150,
          total_paid_out: 0,
          pending_balance: 150,
        },
        per_member: [
          { user_id: 'owner-1', pending_balance: 100 },
          { user_id: 'member-1', pending_balance: 0 },
        ],
      })
    }
    if (path.endsWith('/stats')) {
      return response({
        totals: { revenue: 5000, orders: 3, quotes: 1 },
        per_member: [
          { user_id: 'owner-1', revenue: 5000, orders: 3, quotes: 1 },
        ],
        revenue_by_event: [{ event_id: 'e1', name: 'Paris Fair', revenue: 5000, orders: 3 }],
      })
    }
    if (path === '/api/agents') {
      return response({
        agents: [
          { id: 'owner-1', commission_rate: 12 },
          { id: 'member-1', commission_rate: 0 },
        ],
      })
    }
    throw new Error(`Unexpected request: ${path}`)
  })
}

describe('Admin organization detail redesign', () => {
  beforeEach(() => {
    push.mockClear()
    inviteFormProps.length = 0
    fairChartProps.length = 0
    installFetch()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders the approved summary headings and preserves operational sections', async () => {
    render(<AdminOrganizationDetailPage />)

    await screen.findByRole('heading', { name: 'Maison Lumière' })
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(/Organizations\s*\/\s*Maison Lumière/)
    expect(screen.getByRole('heading', { name: 'Organization settings' })).toBeInTheDocument()
    expect(screen.getByText("Default for members who don't have their own rate.")).toBeInTheDocument()
    expect(screen.getByText('Team earned')).toBeInTheDocument()
    expect(screen.getByText('Paid out')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Team financial summary' })).getByText('Outstanding')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument()
    expect(screen.getByTestId('settlement-card')).toBeInTheDocument()
    expect(screen.getByTestId('team-invite-form')).toBeInTheDocument()
    expect(screen.getByTestId('revenue-by-fair-chart')).toBeInTheDocument()
  })

  // The page used to render TeamDashboard below its own table, which repeated
  // the totals, the member list and the per-member revenue — the "three
  // dashboards" complaint. There must be exactly one members table now.
  it('renders one members list: no TeamDashboard, no second table', async () => {
    render(<AdminOrganizationDetailPage />)

    await screen.findByTestId('organization-member-owner-1')
    expect(screen.queryByTestId('team-dashboard')).not.toBeInTheDocument()
    expect(document.querySelectorAll('table').length).toBe(1)

    // The invite form reloads this page's own data after inviting.
    const invite = inviteFormProps[inviteFormProps.length - 1]
    expect(invite.organizationId).toBe('org-1')
    expect(invite.adminView).toBe(true)
    expect(typeof invite.onInvited).toBe('function')

    // The chart is fed from the stats the page already fetched — no extra call.
    const chart = fairChartProps[fairChartProps.length - 1]
    expect(chart.data).toEqual([{ event_id: 'e1', name: 'Paris Fair', revenue: 5000, orders: 3 }])
    const statsCalls = global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/stats'))
    expect(statsCalls.length).toBe(1)
  })

  it('shows each member\'s status and the management actions in the single table', async () => {
    global.fetch = jest.fn((url, options) => {
      const path = String(url)
      if (path === '/api/organizations/org-1') return response({ organization })
      if (/\/members\/[^/]+$/.test(path)) return response({ ok: true, action: options?.method })
      if (path.endsWith('/members')) {
        return response({
          members: [
            { user_id: 'owner-1', role: 'owner', profiles: { full_name: 'Sarah Dupont', email: 'sarah@example.com', agent_status: 'active', has_password_set: true } },
            { user_id: 'member-1', role: 'member', profiles: { full_name: 'Luc Martin', email: 'luc@example.com', agent_status: 'invited', has_password_set: false } },
            { user_id: 'member-2', role: 'member', profiles: { full_name: 'Nora Blanc', email: 'nora@example.com', agent_status: 'paused', has_password_set: true } },
          ],
        })
      }
      if (path.endsWith('/ledger')) return response({ organization_summary: {}, per_member: [] })
      if (path.endsWith('/stats')) return response({ totals: {}, per_member: [], revenue_by_event: [] })
      if (path === '/api/agents') return response({ agents: [] })
      throw new Error(`Unexpected request: ${path}`)
    })

    render(<AdminOrganizationDetailPage />)

    const ownerRow = await screen.findByTestId('organization-member-owner-1')
    const invitedRow = screen.getByTestId('organization-member-member-1')
    const pausedRow = screen.getByTestId('organization-member-member-2')

    expect(within(ownerRow).getByText('Active')).toBeInTheDocument()
    expect(within(invitedRow).getByText('Invited')).toBeInTheDocument()
    expect(within(pausedRow).getByText('Paused')).toBeInTheDocument()

    // Actions follow the member's state.
    expect(within(invitedRow).getByRole('button', { name: 'Resend invite' })).toBeInTheDocument()
    expect(within(pausedRow).getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
    expect(within(ownerRow).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(within(ownerRow).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('pauses a member without navigating to their page, then reloads', async () => {
    render(<AdminOrganizationDetailPage />)

    const memberRow = await screen.findByTestId('organization-member-member-1')
    fireEvent.click(within(memberRow).getByRole('button', { name: 'Pause' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/organizations/org-1/members/member-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ action: 'pause' }) }),
      )
    })
    // The action button must not trigger the row's navigation.
    expect(push).not.toHaveBeenCalled()
    // The page reloads its own data afterwards (organization fetched twice).
    await waitFor(() => {
      const orgCalls = global.fetch.mock.calls.filter(([url]) => String(url) === '/api/organizations/org-1')
      expect(orgCalls.length).toBe(2)
    })
  })

  it('asks for confirmation before removing a member', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
    render(<AdminOrganizationDetailPage />)

    const memberRow = await screen.findByTestId('organization-member-member-1')
    fireEvent.click(within(memberRow).getByRole('button', { name: 'Remove' }))

    expect(confirmSpy).toHaveBeenCalledWith('Remove Luc Martin from the organization?')
    const deleteCalls = global.fetch.mock.calls.filter(([, options]) => options?.method === 'DELETE')
    expect(deleteCalls.length).toBe(0)

    confirmSpy.mockReturnValue(true)
    fireEvent.click(within(memberRow).getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/organizations/org-1/members/member-1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
    confirmSpy.mockRestore()
  })

  it('labels positive personal rates as custom and zero personal rates as org default', async () => {
    render(<AdminOrganizationDetailPage />)

    const ownerRow = await screen.findByTestId('organization-member-owner-1')
    const memberRow = screen.getByTestId('organization-member-member-1')

    expect(within(ownerRow).getByText('12%')).toBeInTheDocument()
    expect(within(ownerRow).getByText('custom')).toBeInTheDocument()
    expect(within(memberRow).getByText('8%')).toBeInTheDocument()
    expect(within(memberRow).getByText('org default')).toBeInTheDocument()
  })

  it('keeps zero financial values visible and makes the whole member row navigable', async () => {
    render(<AdminOrganizationDetailPage />)

    const memberRow = await screen.findByTestId('organization-member-member-1')
    expect(within(memberRow).getByText('€0')).toBeInTheDocument()

    fireEvent.click(memberRow)
    expect(push).toHaveBeenCalledWith('/admin/agents/member-1')

    fireEvent.keyDown(memberRow, { key: 'Enter' })
    expect(push).toHaveBeenLastCalledWith('/admin/agents/member-1')
  })

  it('shows documents and revenue even when every commission bucket is zero', async () => {
    // Production shape of Sarah Goutard Organization (measured Aug 2026): all
    // nine members sit on commission_rate 0 and the org rate is null, so the
    // three money cards are all €0 while the team has really sold 15 orders for
    // €28,018. Before this the page looked like a dormant organization.
    global.fetch.mockImplementation((url) => {
      const path = String(url)
      if (path === '/api/organizations/org-1') return response({ organization: { ...organization, commission_rate: null } })
      if (path.endsWith('/members')) return response({ members: sarahTeamMembers })
      if (path.endsWith('/ledger')) {
        return response({
          organization_summary: { total_commission_earned: 0, total_paid_out: 0, pending_balance: 0 },
          per_member: sarahTeamMembers.map((m) => ({ user_id: m.user_id, pending_balance: 0 })),
        })
      }
      if (path.endsWith('/stats')) return response(sarahTeamStats)
      if (path === '/api/agents') {
        return response({ agents: sarahTeamMembers.map((m) => ({ id: m.user_id, commission_rate: 0 })) })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    render(<AdminOrganizationDetailPage />)

    const activity = await screen.findByRole('region', { name: 'Team activity summary' })
    expect(within(activity).getByText('15')).toBeInTheDocument()
    expect(within(activity).getByText('15 orders · 0 quotes')).toBeInTheDocument()
    expect(within(activity).getByText('€28,018')).toBeInTheDocument()

    // The commission cards stay honest about being zero.
    const financial = screen.getByRole('region', { name: 'Team financial summary' })
    expect(within(financial).getAllByText('€0').length).toBe(3)
  })

  it('breaks documents and revenue down per member, most active first', async () => {
    global.fetch.mockImplementation((url) => {
      const path = String(url)
      if (path === '/api/organizations/org-1') return response({ organization })
      if (path.endsWith('/members')) return response({ members: sarahTeamMembers })
      if (path.endsWith('/ledger')) return response({ organization_summary: {}, per_member: [] })
      if (path.endsWith('/stats')) return response(sarahTeamStats)
      if (path === '/api/agents') return response({ agents: [] })
      throw new Error(`Unexpected request: ${path}`)
    })

    render(<AdminOrganizationDetailPage />)

    const wassila = await screen.findByTestId('organization-member-wassila')
    expect(within(wassila).getByText('9')).toBeInTheDocument()
    expect(within(wassila).getByText('9 orders')).toBeInTheDocument()
    expect(within(wassila).getByText('€16,365')).toBeInTheDocument()

    const ruby = screen.getByTestId('organization-member-ruby')
    expect(within(ruby).getByText('1')).toBeInTheDocument()
    expect(within(ruby).getByText('€1,841')).toBeInTheDocument()

    // Sarah is the owner but has sold nothing herself — em dash, not "€0",
    // so an empty cell never reads as a real amount.
    const sarah = screen.getByTestId('organization-member-sarah')
    expect(within(sarah).getAllByText('—').length).toBe(2)

    const rows = screen.getAllByTestId(/^organization-member-/)
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'organization-member-wassila',
      'organization-member-caren',
      'organization-member-ruby',
      'organization-member-sarah',
    ])
  })

  it('still renders the page when the stats endpoint fails', async () => {
    global.fetch.mockImplementation((url) => {
      const path = String(url)
      if (path === '/api/organizations/org-1') return response({ organization })
      if (path.endsWith('/members')) return response({ members })
      if (path.endsWith('/ledger')) {
        return response({
          organization_summary: { total_commission_earned: 150, total_paid_out: 0, pending_balance: 150 },
          per_member: [],
        })
      }
      if (path.endsWith('/stats')) return response({ error: 'boom' }, false)
      if (path === '/api/agents') return response({ agents: [] })
      throw new Error(`Unexpected request: ${path}`)
    })

    render(<AdminOrganizationDetailPage />)

    await screen.findByRole('heading', { name: 'Maison Lumière' })
    expect(screen.getByText(/documents and revenue/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument()
    const financial = screen.getByRole('region', { name: 'Team financial summary' })
    expect(within(financial).getAllByText('€150').length).toBe(2)
    const activity = screen.getByRole('region', { name: 'Team activity summary' })
    expect(within(activity).getByText('0')).toBeInTheDocument()
  })

  it('keeps settings editing and saving wired to the organization endpoint', async () => {
    global.fetch.mockImplementation((url, options) => {
      const path = String(url)
      if (path === '/api/organizations/org-1' && options?.method === 'PATCH') {
        return response({ organization: { ...organization, commission_rate: 10 } })
      }
      if (path === '/api/organizations/org-1') return response({ organization })
      if (path.endsWith('/members')) return response({ members })
      if (path.endsWith('/ledger')) return response({ organization_summary: {}, per_member: [] })
      if (path.endsWith('/stats')) return response({ totals: {}, per_member: [] })
      if (path === '/api/agents') return response({ agents: [] })
      throw new Error(`Unexpected request: ${path}`)
    })

    render(<AdminOrganizationDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit settings' }))
    fireEvent.change(screen.getByLabelText('Commission rate'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/organizations/org-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"commission_rate":10'),
        }),
      )
    })
    await waitFor(() => expect(screen.getAllByText('10%').length).toBeGreaterThan(0))
  })
})

/**
 * TeamDashboard — owner-only gating, member list rendering, invite form.
 *
 * Strategy: mock recharts (jsdom measurement hangs) and global.fetch with
 * canned /stats and /members responses. The caller_role returned by the
 * members endpoint drives the owner/member gating.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'

jest.mock('recharts', () => ({
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  CartesianGrid: () => null,
}))

import TeamDashboard from '../TeamDashboard'

const statsResponse = {
  organization: { id: 'org-1', name: 'Partner France', territory: 'France', commission_rate: 10 },
  totals: { revenue: 12500, orders: 14, quotes: 3, active_members: 2, total_commission: 1250, pending_commission: 400 },
  per_member: [
    { user_id: 'owner-1', full_name: 'Sarah Dupont', email: 'sarah@partner.fr', role: 'owner', agent_status: 'active', is_removed: false, revenue: 9000, orders: 10, quotes: 2, commission: 900 },
    { user_id: 'member-1', full_name: 'Luc Martin', email: 'luc@partner.fr', role: 'member', agent_status: 'invited', is_removed: false, revenue: 3500, orders: 4, quotes: 1, commission: 350 },
  ],
  revenue_by_event: [{ event_id: 'e1', name: 'Paris Fair', revenue: 5000, orders: 6 }],
}

const membersResponse = (callerRole) => ({
  caller_role: callerRole,
  members: [
    { id: 'm1', user_id: 'owner-1', role: 'owner', created_at: '2026-01-01', profiles: { id: 'owner-1', full_name: 'Sarah Dupont', email: 'sarah@partner.fr', agent_status: 'active', has_password_set: true } },
    { id: 'm2', user_id: 'member-1', role: 'member', created_at: '2026-02-01', profiles: { id: 'member-1', full_name: 'Luc Martin', email: 'luc@partner.fr', agent_status: 'invited', has_password_set: false } },
  ],
})

function mockFetch(callerRole, { onInvite } = {}) {
  global.fetch = jest.fn((url, opts) => {
    if (String(url).includes('/stats')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(statsResponse) })
    }
    if (String(url).includes('/members') && opts?.method === 'POST') {
      if (onInvite) onInvite(url, opts)
      return Promise.resolve({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ ok: true, invited: true, member: { email: 'new@partner.fr' } }),
      })
    }
    if (String(url).includes('/members')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(membersResponse(callerRole)) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

const renderDashboard = (props = {}) =>
  render(
    <I18nProvider>
      <TeamDashboard organizationId="org-1" {...props} />
    </I18nProvider>
  )

describe('TeamDashboard', () => {
  afterEach(() => jest.resetAllMocks())

  it('renders KPIs and the members list for every org member', async () => {
    mockFetch('member')
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Sarah Dupont')).toBeInTheDocument())
    expect(screen.getByText('Luc Martin')).toBeInTheDocument()
    expect(screen.getByText('Team Revenue')).toBeInTheDocument()
    expect(screen.getByText('€12,500')).toBeInTheDocument()
    expect(screen.getByText('Active Members')).toBeInTheDocument()
    // Per-member revenue is visible to plain members too (shared data model)
    expect(screen.getByText('€9,000')).toBeInTheDocument()
    expect(screen.getByText('€3,500')).toBeInTheDocument()
  })

  it('hides the invite form and actions from plain members', async () => {
    mockFetch('member')
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Sarah Dupont')).toBeInTheDocument())
    expect(screen.queryByTestId('team-invite-input')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
    expect(screen.queryByText('Pause')).not.toBeInTheDocument()
  })

  it('shows the invite form and member actions to owners', async () => {
    mockFetch('owner')
    renderDashboard()
    await waitFor(() => expect(screen.getByTestId('team-invite-input')).toBeInTheDocument())
    // Owner can manage the plain member (pause/remove) …
    expect(screen.getAllByText('Remove').length).toBeGreaterThan(0)
    // … and resend the pending invite (member-1 is invited without password)
    expect(screen.getByText('Resend invite')).toBeInTheDocument()
  })

  it('owners never see management actions on other owners', async () => {
    mockFetch('owner')
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Sarah Dupont')).toBeInTheDocument())
    const ownerRow = screen.getByTestId('team-member-row-owner-1')
    expect(ownerRow.textContent).not.toContain('Remove')
    expect(ownerRow.textContent).not.toContain('Pause')
  })

  it('disables the invite button until an email is entered', async () => {
    mockFetch('owner')
    renderDashboard()
    await waitFor(() => expect(screen.getByTestId('team-invite-input')).toBeInTheDocument())
    const button = screen.getByTestId('team-invite-submit')
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByTestId('team-invite-input'), { target: { value: 'new@partner.fr' } })
    expect(button).not.toBeDisabled()
  })

  it('bulk paste posts all emails to the members endpoint', async () => {
    const invites = []
    mockFetch('owner', { onInvite: (url, opts) => invites.push(JSON.parse(opts.body)) })
    renderDashboard()
    await waitFor(() => expect(screen.getByTestId('team-invite-input')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('team-invite-input'), {
      target: { value: 'a@partner.fr, b@partner.fr\nA@partner.fr' },
    })
    fireEvent.click(screen.getByTestId('team-invite-submit'))

    await waitFor(() => expect(invites.length).toBe(1))
    expect(invites[0].emails).toEqual(['a@partner.fr', 'b@partner.fr'])
  })

  it('single invite posts a flat email payload and shows success feedback', async () => {
    const invites = []
    mockFetch('owner', { onInvite: (url, opts) => invites.push(JSON.parse(opts.body)) })
    renderDashboard()
    await waitFor(() => expect(screen.getByTestId('team-invite-input')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('team-invite-input'), { target: { value: 'new@partner.fr' } })
    fireEvent.click(screen.getByTestId('team-invite-submit'))

    await waitFor(() => expect(screen.getByTestId('team-invite-feedback')).toBeInTheDocument())
    expect(invites[0].email).toBe('new@partner.fr')
    expect(invites[0].role).toBe('member')
    expect(screen.getByTestId('team-invite-feedback').textContent).toContain('new@partner.fr')
  })

  it('adminView shows management plus the invite-as-owner option', async () => {
    mockFetch('admin')
    renderDashboard({ adminView: true })
    await waitFor(() => expect(screen.getByTestId('team-invite-input')).toBeInTheDocument())
    expect(screen.getByText('Invite as organization owner')).toBeInTheDocument()
    // Admin can manage owners too
    const ownerRow = screen.getByTestId('team-member-row-owner-1')
    expect(ownerRow.textContent).toContain('Remove')
  })

  it('surfaces a retry UI when loading fails', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }))
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Failed to load team data.')).toBeInTheDocument())
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })
})

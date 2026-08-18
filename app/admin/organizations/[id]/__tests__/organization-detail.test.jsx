import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'org-1' }),
  useRouter: () => ({ push }),
}))

jest.mock('@/app/components/TeamDashboard', () => () => <div data-testid="team-dashboard">Team operations</div>)
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

function response(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body })
}

function installFetch() {
  global.fetch = jest.fn((url) => {
    const path = String(url)
    if (path === '/api/organizations/org-1') return response({ organization })
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
    expect(screen.getByRole('heading', { name: 'Operations and reporting' })).toBeInTheDocument()
    expect(screen.getByTestId('settlement-card')).toBeInTheDocument()
    expect(screen.getByTestId('team-dashboard')).toBeInTheDocument()
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

  it('keeps settings editing and saving wired to the organization endpoint', async () => {
    global.fetch.mockImplementation((url, options) => {
      const path = String(url)
      if (path === '/api/organizations/org-1' && options?.method === 'PATCH') {
        return response({ organization: { ...organization, commission_rate: 10 } })
      }
      if (path === '/api/organizations/org-1') return response({ organization })
      if (path.endsWith('/members')) return response({ members })
      if (path.endsWith('/ledger')) return response({ organization_summary: {}, per_member: [] })
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

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

jest.mock('../../../components/AgentFormModal', () => function AgentFormModal() {
  return <div>Agent form</div>
})

jest.mock('../../../components/AddBonusModal', () => function AddBonusModal() {
  return <div>Bonus form</div>
})

import AdminAgentsPage from '../page'

const agents = [
  {
    id: 'solo-org-agent',
    full_name: 'Alice Solo',
    email: 'alice@example.com',
    agent_status: 'active',
    commission_rate: 0,
    organization_id: 'solo-org',
    organization_name: 'Alice Studio',
    organization_rate: 12,
    stats: { effective_pending_commission: 450 },
  },
  {
    id: 'independent-agent',
    full_name: 'Dana Independent',
    email: 'dana@example.com',
    agent_status: 'invited',
    commission_rate: 8,
    organization_id: null,
    stats: { pending_commission: 25 },
  },
  {
    id: 'shared-one',
    full_name: 'Bob Team',
    email: 'bob@example.com',
    agent_status: 'active',
    commission_rate: 15,
    organization_id: 'shared-org',
    organization_name: 'North Team',
    organization_rate: 10,
    stats: { effective_pending_commission: 200 },
  },
  {
    id: 'shared-two',
    full_name: 'Carol Team',
    email: 'carol@example.com',
    agent_status: 'paused',
    commission_rate: 0,
    organization_id: 'shared-org',
    organization_name: 'North Team',
    organization_rate: 10,
    stats: { effective_pending_commission: 300 },
  },
]

describe('AdminAgentsPage redesigned list', () => {
  beforeEach(() => {
    push.mockClear()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ agents, trashedAgents: [] }),
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('separates solo agents from shared organizations and shows effective figures', async () => {
    render(<AdminAgentsPage />)

    expect(await screen.findByRole('heading', { name: 'Solo agents' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shared organizations' })).toBeInTheDocument()
    expect(screen.getByText(/Alice Studio/)).toBeInTheDocument()
    expect(screen.getByText('North Team')).toBeInTheDocument()
    expect(screen.getByText('2 members')).toBeInTheDocument()
    expect(screen.getByText('€450')).toBeInTheDocument()
    expect(screen.getByText('€25')).toBeInTheDocument()
    expect(screen.getAllByText('10%')).toHaveLength(1)
    expect(screen.getByText('15%')).toBeInTheDocument()
    expect(screen.getByText('12%')).toBeInTheDocument()
  })

  it('keeps shared-team classification while searching and opens the correct routes', async () => {
    render(<AdminAgentsPage />)
    await screen.findByText('Bob Team')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search agents' }), {
      target: { value: 'Bob' },
    })

    expect(screen.queryByRole('heading', { name: 'Solo agents' })).not.toBeInTheDocument()
    expect(screen.getByText('2 members')).toBeInTheDocument()
    expect(screen.queryByText('Carol Team')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open Bob Team profile' }))
    expect(push).toHaveBeenCalledWith('/admin/agents/shared-one')

    fireEvent.click(screen.getByRole('button', { name: 'Open organization' }))
    expect(push).toHaveBeenCalledWith('/admin/organizations/shared-org')
  })

  it('keeps rare administration actions in a secondary disclosure', async () => {
    render(<AdminAgentsPage />)
    await screen.findByText('Dana Independent')

    const danaArticle = screen.getByRole('button', { name: 'Open Dana Independent profile' }).closest('article')
    const actions = within(danaArticle)
    fireEvent.click(actions.getByText('Manage agent'))
    expect(actions.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(actions.getByRole('button', { name: 'Bonus' })).toBeInTheDocument()
    expect(actions.getByRole('button', { name: 'Repair' })).toBeInTheDocument()
    expect(actions.getByRole('button', { name: 'Reset password' })).toBeInTheDocument()
    expect(actions.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('fetches the full agent and trash payload', async () => {
    render(<AdminAgentsPage />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/agents?include_trashed=true'))
  })
})

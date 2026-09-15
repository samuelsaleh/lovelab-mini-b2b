/**
 * Sales Team → Commercials (Sam, 15 Sep 2026): admins who take orders and
 * earn commission are followed here, with the same figures as an agent, and
 * never mixed into the Agents tab.
 */
import { fireEvent, render, screen } from '@testing-library/react'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

import AdminCommercialsPage from '../page'

const payload = {
  agents: [
    { id: 'alice', full_name: 'Alice Agent', email: 'alice@example.com', agent_status: 'active', commission_rate: 12, is_commercial: false, stats: { effective_pending_commission: 450 } },
    { id: 'raphael', full_name: 'Raphael', email: 'raphael@love-lab.com', role: 'admin', agent_status: 'active', commission_rate: 10, is_commercial: true, stats: { effective_orders: 3, effective_revenue: 1200, effective_pending_commission: 120 } },
  ],
}

describe('AdminCommercialsPage', () => {
  beforeEach(() => {
    push.mockClear()
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload })
  })
  afterEach(() => jest.restoreAllMocks())

  it('lists only the commercials, with rate, orders, revenue and what is owed', async () => {
    render(<AdminCommercialsPage />)
    expect(await screen.findByText('Raphael')).toBeInTheDocument()
    expect(screen.queryByText('Alice Agent')).not.toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/1\.?200,00/)).toBeInTheDocument()
    expect(screen.getByText(/120,00/)).toBeInTheDocument()
    expect(screen.getByText('· Employee')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Commercials' })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the commercial page, not the agent page', async () => {
    render(<AdminCommercialsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open Raphael profile' }))
    expect(push).toHaveBeenCalledWith('/admin/commercials/raphael')
  })

  it('points to Employees when nobody is a commercial yet', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ agents: payload.agents.slice(0, 1) }) })
    render(<AdminCommercialsPage />)
    expect(await screen.findByText(/No commercials yet.*Make commercial/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Employees/ }))
    expect(push).toHaveBeenCalledWith('/admin/employees')
  })
})

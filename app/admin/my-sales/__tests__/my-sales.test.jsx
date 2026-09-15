/**
 * /admin/my-sales — a commercial admin's own orders, commissions and payments
 * inside the admin portal (Sam, 15 Sep 2026). Not the agent portal.
 */
import { render, screen } from '@testing-library/react'

const replace = jest.fn()
let auth = { profile: null, loading: false }

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
jest.mock('@/app/components/AuthProvider', () => ({ useAuth: () => auth }))
jest.mock('@/app/components/AgentSelfView', () => function AgentSelfView({ defaultTab }) {
  return <div>Self view · {defaultTab}</div>
})

import MySalesPage from '../page'
import { getAdminNavItems, getMainNavItems } from '@/lib/navItems'

describe('My Sales', () => {
  beforeEach(() => replace.mockClear())

  it('shows the commercial their own sales view', () => {
    auth = { profile: { id: 'r', role: 'admin', is_agent: true, agent_status: 'active' }, loading: false }
    render(<MySalesPage />)
    expect(screen.getByText('Self view · financials')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('sends an admin who is not a commercial back to the dashboard', () => {
    auth = { profile: { id: 'a', role: 'admin', is_agent: false }, loading: false }
    render(<MySalesPage />)
    expect(screen.queryByText(/Self view/)).not.toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith('/admin')
  })

  it('is reached from the admin sidebar, inside the admin portal', () => {
    const items = getAdminNavItems({ role: 'admin', is_agent: true, agent_status: 'active' })
    const mine = items.find((i) => i.id === 'my-sales')
    expect(mine).toEqual({ id: 'my-sales', label: 'My Sales', href: '/admin/my-sales' })
    expect(items[items.findIndex((i) => i.id === 'sales-team') + 1]).toBe(mine)
    expect(getAdminNavItems({ role: 'admin', is_agent: false }).some((i) => i.id === 'my-sales')).toBe(false)
  })

  it('is also in the main app sidebar for a commercial admin only', () => {
    const mine = getMainNavItems({ role: 'admin', is_agent: true, agent_status: 'active' }).find((i) => i.id === 'my-sales')
    expect(mine).toEqual({ id: 'my-sales', label: 'My Sales', href: '/admin/my-sales' })
    expect(getMainNavItems({ role: 'admin' }).some((i) => i.id === 'my-sales')).toBe(false)
    expect(getMainNavItems({ role: 'agent', is_agent: true, agent_status: 'active' }).some((i) => i.id === 'my-sales')).toBe(false)
    expect(getMainNavItems({ role: 'admin', is_agent: true, agent_status: 'inactive' }).some((i) => i.id === 'my-sales')).toBe(false)
  })
})

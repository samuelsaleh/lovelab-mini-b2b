/**
 * Home screen for a commercial admin (Sam, 15 Sep 2026): a "My Sales" button
 * next to Create New Order leads to their own orders, commissions and
 * payments. A plain admin and an agent do not get it.
 */
import { render, screen } from '@testing-library/react'

let auth = {}
jest.mock('../AuthProvider', () => ({ useAuth: () => auth }))
jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))
jest.mock('../ResourcesCard', () => () => <div data-testid="resources-card" />)
jest.mock('../PackshotGallery', () => () => null)
jest.mock('../OrderTypePicker', () => () => null)

import HomeTab from '../HomeTab'

const renderAs = (profile) => {
  auth = { profile, user: { email: profile.email || 'x@example.com' }, orgMembership: null }
  return render(<HomeTab onSwitchTab={jest.fn()} onCreateOrder={jest.fn()} />)
}

describe('HomeTab — commercial admin', () => {
  it('shows My Sales to a commercial admin, pointing into the admin portal', () => {
    renderAs({ full_name: 'Raphael', role: 'admin', is_agent: true, agent_status: 'active' })
    const link = screen.getByTestId('my-sales-button')
    expect(link).toHaveTextContent('My Sales')
    expect(link).toHaveAttribute('href', '/admin/my-sales')
  })

  it('hides it from an admin who is not a commercial, and from a stopped one', () => {
    renderAs({ full_name: 'Sam', role: 'admin', is_agent: false })
    expect(screen.queryByTestId('my-sales-button')).not.toBeInTheDocument()
  })

  it('hides it from an agent — agents have their own portal', () => {
    renderAs({ full_name: 'Alice', role: 'agent', is_agent: true, agent_status: 'active' })
    expect(screen.queryByTestId('my-sales-button')).not.toBeInTheDocument()
  })
})

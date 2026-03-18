/**
 * AgentLayout guard tests
 *
 * Covers:
 *   - Non-agent user is redirected to /
 *   - Non-authenticated user is redirected to /
 *   - Agent user sees children rendered
 */

import { render, screen } from '@testing-library/react'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/agent',
}))

jest.mock('../../components/AuthProvider', () => ({
  useAuth: jest.fn(),
}))

// PortalLayout is a layout wrapper — render it as a pass-through for guard tests
jest.mock('../../components/PortalLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="portal-layout">{children}</div>,
}))

import { useAuth } from '../../components/AuthProvider'
import AgentLayout from '../layout'

beforeEach(() => { mockPush.mockClear() })

describe('AgentLayout — auth guard', () => {
  it('redirects to / when user is not authenticated', () => {
    useAuth.mockReturnValue({ user: null, profile: null, loading: false })
    render(<AgentLayout><span>content</span></AgentLayout>)
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('redirects to / when user is authenticated but not an agent', () => {
    useAuth.mockReturnValue({
      user: { id: '1', email: 'admin@test.com' },
      profile: { role: 'admin', is_agent: false },
      loading: false,
    })
    render(<AgentLayout><span>content</span></AgentLayout>)
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('renders children when user is an active agent', () => {
    useAuth.mockReturnValue({
      user: { id: '2', email: 'agent@test.com' },
      profile: { role: 'member', is_agent: true, agent_status: 'active' },
      loading: false,
    })
    render(<AgentLayout><span data-testid="child">dashboard</span></AgentLayout>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders loading state while auth is loading', () => {
    useAuth.mockReturnValue({ user: null, profile: null, loading: true })
    render(<AgentLayout><span>content</span></AgentLayout>)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })
})

/**
 * HomeTab privacy tests
 *
 * Guarantees:
 *   - Renders with zero financial data
 *   - No API calls are made on mount
 *   - "+ Create New Order" opens the order type picker for agents (B2B only)
 *   - Welcome message contains the user's name
 */

import { render, screen, fireEvent } from '@testing-library/react'

const mockResourcesCard = jest.fn(() => <div data-testid="resources-card" />)

// Mock useAuth
jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    profile: { full_name: 'Alice Martin', role: 'agent' },
    user: { email: 'alice@example.com' },
  }),
}))

// Mock useI18n
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key, params) => {
      const map = {
        'home.welcome': 'Welcome back, {name}!',
        'home.newOrder': '+ Create New Order',
      }
      let str = map[key] || key
      if (params) Object.entries(params).forEach(([k, v]) => { str = str.replaceAll(`{${k}}`, v) })
      return str
    },
  }),
}))

// Mock ResourcesCard (external dep)
jest.mock('../ResourcesCard', () => ({
  __esModule: true,
  default: (props) => mockResourcesCard(props),
}))

import HomeTab from '../HomeTab'

beforeEach(() => {
  global.fetch = jest.fn()
  mockResourcesCard.mockClear()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('HomeTab', () => {
  it('renders without crashing', () => {
    render(<HomeTab onSwitchTab={jest.fn()} />)
    expect(screen.getByTestId('home-tab')).toBeInTheDocument()
  })

  it('shows the user name in the welcome message', () => {
    render(<HomeTab onSwitchTab={jest.fn()} />)
    expect(screen.getByText(/Welcome back, Alice Martin!/i)).toBeInTheDocument()
  })

  it('renders the New Order button', () => {
    render(<HomeTab onSwitchTab={jest.fn()} />)
    expect(screen.getByTestId('new-order-button')).toBeInTheDocument()
  })

  it('opens the order type picker when New Order is clicked (agent role)', () => {
    render(<HomeTab onSwitchTab={jest.fn()} onCreateOrder={jest.fn()} />)
    fireEvent.click(screen.getByTestId('new-order-button'))
    expect(screen.getByText('Create New Order')).toBeInTheDocument()
    expect(screen.queryByText('Sample Order')).not.toBeInTheDocument()
    expect(screen.getByText('B2B Order')).toBeInTheDocument()
  })

  it('makes NO fetch calls on mount (privacy guarantee)', () => {
    render(<HomeTab onSwitchTab={jest.fn()} />)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not render any financial amounts (privacy guarantee)', () => {
    const { container } = render(<HomeTab onSwitchTab={jest.fn()} />)
    // No euro signs in the rendered output
    expect(container.textContent).not.toMatch(/€\d/)
  })

  it('passes the user email to ResourcesCard for role-aware catalogue links', () => {
    render(<HomeTab onSwitchTab={jest.fn()} />)
    expect(mockResourcesCard).toHaveBeenCalledWith(expect.objectContaining({
      isAdmin: false,
      userEmail: 'alice@example.com',
    }))
  })
})

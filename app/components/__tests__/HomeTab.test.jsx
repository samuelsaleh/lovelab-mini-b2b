/**
 * HomeTab privacy tests
 *
 * Guarantees:
 *   - Renders with zero financial data
 *   - No API calls are made on mount
 *   - "+ Create New Order" button calls onSwitchTab('builder')
 *   - Welcome message contains the user's name
 */

import { render, screen, fireEvent } from '@testing-library/react'

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
  default: () => <div data-testid="resources-card" />,
}))

import HomeTab from '../HomeTab'

beforeEach(() => {
  global.fetch = jest.fn()
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

  it('calls onSwitchTab("builder") when New Order is clicked', () => {
    const onSwitchTab = jest.fn()
    render(<HomeTab onSwitchTab={onSwitchTab} />)
    fireEvent.click(screen.getByTestId('new-order-button'))
    expect(onSwitchTab).toHaveBeenCalledWith('builder')
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
})

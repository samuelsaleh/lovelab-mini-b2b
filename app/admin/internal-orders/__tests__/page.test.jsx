/**
 * Admin Internal Orders page — same panel as the old main-sidebar tab.
 */

import { render, screen } from '@testing-library/react'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

jest.mock('@/app/components/InternalOrdersPanel', () => ({ onReEdit }) => (
  <div data-testid="internal-orders-panel">
    <button type="button" onClick={() => onReEdit({ id: 'doc-1' })}>Re-edit</button>
  </div>
))

import AdminInternalOrdersPage from '../page'

describe('AdminInternalOrdersPage', () => {
  beforeEach(() => push.mockClear())

  it('renders the internal orders panel', () => {
    render(<AdminInternalOrdersPage />)
    expect(screen.getByTestId('internal-orders-panel')).toBeInTheDocument()
  })

  it('opens a saved order in the main app via reEdit', () => {
    render(<AdminInternalOrdersPage />)
    screen.getByRole('button', { name: 'Re-edit' }).click()
    expect(push).toHaveBeenCalledWith('/?reEdit=doc-1')
  })
})

import { fireEvent, render, screen } from '@testing-library/react'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

import SalesTeamTabs from '../SalesTeamTabs'

describe('SalesTeamTabs', () => {
  beforeEach(() => push.mockClear())

  it('explains the three distinct sales-team concepts in plain language', () => {
    render(<SalesTeamTabs active="agents" />)

    expect(screen.getByRole('heading', { name: 'Sales Team' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Agents' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Assistants' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Agent Teams' })).toBeInTheDocument()
    expect(screen.getByText('One agent = one clear profile')).toBeInTheDocument()
    expect(screen.getByText(/Independent salespeople.*earn commission/i)).toBeInTheDocument()
  })

  it('marks the current section as selected', () => {
    render(<SalesTeamTabs active="assistants" />)
    expect(screen.getByRole('tab', { name: 'Assistants' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Internal helpers.*fairs you assign/i)).toBeInTheDocument()
  })

  it('navigates among the existing stable admin routes', () => {
    render(<SalesTeamTabs active="agents" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Assistants' }))
    expect(push).toHaveBeenCalledWith('/admin/assistants')

    fireEvent.click(screen.getByRole('tab', { name: 'Agent Teams' }))
    expect(push).toHaveBeenCalledWith('/admin/organizations')
  })
})

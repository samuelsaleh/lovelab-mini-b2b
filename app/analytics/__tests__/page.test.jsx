/**
 * /analytics redirect smoke tests
 *
 * Covers:
 *   - Admin user → redirects to /admin/reports
 *   - Agent user → redirects to /agent/reports
 *   - Unknown/unauthenticated user → redirects to /
 */

import { render } from '@testing-library/react'

const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('../../components/AuthProvider', () => ({
  useAuth: jest.fn(),
}))

import { useAuth } from '../../components/AuthProvider'
import AnalyticsRedirect from '../page'

beforeEach(() => { mockReplace.mockClear() })

describe('/analytics redirect', () => {
  it('redirects admin to /admin/reports', () => {
    useAuth.mockReturnValue({ profile: { role: 'admin', is_agent: false }, loading: false })
    render(<AnalyticsRedirect />)
    expect(mockReplace).toHaveBeenCalledWith('/admin/reports')
  })

  it('redirects agent to /agent/reports', () => {
    useAuth.mockReturnValue({ profile: { role: 'member', is_agent: true }, loading: false })
    render(<AnalyticsRedirect />)
    expect(mockReplace).toHaveBeenCalledWith('/agent/reports')
  })

  it('redirects unknown user to /', () => {
    useAuth.mockReturnValue({ profile: { role: 'member', is_agent: false }, loading: false })
    render(<AnalyticsRedirect />)
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('does not redirect while loading', () => {
    useAuth.mockReturnValue({ profile: null, loading: true })
    render(<AnalyticsRedirect />)
    expect(mockReplace).not.toHaveBeenCalled()
  })
})

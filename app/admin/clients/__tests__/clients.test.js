/**
 * Admin Clients page — the page has been replaced with a redirect to /admin/reports.
 * Tests verify the redirect behavior.
 */

import React from 'react'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

import AdminClientsRedirect from '../page'

beforeEach(() => { mockReplace.mockClear() })

describe('AdminClientsPage redirect', () => {
  test('redirects to /admin/reports', () => {
    render(<AdminClientsRedirect />)
    expect(mockReplace).toHaveBeenCalledWith('/admin/reports')
  })

  test('renders nothing visible (returns null)', () => {
    const { container } = render(<AdminClientsRedirect />)
    expect(container.firstChild).toBeNull()
  })
})

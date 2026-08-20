/**
 * TeamInviteForm — standalone invite flow, extracted from TeamDashboard so the
 * admin org page can reuse it inside its single Members table.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import TeamInviteForm from '../TeamInviteForm'

const renderForm = (props = {}) =>
  render(<TeamInviteForm organizationId="org-1" {...props} />)

describe('TeamInviteForm', () => {
  afterEach(() => jest.resetAllMocks())

  it('disables the send button until an email is entered', () => {
    global.fetch = jest.fn()
    renderForm()
    const button = screen.getByTestId('team-invite-submit')
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByTestId('team-invite-input'), { target: { value: 'new@partner.fr' } })
    expect(button).not.toBeDisabled()
  })

  it('posts a single invite, shows feedback, and tells the caller to reload', async () => {
    const calls = []
    global.fetch = jest.fn((url, opts) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body) })
      return Promise.resolve({ ok: true, status: 202, json: async () => ({ ok: true }) })
    })
    const onInvited = jest.fn()
    renderForm({ onInvited })

    fireEvent.change(screen.getByTestId('team-invite-input'), { target: { value: 'new@partner.fr' } })
    fireEvent.click(screen.getByTestId('team-invite-submit'))

    await waitFor(() => expect(screen.getByTestId('team-invite-feedback')).toBeInTheDocument())
    expect(calls[0].url).toBe('/api/organizations/org-1/members')
    expect(calls[0].body).toEqual({ email: 'new@partner.fr', role: 'member' })
    expect(onInvited).toHaveBeenCalled()
    expect(screen.getByTestId('team-invite-feedback').textContent).toContain('new@partner.fr')
  })

  it('deduplicates bulk pastes into one request with all emails', async () => {
    const bodies = []
    global.fetch = jest.fn((url, opts) => {
      bodies.push(JSON.parse(opts.body))
      return Promise.resolve({ ok: true, json: async () => ({ invited_count: 2, failed_count: 0, results: [] }) })
    })
    renderForm()

    fireEvent.change(screen.getByTestId('team-invite-input'), {
      target: { value: 'a@partner.fr, b@partner.fr\nA@partner.fr' },
    })
    fireEvent.click(screen.getByTestId('team-invite-submit'))

    await waitFor(() => expect(bodies.length).toBe(1))
    expect(bodies[0].emails).toEqual(['a@partner.fr', 'b@partner.fr'])
  })

  it('shows the invite-as-owner checkbox only in admin view', () => {
    global.fetch = jest.fn()
    const { unmount } = renderForm()
    expect(screen.queryByText('Invite as organization owner')).not.toBeInTheDocument()
    unmount()

    renderForm({ adminView: true })
    expect(screen.getByText('Invite as organization owner')).toBeInTheDocument()
  })

  it('surfaces an error message when the invite fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, json: async () => ({ error: 'Already a member of another team' }) })
    )
    renderForm()

    fireEvent.change(screen.getByTestId('team-invite-input'), { target: { value: 'taken@partner.fr' } })
    fireEvent.click(screen.getByTestId('team-invite-submit'))

    await waitFor(() => expect(screen.getByTestId('team-invite-feedback')).toBeInTheDocument())
    expect(screen.getByTestId('team-invite-feedback').textContent).toContain('Already a member of another team')
  })
})

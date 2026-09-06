/**
 * Admin Invite button on a fair folder: pick an agent, POST edit access, remove.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DocumentsPanel from '../DocumentsPanel'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', luxeGold: '#c9a84c', lovelabMuted: '#999' },
  fonts: { body: 'inherit' },
}))
jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))
jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (k) => k }) }))
jest.mock('@/lib/utils', () => ({ fmt: (n) => `€${n}`, fmtRevenue: (n) => `€${n}` }))
jest.mock('@/lib/api', () => ({ safeFetch: (url, opts) => global.fetch(url, opts) }))
jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', email: 'admin@lovelab.test' },
    profile: { role: 'admin' },
    profileMissing: false,
    profileError: null,
  }),
}))
jest.mock('../DocumentsAnalytics', () => () => null)
jest.mock('../ConfirmDialog', () => () => null)
jest.mock('../DocumentRow', () => ({ doc }) => <div data-testid="doc-row">{doc.file_name}</div>)
jest.mock('../DocumentsSidebar', () => (props) => (
  <div>
    {(props.events || []).map((e) => (
      <button key={e.id} onClick={() => props.setSelectedEventId(e.id)}>
        {`select-${e.id}`}
      </button>
    ))}
  </div>
))

const INOVA = {
  id: 'inova',
  name: 'INOVA FRANKFURT',
  type: 'fair',
  permission: 'manage',
  doc_count: 5,
}

const BASTIAN = {
  id: 'bastian-id',
  full_name: 'Bastian Mayer',
  email: 'bastianmeyer319@hotmail.com',
  agent_status: 'active',
}

function mockFetch({ access = [], agents = [BASTIAN] } = {}) {
  return jest.fn((url, opts = {}) => {
    const u = String(url)
    let body = {}
    if (u === '/api/events' || (u.startsWith('/api/events') && !u.includes('/access'))) {
      body = { events: [INOVA] }
    } else if (u.startsWith('/api/org-folders')) {
      body = { orgFolders: [] }
    } else if (u.startsWith('/api/agents')) {
      body = { agents }
    } else if (u.includes('/access/') && opts.method === 'DELETE') {
      body = { ok: true }
    } else if (u.includes('/access') && opts.method === 'POST') {
      body = {
        access: {
          user_id: 'bastian-id',
          permission: 'edit',
          profiles: { full_name: BASTIAN.full_name, email: BASTIAN.email },
        },
      }
    } else if (u.includes('/access')) {
      body = { access }
    } else if (u.startsWith('/api/documents')) {
      body = { documents: [], total_count: 0 }
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    })
  })
}

beforeEach(() => {
  global.fetch = mockFetch()
})

describe('DocumentsPanel — invite agent to a fair', () => {
  test('shows Invite on a selected fair and posts edit access for the picked agent', async () => {
    render(<DocumentsPanel />)
    fireEvent.click(await screen.findByText('select-inova'))

    const inviteBtn = await screen.findByTestId('invite-fair-btn')
    fireEvent.click(inviteBtn)

    expect(await screen.findByText('docs.inviteTitle')).toBeInTheDocument()
    expect(screen.getByText('docs.inviteHint')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('invite-agent-select'), {
      target: { value: 'bastian-id' },
    })
    fireEvent.click(screen.getByTestId('invite-agent-submit'))

    await waitFor(() => {
      const post = global.fetch.mock.calls.find((c) =>
        String(c[0]).includes('/api/events/inova/access') && c[1]?.method === 'POST',
      )
      expect(post).toBeTruthy()
      expect(JSON.parse(post[1].body)).toEqual({
        user_id: 'bastian-id',
        permission: 'edit',
      })
    })
  })

  test('Remove revokes the share row', async () => {
    global.fetch = mockFetch({
      access: [{
        user_id: 'bastian-id',
        permission: 'edit',
        profiles: { full_name: BASTIAN.full_name, email: BASTIAN.email },
      }],
    })

    render(<DocumentsPanel />)
    fireEvent.click(await screen.findByText('select-inova'))
    fireEvent.click(await screen.findByTestId('invite-fair-btn'))

    expect(await screen.findByText('Bastian Mayer')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('invite-remove-bastian-id'))

    await waitFor(() => {
      const del = global.fetch.mock.calls.find((c) =>
        String(c[0]).includes('/api/events/inova/access/bastian-id') && c[1]?.method === 'DELETE',
      )
      expect(del).toBeTruthy()
    })
  })
})

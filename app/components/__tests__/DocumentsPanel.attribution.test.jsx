/**
 * DocumentsPanel — find a document by the person behind it.
 *
 * Sam Aug 2026: "Wassila puts in a new order, but how do I see it came from
 * her? I have to go looking myself." Search only matched client name, company
 * and file name, and there was no way to narrow a team folder to one member.
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
jest.mock('@/lib/utils', () => ({ fmt: (n) => `€${n}` }))
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
jest.mock('../DocumentRow', () => ({ doc }) => (
  <div data-testid="doc-row">{doc.client_company || doc.client_name}</div>
))

// Sidebar stub that exposes team and member selection the same way the real one
// does, so the panel's filtering is what gets tested.
jest.mock('../DocumentsSidebar', () => (props) => (
  <div>
    <button onClick={() => {
      props.setSelectedOrgId(null)
      props.setSelectedOrgMemberId(null)
      props.setSelectedEventId(null)
    }}>select-all</button>
    {(props.orgFolders || []).map((org) => (
      <div key={org.organization_id}>
        <button onClick={() => {
          props.setSelectedOrgId(org.organization_id)
          props.setSelectedOrgMemberId(null)
        }}>{`select-team-${org.organization_id}`}</button>
        {(org.members || []).map((m) => (
          <button key={m.user_id} onClick={() => {
            props.setSelectedOrgId(org.organization_id)
            props.setSelectedOrgMemberId(m.user_id)
          }}>{`select-member-${m.user_id}`}</button>
        ))}
      </div>
    ))}
    <span data-testid="member-filter">{props.selectedOrgMemberId || 'none'}</span>
  </div>
))

const SARAH_TEAM = {
  organization_id: 'org-sarah',
  organization_name: 'Sarah Goutard Organization',
  doc_count: 3,
  members: [
    { user_id: 'sarah', full_name: 'Sarah Goutard', email: 'sarah@example.com', role: 'owner', doc_count: 0 },
    { user_id: 'wassila', full_name: 'Wassila Mekidiche', email: 'wassila@example.com', role: 'agent', doc_count: 2 },
    { user_id: 'ruby', full_name: 'Ruby Robin', email: 'ruby@example.com', role: 'agent', doc_count: 1 },
  ],
  agent_subfolders: [],
}

const wassilaCreator = { full_name: 'Wassila Mekidiche', email: 'wassila@example.com' }
const rubyCreator = { full_name: 'Ruby Robin', email: 'ruby@example.com' }

// One of Wassila's orders is still filed in Sarah's event — the exact residue
// of the historical misfiling. Filtering on created_by must still find it.
const TEAM_DOCS = [
  {
    id: 'w1',
    client_company: 'BIJOUTERIE CURIOZA',
    status: 'sent',
    document_type: 'order',
    total_amount: 2585,
    created_at: '2026-07-07T10:00:00.000Z',
    created_by: 'wassila',
    event_id: 'evt-sarah',
    events: { name: 'Sarah Goutard', organization_id: 'org-sarah' },
    creator: wassilaCreator,
    agent: wassilaCreator,
  },
  {
    id: 'w2',
    client_company: 'CAPRICE',
    status: 'sent',
    document_type: 'order',
    total_amount: 2006,
    created_at: '2026-07-16T10:00:00.000Z',
    created_by: 'wassila',
    event_id: 'evt-wassila',
    events: { name: 'Wassila Mekidiche', organization_id: 'org-sarah' },
    creator: wassilaCreator,
    agent: wassilaCreator,
  },
  {
    id: 'r1',
    client_company: 'FARANDOLE',
    status: 'sent',
    document_type: 'order',
    total_amount: 1841,
    created_at: '2026-07-10T10:00:00.000Z',
    created_by: 'ruby',
    event_id: 'evt-ruby',
    events: { name: 'Ruby Robin', organization_id: 'org-sarah' },
    creator: rubyCreator,
    agent: rubyCreator,
  },
]

function installFetch() {
  global.fetch = jest.fn((url) => {
    const u = String(url)
    let body = {}
    if (u.startsWith('/api/events')) body = { events: [] }
    else if (u.startsWith('/api/org-folders')) body = { orgFolders: [SARAH_TEAM] }
    else if (u.includes('organization_id=org-sarah')) body = { documents: TEAM_DOCS, total_count: 3 }
    else if (u.startsWith('/api/documents')) {
      const page = new URL(u, 'http://localhost').searchParams.get('page')
      body = page === '1' ? { documents: TEAM_DOCS, total_count: 3 } : { documents: [], total_count: 3 }
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
}

const search = () => screen.getByPlaceholderText('Search by client name or company...')
const visibleClients = () => screen.queryAllByTestId('doc-row').map((n) => n.textContent)

beforeEach(installFetch)
afterEach(() => jest.clearAllMocks())

describe('DocumentsPanel — search by the person', () => {
  it('finds a member\'s orders by typing their name', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('BIJOUTERIE CURIOZA')

    fireEvent.change(search(), { target: { value: 'wassila' } })

    expect(visibleClients()).toEqual(['BIJOUTERIE CURIOZA', 'CAPRICE'])
  })

  it('finds them by email too', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('FARANDOLE')

    fireEvent.change(search(), { target: { value: 'ruby@example.com' } })

    expect(visibleClients()).toEqual(['FARANDOLE'])
  })

  it('is case-insensitive on the person\'s name', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('FARANDOLE')

    fireEvent.change(search(), { target: { value: 'RUBY ROBIN' } })

    expect(visibleClients()).toEqual(['FARANDOLE'])
  })

  it('keeps searching by client as before', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('CAPRICE')

    fireEvent.change(search(), { target: { value: 'caprice' } })

    expect(visibleClients()).toEqual(['CAPRICE'])
  })

  it('still reports no match for a name nobody has', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('CAPRICE')

    fireEvent.change(search(), { target: { value: 'nobody at all' } })

    expect(visibleClients()).toEqual([])
  })
})

describe('DocumentsPanel — team folder scoped to one member', () => {
  it('shows only that member, including an order still filed elsewhere', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('BIJOUTERIE CURIOZA')

    fireEvent.click(screen.getByText('select-member-wassila'))

    await waitFor(() => {
      // BIJOUTERIE CURIOZA sits in Sarah's event but was created by Wassila.
      expect(visibleClients()).toEqual(['BIJOUTERIE CURIOZA', 'CAPRICE'])
    })
    expect(screen.getByText(/Sarah Goutard Organization › Wassila Mekidiche/)).toBeInTheDocument()
  })

  it('shows the whole team again when the team row is selected', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('BIJOUTERIE CURIOZA')

    fireEvent.click(screen.getByText('select-member-ruby'))
    await waitFor(() => expect(visibleClients()).toEqual(['FARANDOLE']))

    fireEvent.click(screen.getByText('select-team-org-sarah'))
    await waitFor(() => expect(visibleClients()).toHaveLength(3))
    expect(screen.getByTestId('member-filter')).toHaveTextContent('none')
  })

  it('combines the member filter with search', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('BIJOUTERIE CURIOZA')

    fireEvent.click(screen.getByText('select-member-wassila'))
    await waitFor(() => expect(visibleClients()).toHaveLength(2))

    fireEvent.change(search(), { target: { value: 'caprice' } })
    expect(visibleClients()).toEqual(['CAPRICE'])
  })

  it('a member with no documents shows an empty folder, not the whole team', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('BIJOUTERIE CURIOZA')

    fireEvent.click(screen.getByText('select-member-sarah'))

    expect(await screen.findByText('No documents in Sarah Goutard Organization › Sarah Goutard'))
      .toBeInTheDocument()
    expect(visibleClients()).toEqual([])
  })

  it('names the current folder and its document count above the list', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('BIJOUTERIE CURIOZA')

    expect(screen.getByRole('heading', { name: 'All Documents' })).toBeInTheDocument()
    expect(screen.getByText('3 documents')).toBeInTheDocument()

    fireEvent.click(screen.getByText('select-member-ruby'))

    expect(await screen.findByRole('heading', { name: 'Sarah Goutard Organization › Ruby Robin' }))
      .toBeInTheDocument()
    expect(await screen.findByText('1 document')).toBeInTheDocument()
  })
})

/**
 * Documents panel — a commercial's folder (Sam, 15 Sep 2026).
 *
 * Clicking Raphael under Commercials fetches every order he saved or was
 * credited with (`created_by_agent`, the same filter his commercial page
 * uses) and lists them; All Documents brings the global list back.
 */
import { render, screen, fireEvent } from '@testing-library/react'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', luxeGold: '#c9a84c', lovelabMuted: '#999', charcoal: '#333', textLight: '#888', lovelabBorder: '#ddd' },
  fonts: { body: 'inherit', heading: 'inherit' },
}))
jest.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => false, useResponsive: () => ({ isMobile: false, isCompact: false }) }))
jest.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (k) => k }) }))
jest.mock('@/lib/utils', () => ({ fmt: (n) => `€${n}`, fmtRevenue: (n) => `€${n}`, isHideRevenue: () => false }))
jest.mock('@/lib/api', () => ({ safeFetch: (url, opts) => global.fetch(url, opts) }))
jest.mock('../AuthProvider', () => ({
  useAuth: () => ({ profile: { id: 'admin-1', role: 'admin' }, user: { id: 'admin-1' }, orgMembership: null }),
}))
jest.mock('../DocumentsAnalytics', () => () => null)
jest.mock('../ConfirmDialog', () => () => null)
jest.mock('../DocumentRow', () => ({ doc }) => <div>{doc.file_name}</div>)
jest.mock('../DocumentsSidebar', () => (props) => (
  <div>
    <button onClick={() => { props.setSelectedCommercialId(null); props.setSelectedEventId(null) }}>select-all</button>
    {(props.commercials || []).map((c) => (
      <button key={c.user_id} onClick={() => { props.setSelectedCommercialId(c.user_id); props.setSelectedEventId(null) }}>
        {`commercial-${c.user_id} (${c.doc_count})`}
      </button>
    ))}
  </div>
))

import DocumentsPanel from '../DocumentsPanel'

const RAPHAEL = { user_id: 'raphael-id', full_name: 'Raphael Saleh', email: 'raphael@love-lab.com', doc_count: 2 }
const GLOBAL_DOCS = [{ id: 'g1', event_id: null, status: 'sent', file_name: 'Recent.pdf', client_name: 'Acme', total_amount: 100, created_by: 'someone-else' }]
const RAPHAEL_DOCS = [
  { id: 'r1', event_id: null, status: 'sent', file_name: 'Dubois.pdf', client_name: 'Maison Dubois', total_amount: 1800, created_by: 'raphael-id' },
  { id: 'r2', event_id: null, status: 'sent', file_name: 'VanLoo.pdf', client_name: 'Van Loo', total_amount: 1260, created_by: 'sam-id', agent_id: 'raphael-id' },
]

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const u = String(url)
    let body = {}
    if (u.startsWith('/api/events')) body = { events: [] }
    else if (u.startsWith('/api/org-folders')) body = { orgFolders: [], commercials: [RAPHAEL] }
    else if (u.includes('created_by_agent=raphael-id')) body = { documents: RAPHAEL_DOCS, total_count: 2 }
    else if (u.startsWith('/api/documents')) body = { documents: GLOBAL_DOCS, total_count: 1 }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
})
afterEach(() => jest.restoreAllMocks())

describe('DocumentsPanel — commercial folder', () => {
  it('fetches the commercial’s orders with created_by_agent and lists them', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('Recent.pdf')
    fireEvent.click(await screen.findByText('commercial-raphael-id (2)'))

    expect(await screen.findByText('Dubois.pdf')).toBeInTheDocument()
    expect(screen.getByText('VanLoo.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Recent.pdf')).not.toBeInTheDocument()
    const urls = global.fetch.mock.calls.map((c) => String(c[0]))
    expect(urls).toContain('/api/documents?created_by_agent=raphael-id&per_page=200&page=1')
    expect(screen.getByText('Raphael Saleh')).toBeInTheDocument()
  })

  it('All Documents brings the global list back', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('Recent.pdf')
    fireEvent.click(await screen.findByText('commercial-raphael-id (2)'))
    await screen.findByText('Dubois.pdf')
    fireEvent.click(screen.getByText('select-all'))
    expect(await screen.findByText('Recent.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Dubois.pdf')).not.toBeInTheDocument()
  })
})

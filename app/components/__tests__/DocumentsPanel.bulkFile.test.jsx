/**
 * DocumentsPanel — bulk "add to fair" from All Documents.
 *
 * Sam, Sep 2026: an agent saved a batch of orders without linking them to the
 * fair. The admin ticks them in All Documents, picks the fair, and one request
 * files them all — the orders stay attributed to the agent.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
// Interpolating t keeps the notice assertions readable.
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (k, params) => params
      ? `${k} ${Object.entries(params).map(([key, v]) => `${key}=${v}`).join(' ')}`
      : k,
  }),
}))
jest.mock('@/lib/utils', () => ({ fmt: (n) => `€${n}`, fmtRevenue: (n) => `€${n}` }))
jest.mock('@/lib/api', () => ({ safeFetch: (url, opts) => global.fetch(url, opts) }))
jest.mock('@/lib/documentAttribution', () => ({ resolveDocumentAttribution: () => ({ label: null }) }))

let currentProfile = { role: 'admin' }
jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', email: 'admin@lovelab.test' },
    profile: currentProfile,
    profileMissing: false,
    profileError: null,
  }),
}))
jest.mock('../DocumentsAnalytics', () => () => null)
jest.mock('../ConfirmDialog', () => () => null)
jest.mock('../DocumentsSidebar', () => (props) => (
  <div>
    {(props.events || []).map((e) => (
      <button key={e.id} onClick={() => props.setSelectedEventId(e.id)}>{`select-${e.id}`}</button>
    ))}
    <button onClick={() => props.setShowInternal(true)}>select-internal</button>
  </div>
))

const FAIR = { id: 'evt-bijorhca', name: 'Bijorhca Sept 2026', type: 'fair', permission: 'manage', doc_count: 0 }
const AGENT_FOLDER = { id: 'evt-nicolas', name: 'NICOLAS WHOLESALE FRANCE', type: 'agent', permission: 'manage', doc_count: 3 }

const order = (id, company) => ({
  id, status: 'sent', document_type: 'order', order_channel: 'b2b',
  event_id: 'evt-nicolas', agent_id: 'agent-nicolas', created_by: 'agent-nicolas',
  events: { name: 'NICOLAS WHOLESALE FRANCE', organization_id: null },
  file_name: `${company}.pdf`, client_company: company, total_amount: 1000,
  created_at: '2026-09-08T10:00:00.000Z',
})
const DOCS = [
  order('doc-malherbe', 'SAS BIJOUTERIE MALHERBE'),
  order('doc-ponge', 'SARL BIJOUTERIE PONGE'),
  order('doc-hdbj', 'SAS HDBJ'),
]

let bulkResponse
let bulkCalls
function mockFetch() {
  bulkCalls = []
  return jest.fn((url, opts) => {
    const u = String(url)
    let body = {}
    if (u.startsWith('/api/documents/bulk-file')) {
      bulkCalls.push(JSON.parse(opts.body))
      return Promise.resolve({ ok: bulkResponse.ok, status: bulkResponse.ok ? 200 : 500, json: () => Promise.resolve(bulkResponse.body) })
    }
    if (u.startsWith('/api/events')) body = { events: [FAIR, AGENT_FOLDER] }
    else if (u.startsWith('/api/org-folders')) body = { orgFolders: [] }
    else if (u.includes('event_id=')) body = { documents: [], total_count: 0 }
    else if (u.startsWith('/api/documents')) body = { documents: DOCS, total_count: DOCS.length }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
}

beforeEach(() => {
  currentProfile = { role: 'admin' }
  bulkResponse = {
    ok: true,
    body: {
      event: { id: FAIR.id, name: FAIR.name, type: 'fair' },
      updated_count: 2, updated_ids: ['doc-malherbe', 'doc-ponge'], skipped: [], not_found: [],
    },
  }
  global.fetch = mockFetch()
})
afterEach(() => jest.clearAllMocks())

const checkboxes = () => screen.getAllByTestId('doc-select')

describe('DocumentsPanel — bulk add to fair', () => {
  it('shows a checkbox per row for admins and no bar until something is ticked', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    expect(checkboxes()).toHaveLength(3)
    expect(screen.queryByTestId('bulk-file-bar')).not.toBeInTheDocument()
  })

  it('agents never see the checkboxes', async () => {
    currentProfile = { role: 'agent' }
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    expect(screen.queryAllByTestId('doc-select')).toHaveLength(0)
    expect(screen.queryByTestId('bulk-select-all')).not.toBeInTheDocument()
  })

  it('ticking rows opens the bar with the count; the button waits for a fair', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    fireEvent.click(checkboxes()[0])
    fireEvent.click(checkboxes()[1])
    const bar = screen.getByTestId('bulk-file-bar')
    expect(within(bar).getByText('docs.bulkSelected count=2')).toBeInTheDocument()
    expect(screen.getByTestId('bulk-file-btn')).toBeDisabled()
  })

  it('the fair picker lists fairs but not agent folders', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    fireEvent.click(checkboxes()[0])
    const options = Array.from(screen.getByTestId('bulk-fair-select').options).map((o) => o.text)
    expect(options).toContain('Bijorhca Sept 2026')
    expect(options).not.toContain('NICOLAS WHOLESALE FRANCE')
    expect(options).toContain('docs.bulkNoFair')
  })

  it('files the ticked orders in ONE request and re-tags them locally, keeping the agent', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    fireEvent.click(checkboxes()[0])
    fireEvent.click(checkboxes()[1])
    fireEvent.change(screen.getByTestId('bulk-fair-select'), { target: { value: FAIR.id } })
    fireEvent.click(screen.getByTestId('bulk-file-btn'))

    await waitFor(() => expect(bulkCalls).toHaveLength(1))
    expect(bulkCalls[0]).toEqual({ ids: ['doc-malherbe', 'doc-ponge'], event_id: FAIR.id })
    // Only event_id travels — never the agent.
    expect(Object.keys(bulkCalls[0])).toEqual(['ids', 'event_id'])

    expect(await screen.findByTestId('bulk-file-notice')).toHaveTextContent('docs.bulkDone count=2 fair=Bijorhca Sept 2026')
    // Selection is cleared, the bar is gone.
    expect(screen.queryByTestId('bulk-file-bar')).not.toBeInTheDocument()
    // The two filed rows now read "@ Bijorhca", the third still sits with the agent.
    expect(screen.getAllByText('@ Bijorhca Sept 2026')).toHaveLength(2)
    expect(screen.getAllByText('@ NICOLAS WHOLESALE FRANCE')).toHaveLength(1)
    // Sidebar counts are refreshed from the server.
    const eventCalls = global.fetch.mock.calls.filter((c) => String(c[0]).startsWith('/api/events'))
    expect(eventCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('"Select all" ticks every visible row; a second click clears them', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    fireEvent.click(screen.getByTestId('bulk-select-all'))
    expect(within(screen.getByTestId('bulk-file-bar')).getByText('docs.bulkSelected count=3')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('bulk-select-all'))
    expect(screen.queryByTestId('bulk-file-bar')).not.toBeInTheDocument()
  })

  it('"No fair" sends event_id: null', async () => {
    bulkResponse.body = { event: null, updated_count: 1, updated_ids: ['doc-malherbe'], skipped: [], not_found: [] }
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    fireEvent.click(checkboxes()[0])
    fireEvent.change(screen.getByTestId('bulk-fair-select'), { target: { value: '__none__' } })
    fireEvent.click(screen.getByTestId('bulk-file-btn'))
    await waitFor(() => expect(bulkCalls).toHaveLength(1))
    expect(bulkCalls[0]).toEqual({ ids: ['doc-malherbe'], event_id: null })
  })

  it('reports skipped rows alongside the filed ones', async () => {
    bulkResponse.body = {
      event: { id: FAIR.id, name: FAIR.name, type: 'fair' },
      updated_count: 1, updated_ids: ['doc-malherbe'],
      skipped: [{ id: 'doc-ponge', reason: 'already_filed' }], not_found: [],
    }
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    fireEvent.click(checkboxes()[0])
    fireEvent.click(checkboxes()[1])
    fireEvent.change(screen.getByTestId('bulk-fair-select'), { target: { value: FAIR.id } })
    fireEvent.click(screen.getByTestId('bulk-file-btn'))
    const notice = await screen.findByTestId('bulk-file-notice')
    expect(notice).toHaveTextContent('docs.bulkDone count=1 fair=Bijorhca Sept 2026')
    expect(notice).toHaveTextContent('docs.bulkSkipped count=1')
  })

  it('a failed request shows the server error and keeps the selection', async () => {
    bulkResponse = { ok: false, body: { error: 'Event not found' } }
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    fireEvent.click(checkboxes()[0])
    fireEvent.change(screen.getByTestId('bulk-fair-select'), { target: { value: FAIR.id } })
    fireEvent.click(screen.getByTestId('bulk-file-btn'))
    expect(await screen.findByTestId('bulk-file-notice')).toHaveTextContent('Event not found')
    expect(screen.getByTestId('bulk-file-bar')).toBeInTheDocument()
  })

  it('leaving for the Internal view drops the selection and the checkboxes', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SAS BIJOUTERIE MALHERBE')
    fireEvent.click(checkboxes()[0])
    expect(screen.getByTestId('bulk-file-bar')).toBeInTheDocument()
    fireEvent.click(screen.getByText('select-internal'))
    await waitFor(() => expect(screen.queryByTestId('bulk-file-bar')).not.toBeInTheDocument())
    expect(screen.queryAllByTestId('doc-select')).toHaveLength(0)
  })
})

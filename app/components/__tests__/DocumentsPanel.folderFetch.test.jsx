/**
 * DocumentsPanel — complete loading and folder fetch regression tests
 *
 * The All Documents search is local. Loading only the first page meant older
 * orders could appear in the complete analytics summary but not in search.
 *
 * The panel now loads every page with a stable page size. Folder selection still
 * fetches its scoped dataset directly from the server.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DocumentsPanel from '../DocumentsPanel'

// ── Mocks ───────────────────────────────────────────────────────────────────
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

// safeFetch is a thin wrapper over fetch — route everything through global.fetch
// so the test can drive responses by URL without pulling in prompt/catalog deps.
jest.mock('@/lib/api', () => ({ safeFetch: (url, opts) => global.fetch(url, opts) }))

jest.mock('../AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', email: 'admin@lovelab.test' },
    profile: { role: 'admin' },
    profileMissing: false,
    profileError: null,
  }),
}))

// Analytics stub exposes the dataset it received so tests can assert totals.
jest.mock('../DocumentsAnalytics', () => ({ filteredDocs }) => {
  const billable = (filteredDocs || []).filter((d) => d.status !== 'draft')
  const total = billable.reduce((s, d) => s + (d.total_amount || 0), 0)
  return (
    <div data-testid="analytics">
      <span data-testid="analytics-count">{billable.length}</span>
      <span data-testid="analytics-total">{total}</span>
    </div>
  )
})
jest.mock('../ConfirmDialog', () => () => null)
jest.mock('../DocumentRow', () => ({ doc }) => (
  <div data-testid="doc-row">{doc.file_name}</div>
))

// Minimal sidebar stub: renders a "select" button per event so the test can
// drive folder selection (mirrors selectEvent → setSelectedEventId).
jest.mock('../DocumentsSidebar', () => (props) => (
  <div>
    <button onClick={() => {
      props.setSelectedEventId(null)
      props.setShowInternal(false)
    }}>select-all</button>
    {(props.events || []).map((e) => (
      <button key={e.id} onClick={() => props.setSelectedEventId(e.id)}>
        {`select-${e.id}`}
      </button>
    ))}
  </div>
))

// ── Fixtures ──────────────────────────────────────────────────────────────────
const EVENT = {
  id: 'evt-tari',
  name: 'Tari jewelry Napoli show',
  type: 'fair',
  permission: 'manage',
  doc_count: 1, // server says 1 document exists
}

// The first page does not contain the older Tari/Farandole document.
const FIRST_PAGE_DOCS = [
  {
    id: 'recent-1',
    event_id: 'evt-other',
    status: 'sent',
    file_name: 'Recent.pdf',
    client_name: 'Acme',
    total_amount: 100,
  },
]

// The older document is returned by page 2 and by its direct folder request.
const TARI_DOC = {
  id: 'tari-1',
  event_id: 'evt-tari',
  status: 'sent',
  file_name: 'FARANDOLE_Order.pdf',
  client_name: 'Valerie',
  client_company: 'FARANDOLE',
  total_amount: 1841,
}

function mockFetchRouter() {
  return jest.fn((url) => {
    const u = String(url)
    let body = {}
    if (u.startsWith('/api/events')) {
      body = { events: [EVENT] }
    } else if (u.startsWith('/api/org-folders')) {
      body = { orgFolders: [] }
    } else if (u.includes('event_id=evt-tari')) {
      body = { documents: [TARI_DOC], total_count: 1 }
    } else if (u.startsWith('/api/documents')) {
      const page = new URL(u, 'http://localhost').searchParams.get('page')
      body = page === '2'
        ? { documents: [TARI_DOC], total_count: 2 }
        : { documents: FIRST_PAGE_DOCS, total_count: 2 }
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    })
  })
}

beforeEach(() => {
  global.fetch = mockFetchRouter()
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('DocumentsPanel — complete list and folder loading', () => {
  it('loads documents beyond the first page before rendering All Documents', async () => {
    render(<DocumentsPanel />)

    expect(await screen.findByText('Recent.pdf')).toBeInTheDocument()
    expect(screen.getByText('FARANDOLE_Order.pdf')).toBeInTheDocument()

    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]))
    expect(calledUrls).toContain('/api/documents?per_page=200&page=1')
    expect(calledUrls).toContain('/api/documents?per_page=200&page=2')
  })

  it('finds an older document returned only by a later page', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('FARANDOLE_Order.pdf')

    fireEvent.change(
      screen.getByPlaceholderText('Search by client name or company...'),
      { target: { value: 'farandole' } },
    )

    expect(screen.getByText('FARANDOLE_Order.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Recent.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText(/No documents match your search/i)).not.toBeInTheDocument()
  })

  it('still fetches a selected folder directly from the server', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('FARANDOLE_Order.pdf')

    // Select the Tari folder.
    fireEvent.click(screen.getByText('select-evt-tari'))

    expect(await screen.findByText('FARANDOLE_Order.pdf')).toBeInTheDocument()

    // Regression guard: the buggy empty state must NOT appear.
    expect(
      screen.queryByText(/No documents in Tari jewelry Napoli show/i),
    ).not.toBeInTheDocument()

    // Confirm the server was queried with the event_id filter.
    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]))
    expect(calledUrls.some((u) => u.includes('event_id=evt-tari'))).toBe(true)
  })

  it('shows the empty state (not a crash) when the folder genuinely has no docs', async () => {
    // Override: event_id fetch returns no documents.
    global.fetch = jest.fn((url) => {
      const u = String(url)
      let body = {}
      if (u.startsWith('/api/events')) body = { events: [EVENT] }
      else if (u.startsWith('/api/org-folders')) body = { orgFolders: [] }
      else if (u.includes('event_id=evt-tari')) body = { documents: [], total_count: 0 }
      else if (u.startsWith('/api/documents')) {
        const page = new URL(u, 'http://localhost').searchParams.get('page')
        body = page === '2'
          ? { documents: [TARI_DOC], total_count: 2 }
          : { documents: FIRST_PAGE_DOCS, total_count: 2 }
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    })

    render(<DocumentsPanel />)
    await screen.findByText('Recent.pdf')

    fireEvent.click(screen.getByText('select-evt-tari'))

    expect(
      await screen.findByText(/No documents in Tari jewelry Napoli show/i),
    ).toBeInTheDocument()
  })

  it('hides the company-wide total on All Documents', async () => {
    render(<DocumentsPanel />)

    expect(await screen.findByText('Recent.pdf')).toBeInTheDocument()
    expect(screen.queryByTestId('analytics')).not.toBeInTheDocument()
    expect(screen.queryByTestId('analytics-total')).not.toBeInTheDocument()
  })

  it('shows folder analytics for a selected event, using the folder dataset', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('Recent.pdf')

    fireEvent.click(screen.getByText('select-evt-tari'))
    expect(await screen.findByText('FARANDOLE_Order.pdf')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('analytics-count')).toHaveTextContent('1')
    })
    expect(screen.getByTestId('analytics-total')).toHaveTextContent('1841')
  })

  it('searches every folder when a company is typed inside one folder', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('FARANDOLE_Order.pdf')

    fireEvent.click(screen.getByText('select-evt-tari'))
    expect(await screen.findByText('FARANDOLE_Order.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Recent.pdf')).not.toBeInTheDocument()

    fireEvent.change(
      screen.getByPlaceholderText('Search by client name or company...'),
      { target: { value: 'acme' } },
    )

    expect(await screen.findByText('Recent.pdf')).toBeInTheDocument()
    expect(screen.queryByText('FARANDOLE_Order.pdf')).not.toBeInTheDocument()
    expect(screen.getByTestId('searching-all-documents')).toHaveTextContent('Searching all documents')
    expect(screen.queryByTestId('analytics')).not.toBeInTheDocument()

    fireEvent.change(
      screen.getByPlaceholderText('Search by client name or company...'),
      { target: { value: '' } },
    )

    expect(await screen.findByText('FARANDOLE_Order.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Recent.pdf')).not.toBeInTheDocument()
    expect(screen.queryByTestId('searching-all-documents')).not.toBeInTheDocument()
  })

  it('loads a folder past the first 200 rows', async () => {
    const pageOne = Array.from({ length: 200 }, (_, i) => ({
      id: `folder-${i}`,
      event_id: 'evt-tari',
      status: 'sent',
      file_name: `Folder-${i}.pdf`,
      total_amount: 1,
    }))
    const lateDoc = {
      id: 'folder-200',
      event_id: 'evt-tari',
      status: 'sent',
      file_name: 'Folder-late.pdf',
      total_amount: 2,
    }

    global.fetch = jest.fn((url) => {
      const u = String(url)
      const parsed = new URL(u, 'http://localhost')
      let body = {}
      if (u.startsWith('/api/events')) body = { events: [EVENT] }
      else if (u.startsWith('/api/org-folders')) body = { orgFolders: [] }
      else if (u.includes('event_id=evt-tari')) {
        const page = parsed.searchParams.get('page')
        body = page === '2'
          ? { documents: [lateDoc], total_count: 201 }
          : { documents: pageOne, total_count: 201 }
      } else if (u.startsWith('/api/documents')) {
        body = { documents: FIRST_PAGE_DOCS, total_count: 1 }
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    })

    render(<DocumentsPanel />)
    await screen.findByText('Recent.pdf')
    fireEvent.click(screen.getByText('select-evt-tari'))

    expect(await screen.findByText('Folder-late.pdf')).toBeInTheDocument()
    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]))
    expect(calledUrls).toContain('/api/documents?event_id=evt-tari&per_page=200&page=1')
    expect(calledUrls).toContain('/api/documents?event_id=evt-tari&per_page=200&page=2')
  })

  it('returns to the global documents list when All Documents is reselected', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('Recent.pdf')

    fireEvent.click(screen.getByText('select-evt-tari'))
    await screen.findByText('FARANDOLE_Order.pdf')

    fireEvent.click(screen.getByText('select-all'))

    await waitFor(() => {
      expect(screen.getByText('Recent.pdf')).toBeInTheDocument()
      expect(screen.getByText('FARANDOLE_Order.pdf')).toBeInTheDocument()
    })
  })
})

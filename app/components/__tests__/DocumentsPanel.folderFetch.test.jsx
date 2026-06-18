/**
 * DocumentsPanel — folder fetch regression tests
 *
 * Bug: the sidebar shows a server-authoritative per-event count (events.doc_count),
 * but selecting a folder filtered only the first page of the global, paginated
 * `documents` load (created_at DESC, per_page=50). Once the total exceeded one
 * page, older folders' files were not in that page, so clicking them showed
 * "No documents in <event>" even though the count said otherwise.
 *
 * Fix: selecting an event/agent folder fetches that folder straight from the
 * server (/api/documents?event_id=... | organization_id=...), so the list always
 * matches the count.
 *
 * These tests simulate exactly that: the folder's document is NOT in the first
 * page, and only appears via the server-side event_id fetch.
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
jest.mock('@/lib/utils', () => ({ fmt: (n) => `€${n}` }))

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

// The first page of /api/documents (per_page=50) does NOT contain the Tari doc —
// it belongs to a different, more recent event. This reproduces the bug.
const FIRST_PAGE_DOCS = [
  { id: 'recent-1', event_id: 'evt-other', status: 'sent', file_name: 'Recent.pdf', client_name: 'Acme' },
]

// The Tari folder's actual document, only reachable via the event_id fetch.
const TARI_DOC = { id: 'tari-1', event_id: 'evt-tari', status: 'sent', file_name: 'TariDoc.pdf', client_name: 'Napoli Client' }

// Complete dataset returned by the summary endpoint — far more than the single
// first-page doc. Includes a draft that must be excluded from analytics totals.
const SUMMARY_ALL = [
  { id: 'recent-1', status: 'sent', total_amount: 100, created_at: '2026-06-09T10:00:00Z', file_name: 'Recent.pdf', client_name: 'Acme' },
  { id: 'tari-1', status: 'sent', total_amount: 250, created_at: '2026-06-06T10:00:00Z', file_name: 'TariDoc.pdf', client_name: 'Napoli Client' },
  { id: 'old-1', status: 'sent', total_amount: 400, created_at: '2026-05-01T10:00:00Z', file_name: 'Old1.pdf', client_name: 'Old Co' },
  { id: 'old-2', status: 'sent', total_amount: 50, created_at: '2026-04-01T10:00:00Z', file_name: 'Old2.pdf', client_name: 'Old Co 2' },
  { id: 'draft-1', status: 'draft', total_amount: 9999, created_at: '2026-06-08T10:00:00Z', file_name: 'Draft.pdf', client_name: 'Drafty' },
]
// Sum of non-draft total_amount = 100 + 250 + 400 + 50 = 800
const SUMMARY_BILLABLE_TOTAL = 800
const SUMMARY_BILLABLE_COUNT = 4

function mockFetchRouter() {
  return jest.fn((url) => {
    const u = String(url)
    let body = {}
    if (u.startsWith('/api/events')) {
      body = { events: [EVENT] }
    } else if (u.startsWith('/api/org-folders')) {
      body = { orgFolders: [] }
    } else if (u.includes('summary=true')) {
      // Complete lightweight dataset for analytics (one page covers it).
      body = { documents: SUMMARY_ALL, total_count: SUMMARY_ALL.length }
    } else if (u.includes('event_id=evt-tari')) {
      body = { documents: [TARI_DOC], total_count: 1 }
    } else if (u.startsWith('/api/documents')) {
      // Initial paginated load (per_page=50) — Tari + older docs absent on purpose.
      body = { documents: FIRST_PAGE_DOCS, total_count: 60 }
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

describe('DocumentsPanel — folder selection fetches from server', () => {
  it('shows the folder document even when it is NOT in the first page of documents', async () => {
    render(<DocumentsPanel />)

    // Initial All Documents view shows the first-page doc.
    expect(await screen.findByText('Recent.pdf')).toBeInTheDocument()

    // Sanity: the Tari doc is not loaded yet.
    expect(screen.queryByText('TariDoc.pdf')).not.toBeInTheDocument()

    // Select the Tari folder.
    fireEvent.click(screen.getByText('select-evt-tari'))

    // The fix: the panel fetches the folder by event_id and renders its doc.
    expect(await screen.findByText('TariDoc.pdf')).toBeInTheDocument()

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
      else if (u.includes('summary=true')) body = { documents: SUMMARY_ALL, total_count: SUMMARY_ALL.length }
      else if (u.includes('event_id=evt-tari')) body = { documents: [], total_count: 0 }
      else if (u.startsWith('/api/documents')) body = { documents: FIRST_PAGE_DOCS, total_count: 60 }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    })

    render(<DocumentsPanel />)
    await screen.findByText('Recent.pdf')

    fireEvent.click(screen.getByText('select-evt-tari'))

    expect(
      await screen.findByText(/No documents in Tari jewelry Napoli show/i),
    ).toBeInTheDocument()
  })

  it('All Documents analytics reflects EVERY document (summary), not just the first page', async () => {
    render(<DocumentsPanel />)

    // First-page list still shows only the paginated doc.
    expect(await screen.findByText('Recent.pdf')).toBeInTheDocument()

    // Analytics is driven by the complete summary dataset, excluding drafts.
    await waitFor(() => {
      expect(screen.getByTestId('analytics-count')).toHaveTextContent(String(SUMMARY_BILLABLE_COUNT))
    })
    expect(screen.getByTestId('analytics-total')).toHaveTextContent(String(SUMMARY_BILLABLE_TOTAL))

    // The summary endpoint was queried.
    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]))
    expect(calledUrls.some((u) => u.includes('summary=true'))).toBe(true)
  })

  it('returns to the global documents list when All Documents is reselected', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('Recent.pdf')

    fireEvent.click(screen.getByText('select-evt-tari'))
    await screen.findByText('TariDoc.pdf')

    fireEvent.click(screen.getByText('select-all'))

    await waitFor(() => {
      expect(screen.getByText('Recent.pdf')).toBeInTheDocument()
      expect(screen.queryByText('TariDoc.pdf')).not.toBeInTheDocument()
    })
  })
})

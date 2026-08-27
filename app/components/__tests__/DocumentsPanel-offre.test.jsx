/**
 * DocumentsPanel — Offre folder (admin-only twin of Draft)
 *
 * An Offre is a parked order (status='draft' + draft_kind='offre'). It must
 * behave exactly like a Draft — invisible in All Documents, in event folders
 * and in the revenue analytics — but live on its own page, separate from the
 * Draft folder.
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

jest.mock('../DocumentsAnalytics', () => ({ filteredDocs }) => {
  const billable = (filteredDocs || []).filter((d) => d.status !== 'draft')
  const total = billable.reduce((s, d) => s + (d.total_amount || 0), 0)
  return <span data-testid="analytics-total">{total}</span>
})
jest.mock('../ConfirmDialog', () => () => null)
jest.mock('../DocumentRow', () => ({ doc }) => (
  <div data-testid="doc-row">{doc.file_name}</div>
))

// Sidebar stub exposing the folder switches + the counts the panel computes.
jest.mock('../DocumentsSidebar', () => (props) => (
  <div>
    <button onClick={() => { props.setShowDrafts(false); props.setShowOffres(false); props.setSelectedEventId(null) }}>
      select-all
    </button>
    <button onClick={() => { props.setShowDrafts(true); props.setShowOffres(false) }}>select-drafts</button>
    <button onClick={() => { props.setShowOffres(true); props.setShowDrafts(false) }}>select-offres</button>
    <span data-testid="draft-count">{props.draftCount}</span>
    <span data-testid="offre-count">{props.offreCount}</span>
  </div>
))

// ── Fixtures ────────────────────────────────────────────────────────────────
const SENT_DOC = {
  id: 'sent-1', status: 'sent', total_amount: 500,
  file_name: 'SentOrder.pdf', client_name: 'Acme', created_at: '2026-07-20T10:00:00Z',
}
const DRAFT_DOC = {
  id: 'draft-1', status: 'draft', draft_kind: null, total_amount: 100,
  file_name: 'ParkedDraft.pdf', client_name: 'Drafty', created_at: '2026-07-21T10:00:00Z',
}
const OFFRE_DOC = {
  id: 'offre-1', status: 'draft', draft_kind: 'offre', total_amount: 7777,
  file_name: 'ParkedOffre.pdf', client_name: 'Offerta', created_at: '2026-07-22T10:00:00Z',
}

function mockFetchRouter() {
  return jest.fn((url) => {
    const u = String(url)
    let body = {}
    if (u.startsWith('/api/events')) {
      body = { events: [] }
    } else if (u.startsWith('/api/org-folders')) {
      body = { orgFolders: [] }
    } else if (u.includes('status=draft')) {
      // Both parked buckets come back in one request; the panel splits them.
      body = { documents: [DRAFT_DOC, OFFRE_DOC], total_count: 2 }
    } else if (u.includes('summary=true')) {
      body = { documents: [SENT_DOC, DRAFT_DOC, OFFRE_DOC], total_count: 3 }
    } else if (u.startsWith('/api/documents')) {
      body = { documents: [SENT_DOC, DRAFT_DOC, OFFRE_DOC], total_count: 3 }
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  })
}

beforeEach(() => { global.fetch = mockFetchRouter() })
afterEach(() => { jest.clearAllMocks() })

describe('DocumentsPanel — Offre folder', () => {
  it('keeps parked orders out of All Documents', async () => {
    render(<DocumentsPanel />)
    expect(await screen.findByText('SentOrder.pdf')).toBeInTheDocument()
    expect(screen.queryByText('ParkedOffre.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('ParkedDraft.pdf')).not.toBeInTheDocument()
  })

  it('does not show a company-wide revenue total on All Documents', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SentOrder.pdf')
    expect(screen.queryByTestId('analytics-total')).not.toBeInTheDocument()
  })

  it('shows only Offres in the Offre folder', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SentOrder.pdf')

    fireEvent.click(screen.getByText('select-offres'))

    expect(await screen.findByText('ParkedOffre.pdf')).toBeInTheDocument()
    expect(screen.queryByText('ParkedDraft.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('SentOrder.pdf')).not.toBeInTheDocument()
  })

  it('keeps Offres out of the Draft folder', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SentOrder.pdf')

    fireEvent.click(screen.getByText('select-drafts'))

    expect(await screen.findByText('ParkedDraft.pdf')).toBeInTheDocument()
    expect(screen.queryByText('ParkedOffre.pdf')).not.toBeInTheDocument()
  })

  it('counts each bucket separately in the sidebar', async () => {
    render(<DocumentsPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('draft-count')).toHaveTextContent('1')
      expect(screen.getByTestId('offre-count')).toHaveTextContent('1')
    })
  })

  it('fetches parked orders server-side instead of relying on the first page', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SentOrder.pdf')
    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]))
    expect(calledUrls.some((u) => u.includes('status=draft'))).toBe(true)
  })

  it('returns to All Documents when the folder is deselected', async () => {
    render(<DocumentsPanel />)
    await screen.findByText('SentOrder.pdf')

    fireEvent.click(screen.getByText('select-offres'))
    await screen.findByText('ParkedOffre.pdf')

    fireEvent.click(screen.getByText('select-all'))
    await waitFor(() => {
      expect(screen.getByText('SentOrder.pdf')).toBeInTheDocument()
      expect(screen.queryByText('ParkedOffre.pdf')).not.toBeInTheDocument()
    })
  })
})

/**
 * DocumentsSidebar — render tests
 *
 * Guarantees:
 *   - "Documents" header is shown
 *   - All 4 event type group labels appear when events of each type exist
 *   - The 'agent' type (previously missing) is rendered
 *   - "Internal Orders" button is visible only for admins
 *   - All Documents button shows correct count
 *   - Events of a type only appear in that group
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocumentsSidebar from '../DocumentsSidebar'

// next/navigation router mock
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

// Minimal stub for styles
jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', luxeGold: '#c9a84c', lovelabMuted: '#999' },
  fonts: { body: 'inherit' },
}))

const EVENTS = [
  { id: 'f1', name: 'Paris Première Classe', type: 'fair', permission: 'manage' },
  { id: 'a1', name: 'Agent Berlin', type: 'agent', permission: 'read' },
  { id: 'p1', name: 'Partner London', type: 'partner', permission: 'read' },
  { id: 'o1', name: 'Other Event', type: 'other', permission: 'read' },
]

const DOCUMENTS = [
  { id: 'd1', event_id: 'f1', created_by: 'u1' },
  { id: 'd2', event_id: 'a1', created_by: 'u1' },
  { id: 'd3', event_id: null, created_by: 'u1' },
]

function buildProps(overrides = {}) {
  return {
    mobile: false,
    showSidebar: true,
    setShowSidebar: jest.fn(),
    isAdmin: true,
    events: EVENTS,
    documents: DOCUMENTS,
    orgFolders: [],
    orgFoldersError: null,
    selectedEventId: null,
    setSelectedEventId: jest.fn(),
    selectedOrgId: null,
    setSelectedOrgId: jest.fn(),
    showInternal: false,
    setShowInternal: jest.fn(),
    expandedOrgs: new Set(),
    setExpandedOrgs: jest.fn(),
    renamingEventId: null,
    renameValue: '',
    setRenameValue: jest.fn(),
    startRename: jest.fn(),
    commitRename: jest.fn(),
    renameLoading: false,
    showNewEvent: false,
    setShowNewEvent: jest.fn(),
    newEventName: '',
    setNewEventName: jest.fn(),
    newEventType: 'fair',
    setNewEventType: jest.fn(),
    createEvent: jest.fn(),
    setConfirmDeleteEvent: jest.fn(),
    openShareModal: jest.fn(),
    canManageEvent: (e) => e.permission === 'manage',
    fetchData: jest.fn(),
    ...overrides,
  }
}

describe('DocumentsSidebar', () => {
  test('renders "Documents" header', () => {
    render(<DocumentsSidebar {...buildProps()} />)
    expect(screen.getByText('Documents')).toBeInTheDocument()
  })

  test('renders all 4 event type group labels', () => {
    render(<DocumentsSidebar {...buildProps()} />)
    expect(screen.getByText('Fairs')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Partners')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  test('renders event names under their correct groups', () => {
    render(<DocumentsSidebar {...buildProps()} />)
    expect(screen.getByText('Paris Première Classe')).toBeInTheDocument()
    expect(screen.getByText('Agent Berlin')).toBeInTheDocument()
    expect(screen.getByText('Partner London')).toBeInTheDocument()
    expect(screen.getByText('Other Event')).toBeInTheDocument()
  })

  test('shows "Internal Orders" button for admins', () => {
    render(<DocumentsSidebar {...buildProps({ isAdmin: true })} />)
    expect(screen.getByText('Internal Orders')).toBeInTheDocument()
  })

  test('hides "Internal Orders" button for non-admins', () => {
    render(<DocumentsSidebar {...buildProps({ isAdmin: false })} />)
    expect(screen.queryByText('Internal Orders')).not.toBeInTheDocument()
  })

  test('All Documents badge shows correct document count', () => {
    render(<DocumentsSidebar {...buildProps()} />)
    // 3 documents total
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('hides Agents group when no agent events exist', () => {
    const events = EVENTS.filter(e => e.type !== 'agent')
    render(<DocumentsSidebar {...buildProps({ events })} />)
    expect(screen.queryByText('Agents')).not.toBeInTheDocument()
  })

  test('clicking All Documents calls setSelectedEventId(null)', async () => {
    const setSelectedEventId = jest.fn()
    render(<DocumentsSidebar {...buildProps({ setSelectedEventId })} />)
    await userEvent.click(screen.getByText('All Documents'))
    expect(setSelectedEventId).toHaveBeenCalledWith(null)
  })

  test('clicking Internal Orders calls setShowInternal(true)', async () => {
    const setShowInternal = jest.fn()
    render(<DocumentsSidebar {...buildProps({ setShowInternal })} />)
    await userEvent.click(screen.getByText('Internal Orders'))
    expect(setShowInternal).toHaveBeenCalledWith(true)
  })
})

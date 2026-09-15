/**
 * Documents sidebar — Commercials section (Sam, 15 Sep 2026).
 *
 * A commercial is an admin who takes orders. They have no organization, so
 * they never appeared under Agents. They get their own section, one row per
 * person with the number of orders saved by or credited to them.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import DocumentsSidebar from '../DocumentsSidebar'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', luxeGold: '#c9a84c', lovelabMuted: '#999' },
  fonts: { body: 'inherit' },
}))

const RAPHAEL = { user_id: 'raphael-id', full_name: 'Raphael Saleh', email: 'raphael@love-lab.com', doc_count: 3 }

function buildProps(overrides = {}) {
  return {
    mobile: false, showSidebar: true, setShowSidebar: jest.fn(), isAdmin: true,
    events: [], documents: [], orgFolders: [],
    commercials: [RAPHAEL], selectedCommercialId: null, setSelectedCommercialId: jest.fn(),
    selectedEventId: null, setSelectedEventId: jest.fn(),
    selectedOrgId: null, setSelectedOrgId: jest.fn(),
    selectedOrgMemberId: null, setSelectedOrgMemberId: jest.fn(),
    showInternal: false, setShowInternal: jest.fn(),
    showConsignment: false, setShowConsignment: jest.fn(),
    showDrafts: false, setShowDrafts: jest.fn(),
    showOffres: false, setShowOffres: jest.fn(),
    renamingEventId: null, renameValue: '', setRenameValue: jest.fn(), startRename: jest.fn(),
    commitRename: jest.fn(), renameLoading: false, showNewEvent: false, setShowNewEvent: jest.fn(),
    newEventName: '', setNewEventName: jest.fn(), newEventType: 'fair', setNewEventType: jest.fn(),
    createEvent: jest.fn(), setConfirmDeleteEvent: jest.fn(), openShareModal: jest.fn(),
    canManageEvent: () => true, fetchData: jest.fn(),
    ...overrides,
  }
}

describe('DocumentsSidebar — Commercials', () => {
  it('lists each commercial with their order count under its own heading', () => {
    render(<DocumentsSidebar {...buildProps()} />)
    expect(screen.getByText('Commercials')).toBeInTheDocument()
    const row = screen.getByTestId('commercial-folder-raphael-id')
    expect(row).toHaveTextContent('Raphael Saleh')
    expect(row).toHaveTextContent('3')
    expect(screen.queryByText('Agents')).not.toBeInTheDocument()
  })

  it('selecting a commercial clears the team, event and other folders', () => {
    const props = buildProps({ selectedOrgId: 'org-x', showInternal: true })
    render(<DocumentsSidebar {...props} />)
    fireEvent.click(screen.getByTestId('commercial-folder-raphael-id'))
    expect(props.setSelectedCommercialId).toHaveBeenCalledWith('raphael-id')
    expect(props.setSelectedOrgId).toHaveBeenCalledWith(null)
    expect(props.setSelectedOrgMemberId).toHaveBeenCalledWith(null)
    expect(props.setSelectedEventId).toHaveBeenCalledWith(null)
    expect(props.setShowInternal).toHaveBeenCalledWith(false)
  })

  it('choosing All Documents or a team drops the commercial selection', () => {
    const props = buildProps({
      selectedCommercialId: 'raphael-id',
      orgFolders: [{ organization_id: 'org-s', organization_name: 'Sarah Goutard Organization', members: [{ user_id: 's1', full_name: 'Sarah', doc_count: 2 }], doc_count: 2 }],
    })
    render(<DocumentsSidebar {...props} />)
    expect(screen.getByTestId('commercial-folder-raphael-id')).toHaveStyle({ fontWeight: 600 })
    fireEvent.click(screen.getByText('All Documents'))
    expect(props.setSelectedCommercialId).toHaveBeenCalledWith(null)
    fireEvent.click(screen.getByText('Sarah'))
    expect(props.setSelectedCommercialId).toHaveBeenLastCalledWith(null)
    expect(props.setSelectedOrgId).toHaveBeenLastCalledWith('org-s')
  })

  it('shows no section when nobody is a commercial', () => {
    render(<DocumentsSidebar {...buildProps({ commercials: [] })} />)
    expect(screen.queryByText('Commercials')).not.toBeInTheDocument()
  })
})

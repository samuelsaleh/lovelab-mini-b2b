/**
 * DocumentsSidebar — parent/child folders for agent teams.
 *
 * Sam Aug 2026 asked for "a parent folder and a child folder": the team on top,
 * each person underneath. Previously the Agents section was a flat list whose
 * label was members[0].full_name, so a nine-person team looked like one person.
 *
 * Solo teams keep the person's name — "NICOLAS WHOLESALE FRANCE" says more than
 * the auto-generated "nicolas vial Organization" — and never expand.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import DocumentsSidebar from '../DocumentsSidebar'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', luxeGold: '#c9a84c', lovelabMuted: '#999' },
  fonts: { body: 'inherit' },
}))

const sarahTeam = {
  organization_id: 'org-sarah',
  organization_name: 'Sarah Goutard Organization',
  doc_count: 15,
  members: [
    { user_id: 'sarah', full_name: 'Sarah Goutard', email: 'sarah@example.com', role: 'owner', doc_count: 0 },
    { user_id: 'wassila', full_name: 'Wassila Mekidiche', email: 'wassila@example.com', role: 'agent', doc_count: 9 },
    { user_id: 'ruby', full_name: 'Ruby Robin', email: 'ruby@example.com', role: 'agent', doc_count: 1 },
  ],
  agent_subfolders: [],
}

const soloTeam = {
  organization_id: 'org-nicolas',
  organization_name: 'nicolas vial Organization',
  doc_count: 5,
  members: [{ user_id: 'nicolas', full_name: 'NICOLAS WHOLESALE FRANCE', email: 'n@example.com', role: 'owner', doc_count: 5 }],
  agent_subfolders: [],
}

function baseProps(overrides = {}) {
  return {
    mobile: false,
    showSidebar: true,
    setShowSidebar: jest.fn(),
    isAdmin: true,
    events: [],
    documents: [],
    orgFolders: [],
    selectedEventId: null,
    setSelectedEventId: jest.fn(),
    selectedOrgId: null,
    setSelectedOrgId: jest.fn(),
    selectedOrgMemberId: null,
    setSelectedOrgMemberId: jest.fn(),
    showInternal: false,
    setShowInternal: jest.fn(),
    showConsignment: false,
    setShowConsignment: jest.fn(),
    showDrafts: false,
    setShowDrafts: jest.fn(),
    showOffres: false,
    setShowOffres: jest.fn(),
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
    canManageEvent: () => true,
    fetchData: jest.fn(),
    ...overrides,
  }
}

describe('DocumentsSidebar agent team nesting', () => {
  test('a multi-member team is labelled with the team name, not the first member', () => {
    render(<DocumentsSidebar {...baseProps({ orgFolders: [sarahTeam] })} />)

    expect(screen.getByText('Sarah Goutard Organization')).toBeInTheDocument()
    // Collapsed by default — the members are not rendered yet.
    expect(screen.queryByText('Wassila Mekidiche')).not.toBeInTheDocument()
  })

  test('expanding the team lists every member with their own document count', () => {
    render(<DocumentsSidebar {...baseProps({ orgFolders: [sarahTeam] })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Sarah Goutard Organization' }))

    const wassila = screen.getByText('Wassila Mekidiche').closest('button')
    expect(within(wassila).getByText('9')).toBeInTheDocument()
    const ruby = screen.getByText('Ruby Robin').closest('button')
    expect(within(ruby).getByText('1')).toBeInTheDocument()
    const sarah = screen.getByText('Sarah Goutard').closest('button')
    expect(within(sarah).getByText('0')).toBeInTheDocument()
  })

  test('members are ordered by document count so the active people come first', () => {
    render(<DocumentsSidebar {...baseProps({ orgFolders: [sarahTeam] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand Sarah Goutard Organization' }))

    const teamRow = screen.getByText('Sarah Goutard Organization').closest('div').parentElement
    const rendered = [...teamRow.querySelectorAll('button')]
      .map((button) => button.textContent)
      .filter((text) => /Mekidiche|Robin|Sarah Goutard\d/.test(text))
    expect(rendered).toEqual([
      'Wassila Mekidiche9',
      'Ruby Robin1',
      'Sarah Goutard0',
    ])
  })

  test('clicking a member selects the team scoped to that person', () => {
    const setSelectedOrgId = jest.fn()
    const setSelectedOrgMemberId = jest.fn()
    render(<DocumentsSidebar {...baseProps({
      orgFolders: [sarahTeam],
      setSelectedOrgId,
      setSelectedOrgMemberId,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Sarah Goutard Organization' }))
    fireEvent.click(screen.getByText('Wassila Mekidiche').closest('button'))

    expect(setSelectedOrgId).toHaveBeenCalledWith('org-sarah')
    expect(setSelectedOrgMemberId).toHaveBeenCalledWith('wassila')
  })

  test('clicking the team row clears any member filter', () => {
    const setSelectedOrgMemberId = jest.fn()
    render(<DocumentsSidebar {...baseProps({
      orgFolders: [sarahTeam],
      selectedOrgId: 'org-sarah',
      selectedOrgMemberId: 'wassila',
      setSelectedOrgMemberId,
    })} />)

    fireEvent.click(screen.getByText('Sarah Goutard Organization').closest('button'))
    expect(setSelectedOrgMemberId).toHaveBeenCalledWith(null)
  })

  test('the selected team is expanded without an extra click', () => {
    render(<DocumentsSidebar {...baseProps({
      orgFolders: [sarahTeam],
      selectedOrgId: 'org-sarah',
    })} />)

    expect(screen.getByText('Wassila Mekidiche')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse Sarah Goutard Organization' })).toBeInTheDocument()
  })

  test('a one-person team keeps the person as its label and does not expand', () => {
    render(<DocumentsSidebar {...baseProps({ orgFolders: [soloTeam] })} />)

    const row = screen.getByText('NICOLAS WHOLESALE FRANCE').closest('button')
    expect(within(row).getByText('5')).toBeInTheDocument()
    expect(screen.queryByText('nicolas vial Organization')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Expand/ })).not.toBeInTheDocument()
  })

  test('falls back to counting created_by when the API sends no per-member count', () => {
    const team = {
      ...sarahTeam,
      members: sarahTeam.members.map(({ doc_count, ...rest }) => rest),
    }
    const documents = [
      { id: 'd1', created_by: 'wassila' },
      { id: 'd2', created_by: 'wassila' },
      { id: 'd3', created_by: 'ruby' },
    ]
    render(<DocumentsSidebar {...baseProps({ orgFolders: [team], documents })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand Sarah Goutard Organization' }))

    expect(within(screen.getByText('Wassila Mekidiche').closest('button')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByText('Ruby Robin').closest('button')).getByText('1')).toBeInTheDocument()
  })

  test('leaving the Agents section clears the member filter', () => {
    const setSelectedOrgMemberId = jest.fn()
    render(<DocumentsSidebar {...baseProps({
      orgFolders: [sarahTeam],
      selectedOrgId: 'org-sarah',
      selectedOrgMemberId: 'wassila',
      setSelectedOrgMemberId,
    })} />)

    fireEvent.click(screen.getByText('All Documents').closest('button'))
    expect(setSelectedOrgMemberId).toHaveBeenCalledWith(null)
  })
})

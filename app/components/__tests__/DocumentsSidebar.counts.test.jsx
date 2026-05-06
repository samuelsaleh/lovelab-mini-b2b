/**
 * DocumentsSidebar — count-source regression tests
 *
 * Phase 12 fix: counts must come from server-provided event.doc_count, not
 * from filtering the in-memory `documents` array (which is paginated to 50).
 *
 * Guarantees:
 *   - When events[i].doc_count is set, the sidebar renders that exact number,
 *     even if the local documents array is empty (this was the
 *     "nicolas vial: 0 orders" bug).
 *   - Org folder counts sum the doc_count of events with matching organization_id.
 *   - When doc_count is missing, the sidebar falls back to the in-memory filter
 *     (backward compatibility while the API rolls out).
 */

import { render, screen, within } from '@testing-library/react';
import DocumentsSidebar from '../DocumentsSidebar';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@/lib/styles', () => ({
  colors: { inkPlum: '#5D3A5E', lineGray: '#eaeaea', luxeGold: '#c9a84c', lovelabMuted: '#999' },
  fonts: { body: 'inherit' },
}));

function baseProps(overrides = {}) {
  return {
    mobile: false,
    showSidebar: true,
    setShowSidebar: jest.fn(),
    isAdmin: true,
    events: [],
    documents: [],
    orgFolders: [],
    orgFoldersError: null,
    selectedEventId: null,
    setSelectedEventId: jest.fn(),
    selectedOrgId: null,
    setSelectedOrgId: jest.fn(),
    showInternal: false,
    setShowInternal: jest.fn(),
    showConsignment: false,
    setShowConsignment: jest.fn(),
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
  };
}

describe('DocumentsSidebar event counts (Phase 12)', () => {
  test('uses server-provided doc_count even when local documents array is empty', () => {
    const events = [
      { id: 'nv', name: 'Nicolas Vial', type: 'partner', permission: 'manage', doc_count: 5 },
    ];
    render(<DocumentsSidebar {...baseProps({ events, documents: [] })} />);

    // The "Nicolas Vial" row must show 5 — this used to be 0 because the API
    // capped at per_page=50 and nicolas's docs weren't in the first page.
    const row = screen.getByText('Nicolas Vial').closest('div');
    expect(row).not.toBeNull();
    expect(within(row.parentElement).getByText('5')).toBeInTheDocument();
  });

  test('falls back to local filter when doc_count is missing (graceful rollout)', () => {
    const events = [
      { id: 'evt-old', name: 'Legacy Event', type: 'fair', permission: 'manage' },
    ];
    const documents = [
      { id: 'd1', event_id: 'evt-old', created_by: 'u1' },
      { id: 'd2', event_id: 'evt-old', created_by: 'u1' },
    ];
    render(<DocumentsSidebar {...baseProps({ events, documents })} />);

    const row = screen.getByText('Legacy Event').closest('div');
    expect(within(row.parentElement).getByText('2')).toBeInTheDocument();
  });

  test('shows zero when server says zero, regardless of local docs', () => {
    // If the server says 0 (e.g. all docs were soft-deleted or are internal),
    // we trust the server even if the local array would have non-zero matches.
    const events = [
      { id: 'evt-empty', name: 'Empty Folder', type: 'fair', permission: 'manage', doc_count: 0 },
    ];
    const documents = [
      // These are present in the local cache but the server filtered them out.
      { id: 'd1', event_id: 'evt-empty', created_by: 'u1' },
    ];
    render(<DocumentsSidebar {...baseProps({ events, documents })} />);

    const row = screen.getByText('Empty Folder').closest('div');
    expect(within(row.parentElement).getByText('0')).toBeInTheDocument();
  });
});

describe('DocumentsSidebar org folder counts (Phase 18b)', () => {
  test('uses orgFolder.doc_count when the agent has docs in events without org_id', () => {
    // The "nicolas vial: 0 vs 5" repro from production. /api/org-folders now
    // returns doc_count: 5; the sidebar must trust it even though the local
    // documents/events arrays would have produced 0.
    const orgFolders = [
      {
        organization_id: 'org-N',
        organization_name: 'Nicolas',
        members: [{ user_id: 'nicolas-id', full_name: 'nicolas vial', email: '' }],
        agent_subfolders: [],
        doc_count: 5,
      },
    ];
    render(
      <DocumentsSidebar
        {...baseProps({
          isAdmin: true,
          events: [], // no agent events with org_id set
          documents: [], // paginated cache empty
          orgFolders,
        })}
      />,
    );

    const row = screen.getByText('nicolas vial').closest('button') || screen.getByText('nicolas vial').closest('div');
    expect(row).not.toBeNull();
    expect(within(row).getByText('5')).toBeInTheDocument();
  });

  test('falls back to event-sum when orgFolder.doc_count is 0 but events have counts', () => {
    // Backward-compat case: if server didn't compute doc_count yet but events
    // are tagged with org_id and have doc_count, sum those instead.
    const orgFolders = [
      {
        organization_id: 'org-C',
        organization_name: 'Corinne',
        members: [{ user_id: 'corinne-id', full_name: 'Corinne Ruimy', email: '' }],
        agent_subfolders: [],
        doc_count: 0,
      },
    ];
    const events = [
      { id: 'evt-1', name: 'Corinne Event', type: 'agent', permission: 'manage', organization_id: 'org-C', doc_count: 7 },
    ];
    render(
      <DocumentsSidebar
        {...baseProps({ isAdmin: true, events, documents: [], orgFolders })}
      />,
    );

    const row = screen.getByText('Corinne Ruimy').closest('button') || screen.getByText('Corinne Ruimy').closest('div');
    expect(within(row).getByText('7')).toBeInTheDocument();
  });
});

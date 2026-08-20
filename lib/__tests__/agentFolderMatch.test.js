/**
 * Agent folder matching — the rule that keeps a team member's orders in their
 * own folder instead of the team owner's.
 *
 * The production bug this guards: Showroom Accestory's per-member folders were
 * created after the team's first orders, and the auto-file picked the FIRST
 * agent folder of the organization. Ten orders by Wassila, Caren, Ruby and
 * Marie-Louise ended up filed as "Sarah Goutard".
 */

import {
  matchAgentFolderEvent,
  resolveMisfiledAgentOrder,
  agentFolderName,
  nameKey,
} from '../events/agentFolderMatch';

const ORG = 'org-sarah';

const sarahFolder = { id: 'evt-sarah', name: 'Sarah Goutard', organization_id: ORG, created_by: 'sarah' };
const wassilaFolder = { id: 'evt-wassila', name: 'Wassila Mekidiche', organization_id: ORG, created_by: 'admin' };
const rubyFolder = { id: 'evt-ruby', name: 'Ruby Robin', organization_id: ORG, created_by: 'admin' };
const fairFolder = { id: 'evt-fair', name: 'Bijorhca 2026', organization_id: null, created_by: 'admin' };
const otherOrgFolder = { id: 'evt-other', name: 'Wassila Mekidiche', organization_id: 'org-other', created_by: 'x' };

const agentEvents = [sarahFolder, wassilaFolder, rubyFolder, otherOrgFolder];

const wassila = { id: 'wassila', full_name: 'Wassila Mekidiche', email: 'wassila@example.com', role: 'agent' };
const sarah = { id: 'sarah', full_name: 'Sarah Goutard', email: 'sarah@example.com', role: 'agent' };

describe('nameKey / agentFolderName', () => {
  test('nameKey normalises case and surrounding whitespace', () => {
    expect(nameKey('  Wassila Mekidiche ')).toBe('wassila mekidiche');
    expect(nameKey(null)).toBe('');
  });

  test('agentFolderName prefers the full name and falls back to the email', () => {
    expect(agentFolderName(wassila)).toBe('Wassila Mekidiche');
    expect(agentFolderName({ full_name: '  ', email: 'x@y.com' })).toBe('x@y.com');
    expect(agentFolderName({})).toBe('');
  });
});

describe('matchAgentFolderEvent', () => {
  test('picks the member\'s own folder, not the first folder of the organization', () => {
    // Sarah's folder comes first in the list — the exact shape that caused the bug.
    const match = matchAgentFolderEvent({ profile: wassila, orgIds: [ORG], agentEvents });
    expect(match.id).toBe('evt-wassila');
  });

  test('the owner still resolves to their own folder', () => {
    const match = matchAgentFolderEvent({ profile: sarah, orgIds: [ORG], agentEvents });
    expect(match.id).toBe('evt-sarah');
  });

  test('stays inside the person\'s organization when a same-named folder exists elsewhere', () => {
    const match = matchAgentFolderEvent({
      profile: wassila,
      orgIds: [ORG],
      agentEvents: [otherOrgFolder, wassilaFolder],
    });
    expect(match.id).toBe('evt-wassila');
  });

  test('matches on name regardless of case and padding', () => {
    const match = matchAgentFolderEvent({
      profile: { full_name: '  wassila mekidiche  ' },
      orgIds: [ORG],
      agentEvents,
    });
    expect(match.id).toBe('evt-wassila');
  });

  test('falls back to a folder the person created when no name matches', () => {
    const match = matchAgentFolderEvent({
      profile: { id: 'sarah', full_name: 'Sarah Renamed' },
      orgIds: [ORG],
      agentEvents,
    });
    expect(match.id).toBe('evt-sarah');
  });

  test('a re-invited agent matches a folder created by their older profile row', () => {
    const match = matchAgentFolderEvent({
      profile: { id: 'wassila-new', full_name: 'Renamed Person', email: 'wassila@example.com' },
      orgIds: [ORG],
      agentEvents: [{ id: 'evt-old', name: 'Old Name', organization_id: ORG, created_by: 'wassila-old' }],
      userIds: ['wassila-old', 'wassila-new'],
    });
    expect(match.id).toBe('evt-old');
  });

  test('matches by name anywhere when the person has no organization', () => {
    const match = matchAgentFolderEvent({ profile: wassila, orgIds: [], agentEvents });
    expect(match.id).toBe('evt-wassila');
  });

  test('returns null when nothing matches', () => {
    expect(matchAgentFolderEvent({
      profile: { id: 'nobody', full_name: 'Nobody At All' },
      orgIds: [ORG],
      agentEvents,
    })).toBeNull();
    expect(matchAgentFolderEvent()).toBeNull();
  });
});

describe('resolveMisfiledAgentOrder', () => {
  const base = { orgIds: [ORG], agentEvents };

  test('moves a member order out of the owner folder', () => {
    const decision = resolveMisfiledAgentOrder({
      ...base,
      document: { id: 'd1', event_id: 'evt-sarah', status: 'sent', created_by: 'wassila' },
      profile: wassila,
    });
    expect(decision.action).toBe('move');
    expect(decision.targetEvent.id).toBe('evt-wassila');
    expect(decision.reason).toContain('Sarah Goutard');
  });

  test('is idempotent — a document already in the right folder is left alone', () => {
    const decision = resolveMisfiledAgentOrder({
      ...base,
      document: { id: 'd2', event_id: 'evt-wassila', status: 'sent', created_by: 'wassila' },
      profile: wassila,
    });
    expect(decision).toEqual({ action: 'skip', reason: 'already in the right folder' });
  });

  test('never touches a fair folder', () => {
    const decision = resolveMisfiledAgentOrder({
      ...base,
      agentEvents: [...agentEvents, fairFolder],
      document: { id: 'd3', event_id: 'evt-fair', status: 'sent', created_by: 'wassila' },
      profile: wassila,
    });
    expect(decision.action).toBe('skip');
  });

  test('never touches an agent folder of another organization', () => {
    const decision = resolveMisfiledAgentOrder({
      ...base,
      document: { id: 'd4', event_id: 'evt-other', status: 'sent', created_by: 'wassila' },
      profile: wassila,
    });
    expect(decision).toEqual({
      action: 'skip',
      reason: "agent folder outside the creator's organization",
    });
  });

  test('leaves admin-created documents to manual filing', () => {
    const decision = resolveMisfiledAgentOrder({
      ...base,
      document: { id: 'd5', event_id: 'evt-sarah', status: 'sent', created_by: 'sam' },
      profile: { id: 'sam', full_name: 'Sam Saleh', role: 'admin' },
    });
    expect(decision).toEqual({ action: 'skip', reason: 'created by an admin' });
  });

  test('leaves drafts alone', () => {
    const decision = resolveMisfiledAgentOrder({
      ...base,
      document: { id: 'd6', event_id: 'evt-sarah', status: 'draft', created_by: 'wassila' },
      profile: wassila,
    });
    expect(decision).toEqual({ action: 'skip', reason: 'draft' });
  });

  test('leaves unfiled documents to the dedicated unfiled script', () => {
    const decision = resolveMisfiledAgentOrder({
      ...base,
      document: { id: 'd7', event_id: null, status: 'sent', created_by: 'wassila' },
      profile: wassila,
    });
    expect(decision).toEqual({ action: 'skip', reason: 'not filed in any folder' });
  });

  test('never creates a folder — reports the member instead', () => {
    const decision = resolveMisfiledAgentOrder({
      ...base,
      agentEvents: [sarahFolder],
      document: { id: 'd8', event_id: 'evt-sarah', status: 'sent', created_by: 'newbie' },
      profile: { id: 'newbie', full_name: 'Marion Husson', role: 'agent' },
    });
    expect(decision).toEqual({ action: 'skip', reason: 'no personal folder exists yet' });
  });

  test('skips when the creator profile is missing', () => {
    const decision = resolveMisfiledAgentOrder({
      ...base,
      document: { id: 'd9', event_id: 'evt-sarah', status: 'sent', created_by: 'ghost' },
      profile: null,
    });
    expect(decision).toEqual({ action: 'skip', reason: 'creator profile missing' });
  });
});

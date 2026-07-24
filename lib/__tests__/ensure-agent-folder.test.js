/**
 * @jest-environment node
 *
 * ensureAgentFolderEvent — creates the events.type='agent' folder when missing.
 * July 2026: prefers a personal name-matched folder; sub-agents get their own
 * folder even when the org owner already has one.
 */

const { ensureAgentFolderEvent } = require('../events/ensure-agent-folder');

function makeClient({ profile, memberships = [], existingFolders = [], insertResult = null, insertError = null } = {}) {
  const inserted = [];

  function filterFolders(state) {
    let rows = existingFolders;
    const inOrgs = state.filters.organization_id;
    if (Array.isArray(inOrgs)) {
      rows = rows.filter((f) => inOrgs.includes(f.organization_id));
    } else if (typeof inOrgs === 'string') {
      rows = rows.filter((f) => f.organization_id === inOrgs);
    }
    if (Array.isArray(state.filters.created_by)) {
      rows = rows.filter((f) => state.filters.created_by.includes(f.created_by));
    }
    return rows;
  }

  const client = {
    from: jest.fn((table) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn(function (col) {
            if (col === 'email') {
              return Promise.resolve({
                data: profile?.email ? [{ id: profile.id }] : [],
                error: null,
              });
            }
            return this;
          }),
          maybeSingle: jest.fn().mockResolvedValue({ data: profile, error: null }),
        };
      }

      if (table === 'organization_memberships') {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          is: jest.fn().mockResolvedValue({ data: memberships, error: null }),
        };
      }

      if (table === 'events') {
        const state = { filters: {} };
        const chain = {
          select: jest.fn(function () { return this; }),
          eq: jest.fn(function (col, val) {
            state.filters[col] = val;
            return this;
          }),
          in: jest.fn(function (col, vals) {
            state.filters[col] = vals;
            return this;
          }),
          ilike: jest.fn(function () { return this; }),
          limit: jest.fn(function () {
            return Promise.resolve({ data: filterFolders(state), error: null });
          }),
          then: (resolve, reject) =>
            Promise.resolve({ data: filterFolders(state), error: null }).then(resolve, reject),
          insert: jest.fn(function (row) {
            inserted.push(row);
            return {
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: insertError ? null : (insertResult || { id: 'evt-new' }),
                  error: insertError,
                }),
              })),
            };
          }),
        };
        return chain;
      }

      throw new Error('unexpected table: ' + table);
    }),
    _inserted: inserted,
  };

  return client;
}

describe('ensureAgentFolderEvent', () => {
  test('returns existing name-matched org folder without inserting', async () => {
    const client = makeClient({
      profile: {
        id: 'u1',
        full_name: 'Savvidou Kyriaki',
        email: 'kiki@savvidis.com',
        organization_id: 'org-1',
      },
      memberships: [{ organization_id: 'org-1' }],
      existingFolders: [
        { id: 'evt-existing', name: 'Savvidou Kyriaki', organization_id: 'org-1', type: 'agent' },
      ],
    });

    const id = await ensureAgentFolderEvent(client, 'u1');
    expect(id).toBe('evt-existing');
    expect(client._inserted).toHaveLength(0);
  });

  test('returns existing created_by folder when no name match', async () => {
    const client = makeClient({
      profile: {
        id: 'u1',
        full_name: 'Solo Agent',
        email: 'solo@test.com',
        organization_id: null,
      },
      memberships: [],
      existingFolders: [{ id: 'evt-own', name: 'Solo Agent', organization_id: null, created_by: 'u1', type: 'agent' }],
    });

    const id = await ensureAgentFolderEvent(client, 'u1');
    expect(id).toBe('evt-own');
    expect(client._inserted).toHaveLength(0);
  });

  test('creates folder named after full_name when none exists', async () => {
    const client = makeClient({
      profile: {
        id: 'u1',
        full_name: 'Savvidou Kyriaki',
        email: 'kiki@savvidis.com',
        organization_id: 'org-1',
      },
      memberships: [{ organization_id: 'org-1' }],
      existingFolders: [],
      insertResult: { id: 'evt-created' },
    });

    const id = await ensureAgentFolderEvent(client, 'u1');
    expect(id).toBe('evt-created');
    expect(client._inserted).toEqual([
      {
        name: 'Savvidou Kyriaki',
        type: 'agent',
        organization_id: 'org-1',
        created_by: 'u1',
      },
    ]);
  });

  test('falls back to email when full_name is empty', async () => {
    const client = makeClient({
      profile: {
        id: 'u1',
        full_name: '  ',
        email: 'agent@example.com',
        organization_id: 'org-1',
      },
      memberships: [{ organization_id: 'org-1' }],
      existingFolders: [],
      insertResult: { id: 'evt-email' },
    });

    const id = await ensureAgentFolderEvent(client, 'u1');
    expect(id).toBe('evt-email');
    expect(client._inserted[0].name).toBe('agent@example.com');
  });

  test('creates a personal folder for a sub-agent even when org owner folder exists', async () => {
    const client = makeClient({
      profile: {
        id: 'sub-1',
        full_name: 'Wassila Mekidiche',
        email: 'wassila@test.com',
        organization_id: 'org-shared',
      },
      memberships: [{ organization_id: 'org-shared' }],
      existingFolders: [
        { id: 'evt-owner', organization_id: 'org-shared', name: 'Sarah Goutard', type: 'agent' },
      ],
      insertResult: { id: 'evt-wassila' },
    });

    const id = await ensureAgentFolderEvent(client, 'sub-1');
    expect(id).toBe('evt-wassila');
    expect(client._inserted).toEqual([
      {
        name: 'Wassila Mekidiche',
        type: 'agent',
        organization_id: 'org-shared',
        created_by: 'sub-1',
      },
    ]);
  });

  test('returns null for missing userId / missing profile', async () => {
    expect(await ensureAgentFolderEvent({}, null)).toBeNull();
    const client = makeClient({ profile: null });
    expect(await ensureAgentFolderEvent(client, 'missing')).toBeNull();
  });
});

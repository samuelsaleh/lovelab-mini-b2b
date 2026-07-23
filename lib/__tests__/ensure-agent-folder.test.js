/**
 * @jest-environment node
 *
 * ensureAgentFolderEvent — creates the events.type='agent' folder when missing.
 * Regression for Savvidou Kyriaki / SAVVIDIS SA (July 2026): invite created
 * org + membership but never the events folder, so the first order had nowhere
 * to file.
 */

const { ensureAgentFolderEvent } = require('../events/ensure-agent-folder');

function makeClient({ profile, memberships = [], existingFolders = [], insertResult = null, insertError = null } = {}) {
  const inserted = [];
  const eventsCalls = [];

  const client = {
    from: jest.fn((table) => {
      if (table === 'profiles') {
        const chain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: profile, error: null }),
        };
        // resolveUserIds second profiles query uses .select().eq('email')
        // without maybeSingle — return thenable that also has maybeSingle
        chain.then = undefined;
        // For .eq('email', ...).select chain used as awaitable via implicit — actually
        // the code awaits `adminSupabase.from('profiles').select('id').eq('email', email)`
        // which returns a thenable from supabase. Our mock needs to be thenable.
        const emailLookup = {
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
        return emailLookup;
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
          select: jest.fn().mockReturnThis(),
          eq: jest.fn(function (col, val) {
            state.filters[col] = val;
            return this;
          }),
          in: jest.fn(function (col, vals) {
            state.filters[col] = vals;
            return this;
          }),
          limit: jest.fn(function () {
            eventsCalls.push({ ...state.filters });
            let rows = existingFolders;
            if (state.filters.type === 'agent' && state.filters.organization_id) {
              rows = existingFolders.filter(
                (f) => f.organization_id === state.filters.organization_id
              );
            } else if (state.filters.organization_id === undefined && Array.isArray(state.filters.organization_id) === false) {
              // .in('organization_id', [...])
            }
            if (Array.isArray(state.filters.organization_id) || (state.filters.organization_id && typeof state.filters.organization_id !== 'string')) {
              // handled below via 'in'
            }
            const inOrgs = state.filters.organization_id;
            if (Array.isArray(inOrgs)) {
              rows = existingFolders.filter((f) => inOrgs.includes(f.organization_id));
            } else if (typeof state.filters.organization_id === 'string') {
              rows = existingFolders.filter(
                (f) => f.organization_id === state.filters.organization_id
              );
            }
            if (Array.isArray(state.filters.created_by)) {
              rows = existingFolders.filter((f) =>
                state.filters.created_by.includes(f.created_by)
              );
            }
            return Promise.resolve({ data: rows.slice(0, 1), error: null });
          }),
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
    _eventsCalls: eventsCalls,
  };

  return client;
}

describe('ensureAgentFolderEvent', () => {
  test('returns existing org-linked agent folder without inserting', async () => {
    const client = makeClient({
      profile: {
        id: 'u1',
        full_name: 'Savvidou Kyriaki',
        email: 'kiki@savvidis.com',
        organization_id: 'org-1',
      },
      memberships: [{ organization_id: 'org-1' }],
      existingFolders: [{ id: 'evt-existing', organization_id: 'org-1', type: 'agent' }],
    });

    const id = await ensureAgentFolderEvent(client, 'u1');
    expect(id).toBe('evt-existing');
    expect(client._inserted).toHaveLength(0);
  });

  test('returns existing created_by folder when no org folder', async () => {
    const client = makeClient({
      profile: {
        id: 'u1',
        full_name: 'Solo Agent',
        email: 'solo@test.com',
        organization_id: null,
      },
      memberships: [],
      existingFolders: [{ id: 'evt-own', organization_id: null, created_by: 'u1', type: 'agent' }],
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

  test('dedups by organization — sub-agent reuses parent org folder', async () => {
    const client = makeClient({
      profile: {
        id: 'sub-1',
        full_name: 'Sub Agent',
        email: 'sub@test.com',
        organization_id: 'org-shared',
      },
      memberships: [{ organization_id: 'org-shared' }],
      existingFolders: [
        { id: 'evt-owner', organization_id: 'org-shared', name: 'Owner Agent', type: 'agent' },
      ],
    });

    const id = await ensureAgentFolderEvent(client, 'sub-1');
    expect(id).toBe('evt-owner');
    expect(client._inserted).toHaveLength(0);
  });

  test('returns null for missing userId / missing profile', async () => {
    expect(await ensureAgentFolderEvent({}, null)).toBeNull();
    const client = makeClient({ profile: null });
    expect(await ensureAgentFolderEvent(client, 'missing')).toBeNull();
  });
});

/**
 * @jest-environment node
 *
 * Org-member event access — regression tests for the Wassila/Caprice bug
 * (July 2026).
 *
 * Three guarantees:
 *   1. GET /api/me activates an agent stuck at "invited" — the auth callback
 *      only runs for OAuth/magic-link, so password sign-ins relied on this
 *      endpoint (hit by AuthProvider on every session) to activate.
 *   2. GET /api/events shows a non-admin org member the events linked to
 *      their organization (so the save-modal dropdown isn't empty).
 *   3. POST /api/documents lets an org member file an order into their
 *      organization's event even though their event permission is only
 *      'read' — but still rejects events of OTHER organizations.
 */

describe('GET /api/me — invited agent activation', () => {
  let profileUpdates;

  beforeEach(() => {
    jest.resetModules();
    profileUpdates = [];
  });

  function setupMeMocks({ agentStatus }) {
    const profile = {
      id: 'user-1',
      is_agent: true,
      agent_status: agentStatus,
      organization_id: 'org-1',
    };

    const userClient = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { ...profile }, error: null }),
      })),
    };

    const adminClient = {
      from: jest.fn((table) => {
        if (table === 'profiles') {
          return {
            update: jest.fn((values) => ({
              eq: jest.fn((col, val) => {
                profileUpdates.push({ values, col, val });
                return Promise.resolve({ error: null });
              }),
            })),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { ...profile }, error: null }),
          };
        }
        if (table === 'organization_memberships') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        throw new Error('unexpected table: ' + table);
      }),
    };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn().mockResolvedValue(userClient),
      createAdminClient: jest.fn(() => adminClient),
    }));
    jest.doMock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
  }

  test('flips invited agent to active and returns the updated status', async () => {
    setupMeMocks({ agentStatus: 'invited' });
    const { GET } = require('../me/route');
    const res = await GET(new global.Request('http://localhost/api/me'));
    const body = await res.json();

    expect(profileUpdates).toHaveLength(1);
    expect(profileUpdates[0].values).toEqual({ agent_status: 'active' });
    expect(profileUpdates[0].val).toBe('user-1');
    expect(body.profile.agent_status).toBe('active');
  });

  test('does not touch agents that are already active', async () => {
    setupMeMocks({ agentStatus: 'active' });
    const { GET } = require('../me/route');
    const res = await GET(new global.Request('http://localhost/api/me'));
    const body = await res.json();

    expect(profileUpdates).toHaveLength(0);
    expect(body.profile.agent_status).toBe('active');
  });
});

describe('GET /api/events — org member visibility', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function setupEventsMocks({ memberships }) {
    const rawEvents = [
      { id: 'evt-org', name: 'Sarah Goutard', type: 'agent', organization_id: 'org-1', created_by: 'owner-1' },
      { id: 'evt-other', name: 'Other Org', type: 'agent', organization_id: 'org-2', created_by: 'someone-else' },
      { id: 'evt-mine', name: 'My Fair', type: 'fair', organization_id: null, created_by: 'member-1' },
    ];

    const adminClient = {
      from: jest.fn((table) => {
        if (table === 'events') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: rawEvents, error: null }),
          };
        }
        if (table === 'event_access') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'documents') {
          const chain = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            not: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
          return chain;
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            is: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        throw new Error('unexpected table: ' + table);
      }),
    };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn().mockResolvedValue({}),
      createAdminClient: jest.fn(() => adminClient),
    }));
    jest.doMock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
    jest.doMock('@/app/api/_lib/access', () => ({
      getUserContext: jest.fn().mockResolvedValue({ user: { id: 'member-1' }, isAdmin: false }),
      resolveAgentIds: jest.fn().mockResolvedValue(['member-1']),
      getActiveOrgMemberships: jest.fn().mockResolvedValue(memberships),
    }));
  }

  test('includes events linked to the member organization with read permission', async () => {
    setupEventsMocks({ memberships: [{ organization_id: 'org-1', role: 'member', user_id: 'member-1' }] });
    const { GET } = require('../events/route');
    const res = await GET(new global.Request('http://localhost/api/events'));
    const body = await res.json();

    const ids = body.events.map((e) => e.id).sort();
    expect(ids).toEqual(['evt-mine', 'evt-org']);
    expect(body.events.find((e) => e.id === 'evt-org').permission).toBe('read');
    expect(body.events.find((e) => e.id === 'evt-mine').permission).toBe('manage');
  });

  test('does NOT leak other organizations events to non-members', async () => {
    setupEventsMocks({ memberships: [] });
    const { GET } = require('../events/route');
    const res = await GET(new global.Request('http://localhost/api/events'));
    const body = await res.json();

    expect(body.events.map((e) => e.id)).toEqual(['evt-mine']);
  });
});

describe('POST /api/documents — org member files order into org event', () => {
  let insertedRows;

  beforeEach(() => {
    jest.resetModules();
    insertedRows = [];
    delete process.env.RESEND_API_KEY;
  });

  function setupDocumentsMocks({ eventOrgId, memberships }) {
    const adminClient = {
      from: jest.fn((table) => {
        if (table === 'events') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { organization_id: eventOrgId }, error: null }),
          };
        }
        if (table === 'documents') {
          return {
            insert: jest.fn((row) => {
              insertedRows.push(row);
              return {
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({ data: { id: 'doc-1', ...row }, error: null }),
                })),
              };
            }),
          };
        }
        throw new Error('unexpected table: ' + table);
      }),
    };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn().mockResolvedValue({}),
      createAdminClient: jest.fn(() => adminClient),
    }));
    jest.doMock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
    jest.doMock('@/app/api/_lib/access', () => ({
      getUserContext: jest.fn().mockResolvedValue({ user: { id: 'member-1' }, isAdmin: false }),
      getAccessibleEventIds: jest.fn().mockResolvedValue([]),
      // Org members only ever get 'read' on org events — not enough for the
      // default 'edit' requirement, so the org-membership fallback must run.
      requireEventPermission: jest.fn().mockResolvedValue({ allowed: false }),
      resolveAgentIds: jest.fn().mockResolvedValue(['member-1']),
      getActiveOrgMemberships: jest.fn().mockResolvedValue(memberships),
      getOrgTeamScope: jest.fn().mockResolvedValue({ memberIds: [], eventIds: [] }),
    }));
    jest.doMock('@/lib/organizations/team', () => ({
      canUseOrgScope: jest.fn().mockResolvedValue(false),
      buildTeamScopeOrFilter: jest.fn(() => null),
    }));
  }

  function makePostRequest() {
    return new global.Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: 'evt-org',
        client_name: 'CAPRICE',
        document_type: 'order',
        file_path: 'evt-org/caprice.pdf',
        file_name: 'caprice.pdf',
        order_channel: 'b2b',
      }),
    });
  }

  test('allows the save when the event belongs to the member organization', async () => {
    setupDocumentsMocks({
      eventOrgId: 'org-1',
      memberships: [{ organization_id: 'org-1', role: 'member', user_id: 'member-1' }],
    });
    const { POST } = require('../documents/route');
    const res = await POST(makePostRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.document.event_id).toBe('evt-org');
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].event_id).toBe('evt-org');
  });

  test('still rejects events belonging to another organization', async () => {
    setupDocumentsMocks({
      eventOrgId: 'org-2',
      memberships: [{ organization_id: 'org-1', role: 'member', user_id: 'member-1' }],
    });
    const { POST } = require('../documents/route');
    const res = await POST(makePostRequest());

    expect(res.status).toBe(403);
    expect(insertedRows).toHaveLength(0);
  });
});

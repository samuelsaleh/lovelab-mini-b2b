/**
 * @jest-environment node
 *
 * Offre orders (Sam, July 2026) — the admin-only twin of Draft.
 *
 * An Offre is a parked order: same `status = 'draft'` as a Draft (so every
 * draft protection is inherited — no folder, no commission, no bonus, no
 * notification email, excluded from revenue) plus `draft_kind = 'offre'` so it
 * shows up on the admin Offre page instead of the shared Draft page.
 *
 * Guarantees:
 *   1. POST admin draft + draft_kind=offre → row parked as an Offre, unfiled,
 *      no commission.
 *   2. POST non-admin forging draft_kind → ordinary draft (flag dropped).
 *   3. POST never writes draft_kind unless it is an Offre (a database without
 *      supabase-phase25-offre-orders.sql keeps saving normally).
 *   4. PUT keeping the Offre → still no commission.
 *   5. PUT promoting the Offre to sent → commission runs, bucket preserved.
 *   6. GET exposes the two buckets (?status=draft&draft_kind=offre|none).
 */

const OFFRE_PAYLOAD = {
  client_name: 'CAPRICE',
  document_type: 'order',
  file_path: 'no-event/caprice.pdf',
  file_name: 'caprice.pdf',
  order_channel: 'b2b',
  total_amount: 1000,
};

describe('POST /api/documents — Offre bucket', () => {
  let insertedRows;
  let resolveCommissionAgent;

  beforeEach(() => {
    jest.resetModules();
    insertedRows = [];
    resolveCommissionAgent = jest.fn().mockResolvedValue(null);
    delete process.env.RESEND_API_KEY;
  });

  function setupMocks({ isAdmin = true } = {}) {
    const adminClient = {
      from: jest.fn((table) => {
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
        if (table === 'events') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { organization_id: null }, error: null }),
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
      getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-1' }, isAdmin }),
      getAccessibleEventIds: jest.fn().mockResolvedValue([]),
      requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
      resolveAgentIds: jest.fn().mockResolvedValue(['admin-1']),
      getActiveOrgMemberships: jest.fn().mockResolvedValue([]),
      getOrgTeamScope: jest.fn().mockResolvedValue({ memberIds: [], eventIds: [] }),
      resolveAgentFolderEventId: jest.fn().mockResolvedValue('evt-agent'),
    }));
    jest.doMock('@/lib/organizations/team', () => ({
      canUseOrgScope: jest.fn(() => false),
      buildTeamScopeOrFilter: jest.fn(() => null),
    }));
    jest.doMock('@/lib/commissionAttribution', () => ({
      resolveCommissionAgent,
      upsertCommissionForDocument: jest.fn(),
    }));
    jest.doMock('@/lib/newClientBonus', () => ({ maybeCreateBonusForOrder: jest.fn() }));
    jest.doMock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn() }));
    jest.doMock('@/lib/lovelab-sync', () => ({
      syncConsignmentToLovelab: jest.fn(),
      syncGiftLostToLovelab: jest.fn(),
    }));
  }

  function makePost(extra = {}) {
    return new global.Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: 'evt-chosen', ...OFFRE_PAYLOAD, ...extra }),
    });
  }

  test('admin parks an Offre: draft status, offre bucket, no folder', async () => {
    setupMocks();
    const { POST } = require('../documents/route');
    const res = await POST(makePost({ status: 'draft', draft_kind: 'offre' }));
    expect(res.status).toBe(200);
    expect(insertedRows[0].status).toBe('draft');
    expect(insertedRows[0].draft_kind).toBe('offre');
    // Same as a Draft: parked outside every folder until it is sent.
    expect(insertedRows[0].event_id).toBeNull();
  });

  test('an Offre never creates a commission', async () => {
    setupMocks();
    const { POST } = require('../documents/route');
    await POST(makePost({ status: 'draft', draft_kind: 'offre' }));
    expect(resolveCommissionAgent).not.toHaveBeenCalled();
  });

  test('a non-admin cannot park into the Offre folder', async () => {
    setupMocks({ isAdmin: false });
    const { POST } = require('../documents/route');
    await POST(makePost({ status: 'draft', draft_kind: 'offre' }));
    expect(insertedRows[0].status).toBe('draft');
    expect(insertedRows[0].draft_kind).toBeUndefined();
  });

  test('draft_kind=offre on a sent order is ignored', async () => {
    setupMocks();
    const { POST } = require('../documents/route');
    await POST(makePost({ status: 'sent', draft_kind: 'offre' }));
    expect(insertedRows[0].status).toBe('sent');
    expect(insertedRows[0].draft_kind).toBeUndefined();
  });

  test('an ordinary draft never touches the draft_kind column', async () => {
    setupMocks();
    const { POST } = require('../documents/route');
    await POST(makePost({ status: 'draft' }));
    expect(insertedRows[0].status).toBe('draft');
    expect('draft_kind' in insertedRows[0]).toBe(false);
  });

  test('an ordinary sent order never touches the draft_kind column', async () => {
    setupMocks();
    const { POST } = require('../documents/route');
    await POST(makePost({ status: 'sent' }));
    expect('draft_kind' in insertedRows[0]).toBe(false);
  });
});

describe('PUT /api/documents/:id — Offre bucket', () => {
  let updatedPayloads;
  let resolveCommissionAgent;

  beforeEach(() => {
    jest.resetModules();
    updatedPayloads = [];
    resolveCommissionAgent = jest.fn().mockResolvedValue(null);
    delete process.env.RESEND_API_KEY;
  });

  function setupMocks({ isAdmin = true } = {}) {
    const oldDoc = {
      file_path: 'x/old.pdf',
      created_by: 'admin-1',
      event_id: null,
      status: 'draft',
      order_channel: 'b2b',
    };
    const adminClient = {
      from: jest.fn((table) => {
        if (table === 'documents') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: oldDoc, error: null }),
            update: jest.fn((payload) => {
              updatedPayloads.push(payload);
              return {
                eq: jest.fn(() => ({
                  select: jest.fn(() => ({
                    single: jest.fn().mockResolvedValue({
                      data: { id: 'doc-1', ...oldDoc, ...payload },
                      error: null,
                    }),
                  })),
                })),
              };
            }),
          };
        }
        if (table === 'events' || table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        throw new Error('unexpected table: ' + table);
      }),
      storage: { from: jest.fn(() => ({ remove: jest.fn().mockResolvedValue({}) })) },
    };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn().mockResolvedValue({}),
      createAdminClient: jest.fn(() => adminClient),
    }));
    jest.doMock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
    jest.doMock('@/app/api/_lib/access', () => ({
      getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-1' }, isAdmin }),
      isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
      requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
      resolveAgentFolderEventId: jest.fn().mockResolvedValue('evt-agent'),
    }));
    jest.doMock('@/lib/commissionAttribution', () => ({
      resolveCommissionAgent,
      upsertCommissionForDocument: jest.fn(),
    }));
    jest.doMock('@/lib/newClientBonus', () => ({ maybeCreateBonusForOrder: jest.fn() }));
    jest.doMock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn() }));
  }

  const ID = '11111111-1111-4111-8111-111111111111';
  const PARAMS = { params: Promise.resolve({ id: ID }) };

  function makePut(extra = {}) {
    return new global.Request(`http://localhost/api/documents/${ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: null, ...OFFRE_PAYLOAD, ...extra }),
    });
  }

  test('re-saving an Offre keeps it in the Offre folder and skips commission', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    const res = await PUT(makePut({ status: 'draft', draft_kind: 'offre' }), PARAMS);
    expect(res.status).toBe(200);
    expect(updatedPayloads[0].status).toBe('draft');
    expect(updatedPayloads[0].draft_kind).toBe('offre');
    expect(resolveCommissionAgent).not.toHaveBeenCalled();
  });

  test('promoting an Offre to sent runs commission and preserves the bucket', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ status: 'sent' }), PARAMS);
    expect(updatedPayloads[0].status).toBe('sent');
    // Key omitted → the stored draft_kind is left untouched (provenance).
    expect('draft_kind' in updatedPayloads[0]).toBe(false);
    expect(resolveCommissionAgent).toHaveBeenCalled();
  });

  test('a non-admin cannot move a document into the Offre folder', async () => {
    setupMocks({ isAdmin: false });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ status: 'draft', draft_kind: 'offre' }), PARAMS);
    expect('draft_kind' in updatedPayloads[0]).toBe(false);
  });

  test('draft_kind=offre with status sent clears the bucket instead of lying', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ status: 'sent', draft_kind: 'offre' }), PARAMS);
    expect(updatedPayloads[0].draft_kind).toBeNull();
  });

  test('an ordinary draft update never touches the draft_kind column', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ status: 'draft' }), PARAMS);
    expect('draft_kind' in updatedPayloads[0]).toBe(false);
  });
});

describe('GET /api/documents — parked buckets', () => {
  let calls;

  beforeEach(() => {
    jest.resetModules();
    calls = [];
  });

  function setupMocks() {
    // Minimal thenable query builder recording the filters the route applies.
    const query = {
      select: () => query,
      order: () => query,
      range: () => query,
      or: (...a) => { calls.push(['or', ...a]); return query; },
      not: (...a) => { calls.push(['not', ...a]); return query; },
      is: (...a) => { calls.push(['is', ...a]); return query; },
      eq: (...a) => { calls.push(['eq', ...a]); return query; },
      in: (...a) => { calls.push(['in', ...a]); return query; },
      then: (resolve) => resolve({ data: [], error: null, count: 0 }),
    };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn().mockResolvedValue({}),
      createAdminClient: jest.fn(() => ({ from: jest.fn(() => query) })),
    }));
    jest.doMock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
    jest.doMock('@/app/api/_lib/access', () => ({
      getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-1' }, isAdmin: true }),
      getAccessibleEventIds: jest.fn().mockResolvedValue([]),
      requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
      resolveAgentIds: jest.fn().mockResolvedValue(['admin-1']),
      getActiveOrgMemberships: jest.fn().mockResolvedValue([]),
      getOrgTeamScope: jest.fn().mockResolvedValue({ memberIds: [], eventIds: [] }),
      resolveAgentFolderEventId: jest.fn(),
    }));
    jest.doMock('@/lib/organizations/team', () => ({
      canUseOrgScope: jest.fn(() => false),
      buildTeamScopeOrFilter: jest.fn(() => null),
    }));
  }

  async function get(qs) {
    setupMocks();
    const { GET } = require('../documents/route');
    return GET(new global.Request(`http://localhost/api/documents?${qs}`));
  }

  test('status=draft returns only parked orders', async () => {
    const res = await get('status=draft&per_page=200');
    expect(res.status).toBe(200);
    expect(calls).toEqual(expect.arrayContaining([['eq', 'status', 'draft']]));
  });

  test('draft_kind=offre filters the Offre folder', async () => {
    await get('status=draft&draft_kind=offre');
    expect(calls).toEqual(expect.arrayContaining([['eq', 'draft_kind', 'offre']]));
  });

  test('draft_kind=none filters the plain Draft folder', async () => {
    await get('status=draft&draft_kind=none');
    expect(calls).toEqual(expect.arrayContaining([['is', 'draft_kind', null]]));
  });

  test('an unrelated list is never filtered on status or draft_kind', async () => {
    await get('per_page=50');
    const filtered = calls.filter(
      (c) => c[1] === 'status' || c[1] === 'draft_kind',
    );
    expect(filtered).toEqual([]);
  });
});

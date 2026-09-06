/**
 * @jest-environment node
 *
 * Mandatory agent filing (Sam, July 2026) — "everything saved by an agent
 * goes into their folder".
 *
 * Regression for the Sarah/Nicolas bug: the save modal's folder list loads
 * async; a fast Save (or a failed fetch) posted event_id null and the order
 * landed in "No Event" instead of the agent's folder.
 *
 * Guarantees:
 *   1. POST: non-admin sent b2b/b2c order with no event_id auto-files into
 *      the creator's agent folder (resolveAgentFolderEventId).
 *   2. POST: drafts and admin saves are NOT auto-filed.
 *   3. PUT: non-admin update with event_id null keeps the existing folder
 *      (re-edit can never strip it), and auto-files when there was none.
 *   4. PUT: admin sending event_id null is respected (intentional unfiling).
 */

const FOLDER_ID = 'evt-agent-folder';

describe('POST /api/documents — agent auto-file fallback', () => {
  let insertedRows;
  let resolveFolderMock;

  beforeEach(() => {
    jest.resetModules();
    insertedRows = [];
    resolveFolderMock = jest.fn().mockResolvedValue(FOLDER_ID);
    delete process.env.RESEND_API_KEY;
  });

  function setupMocks({ isAdmin = false } = {}) {
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
      getUserContext: jest.fn().mockResolvedValue({ user: { id: 'agent-1' }, isAdmin }),
      getAccessibleEventIds: jest.fn().mockResolvedValue([]),
      requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
      resolveAgentIds: jest.fn().mockResolvedValue(['agent-1']),
      getActiveOrgMemberships: jest.fn().mockResolvedValue([]),
      getOrgTeamScope: jest.fn().mockResolvedValue({ memberIds: [], eventIds: [] }),
      resolveAgentFolderEventId: resolveFolderMock,
    }));
    jest.doMock('@/lib/organizations/team', () => ({
      canUseOrgScope: jest.fn().mockResolvedValue(false),
      buildTeamScopeOrFilter: jest.fn(() => null),
    }));
  }

  function makePost({ event_id = null, status = 'sent', order_channel = 'b2b' } = {}) {
    return new global.Request('http://localhost/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id,
        client_name: 'SARL LANOUE AND CO',
        document_type: 'order',
        file_path: 'no-event/lanoue.pdf',
        file_name: 'lanoue.pdf',
        order_channel,
        status,
      }),
    });
  }

  test('files a sent b2b order with no event into the agent folder', async () => {
    setupMocks();
    const { POST } = require('../documents/route');
    const res = await POST(makePost());
    expect(res.status).toBe(200);
    expect(resolveFolderMock).toHaveBeenCalledWith(expect.anything(), 'agent-1');
    expect(insertedRows[0].event_id).toBe(FOLDER_ID);
  });

  test('files a sent b2c order too', async () => {
    setupMocks();
    const { POST } = require('../documents/route');
    await POST(makePost({ order_channel: 'b2c' }));
    expect(insertedRows[0].event_id).toBe(FOLDER_ID);
  });

  test('drafts are never auto-filed', async () => {
    setupMocks();
    const { POST } = require('../documents/route');
    await POST(makePost({ status: 'draft' }));
    expect(resolveFolderMock).not.toHaveBeenCalled();
    expect(insertedRows[0].event_id).toBeNull();
  });

  test('admin saves without an event stay unfiled', async () => {
    setupMocks({ isAdmin: true });
    const { POST } = require('../documents/route');
    await POST(makePost());
    expect(resolveFolderMock).not.toHaveBeenCalled();
    expect(insertedRows[0].event_id).toBeNull();
  });

  test('an explicitly chosen event wins over the fallback', async () => {
    setupMocks();
    const { POST } = require('../documents/route');
    await POST(makePost({ event_id: 'evt-explicit' }));
    expect(resolveFolderMock).not.toHaveBeenCalled();
    expect(insertedRows[0].event_id).toBe('evt-explicit');
  });
});

describe('PUT /api/documents/:id — folder preserved / auto-filed on update', () => {
  let updatedPayloads;
  let resolveFolderMock;

  beforeEach(() => {
    jest.resetModules();
    updatedPayloads = [];
    resolveFolderMock = jest.fn().mockResolvedValue(FOLDER_ID);
    delete process.env.RESEND_API_KEY;
  });

  function setupMocks({ isAdmin = false, oldEventId = null, oldStatus = 'sent' } = {}) {
    const oldDoc = {
      file_path: 'x/old.pdf',
      created_by: 'agent-1',
      event_id: oldEventId,
      status: oldStatus,
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
      getUserContext: jest.fn().mockResolvedValue({ user: { id: 'agent-1' }, isAdmin }),
      isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
      requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
      canAccessDocument: jest.fn().mockResolvedValue({ allowed: true }),
      resolveAgentFolderEventId: resolveFolderMock,
    }));
    jest.doMock('@/lib/commissionAttribution', () => ({
      resolveCommissionAgent: jest.fn().mockResolvedValue(null),
      upsertCommissionForDocument: jest.fn(),
    }));
    jest.doMock('@/lib/newClientBonus', () => ({ maybeCreateBonusForOrder: jest.fn() }));
    jest.doMock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn() }));
  }

  function makePut({ event_id = null, status = 'sent' } = {}) {
    return new global.Request('http://localhost/api/documents/11111111-1111-4111-8111-111111111111', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id,
        client_name: 'CAPRICE',
        document_type: 'order',
        file_path: 'x/new.pdf',
        file_name: 'new.pdf',
        order_channel: 'b2b',
        status,
      }),
    });
  }

  const PARAMS = { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) };

  test('re-edit with null event keeps the existing folder for agents', async () => {
    setupMocks({ oldEventId: 'evt-existing' });
    const { PUT } = require('../documents/[id]/route');
    const res = await PUT(makePut(), PARAMS);
    expect(res.status).toBe(200);
    expect(updatedPayloads[0].event_id).toBe('evt-existing');
    expect(resolveFolderMock).not.toHaveBeenCalled();
  });

  test('agent update with no folder anywhere auto-files into the agent folder', async () => {
    setupMocks({ oldEventId: null });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(resolveFolderMock).toHaveBeenCalledWith(expect.anything(), 'agent-1');
    expect(updatedPayloads[0].event_id).toBe(FOLDER_ID);
  });

  test('draft updates are not auto-filed', async () => {
    setupMocks({ oldEventId: null, oldStatus: 'draft' });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ status: 'draft' }), PARAMS);
    expect(resolveFolderMock).not.toHaveBeenCalled();
    expect(updatedPayloads[0].event_id).toBeNull();
  });

  test('admin can intentionally unfile (null respected)', async () => {
    setupMocks({ isAdmin: true, oldEventId: 'evt-existing' });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(resolveFolderMock).not.toHaveBeenCalled();
    expect(updatedPayloads[0].event_id).toBeNull();
  });

  test('explicit event on update wins as before', async () => {
    setupMocks({ oldEventId: 'evt-existing' });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ event_id: 'evt-new' }), PARAMS);
    expect(updatedPayloads[0].event_id).toBe('evt-new');
  });
});

/**
 * @jest-environment node
 *
 * PUT /api/documents/:id — re-edit updates the same order.
 *
 * A re-saved order used to become a fresh row and the previous version went
 * to Trash. It now updates in place (same id, commissions stay attached) and
 * stamps activity_at so the list can float that same order to the top.
 * created_at is not rewritten. The office is still told it was updated.
 */

const OLD_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ID = '22222222-2222-4222-8222-222222222222';
const PARAMS = { params: Promise.resolve({ id: OLD_ID }) };

let insertedPayloads;
let updatedDocPayloads;
let commissionUpdates;
let storageRemoved;
let notify;
let recordHealthEvent;

function setupMocks({
  oldDoc: oldDocOverrides = {},
  isAdmin = false,
  agentColumn = true,
  activityColumn = true,
} = {}) {
  const oldDoc = {
    id: OLD_ID,
    created_at: '2026-09-02T10:00:00.000Z',
    created_by: 'silke-uuid',
    agent_id: 'silke-uuid',
    event_id: 'evt-nordstil',
    status: 'sent',
    order_channel: 'b2b',
    file_path: 'silke-uuid/old.pdf',
    client_company: 'Nanau Vertriebsgesellschaft mbH',
    metadata: { formState: { rows: [] } },
    draft_kind: null,
    ...oldDocOverrides,
  };

  const adminClient = {
    from: jest.fn((table) => {
      if (table === 'documents') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: oldDoc, error: null }),
          insert: jest.fn((payload) => {
            insertedPayloads.push(payload);
            return {
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { id: NEW_ID, created_at: '2026-09-09T09:28:00.000Z', ...payload },
                  error: null,
                }),
              })),
            };
          }),
          update: jest.fn((payload) => {
            updatedDocPayloads.push(payload);
            const chain = {
              eq: jest.fn(() => ({
                ...chain,
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: { ...oldDoc, ...payload },
                    error: null,
                  }),
                })),
                then: (resolve) => resolve({ error: null }),
              })),
            };
            return chain;
          }),
        };
      }
      if (table === 'agent_commissions') {
        return {
          update: jest.fn((payload) => {
            commissionUpdates.push({ payload });
            return {
              eq: jest.fn((col, val) => {
                commissionUpdates[commissionUpdates.length - 1].eq = [col, val];
                return {
                  neq: jest.fn((ncol, nval) => {
                    commissionUpdates[commissionUpdates.length - 1].neq = [ncol, nval];
                    return Promise.resolve({ error: null });
                  }),
                };
              }),
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
    storage: {
      from: jest.fn(() => ({
        remove: jest.fn(async (paths) => { storageRemoved.push(...paths); return {}; }),
      })),
    },
  };

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn().mockResolvedValue({}),
    createAdminClient: jest.fn(() => adminClient),
  }));
  jest.doMock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
  jest.doMock('@/app/api/_lib/access', () => ({
    getUserContext: jest.fn().mockResolvedValue({ user: { id: 'silke-uuid', email: 'silke@example.com' }, isAdmin }),
    isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
    requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
    canAccessDocument: jest.fn().mockResolvedValue({ allowed: true }),
    resolveAgentFolderEventId: jest.fn().mockResolvedValue('evt-agent-folder'),
  }));
  jest.doMock('@/lib/commissionAttribution', () => ({
    resolveCommissionAgent: jest.fn().mockResolvedValue(null),
    upsertCommissionForDocument: jest.fn(),
  }));
  jest.doMock('@/lib/newClientBonus', () => ({ maybeCreateBonusForOrder: jest.fn() }));
  jest.doMock('@/lib/agentIdColumn', () => ({
    documentsHaveAgentIdColumn: jest.fn().mockResolvedValue(agentColumn),
    normalizeAgentId: jest.fn(async (v) => v ?? null),
  }));
  jest.doMock('@/lib/activityAtColumn', () => ({
    documentsHaveActivityAtColumn: jest.fn().mockResolvedValue(activityColumn),
  }));
  jest.doMock('@/lib/healthEvent', () => ({ recordHealthEvent }));
  jest.doMock('@/lib/orderNotices', () => ({ notifyOrderEvent: notify }));
  jest.doMock('@/lib/lovelab-sync', () => ({ syncConsignmentToLovelab: jest.fn() }));
}

function makePut(extra = {}) {
  return new global.Request(`http://localhost/api/documents/${OLD_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: 'evt-nordstil',
      client_name: 'Malwina Ernst',
      client_company: 'Nanau Vertriebsgesellschaft mbH',
      document_type: 'order',
      file_path: 'silke-uuid/new.pdf',
      file_name: 'LoveLab_Order_Nanau_20260909.pdf',
      total_amount: 2497.5,
      order_channel: 'b2b',
      status: 'sent',
      metadata: { formState: { rows: [{ no: 1 }] } },
      ...extra,
    }),
  });
}

beforeEach(() => {
  jest.resetModules();
  insertedPayloads = [];
  updatedDocPayloads = [];
  commissionUpdates = [];
  storageRemoved = [];
  notify = jest.fn().mockResolvedValue({ sent: true });
  recordHealthEvent = jest.fn().mockResolvedValue({ ok: true });
  delete process.env.RESEND_API_KEY;
});

describe('PUT updates a committed B2B/B2C order in place', () => {
  test('writes the edit onto the same row and does not create another', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    const res = await PUT(makePut(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(insertedPayloads).toHaveLength(0);
    expect(updatedDocPayloads).toHaveLength(1);
    expect(updatedDocPayloads[0]).toMatchObject({
      client_company: 'Nanau Vertriebsgesellschaft mbH',
      file_path: 'silke-uuid/new.pdf',
      total_amount: 2497.5,
      status: 'sent',
      order_channel: 'b2b',
      event_id: 'evt-nordstil',
    });
    expect(updatedDocPayloads[0].metadata).toEqual({ formState: { rows: [{ no: 1 }] } });
    expect(updatedDocPayloads[0].deleted_at).toBeUndefined();
    expect(body.document.id).toBe(OLD_ID);
    expect(body.reissued_from).toBeUndefined();
    expect(body.document.created_at).toBe('2026-09-02T10:00:00.000Z');
  });

  test('stamps activity_at so the same order sorts to the top', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    const before = Date.now();
    await PUT(makePut(), PARAMS);
    const stamped = Date.parse(updatedDocPayloads[0].activity_at);
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  test('does not move commissions onto a new document', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(commissionUpdates).toHaveLength(0);
  });

  test('replaces the old PDF on the same order', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(storageRemoved).toContain('silke-uuid/old.pdf');
  });

  test('tells the office it was updated, without a retired version', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(notify).toHaveBeenCalledTimes(1);
    const [, args] = notify.mock.calls[0];
    expect(args.kind).toBe('updated');
    expect(args.document.id).toBe(OLD_ID);
    expect(args.replacedDocument).toBeUndefined();
    expect(args.actor).toMatchObject({ id: 'silke-uuid' });
  });

  test('a draft promoted to sent stays the same row and is announced as created', async () => {
    setupMocks({ oldDoc: { status: 'draft' } });
    const { PUT } = require('../documents/[id]/route');
    const res = await PUT(makePut(), PARAMS);
    const body = await res.json();
    expect(insertedPayloads).toHaveLength(0);
    expect(body.document.id).toBe(OLD_ID);
    expect(notify.mock.calls[0][1].kind).toBe('created');
    expect(updatedDocPayloads[0].activity_at).toEqual(expect.any(String));
  });

  test('does not wipe the selling agent when the form does not resend it', async () => {
    setupMocks({ oldDoc: { agent_id: 'agent-x' } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS); // body has no agent_id key
    expect(Object.prototype.hasOwnProperty.call(updatedDocPayloads[0], 'agent_id')).toBe(false);
  });

  test('never writes agent_id on a database without the column', async () => {
    setupMocks({ agentColumn: false });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ agent_id: 'agent-x' }), PARAMS);
    expect(Object.prototype.hasOwnProperty.call(updatedDocPayloads[0], 'agent_id')).toBe(false);
  });

  test('skips activity_at until that column migration is applied', async () => {
    setupMocks({ activityColumn: false });
    const { PUT } = require('../documents/[id]/route');
    const res = await PUT(makePut(), PARAMS);
    expect(res.status).toBe(200);
    expect(Object.prototype.hasOwnProperty.call(updatedDocPayloads[0], 'activity_at')).toBe(false);
    expect(insertedPayloads).toHaveLength(0);
  });
});

describe('PUT still edits drafts and non-revenue orders in place', () => {
  test('a draft saved as a draft', async () => {
    setupMocks({ oldDoc: { status: 'draft' } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ status: 'draft' }), PARAMS);
    expect(insertedPayloads).toHaveLength(0);
    expect(updatedDocPayloads[0]).toMatchObject({ status: 'draft', client_company: 'Nanau Vertriebsgesellschaft mbH' });
    expect(updatedDocPayloads[0].activity_at).toEqual(expect.any(String));
  });

  test('a consignment order (the ERP holds its id)', async () => {
    setupMocks({ oldDoc: { order_channel: 'consignment' } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ order_channel: 'consignment', consignment_agent_id: 'agent-x' }), PARAMS);
    expect(insertedPayloads).toHaveLength(0);
    expect(updatedDocPayloads[0].order_channel).toBe('consignment');
    expect(updatedDocPayloads[0].activity_at).toEqual(expect.any(String));
  });

  test('an internal order', async () => {
    setupMocks({ oldDoc: { order_channel: 'internal' } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ order_channel: 'internal' }), PARAMS);
    expect(insertedPayloads).toHaveLength(0);
    expect(updatedDocPayloads[0].activity_at).toEqual(expect.any(String));
  });
});

/**
 * @jest-environment node
 *
 * PUT /api/documents/:id — re-issue on update.
 *
 * Sam, 9 Sept 2026: Silke re-saved a week-old order and emailed it. It kept
 * its 2 September date, sat deep in the list, and the office heard nothing.
 * A re-saved committed B2B/B2C order now becomes a FRESH order (new row,
 * dated now), its commission moves onto that row, the previous version is
 * retired into Trash, and the office is told it was updated.
 *
 * Consignment / internal / write-off orders and drafts keep updating in
 * place, exactly as before.
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
  commissionMoveError = null,
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
                    return Promise.resolve({ error: commissionMoveError });
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

describe('PUT re-issues a committed B2B/B2C order', () => {
  test('creates a fresh row carrying the edit, creator, folder and agent', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    const res = await PUT(makePut(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(insertedPayloads).toHaveLength(1);
    const inserted = insertedPayloads[0];
    expect(inserted).toMatchObject({
      client_company: 'Nanau Vertriebsgesellschaft mbH',
      file_path: 'silke-uuid/new.pdf',
      total_amount: 2497.5,
      status: 'sent',
      order_channel: 'b2b',
      created_by: 'silke-uuid',
      agent_id: 'silke-uuid',
      event_id: 'evt-nordstil',
    });
    expect(inserted.metadata).toMatchObject({
      formState: { rows: [{ no: 1 }] },
      replaces_document_id: OLD_ID,
      replaces_created_at: '2026-09-02T10:00:00.000Z',
    });
    expect(body.document.id).toBe(NEW_ID);
    expect(body.reissued_from).toBe(OLD_ID);
  });

  test('retires the old version into Trash, pointing at the fresh one', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    const retire = updatedDocPayloads.find((p) => p.deleted_at);
    expect(retire).toBeTruthy();
    expect(retire.metadata).toMatchObject({ formState: { rows: [] }, replaced_by_document_id: NEW_ID });
    // No in-place edit of the old row's content.
    expect(updatedDocPayloads.some((p) => p.client_company)).toBe(false);
  });

  test('moves unpaid commissions onto the fresh row', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(commissionUpdates).toHaveLength(1);
    expect(commissionUpdates[0]).toMatchObject({
      payload: { document_id: NEW_ID },
      eq: ['document_id', OLD_ID],
      neq: ['status', 'paid'],
    });
  });

  test('keeps the old PDF so the retired version still opens from Trash', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(storageRemoved).toEqual([]);
  });

  test('tells the office it was updated and which version it replaces', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(notify).toHaveBeenCalledTimes(1);
    const [, args] = notify.mock.calls[0];
    expect(args.kind).toBe('updated');
    expect(args.document.id).toBe(NEW_ID);
    expect(args.replacedDocument.id).toBe(OLD_ID);
    expect(args.actor).toMatchObject({ id: 'silke-uuid' });
  });

  test('a draft promoted to sent is re-issued and announced as created', async () => {
    setupMocks({ oldDoc: { status: 'draft' } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(insertedPayloads).toHaveLength(1);
    expect(notify.mock.calls[0][1].kind).toBe('created');
  });

  test('keeps the selling agent when the form does not resend it', async () => {
    setupMocks({ oldDoc: { agent_id: 'agent-x' } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS); // body has no agent_id key
    expect(insertedPayloads[0].agent_id).toBe('agent-x');
  });

  test('never writes agent_id on a database without the column', async () => {
    setupMocks({ agentColumn: false });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS);
    expect(Object.prototype.hasOwnProperty.call(insertedPayloads[0], 'agent_id')).toBe(false);
  });

  test('a failed commission move is recorded, and the fresh order still returns', async () => {
    setupMocks({ commissionMoveError: { message: 'boom', code: 'XX000' } });
    const { PUT } = require('../documents/[id]/route');
    const res = await PUT(makePut(), PARAMS);
    expect(res.status).toBe(200);
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({
      source: 'documents_put_reissue_commission_move',
      severity: 'error',
    }));
  });
});

describe('PUT still edits in place where a re-issue would be wrong', () => {
  test('a draft saved as a draft', async () => {
    setupMocks({ oldDoc: { status: 'draft' } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ status: 'draft' }), PARAMS);
    expect(insertedPayloads).toHaveLength(0);
    expect(updatedDocPayloads[0]).toMatchObject({ status: 'draft', client_company: 'Nanau Vertriebsgesellschaft mbH' });
  });

  test('a consignment order (the ERP holds its id)', async () => {
    setupMocks({ oldDoc: { order_channel: 'consignment' } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ order_channel: 'consignment', consignment_agent_id: 'agent-x' }), PARAMS);
    expect(insertedPayloads).toHaveLength(0);
    expect(updatedDocPayloads[0].order_channel).toBe('consignment');
  });

  test('an internal order', async () => {
    setupMocks({ oldDoc: { order_channel: 'internal' } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ order_channel: 'internal' }), PARAMS);
    expect(insertedPayloads).toHaveLength(0);
  });

  test('when the caller asks for it explicitly (reissue: false)', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    const res = await PUT(makePut({ reissue: false }), PARAMS);
    expect(res.status).toBe(200);
    expect(insertedPayloads).toHaveLength(0);
    expect(updatedDocPayloads[0].file_path).toBe('silke-uuid/new.pdf');
    // In-place edits still drop the replaced PDF, as before.
    expect(storageRemoved).toContain('silke-uuid/old.pdf');
  });
});

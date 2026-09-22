/**
 * @jest-environment node
 *
 * PUT /api/documents/:id — "No agent" on an existing order.
 *
 * Sam, 22 Sep 2026: choosing "No agent" cleared agent_id but the order stayed
 * on Bastian's page, because the commission recalc fell back to the creator
 * and the agent list is built from created_by + commissions. The explicit
 * choice is now stored as metadata.no_agent, the pending commission is
 * removed, and a later "keep current agent" save does not drop the flag.
 */

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const PARAMS = { params: Promise.resolve({ id: DOC_ID }) };

let updatedDocPayloads;
let removed;
let upserts;

function setupMocks({ oldDoc: oldDocOverrides = {}, isAdmin = true } = {}) {
  const oldDoc = {
    id: DOC_ID,
    created_at: '2026-09-02T10:00:00.000Z',
    created_by: 'bastian-uuid',
    agent_id: 'bastian-uuid',
    event_id: null,
    status: 'sent',
    order_channel: 'b2b',
    total_amount: 1000,
    file_path: 'bastian-uuid/old.pdf',
    client_company: 'Goldschmiede Hecken',
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
          update: jest.fn((payload) => {
            updatedDocPayloads.push(payload);
            return {
              eq: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({ data: { ...oldDoc, ...payload }, error: null }),
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
    storage: { from: jest.fn(() => ({ remove: jest.fn(async () => ({})) })) },
  };

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn().mockResolvedValue({}),
    createAdminClient: jest.fn(() => adminClient),
  }));
  jest.doMock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
  jest.doMock('@/app/api/_lib/access', () => ({
    getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-uuid', email: 'sam@love-lab.com' }, isAdmin }),
    isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
    requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
    canAccessDocument: jest.fn().mockResolvedValue({ allowed: true }),
    resolveAgentFolderEventId: jest.fn().mockResolvedValue(null),
  }));
  // The real rule, in miniature: the flag wins, otherwise the creator (an agent) is credited.
  jest.doMock('@/lib/commissionAttribution', () => ({
    resolveCommissionAgent: jest.fn(async (_admin, doc) => (doc?.metadata?.no_agent === true
      ? null
      : { agentId: doc.agent_id || doc.created_by, profile: { id: doc.agent_id || doc.created_by }, via: 'test' })),
    upsertCommissionForDocument: jest.fn(async (_a, args) => { upserts.push(args); return { upserted: true }; }),
    removePendingOrderCommissions: jest.fn(async (_a, id) => { removed.push(id); return { deleted: 1 }; }),
  }));
  jest.doMock('@/lib/newClientBonus', () => ({ maybeCreateBonusForOrder: jest.fn() }));
  jest.doMock('@/lib/agentIdColumn', () => ({
    documentsHaveAgentIdColumn: jest.fn().mockResolvedValue(true),
    normalizeAgentId: jest.fn(async (_admin, v) => v ?? null),
  }));
  jest.doMock('@/lib/activityAtColumn', () => ({ documentsHaveActivityAtColumn: jest.fn().mockResolvedValue(true) }));
  jest.doMock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn().mockResolvedValue({ ok: true }) }));
  jest.doMock('@/lib/orderNotices', () => ({ notifyOrderEvent: jest.fn().mockResolvedValue({ sent: false }) }));
  jest.doMock('@/lib/lovelab-sync', () => ({ syncConsignmentToLovelab: jest.fn() }));
}

function makePut(extra = {}) {
  return new global.Request(`http://localhost/api/documents/${DOC_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: null,
      client_name: 'Hecken',
      client_company: 'Goldschmiede Hecken',
      document_type: 'order',
      file_path: 'bastian-uuid/new.pdf',
      file_name: 'Goldschmiede_Hecken_Order.pdf',
      total_amount: 1000,
      order_channel: 'b2b',
      status: 'sent',
      metadata: { formState: { rows: [{ no: 1 }] } },
      ...extra,
    }),
  });
}

beforeEach(() => {
  jest.resetModules();
  updatedDocPayloads = [];
  removed = [];
  upserts = [];
  delete process.env.RESEND_API_KEY;
});

describe('PUT with "No agent"', () => {
  test('stores the choice, clears agent_id, removes the pending commission and credits nobody', async () => {
    setupMocks();
    const { PUT } = require('../documents/[id]/route');
    const res = await PUT(makePut({ agent_id: null }), PARAMS);
    expect(res.status).toBe(200);
    const payload = updatedDocPayloads[0];
    expect(payload.agent_id).toBeNull();
    expect(payload.metadata.no_agent).toBe(true);
    expect(payload.metadata.formState.rows).toEqual([{ no: 1 }]);
    expect(removed).toEqual([DOC_ID]);
    expect(upserts).toEqual([]);
  });

  test('choosing an agent again clears the flag and credits them', async () => {
    setupMocks({ oldDoc: { agent_id: null, metadata: { no_agent: true, formState: {} } } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ agent_id: 'bastian-uuid' }), PARAMS);
    const payload = updatedDocPayloads[0];
    expect(payload.agent_id).toBe('bastian-uuid');
    expect(payload.metadata.no_agent).toBeUndefined();
    expect(removed).toEqual([]);
    expect(upserts[0]).toMatchObject({ agentId: 'bastian-uuid' });
  });

  test('a "keep current agent" re-save keeps the flag', async () => {
    setupMocks({ oldDoc: { agent_id: null, metadata: { no_agent: true, formState: {} } } });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut(), PARAMS); // no agent_id key at all
    const payload = updatedDocPayloads[0];
    expect(payload.agent_id).toBeUndefined();
    expect(payload.metadata.no_agent).toBe(true);
    expect(upserts).toEqual([]);
  });

  test('a non-admin sending null does not detach the order', async () => {
    setupMocks({ isAdmin: false });
    const { PUT } = require('../documents/[id]/route');
    await PUT(makePut({ agent_id: null }), PARAMS);
    const payload = updatedDocPayloads[0];
    expect(payload.metadata.no_agent).toBeUndefined();
    expect(removed).toEqual([]);
  });
});

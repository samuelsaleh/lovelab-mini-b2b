/**
 * @jest-environment node
 *
 * Documents update routes must keep commission rows in sync with the
 * document's revenue channel. Internal, consignment, write-off, and zero-total
 * orders are not commissionable, so editing/moving a document into one of
 * those channels must cancel unpaid stale rows instead of leaving them payable.
 */

const DOC_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let fetchedDocument;
let updatedDocument;
let documentUpdatePayload;
let commissionUpdateError = null;

const documentUpdateMock = jest.fn();
const commissionUpdateMock = jest.fn();
const commissionEqMock = jest.fn();
const commissionNeqMock = jest.fn();

const resolveCommissionAgentMock = jest.fn();
const upsertCommissionForDocumentMock = jest.fn();
const maybeCreateBonusForOrderMock = jest.fn();
const recordHealthEventMock = jest.fn().mockResolvedValue({ ok: true });

function makeDocumentsTable() {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({ data: fetchedDocument, error: null }),
      })),
    })),
    update: documentUpdateMock.mockImplementation((patch) => {
      documentUpdatePayload = patch;
      return {
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: updatedDocument, error: null }),
          })),
        })),
      };
    }),
  };
}

function makeCommissionsTable() {
  return {
    update: commissionUpdateMock.mockImplementation((patch) => ({
      eq: commissionEqMock.mockImplementation((col, val) => ({
        neq: commissionNeqMock.mockResolvedValue({
          data: null,
          error: commissionUpdateError,
          patch,
          col,
          val,
        }),
      })),
    })),
  };
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'documents') return makeDocumentsTable();
    if (table === 'agent_commissions') return makeCommissionsTable();
    throw new Error(`unexpected table: ${table}`);
  }),
  storage: {
    from: jest.fn(() => ({ remove: jest.fn().mockResolvedValue({ error: null }) })),
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-user' }, isAdmin: true }),
  isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
  requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock('@/lib/lovelab-sync', () => ({
  syncConsignmentToLovelab: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock('@/lib/commissionAttribution', () => ({
  resolveCommissionAgent: (...args) => resolveCommissionAgentMock(...args),
  upsertCommissionForDocument: (...args) => upsertCommissionForDocumentMock(...args),
}));

jest.mock('@/lib/newClientBonus', () => ({
  maybeCreateBonusForOrder: (...args) => maybeCreateBonusForOrderMock(...args),
}));

jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: (...args) => recordHealthEventMock(...args),
}));

const { PUT, PATCH } = require('../documents/[id]/route');

function makeRequest(body, method = 'PUT') {
  return new global.Request(`http://localhost/api/documents/${DOC_ID}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchedDocument = { id: DOC_ID, file_path: null, created_by: 'user-1', event_id: null, metadata: {} };
  updatedDocument = {
    id: DOC_ID,
    created_by: 'user-1',
    event_id: null,
    total_amount: 1000,
    order_channel: 'b2b',
    metadata: {},
  };
  documentUpdatePayload = null;
  commissionUpdateError = null;
  resolveCommissionAgentMock.mockResolvedValue({
    agentId: 'agent-1',
    profile: { id: 'agent-1', commission_rate: 10, agent_status: 'active' },
  });
  upsertCommissionForDocumentMock.mockResolvedValue({ upserted: true });
  maybeCreateBonusForOrderMock.mockResolvedValue({ skipped: true, reason: 'feature_disabled' });
});

describe('PUT /api/documents/:id commission channel sync', () => {
  test('write-off replacements keep order_channel and cancel unpaid linked commissions', async () => {
    updatedDocument = { ...updatedDocument, order_channel: 'delete_from_stock' };

    const res = await PUT(makeRequest({
      event_id: null,
      client_name: 'Write-off',
      client_company: null,
      document_type: 'order',
      file_path: 'orders/write-off.pdf',
      file_name: 'write-off.pdf',
      file_size: 123,
      total_amount: 1000,
      metadata: { writeOffComment: 'Gifted sample' },
      order_channel: 'delete_from_stock',
    }), { params: Promise.resolve({ id: DOC_ID }) });

    expect(res.status).toBe(200);
    expect(documentUpdatePayload.order_channel).toBe('delete_from_stock');
    expect(commissionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', notes: expect.stringContaining('delete_from_stock') }),
    );
    expect(commissionEqMock).toHaveBeenCalledWith('document_id', DOC_ID);
    expect(commissionNeqMock).toHaveBeenCalledWith('status', 'paid');
    expect(resolveCommissionAgentMock).not.toHaveBeenCalled();
    expect(upsertCommissionForDocumentMock).not.toHaveBeenCalled();
    expect(maybeCreateBonusForOrderMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/documents/:id commission channel sync', () => {
  test('moving a document to an internal channel cancels unpaid linked commissions', async () => {
    updatedDocument = { ...updatedDocument, order_channel: 'internal' };

    const res = await PATCH(makeRequest({ order_channel: 'internal' }, 'PATCH'), {
      params: Promise.resolve({ id: DOC_ID }),
    });

    expect(res.status).toBe(200);
    expect(documentUpdatePayload.order_channel).toBe('internal');
    expect(commissionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', notes: expect.stringContaining('internal') }),
    );
    expect(resolveCommissionAgentMock).not.toHaveBeenCalled();
    expect(upsertCommissionForDocumentMock).not.toHaveBeenCalled();
  });

  test('moving a document back to B2B recalculates the order commission', async () => {
    updatedDocument = { ...updatedDocument, order_channel: 'b2b', total_amount: 1000 };

    const res = await PATCH(makeRequest({ order_channel: 'b2b' }, 'PATCH'), {
      params: Promise.resolve({ id: DOC_ID }),
    });

    expect(res.status).toBe(200);
    expect(commissionUpdateMock).not.toHaveBeenCalled();
    expect(resolveCommissionAgentMock).toHaveBeenCalledWith(mockAdminSupabase, updatedDocument);
    expect(upsertCommissionForDocumentMock).toHaveBeenCalledWith(mockAdminSupabase, {
      document: updatedDocument,
      profile: expect.objectContaining({ id: 'agent-1' }),
      agentId: 'agent-1',
    });
  });
});

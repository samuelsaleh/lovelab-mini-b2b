/**
 * @jest-environment node
 */

const mockAdminSupabase = {
  from: jest.fn(),
  storage: { from: jest.fn(() => ({ remove: jest.fn().mockResolvedValue({ error: null }) })) },
};

const mockResolveCommissionAgent = jest.fn();
const mockUpsertCommissionForDocument = jest.fn();
const mockCancelNonPayableCommissionsForDocument = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-user' }, isAdmin: true }),
  isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
  requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
  getAccessibleEventIds: jest.fn().mockResolvedValue([]),
  resolveAgentIds: jest.fn().mockResolvedValue(['admin-user']),
}));

jest.mock('@/lib/lovelab-sync', () => ({
  syncConsignmentToLovelab: jest.fn(),
  syncGiftLostToLovelab: jest.fn(),
}));

jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/lib/newClientBonus', () => ({
  maybeCreateBonusForOrder: jest.fn().mockResolvedValue({ skipped: true }),
}));

jest.mock('@/lib/commissionAttribution', () => {
  const actual = jest.requireActual('@/lib/commissionAttribution');
  return {
    ...actual,
    resolveCommissionAgent: mockResolveCommissionAgent,
    upsertCommissionForDocument: mockUpsertCommissionForDocument,
    cancelNonPayableCommissionsForDocument: mockCancelNonPayableCommissionsForDocument,
  };
});

const { POST } = require('../documents/route');
const { PUT, PATCH } = require('../documents/[id]/route');

const DOC_ID = '11111111-1111-4111-8111-111111111111';

function makeRequest(url, method, body) {
  return new global.Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function chainReturning(result) {
  const chain = {};
  const ret = () => chain;
  chain.select = jest.fn(ret);
  chain.eq = jest.fn(ret);
  chain.neq = jest.fn(ret);
  chain.insert = jest.fn(ret);
  chain.update = jest.fn(ret);
  chain.single = jest.fn().mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveCommissionAgent.mockResolvedValue({
    agentId: 'agent-1',
    profile: { id: 'agent-1', commission_rate: 10 },
  });
  mockUpsertCommissionForDocument.mockResolvedValue({ upserted: true });
  mockCancelNonPayableCommissionsForDocument.mockResolvedValue({ cancelled: true });
});

describe('document commission lifecycle', () => {
  test('POST does not create commission rows for quotes', async () => {
    const insertedQuote = {
      id: DOC_ID,
      document_type: 'quote',
      order_channel: 'b2b',
      total_amount: 1250,
      created_by: 'admin-user',
      event_id: null,
    };
    mockAdminSupabase.from.mockImplementation((table) => {
      if (table === 'documents') {
        return chainReturning({ data: insertedQuote, error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await POST(makeRequest('http://localhost/api/documents', 'POST', {
      client_name: 'Client',
      document_type: 'quote',
      file_path: 'admin-user/quote.pdf',
      file_name: 'quote.pdf',
      total_amount: 1250,
      order_channel: 'b2b',
    }));

    expect(res.status).toBe(200);
    expect(mockResolveCommissionAgent).not.toHaveBeenCalled();
    expect(mockUpsertCommissionForDocument).not.toHaveBeenCalled();
  });

  test('PUT cancels instead of creating commissions for write-off orders', async () => {
    const oldDoc = { file_path: 'admin-user/old.pdf', created_by: 'admin-user', event_id: null };
    const updatedWriteOff = {
      id: DOC_ID,
      document_type: 'order',
      order_channel: 'delete_from_stock',
      total_amount: 1250,
      created_by: 'admin-user',
      event_id: null,
    };
    const fetchChain = chainReturning({ data: oldDoc, error: null });
    const updateChain = chainReturning({ data: updatedWriteOff, error: null });
    const chains = [fetchChain, updateChain];
    mockAdminSupabase.from.mockImplementation((table) => {
      if (table === 'documents') return chains.shift();
      throw new Error(`unexpected table ${table}`);
    });

    const res = await PUT(
      makeRequest(`http://localhost/api/documents/${DOC_ID}`, 'PUT', {
        client_name: 'Write-off',
        document_type: 'order',
        file_path: 'admin-user/new.pdf',
        file_name: 'writeoff.pdf',
        total_amount: 1250,
        metadata: { writeOffComment: 'Gifted' },
        order_channel: 'delete_from_stock',
      }),
      { params: { id: DOC_ID } },
    );

    expect(res.status).toBe(200);
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      order_channel: 'delete_from_stock',
    }));
    expect(mockResolveCommissionAgent).not.toHaveBeenCalled();
    expect(mockUpsertCommissionForDocument).not.toHaveBeenCalled();
    expect(mockCancelNonPayableCommissionsForDocument).toHaveBeenCalledWith(
      mockAdminSupabase,
      DOC_ID,
      'Auto-cancelled because the linked document is no longer commissionable.',
    );
  });

  test('PATCH moving an order to internal cancels non-paid commissions', async () => {
    const existingDoc = { id: DOC_ID, created_by: 'admin-user', event_id: null, metadata: {} };
    const updatedInternal = {
      id: DOC_ID,
      document_type: 'order',
      order_channel: 'internal',
      total_amount: 1250,
      created_by: 'admin-user',
      event_id: null,
      metadata: {},
    };
    const chains = [
      chainReturning({ data: existingDoc, error: null }),
      chainReturning({ data: updatedInternal, error: null }),
    ];
    mockAdminSupabase.from.mockImplementation((table) => {
      if (table === 'documents') return chains.shift();
      throw new Error(`unexpected table ${table}`);
    });

    const res = await PATCH(
      makeRequest(`http://localhost/api/documents/${DOC_ID}`, 'PATCH', {
        order_channel: 'internal',
      }),
      { params: { id: DOC_ID } },
    );

    expect(res.status).toBe(200);
    expect(mockResolveCommissionAgent).not.toHaveBeenCalled();
    expect(mockUpsertCommissionForDocument).not.toHaveBeenCalled();
    expect(mockCancelNonPayableCommissionsForDocument).toHaveBeenCalledWith(
      mockAdminSupabase,
      DOC_ID,
      'Auto-cancelled because the linked document is no longer commissionable.',
    );
  });
});

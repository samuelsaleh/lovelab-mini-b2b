/**
 * @jest-environment node
 *
 * /api/documents/bulk-file  PATCH
 *
 * Files many orders into one fair in a single request, keeping the agent link.
 * The agent forgot to put a batch of orders in the fair folder; the admin ticks
 * them in All Documents and picks the fair.
 *
 * Coverage:
 *   ✓ 401 / 403 auth gates, 429 when rate limited
 *   ✓ 400 on invalid JSON, missing/invalid event_id, missing/empty/oversized
 *     ids, non-UUID ids; duplicates collapsed
 *   ✓ 404 when the target event does not exist
 *   ✓ the update writes ONLY event_id — agent_id is never in the payload
 *   ✓ drafts, trashed rows and rows already in that fair are skipped
 *   ✓ ids that matched nothing come back in not_found
 *   ✓ event_id: null unfiles
 *   ✓ commissions are recomputed for revenue orders only; a recalc failure
 *     is recorded as a health event and never fails the request
 *   ✓ 500 when the update fails
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';
let rateLimitResponse = null;

let eventRow = null;
let eventError = null;
let docRows = [];
let docFetchError = null;
let updatePayload = null;
let updateInIds = null;
let updateError = null;
let updateReturnRows = null;

const resolveCommissionAgent = jest.fn();
const upsertCommissionForDocument = jest.fn();
const recordHealthEvent = jest.fn(() => Promise.resolve());

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() => Promise.resolve({ data: currentUser ? { role: currentRole } : null, error: null })),
      };
    }
    if (table === 'events') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(() => Promise.resolve({ data: eventRow, error: eventError })),
      };
    }
    if (table === 'documents') {
      const chain = {};
      chain.select = jest.fn(() => chain);
      chain.in = jest.fn((col, val) => {
        if (chain._updating) updateInIds = val;
        return chain;
      });
      chain.update = jest.fn((payload) => {
        chain._updating = true;
        updatePayload = payload;
        return chain;
      });
      chain.then = (resolve) => {
        if (chain._updating) {
          const rows = updateReturnRows ?? docRows
            .filter((d) => (updateInIds || []).includes(d.id))
            .map((d) => ({ ...d, event_id: updatePayload.event_id }));
          return resolve({ data: updateError ? null : rows, error: updateError });
        }
        return resolve({ data: docFetchError ? null : docRows, error: docFetchError });
      };
      return chain;
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: currentUser } })) },
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => rateLimitResponse) }));
jest.mock('@/lib/commissionAttribution', () => ({
  resolveCommissionAgent: (...a) => resolveCommissionAgent(...a),
  upsertCommissionForDocument: (...a) => upsertCommissionForDocument(...a),
}));
jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: (...a) => recordHealthEvent(...a) }));

const { PATCH, MAX_BULK_IDS } = require('../documents/bulk-file/route');

const FAIR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_FAIR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';
const ID_C = '33333333-3333-3333-3333-333333333333';
const ID_D = '44444444-4444-4444-4444-444444444444';

function makeRequest(body, opts = {}) {
  return new global.Request('http://localhost/api/documents/bulk-file', {
    method: 'PATCH',
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const sentOrder = (id, over = {}) => ({
  id, status: 'sent', deleted_at: null, event_id: null,
  agent_id: 'agent-nicolas', created_by: 'agent-nicolas',
  total_amount: 1000, order_channel: 'b2b', document_type: 'order',
  ...over,
});

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  rateLimitResponse = null;
  eventRow = { id: FAIR, name: 'Bijorhca Sept 2026', type: 'fair' };
  eventError = null;
  docRows = [sentOrder(ID_A), sentOrder(ID_B)];
  docFetchError = null;
  updatePayload = null;
  updateInIds = null;
  updateError = null;
  updateReturnRows = null;
  resolveCommissionAgent.mockReset();
  resolveCommissionAgent.mockResolvedValue({ agentId: 'agent-nicolas', profile: { id: 'agent-nicolas' } });
  upsertCommissionForDocument.mockReset();
  upsertCommissionForDocument.mockResolvedValue({});
  recordHealthEvent.mockClear();
  mockAdminSupabase.from.mockClear();
});

describe('PATCH /api/documents/bulk-file — access + validation', () => {
  test('401 when no session', async () => {
    currentUser = null;
    expect((await PATCH(makeRequest({ ids: [ID_A], event_id: FAIR }))).status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'agent';
    expect((await PATCH(makeRequest({ ids: [ID_A], event_id: FAIR }))).status).toBe(403);
    expect(updatePayload).toBeNull();
  });

  test('429 when rate limited', async () => {
    const { NextResponse } = require('next/server');
    rateLimitResponse = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    expect((await PATCH(makeRequest({ ids: [ID_A], event_id: FAIR }))).status).toBe(429);
  });

  test('400 when body is not valid JSON', async () => {
    expect((await PATCH(makeRequest(null, { raw: 'nope' }))).status).toBe(400);
  });

  test('400 when event_id is missing', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/event_id is required/i);
  });

  test('400 when event_id is not a UUID', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A], event_id: 'bijorhca' }));
    expect(res.status).toBe(400);
  });

  test('400 when ids is missing, empty, not an array, or oversized', async () => {
    expect((await PATCH(makeRequest({ event_id: FAIR }))).status).toBe(400);
    expect((await PATCH(makeRequest({ ids: [], event_id: FAIR }))).status).toBe(400);
    expect((await PATCH(makeRequest({ ids: ID_A, event_id: FAIR }))).status).toBe(400);
    const many = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) =>
      `${String(i).padStart(8, '0')}-1111-1111-1111-111111111111`);
    const res = await PATCH(makeRequest({ ids: many, event_id: FAIR }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too many ids/i);
  });

  test('400 when any id is not a UUID', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A, 'nope'], event_id: FAIR }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid uuids/i);
  });

  test('404 when the target event does not exist', async () => {
    eventRow = null;
    const res = await PATCH(makeRequest({ ids: [ID_A], event_id: FAIR }));
    expect(res.status).toBe(404);
    expect(updatePayload).toBeNull();
  });

  test('duplicate ids are collapsed', async () => {
    docRows = [sentOrder(ID_A)];
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_A, ID_A], event_id: FAIR }));
    expect(res.status).toBe(200);
    expect(updateInIds).toEqual([ID_A]);
    expect((await res.json()).updated_count).toBe(1);
  });
});

describe('PATCH /api/documents/bulk-file — filing', () => {
  test('writes only event_id — the agent link is never touched', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_B], event_id: FAIR }));
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({ event_id: FAIR });
    expect(Object.keys(updatePayload)).not.toContain('agent_id');
    expect(Object.keys(updatePayload)).not.toContain('created_by');
    expect(Object.keys(updatePayload)).not.toContain('order_channel');
    expect(updateInIds).toEqual([ID_A, ID_B]);
    const body = await res.json();
    expect(body.updated_count).toBe(2);
    expect(body.updated_ids).toEqual([ID_A, ID_B]);
    expect(body.event).toEqual({ id: FAIR, name: 'Bijorhca Sept 2026', type: 'fair' });
    expect(body.not_found).toEqual([]);
  });

  test('re-files an order already sitting in another fair', async () => {
    docRows = [sentOrder(ID_A, { event_id: OTHER_FAIR })];
    const res = await PATCH(makeRequest({ ids: [ID_A], event_id: FAIR }));
    expect(res.status).toBe(200);
    expect(updateInIds).toEqual([ID_A]);
  });

  test('skips drafts, trashed rows and rows already in that fair', async () => {
    docRows = [
      sentOrder(ID_A),
      sentOrder(ID_B, { status: 'draft' }),
      sentOrder(ID_C, { deleted_at: '2026-09-01T00:00:00Z' }),
      sentOrder(ID_D, { event_id: FAIR }),
    ];
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_B, ID_C, ID_D], event_id: FAIR }));
    expect(res.status).toBe(200);
    expect(updateInIds).toEqual([ID_A]);
    const body = await res.json();
    expect(body.updated_count).toBe(1);
    expect(body.skipped).toEqual(expect.arrayContaining([
      { id: ID_B, reason: 'draft' },
      { id: ID_C, reason: 'trashed' },
      { id: ID_D, reason: 'already_filed' },
    ]));
  });

  test('when everything is skipped no update is issued', async () => {
    docRows = [sentOrder(ID_A, { event_id: FAIR })];
    const res = await PATCH(makeRequest({ ids: [ID_A], event_id: FAIR }));
    expect(res.status).toBe(200);
    expect(updatePayload).toBeNull();
    expect((await res.json()).updated_count).toBe(0);
  });

  test('ids that matched no document come back in not_found', async () => {
    docRows = [sentOrder(ID_A)];
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_C], event_id: FAIR }));
    const body = await res.json();
    expect(body.updated_count).toBe(1);
    expect(body.not_found).toEqual([ID_C]);
  });

  test('event_id: null takes the orders out of their fair without touching events', async () => {
    docRows = [sentOrder(ID_A, { event_id: FAIR })];
    const res = await PATCH(makeRequest({ ids: [ID_A], event_id: null }));
    expect(res.status).toBe(200);
    expect(updatePayload).toEqual({ event_id: null });
    expect(mockAdminSupabase.from.mock.calls.map((c) => c[0])).not.toContain('events');
    expect((await res.json()).event).toBeNull();
  });

  test('500 when the update fails', async () => {
    updateError = { message: 'boom' };
    expect((await PATCH(makeRequest({ ids: [ID_A], event_id: FAIR }))).status).toBe(500);
  });

  test('500 when the document lookup fails', async () => {
    docFetchError = { message: 'boom' };
    expect((await PATCH(makeRequest({ ids: [ID_A], event_id: FAIR }))).status).toBe(500);
  });
});

describe('PATCH /api/documents/bulk-file — commissions', () => {
  test('recomputes the commission of every filed revenue order', async () => {
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_B], event_id: FAIR }));
    expect(res.status).toBe(200);
    expect(resolveCommissionAgent).toHaveBeenCalledTimes(2);
    expect(upsertCommissionForDocument).toHaveBeenCalledTimes(2);
    const [, args] = upsertCommissionForDocument.mock.calls[0];
    expect(args.document.id).toBe(ID_A);
    expect(args.document.event_id).toBe(FAIR);
    expect(args.document.agent_id).toBe('agent-nicolas');
    expect(args.agentId).toBe('agent-nicolas');
    expect((await res.json()).commissions_refreshed).toBe(2);
  });

  test('leaves internal, consignment and zero-amount rows alone', async () => {
    docRows = [
      sentOrder(ID_A, { order_channel: 'internal' }),
      sentOrder(ID_B, { order_channel: 'consignment' }),
      sentOrder(ID_C, { total_amount: 0 }),
    ];
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_B, ID_C], event_id: FAIR }));
    expect(res.status).toBe(200);
    expect(resolveCommissionAgent).not.toHaveBeenCalled();
    expect((await res.json()).commissions_refreshed).toBe(0);
  });

  test('a recalc failure is recorded and never fails the filing', async () => {
    resolveCommissionAgent.mockRejectedValueOnce(new Error('ledger down'));
    const res = await PATCH(makeRequest({ ids: [ID_A, ID_B], event_id: FAIR }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated_count).toBe(2);
    expect(body.commissions_refreshed).toBe(1);
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({
      source: 'documents_bulk_file_commission_recalc',
      severity: 'warn',
      context: { documentId: ID_A, eventId: FAIR },
    }));
  });
});

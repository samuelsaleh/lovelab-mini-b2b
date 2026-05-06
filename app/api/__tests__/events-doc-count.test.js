/**
 * @jest-environment node
 *
 * /api/events GET — doc_count regression test
 *
 * Phase 12 fix. The legacy `documents(count)` join included soft-deleted and
 * internal/consignment/delete_from_stock orders. The new code does a separate
 * counted query that mirrors the default /api/documents filters so the sidebar
 * count and the click-through always agree.
 */

let countQueryFilters = [];
let countResultRows = [];

function buildEventsTableMock() {
  const chain = {};
  const ret = () => chain;
  chain.select = jest.fn(ret);
  chain.order = jest.fn(() =>
    Promise.resolve({
      data: [
        { id: 'evt-1', name: 'Trade Show', type: 'fair', created_by: 'admin-user' },
        { id: 'evt-2', name: 'Empty Event', type: 'fair', created_by: 'admin-user' },
      ],
      error: null,
    }),
  );
  return chain;
}

function buildDocumentsCountMock() {
  const chain = {};
  const ret = () => chain;
  chain.select = jest.fn((cols) => {
    countQueryFilters.push({ kind: 'select', cols });
    return chain;
  });
  chain.in = jest.fn((col, vals) => {
    countQueryFilters.push({ kind: 'in', col, vals });
    return chain;
  });
  chain.is = jest.fn((col, val) => {
    countQueryFilters.push({ kind: 'is', col, val });
    return chain;
  });
  chain.not = jest.fn((col, op, val) => {
    countQueryFilters.push({ kind: 'not', col, op, val });
    return Promise.resolve({ data: countResultRows, error: null });
  });
  return chain;
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'events') return buildEventsTableMock();
    if (table === 'documents') return buildDocumentsCountMock();
    if (table === 'event_access') {
      return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-user' }, isAdmin: true }),
  resolveAgentIds: jest.fn().mockResolvedValue(['admin-user']),
}));

const { GET } = require('../events/route');

function makeRequest() {
  return new global.Request('http://localhost/api/events');
}

beforeEach(() => {
  countQueryFilters = [];
  countResultRows = [];
});

describe('/api/events GET — doc_count', () => {
  test('returns doc_count: 0 for events with no matching docs', async () => {
    countResultRows = []; // no docs
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.events).toHaveLength(2);
    expect(body.events.every((e) => e.doc_count === 0)).toBe(true);
  });

  test('returns accurate doc_count by aggregating event_id rows', async () => {
    countResultRows = [
      { event_id: 'evt-1' },
      { event_id: 'evt-1' },
      { event_id: 'evt-1' },
      { event_id: 'evt-1' },
      { event_id: 'evt-1' },
      // evt-2 has no docs
    ];
    const res = await GET(makeRequest());
    const body = await res.json();

    const e1 = body.events.find((e) => e.id === 'evt-1');
    const e2 = body.events.find((e) => e.id === 'evt-2');
    expect(e1.doc_count).toBe(5);
    expect(e2.doc_count).toBe(0);
  });

  test('count query excludes soft-deleted documents', async () => {
    await GET(makeRequest());
    const isFilter = countQueryFilters.find((f) => f.kind === 'is');
    expect(isFilter).toEqual({ kind: 'is', col: 'deleted_at', val: null });
  });

  test('count query excludes internal/consignment/delete_from_stock channels', async () => {
    await GET(makeRequest());
    const notFilter = countQueryFilters.find((f) => f.kind === 'not' && f.col === 'order_channel');
    expect(notFilter).toBeDefined();
    expect(notFilter.op).toBe('in');
    expect(notFilter.val).toContain('internal');
    expect(notFilter.val).toContain('consignment');
    expect(notFilter.val).toContain('delete_from_stock');
  });

  test('count query restricts to the events being returned', async () => {
    await GET(makeRequest());
    const inFilter = countQueryFilters.find((f) => f.kind === 'in' && f.col === 'event_id');
    expect(inFilter).toBeDefined();
    expect(inFilter.vals).toEqual(['evt-1', 'evt-2']);
  });
});

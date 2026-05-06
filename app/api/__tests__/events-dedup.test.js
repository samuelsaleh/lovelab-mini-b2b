/**
 * @jest-environment node
 *
 * /api/events POST — Phase 13 dedup behaviour
 *
 * The "two Corinne entries" bug from Sam: the sidebar / event picker showed
 * the same agent twice because POST /api/events happily inserted a second
 * row with the same name and same organisation_id. POST is now idempotent
 * for type='agent' events: same name + same org returns the existing row.
 */

let dedupRowsToReturn = [];
let insertCalls = [];

function buildEventsTableMock() {
  // The route does either a dedup probe (select+ilike+eq/is) or an insert.
  // We discriminate by tracking which terminal method is reached.
  const chain = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.ilike = jest.fn(() => chain);
  chain.is = jest.fn(() => Promise.resolve({ data: dedupRowsToReturn, error: null }));
  // For the eq() that resolves the dedup probe (when org_id is set):
  // we override the second eq to be a thenable that resolves to dedup rows.
  // Simpler: track call count and route accordingly.
  let eqCount = 0;
  chain.eq = jest.fn((col, val) => {
    eqCount += 1;
    // After the second eq() (type=agent + organization_id=x), the dedup
    // probe is fully built and awaited. Return a thenable for that case.
    if (eqCount >= 2) {
      return Promise.resolve({ data: dedupRowsToReturn, error: null });
    }
    return chain;
  });

  chain.insert = jest.fn((row) => {
    insertCalls.push(row);
    return {
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: 'newly-created-event', ...row },
          error: null,
        }),
      }),
    };
  });

  return chain;
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'events') return buildEventsTableMock();
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

const { POST } = require('../events/route');

function makeRequest(body) {
  return new global.Request('http://localhost/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  dedupRowsToReturn = [];
  insertCalls = [];
});

describe('/api/events POST — Phase 13 dedup', () => {
  test('inserts a new agent event when none exists with the same name+org', async () => {
    dedupRowsToReturn = [];
    const res = await POST(
      makeRequest({ name: 'Corinne', type: 'agent', organization_id: 'org-1' }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].name).toBe('Corinne');
    expect(insertCalls[0].organization_id).toBe('org-1');
    expect(body.event.id).toBe('newly-created-event');
    expect(body.deduplicated).toBeUndefined();
  });

  test('returns the existing event idempotently when same agent name+org already exists', async () => {
    dedupRowsToReturn = [
      { id: 'existing-corinne', name: 'Corinne', type: 'agent', organization_id: 'org-1' },
    ];
    const res = await POST(
      makeRequest({ name: 'Corinne', type: 'agent', organization_id: 'org-1' }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(0);
    expect(body.event.id).toBe('existing-corinne');
    expect(body.deduplicated).toBe(true);
  });

  test('matches case-insensitively after trim', async () => {
    dedupRowsToReturn = [
      { id: 'existing-corinne', name: 'Corinne', type: 'agent', organization_id: 'org-1' },
    ];
    const res = await POST(
      makeRequest({ name: '  CORINNE  ', type: 'agent', organization_id: 'org-1' }),
    );
    const body = await res.json();
    expect(insertCalls).toHaveLength(0);
    expect(body.event.id).toBe('existing-corinne');
    expect(body.deduplicated).toBe(true);
  });

  test('does NOT dedup non-agent events (fairs can recur with same name)', async () => {
    // Even if a same-name event exists, a "fair" type event should still insert.
    // The route doesn't even run the dedup probe for non-agent events.
    dedupRowsToReturn = [
      { id: 'old-paris-fair', name: 'Paris Fair', type: 'fair', organization_id: null },
    ];
    const res = await POST(makeRequest({ name: 'Paris Fair', type: 'fair' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(body.event.id).toBe('newly-created-event');
    expect(body.deduplicated).toBeUndefined();
  });
});

/**
 * @jest-environment node
 *
 * /api/events POST — Phase 13 dedup + Phase 21 auto-link behaviour
 *
 * Two related concerns covered here:
 *
 *   Phase 13: POST /api/events is idempotent for type='agent'. Re-posting
 *   the same name+org returns the existing row instead of inserting a
 *   duplicate. Originally added because Sam saw the same agent twice in
 *   the event picker after two admins (or one admin twice) hit "+ New
 *   Event" with the same name.
 *
 *   Phase 21: when a type='agent' folder is created with no
 *   organization_id, the route looks up the matching agent profile by
 *   full_name and auto-links the folder to that agent's organization.
 *   Without this, every order saved into the folder skips Tier 2
 *   commission attribution (the "PO Oxygène doesn't appear on Corinne's
 *   page" bug). Phase 21 also adds a second dedup probe by
 *   organization_id, so a folder named "CORINNE SECRET CODE PARIS" is
 *   reused when the auto-creator probes for "Corinne Ruimy" (her
 *   profile.full_name).
 */

let dedupRowsByName = [];
let dedupRowsByOrg = [];
let agentProfileLookupRows = [];
let insertCalls = [];
let lastInsertedRow = null;

// Builds a flexible chainable that records the chain's filters and resolves
// to whatever the caller has set up before invocation.
function makeChain({ resolveValue }) {
  const calls = { eq: [], ilike: [], is: [], or: [], not: [] };
  const chain = {};
  chain._calls = calls;

  // All filters are no-ops that just append to the trace.
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn((col, val) => { calls.eq.push([col, val]); return chain; });
  chain.ilike = jest.fn((col, val) => { calls.ilike.push([col, val]); return chain; });
  chain.is = jest.fn((col, val) => { calls.is.push([col, val]); return chain; });
  chain.or = jest.fn((expr) => { calls.or.push(expr); return chain; });
  chain.not = jest.fn((col, op, val) => { calls.not.push([col, op, val]); return chain; });
  chain.limit = jest.fn(() => chain);

  // Promise-like — await on the chain returns the configured value.
  chain.then = (onFulfilled, onRejected) => Promise.resolve(resolveValue(calls)).then(onFulfilled, onRejected);

  return chain;
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return makeChain({ resolveValue: () => ({ data: agentProfileLookupRows, error: null }) });
    }
    if (table === 'events') {
      // The route runs (in this order):
      //   1. Org dedup: select * .eq('type','agent') .eq('organization_id', X) .limit(1)
      //   2. Name dedup: select * .eq('type','agent') .ilike('name', X) [+ .eq/.is org]
      //   3. Insert: from('events').insert(row).select().single()
      const chain = makeChain({
        resolveValue: (calls) => {
          // Org dedup is the only chain that has eq('organization_id', ...)
          const hasOrgEq = calls.eq.some(([c]) => c === 'organization_id');
          if (hasOrgEq && calls.ilike.length === 0) {
            return { data: dedupRowsByOrg, error: null };
          }
          return { data: dedupRowsByName, error: null };
        },
      });
      chain.insert = jest.fn((row) => {
        insertCalls.push(row);
        lastInsertedRow = row;
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
  dedupRowsByName = [];
  dedupRowsByOrg = [];
  agentProfileLookupRows = [];
  insertCalls = [];
  lastInsertedRow = null;
});

describe('/api/events POST — Phase 13 dedup', () => {
  test('inserts a new agent event when none exists with the same name+org', async () => {
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

  test('returns the existing event idempotently when same agent name+org already exists (name-dedup path)', async () => {
    dedupRowsByName = [
      { id: 'existing-corinne', name: 'Corinne', type: 'agent', organization_id: 'org-1' },
    ];
    const res = await POST(
      makeRequest({ name: 'Corinne', type: 'agent', organization_id: 'org-1' }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(0);
    expect(body.deduplicated).toBe(true);
  });

  test('matches case-insensitively after trim', async () => {
    dedupRowsByName = [
      { id: 'existing-corinne', name: 'Corinne', type: 'agent', organization_id: 'org-1' },
    ];
    const res = await POST(
      makeRequest({ name: '  CORINNE  ', type: 'agent', organization_id: 'org-1' }),
    );
    const body = await res.json();
    expect(insertCalls).toHaveLength(0);
    expect(body.deduplicated).toBe(true);
  });

  test('does NOT dedup non-agent events (fairs can recur with same name)', async () => {
    dedupRowsByName = [
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

describe('/api/events POST — Phase 21 auto-link agent folder to org', () => {
  test('looks up the matching agent profile and uses their org when none provided', async () => {
    agentProfileLookupRows = [{ organization_id: 'org-from-profile' }];
    const res = await POST(makeRequest({ name: 'Corinne Ruimy', type: 'agent' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].organization_id).toBe('org-from-profile');
    expect(body.event.organization_id).toBe('org-from-profile');
  });

  test('does NOT auto-link when zero matching agent profiles exist (orphan folder allowed)', async () => {
    agentProfileLookupRows = [];
    const res = await POST(makeRequest({ name: 'Bali', type: 'agent' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].organization_id).toBeNull();
    expect(body.event.organization_id).toBeNull();
  });

  test('does NOT auto-link when MULTIPLE agent profiles match the name (avoids cross-wiring)', async () => {
    agentProfileLookupRows = [
      { organization_id: 'org-A' },
      { organization_id: 'org-B' },
    ];
    const res = await POST(makeRequest({ name: 'John Smith', type: 'agent' }));
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].organization_id).toBeNull();
  });

  test('explicit organization_id in body wins over auto-link lookup', async () => {
    agentProfileLookupRows = [{ organization_id: 'org-from-profile' }];
    const res = await POST(
      makeRequest({ name: 'Corinne Ruimy', type: 'agent', organization_id: 'explicit-org' }),
    );
    expect(res.status).toBe(200);
    expect(insertCalls[0].organization_id).toBe('explicit-org');
  });

  test('org-based dedup returns the existing folder when an agent already has one (different name)', async () => {
    // The profile lookup resolves to org X, then the route's org-dedup
    // probe finds an existing folder for org X (named "CORINNE SECRET CODE
    // PARIS") and returns it instead of inserting "Corinne Ruimy".
    agentProfileLookupRows = [{ organization_id: 'org-corinne' }];
    dedupRowsByOrg = [
      { id: 'existing-secret-code', name: 'CORINNE SECRET CODE PARIS', type: 'agent', organization_id: 'org-corinne' },
    ];
    const res = await POST(makeRequest({ name: 'Corinne Ruimy', type: 'agent' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(0);
    expect(body.event.id).toBe('existing-secret-code');
    expect(body.deduplicated).toBe(true);
  });
});

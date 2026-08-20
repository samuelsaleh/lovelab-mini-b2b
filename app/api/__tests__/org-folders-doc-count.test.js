/**
 * @jest-environment node
 *
 * /api/org-folders GET — Phase 18b doc_count regression test.
 *
 * The bug: the sidebar Agents section showed "nicolas vial: 0 orders" while
 * his folder actually contained 5. The Phase 12 events-only fix only counted
 * docs in events tagged with organization_id. Agent docs in fair/partner
 * events (no org tag) slipped through.
 *
 * The fix mirrors /api/documents' exact filter logic:
 *   doc.created_by IN org.members  OR  doc.event_id IN events-of-org
 * applied with deleted_at IS NULL and order_channel exclusions.
 */

let orgsToReturn = [];
let membershipsToReturn = [];
let rootFoldersToReturn = [];
let orgEventsToReturn = [];
let docsToReturn = [];

function buildOrganizationsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue({ data: orgsToReturn, error: null });
  return chain;
}

function buildOrgMembershipsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockResolvedValue({ data: membershipsToReturn, error: null });
  return chain;
}

function buildAgentFoldersMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockResolvedValue({ data: rootFoldersToReturn, error: null });
  return chain;
}

let profilesToReturn = [];

function buildProfilesMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockResolvedValue({ data: profilesToReturn, error: null });
  return chain;
}

function buildEventsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockResolvedValue({ data: orgEventsToReturn, error: null });
  return chain;
}

function buildDocumentsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.or = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.not = jest.fn().mockResolvedValue({ data: docsToReturn, error: null });
  return chain;
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'organizations') return buildOrganizationsMock();
    if (table === 'organization_memberships') return buildOrgMembershipsMock();
    if (table === 'agent_folders') return buildAgentFoldersMock();
    if (table === 'profiles') return buildProfilesMock();
    if (table === 'events') return buildEventsMock();
    if (table === 'documents') return buildDocumentsMock();
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/lib/organizations/authz', () => ({
  requireSession: jest.fn().mockResolvedValue({
    user: { id: 'admin-user' },
    profile: { id: 'admin-user', role: 'admin' },
  }),
  isAdmin: jest.fn().mockReturnValue(true),
}));

const { GET } = require('../org-folders/route');

function makeRequest() {
  return new global.Request('http://localhost/api/org-folders');
}

beforeEach(() => {
  orgsToReturn = [];
  membershipsToReturn = [];
  rootFoldersToReturn = [];
  orgEventsToReturn = [];
  docsToReturn = [];
  profilesToReturn = [];
});

describe('/api/org-folders GET — server-authoritative doc_count', () => {
  test('counts docs created by org members even when their events have no organization_id', async () => {
    // The "nicolas vial: 0 vs 5" repro. Nicolas is the sole member of org-N.
    // His 5 orders were saved in a fair-type event with no organization_id.
    orgsToReturn = [{ id: 'org-N', name: 'Nicolas' }];
    membershipsToReturn = [{ organization_id: 'org-N', user_id: 'nicolas-id', role: 'agent' }];
    orgEventsToReturn = []; // no events tagged with this org
    docsToReturn = [
      { id: 'd1', created_by: 'nicolas-id', event_id: 'fair-evt' },
      { id: 'd2', created_by: 'nicolas-id', event_id: 'fair-evt' },
      { id: 'd3', created_by: 'nicolas-id', event_id: 'fair-evt' },
      { id: 'd4', created_by: 'nicolas-id', event_id: 'fair-evt' },
      { id: 'd5', created_by: 'nicolas-id', event_id: null },
    ];

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);

    const folder = body.orgFolders.find((f) => f.organization_id === 'org-N');
    expect(folder).toBeDefined();
    expect(folder.doc_count).toBe(5);
  });

  test('counts docs in events tagged with the org even when creator is not a member', async () => {
    // Inverse case: a doc was created by a non-member admin but inside an
    // event linked to the org. Should still count for the org's folder.
    orgsToReturn = [{ id: 'org-C', name: 'Corinne' }];
    membershipsToReturn = [{ organization_id: 'org-C', user_id: 'corinne-id', role: 'agent' }];
    orgEventsToReturn = [{ id: 'agent-evt', organization_id: 'org-C' }];
    docsToReturn = [
      { id: 'd1', created_by: 'admin-id', event_id: 'agent-evt' },
      { id: 'd2', created_by: 'admin-id', event_id: 'agent-evt' },
    ];

    const res = await GET(makeRequest());
    const body = await res.json();
    const folder = body.orgFolders.find((f) => f.organization_id === 'org-C');
    expect(folder.doc_count).toBe(2);
  });

  test('does not double-count when a doc matches both creator AND event in the same org', async () => {
    orgsToReturn = [{ id: 'org-C', name: 'Corinne' }];
    membershipsToReturn = [{ organization_id: 'org-C', user_id: 'corinne-id', role: 'agent' }];
    orgEventsToReturn = [{ id: 'agent-evt', organization_id: 'org-C' }];
    docsToReturn = [
      // Same doc satisfies both branches — should count once.
      { id: 'd1', created_by: 'corinne-id', event_id: 'agent-evt' },
    ];

    const res = await GET(makeRequest());
    const body = await res.json();
    const folder = body.orgFolders.find((f) => f.organization_id === 'org-C');
    expect(folder.doc_count).toBe(1);
  });

  test('returns doc_count 0 when there are no matches', async () => {
    orgsToReturn = [{ id: 'org-J', name: 'Josephine' }];
    membershipsToReturn = [{ organization_id: 'org-J', user_id: 'jo-id', role: 'agent' }];
    orgEventsToReturn = [];
    docsToReturn = [];

    const res = await GET(makeRequest());
    const body = await res.json();
    const folder = body.orgFolders.find((f) => f.organization_id === 'org-J');
    expect(folder.doc_count).toBe(0);
  });

  test('breaks the count down per member so the sidebar can nest them', async () => {
    // Sarah Goutard Organization, the case that motivated this: nine members,
    // four of whom actually sell. The team count alone told an admin nothing
    // about who an order came from.
    orgsToReturn = [{ id: 'org-S', name: 'Sarah Goutard Organization' }];
    membershipsToReturn = [
      { organization_id: 'org-S', user_id: 'sarah', role: 'owner' },
      { organization_id: 'org-S', user_id: 'wassila', role: 'agent' },
      { organization_id: 'org-S', user_id: 'ruby', role: 'agent' },
    ];
    profilesToReturn = [
      { id: 'sarah', full_name: 'Sarah Goutard', email: 'sarah@example.com' },
      { id: 'wassila', full_name: 'Wassila Mekidiche', email: 'wassila@example.com' },
      { id: 'ruby', full_name: 'Ruby Robin', email: 'ruby@example.com' },
    ];
    orgEventsToReturn = [{ id: 'evt-sarah', organization_id: 'org-S' }];
    docsToReturn = [
      // Two of Wassila's orders are still filed in Sarah's folder — they must
      // count for Wassila, because created_by is the reliable signal.
      { id: 'd1', created_by: 'wassila', event_id: 'evt-sarah' },
      { id: 'd2', created_by: 'wassila', event_id: 'evt-sarah' },
      { id: 'd3', created_by: 'wassila', event_id: null },
      { id: 'd4', created_by: 'ruby', event_id: null },
      // Entered by an admin into the team's folder: counts for the team, for
      // nobody in particular.
      { id: 'd5', created_by: 'admin-id', event_id: 'evt-sarah' },
    ];

    const res = await GET(makeRequest());
    const body = await res.json();
    const folder = body.orgFolders.find((f) => f.organization_id === 'org-S');

    expect(folder.doc_count).toBe(5);
    const byId = new Map(folder.members.map((m) => [m.user_id, m.doc_count]));
    expect(byId.get('wassila')).toBe(3);
    expect(byId.get('ruby')).toBe(1);
    expect(byId.get('sarah')).toBe(0);
    // The per-member counts never exceed the team count.
    const memberSum = folder.members.reduce((acc, m) => acc + m.doc_count, 0);
    expect(memberSum).toBeLessThanOrEqual(folder.doc_count);
  });

  test('every member gets a numeric per-member count, even with no documents', async () => {
    orgsToReturn = [{ id: 'org-J', name: 'Josephine' }];
    membershipsToReturn = [{ organization_id: 'org-J', user_id: 'jo-id', role: 'agent' }];
    profilesToReturn = [{ id: 'jo-id', full_name: 'Josephine Berazzal', email: 'jo@example.com' }];
    docsToReturn = [];

    const res = await GET(makeRequest());
    const body = await res.json();
    const folder = body.orgFolders.find((f) => f.organization_id === 'org-J');
    expect(folder.members.every((m) => typeof m.doc_count === 'number')).toBe(true);
    expect(folder.members[0].doc_count).toBe(0);
  });

  test('a member of two organizations has their documents counted in both', async () => {
    orgsToReturn = [
      { id: 'org-A', name: 'Team A' },
      { id: 'org-B', name: 'Team B' },
    ];
    membershipsToReturn = [
      { organization_id: 'org-A', user_id: 'dual', role: 'agent' },
      { organization_id: 'org-B', user_id: 'dual', role: 'agent' },
    ];
    profilesToReturn = [{ id: 'dual', full_name: 'Dual Member', email: 'dual@example.com' }];
    docsToReturn = [{ id: 'd1', created_by: 'dual', event_id: null }];

    const res = await GET(makeRequest());
    const body = await res.json();
    for (const orgId of ['org-A', 'org-B']) {
      const folder = body.orgFolders.find((f) => f.organization_id === orgId);
      expect(folder.doc_count).toBe(1);
      expect(folder.members.find((m) => m.user_id === 'dual').doc_count).toBe(1);
    }
  });

  test('attributes correctly across multiple orgs in one request', async () => {
    orgsToReturn = [
      { id: 'org-N', name: 'Nicolas' },
      { id: 'org-C', name: 'Corinne' },
    ];
    membershipsToReturn = [
      { organization_id: 'org-N', user_id: 'nicolas-id', role: 'agent' },
      { organization_id: 'org-C', user_id: 'corinne-id', role: 'agent' },
    ];
    orgEventsToReturn = [
      { id: 'corinne-evt', organization_id: 'org-C' },
    ];
    docsToReturn = [
      { id: 'd1', created_by: 'nicolas-id', event_id: null },
      { id: 'd2', created_by: 'nicolas-id', event_id: null },
      { id: 'd3', created_by: 'corinne-id', event_id: 'corinne-evt' },
      { id: 'd4', created_by: 'admin-id', event_id: 'corinne-evt' },
    ];

    const res = await GET(makeRequest());
    const body = await res.json();
    const nf = body.orgFolders.find((f) => f.organization_id === 'org-N');
    const cf = body.orgFolders.find((f) => f.organization_id === 'org-C');
    expect(nf.doc_count).toBe(2);
    expect(cf.doc_count).toBe(2);
  });
});

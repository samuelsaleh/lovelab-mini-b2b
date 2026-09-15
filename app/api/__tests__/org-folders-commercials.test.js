/**
 * @jest-environment node
 *
 * /api/org-folders GET — the Commercials section (Sam, 15 Sep 2026).
 *
 * Admins who take orders have no organization, so the sidebar's Agents section
 * never listed them. The route now also returns `commercials`: one entry per
 * active commercial admin with the number of orders they saved or were
 * credited with (created_by OR an agent_commissions row), same channel
 * exclusions as the team counts. Non-admin callers get no such list.
 */

let isAdminCaller = true;
let commercialProfiles = [];
let commissionRows = [];
let docRows = [];

const resolved = (data) => Promise.resolve({ data, error: null });

function profilesMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn(() => resolved([]));
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.neq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn(() => resolved(commercialProfiles));
  return chain;
}
function orgsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn(() => resolved([]));
  return chain;
}
function membershipsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn(() => resolved([]));
  return chain;
}
function commissionsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn(() => resolved(commissionRows));
  return chain;
}
let lastDocsOr = null;
function documentsMock() {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.or = jest.fn((expr) => { lastDocsOr = expr; return chain; });
  chain.is = jest.fn().mockReturnValue(chain);
  chain.not = jest.fn(() => resolved(docRows));
  return chain;
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') return profilesMock();
    if (table === 'organizations') return orgsMock();
    if (table === 'organization_memberships') return membershipsMock();
    if (table === 'agent_commissions') return commissionsMock();
    if (table === 'documents') return documentsMock();
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/organizations/authz', () => ({
  requireSession: jest.fn().mockResolvedValue({ user: { id: 'caller' }, profile: { id: 'caller', role: 'admin' } }),
  isAdmin: jest.fn(() => isAdminCaller),
}));

const { GET } = require('../org-folders/route');
const makeRequest = () => new global.Request('http://localhost/api/org-folders');

beforeEach(() => {
  isAdminCaller = true;
  commercialProfiles = [];
  commissionRows = [];
  docRows = [];
  lastDocsOr = null;
});

describe('/api/org-folders GET — commercials', () => {
  test('lists each commercial with orders saved by them or credited to them', async () => {
    commercialProfiles = [{ id: 'raphael-id', full_name: 'Raphael Saleh', email: 'raphael@love-lab.com' }];
    commissionRows = [{ agent_id: 'raphael-id', document_id: 'doc-credited' }];
    docRows = [
      { id: 'doc-own', created_by: 'raphael-id' },
      { id: 'doc-credited', created_by: 'sam-id' },
    ];
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.orgFolders).toEqual([]);
    expect(json.commercials).toEqual([
      { user_id: 'raphael-id', full_name: 'Raphael Saleh', email: 'raphael@love-lab.com', doc_count: 2 },
    ]);
    // Same filter the commercial page uses: created_by OR commission document.
    expect(lastDocsOr).toBe('created_by.in.(raphael-id),id.in.(doc-credited)');
  });

  test('a commercial with no orders still shows, at zero', async () => {
    commercialProfiles = [{ id: 'raphael-id', full_name: 'Raphael Saleh', email: 'r@x' }];
    const json = await (await GET(makeRequest())).json();
    expect(json.commercials).toEqual([{ user_id: 'raphael-id', full_name: 'Raphael Saleh', email: 'r@x', doc_count: 0 }]);
  });

  test('asks only for active admin commercials', async () => {
    await GET(makeRequest());
    const profilesChain = mockAdminSupabase.from.mock.results
      .filter((r, i) => mockAdminSupabase.from.mock.calls[i][0] === 'profiles')
      .map((r) => r.value)
      .find((c) => c.eq.mock.calls.length > 0);
    expect(profilesChain.eq).toHaveBeenCalledWith('role', 'admin');
    expect(profilesChain.eq).toHaveBeenCalledWith('is_agent', true);
    expect(profilesChain.is).toHaveBeenCalledWith('agent_deleted_at', null);
    expect(profilesChain.neq).toHaveBeenCalledWith('agent_status', 'inactive');
  });

  test('non-admin callers get no commercials list', async () => {
    isAdminCaller = false;
    commercialProfiles = [{ id: 'raphael-id', full_name: 'Raphael Saleh', email: 'r@x' }];
    const json = await (await GET(makeRequest())).json();
    expect(json).toEqual({ orgFolders: [] });
  });
});

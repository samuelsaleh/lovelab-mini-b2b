/**
 * @jest-environment node
 *
 * autoEnsureOrganization — unit tests
 *
 * Covers:
 *   - Creates a new org when profile has no organization_id
 *   - Cleans up stale memberships before creating new org
 *   - Reuses existing org when profile already has organization_id
 */

let deletedFromTable = null;
let deletedUserId = null;
let singleResults = [];
let singleCallIdx = 0;

function buildChain(table) {
  const chain = {};
  const self = () => chain;

  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.in = jest.fn(self);
  chain.is = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.update = jest.fn(self);
  chain.upsert = jest.fn().mockResolvedValue({ data: null, error: null });
  chain.single = jest.fn(() => {
    const result = singleResults[singleCallIdx] || { data: null, error: null };
    singleCallIdx++;
    return Promise.resolve(result);
  });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  chain.delete = jest.fn(() => {
    deletedFromTable = table;
    return {
      eq: jest.fn((col, val) => {
        if (col === 'user_id') deletedUserId = val;
        return Promise.resolve({ data: null, error: null });
      }),
    };
  });

  return chain;
}

const mockAdminSupabase = {
  from: jest.fn((table) => buildChain(table)),
};

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/organizations/folder-provisioning', () => ({
  ensureOrgRoot: jest.fn().mockResolvedValue({ rootFolder: { id: 'rf-1' } }),
  ensureAgentSubfolder: jest.fn().mockResolvedValue({ subfolder: { id: 'sf-1' } }),
}));

const { autoEnsureOrganization } = require('../organizations/provision-agent');

beforeEach(() => {
  jest.clearAllMocks();
  deletedFromTable = null;
  deletedUserId = null;
  singleResults = [];
  singleCallIdx = 0;
});

describe('autoEnsureOrganization', () => {
  it('creates new org when profile has no organization_id', async () => {
    // single() calls in order: 1) profile lookup, 2) org insert.select.single, 3) provisionAgentInOrg -> org lookup, 4) agent profile lookup
    singleResults = [
      { data: { id: 'agent-1', email: 'agent@test.com', full_name: 'Test Agent', organization_id: null }, error: null },
      { data: { id: 'new-org-1', name: 'Test Agent Organization' }, error: null },
      { data: { id: 'new-org-1', name: 'Test Agent Organization' }, error: null },
      { data: { full_name: 'Test Agent', email: 'agent@test.com' }, error: null },
    ];

    const result = await autoEnsureOrganization('agent-1', 'admin-1');

    expect(result.organization).toBeDefined();
    expect(result.organization.id).toBe('new-org-1');
  });

  it('cleans up stale memberships before creating new org', async () => {
    singleResults = [
      { data: { id: 'agent-1', email: 'agent@test.com', full_name: 'Test Agent', organization_id: null }, error: null },
      { data: { id: 'new-org-1', name: 'Test Agent Organization' }, error: null },
      { data: { id: 'new-org-1', name: 'Test Agent Organization' }, error: null },
      { data: { full_name: 'Test Agent', email: 'agent@test.com' }, error: null },
    ];

    await autoEnsureOrganization('agent-1', 'admin-1');

    expect(deletedFromTable).toBe('organization_memberships');
    expect(deletedUserId).toBe('agent-1');
  });

  it('reuses existing org when profile has organization_id', async () => {
    singleResults = [
      { data: { id: 'agent-1', email: 'agent@test.com', full_name: 'Test Agent', organization_id: 'existing-org' }, error: null },
      { data: { id: 'existing-org', name: 'Existing Org' }, error: null },
      { data: { id: 'existing-org', name: 'Existing Org' }, error: null },
      { data: { full_name: 'Test Agent', email: 'agent@test.com' }, error: null },
    ];

    const result = await autoEnsureOrganization('agent-1', 'admin-1');

    expect(result.organization.id).toBe('existing-org');
    // Should NOT have deleted any memberships (no cleanup for existing orgs)
    expect(deletedUserId).toBeNull();
  });
});

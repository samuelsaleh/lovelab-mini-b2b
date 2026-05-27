/**
 * @jest-environment node
 *
 * /api/agents POST — Phase 22 (2026-05-13) regression test.
 *
 * Verifies:
 *   ✓ Creating a brand-new agent calls ensureAgentDriveFolder
 *   ✓ The resolved folder id is persisted to profiles.drive_folder_id
 *   ✓ A Drive failure is non-blocking — the response is still 200
 *   ✓ When ensureAgentDriveFolder reports `fromCache: true`, no extra
 *     UPDATE is issued (it's already on the row)
 *
 * What we don't test here (covered by agentDriveFolder.test.js):
 *   - The Drive folder lookup/create logic itself
 *   - Sanitisation of the agent name
 */

const mockEnsureAgentDriveFolder = jest.fn();

jest.mock('@/lib/agentDriveFolder', () => ({
  ensureAgentDriveFolder: (...a) => mockEnsureAgentDriveFolder(...a),
}));

// ── Supabase mocks ───────────────────────────────────────────────────
// We capture every UPDATE-on-profiles so we can assert what was written.
const profileUpdates = [];

function buildProfilesChainForUpsert() {
  // POST flow uses .update(...).eq(...) and .upsert(...).select().single()
  // and .select(...).eq(...).maybeSingle().
  //
  // Rules:
  //   - .eq() always returns `chain` so that chaining continues.
  //   - When an .update() payload is pending, .eq() captures it into
  //     profileUpdates before returning `chain`.
  //   - The terminal async methods (.single / .maybeSingle / .insert) resolve.
  const chain = {};
  chain.upsert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn((payload) => {
    chain._lastUpdate = payload;
    return chain;
  });
  chain.eq = jest.fn(() => {
    if (chain._lastUpdate) {
      profileUpdates.push(chain._lastUpdate);
      chain._lastUpdate = null;
    }
    return chain; // stay chainable; terminal calls resolve below
  });
  chain.or = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.not = jest.fn().mockReturnValue(chain);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockResolvedValue({
    data: {
      id: 'agent-uuid',
      email: 'newagent@example.com',
      full_name: 'New Agent',
      is_agent: true,
      agent_status: 'invited',
      drive_folder_id: null,
    },
    error: null,
  });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  chain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
  // Make the chain itself thenable so `await chain.eq(...)` resolves if needed.
  chain.then = undefined; // not a Promise by default
  return chain;
}

const mockAdminSupabase = {
  from: jest.fn(() => buildProfilesChainForUpsert()),
  storage: { from: jest.fn() },
  auth: {
    admin: {
      listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
      generateLink: jest.fn().mockResolvedValue({
        data: {
          properties: { action_link: 'https://example/magic' },
          user: { id: 'agent-uuid', email: 'newagent@example.com' },
        },
        error: null,
      }),
      createUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'agent-uuid', email: 'newagent@example.com' } },
        error: null,
      }),
    },
  },
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

jest.mock('@/lib/email-templates', () => ({
  welcomeAgentWithPasswordEmail: jest.fn(() => ({ subject: 'hi', html: '<p/>' })),
  upgradeAgentEmail: jest.fn(() => ({ subject: 'upgrade', html: '<p/>' })),
}));

jest.mock('@/lib/send-email', () => ({ sendEmail: jest.fn().mockResolvedValue({ ok: true }) }));

jest.mock('@/lib/organizations/provision-agent', () => ({
  provisionAgentInOrg: jest.fn(),
  autoEnsureOrganization: jest.fn().mockResolvedValue({ organization: { id: 'org-uuid' } }),
}));

jest.mock('@/lib/agents/access', () => ({ grantAccess: jest.fn() }));

jest.mock('@/lib/auth/validation', () => ({
  isValidEmail: jest.fn(() => true),
  normalizeEmail: jest.fn((e) => String(e || '').toLowerCase()),
}));

const { POST } = require('../agents/route');

function makeRequest(body) {
  return new global.Request('http://localhost/api/agents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  profileUpdates.length = 0;
  jest.clearAllMocks();
});

describe('/api/agents POST — Drive folder hook', () => {
  test('successful agent creation calls ensureAgentDriveFolder and persists the id', async () => {
    mockEnsureAgentDriveFolder.mockResolvedValueOnce({
      ok: true,
      folderId: 'drive-folder-id',
      fromCache: false,
    });

    const res = await POST(makeRequest({
      email: 'newagent@example.com',
      full_name: 'New Agent',
      commission_rate: 10,
    }));

    expect(res.status).toBe(200);
    expect(mockEnsureAgentDriveFolder).toHaveBeenCalledWith({
      agentName: 'New Agent',
      cachedFolderId: null,
    });
    // The drive_folder_id should have been written to the profile.
    expect(profileUpdates).toContainEqual({ drive_folder_id: 'drive-folder-id' });
  });

  test('Drive failure is non-blocking — the route still returns 200', async () => {
    mockEnsureAgentDriveFolder.mockRejectedValueOnce(new Error('Drive 503'));

    const res = await POST(makeRequest({
      email: 'newagent@example.com',
      full_name: 'New Agent',
      commission_rate: 10,
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent).toBeDefined();
    // No UPDATE because the helper threw — but the agent was still created.
    expect(profileUpdates.find((u) => 'drive_folder_id' in u)).toBeUndefined();
  });

  test('Drive helper returning skipped also does not block the response', async () => {
    mockEnsureAgentDriveFolder.mockResolvedValueOnce({
      skipped: true,
      reason: 'env_not_set',
    });

    const res = await POST(makeRequest({
      email: 'newagent@example.com',
      full_name: 'New Agent',
      commission_rate: 10,
    }));

    expect(res.status).toBe(200);
    expect(profileUpdates.find((u) => 'drive_folder_id' in u)).toBeUndefined();
  });

  test('fromCache:true skips the persistence write (id is already on the row)', async () => {
    mockEnsureAgentDriveFolder.mockResolvedValueOnce({
      ok: true,
      folderId: 'already-cached-id',
      fromCache: true,
    });

    const res = await POST(makeRequest({
      email: 'newagent@example.com',
      full_name: 'New Agent',
      commission_rate: 10,
    }));

    expect(res.status).toBe(200);
    expect(profileUpdates.find((u) => 'drive_folder_id' in u)).toBeUndefined();
  });
});

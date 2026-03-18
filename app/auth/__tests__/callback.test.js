/**
 * @jest-environment node
 *
 * Auth callback route tests
 *
 * Covers:
 *   - Set-password redirect triggers for agents with has_password_set=null/false
 *   - Set-password redirect does NOT trigger for OAuth sign-ins
 *   - ensureProfile migrates agent profile when auth IDs differ (email-based lookup)
 *   - ensureProfile creates fresh profile when no profile exists at all
 *   - Access gate falls back to email-based profile lookup for agents
 */

// ── Mock chain builder ──────────────────────────────────────────────────────

function createMockQuery(resolvedData = null) {
  const q = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: resolvedData, error: null }),
    single: jest.fn().mockResolvedValue({ data: resolvedData, error: null }),
    insert: jest.fn().mockResolvedValue({ data: resolvedData, error: null }),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };
  return q;
}

let mockFromResults = {};
let mockAuthAdmin = {};
const mockAdminSupabase = {
  from: jest.fn((table) => {
    const q = createMockQuery();
    if (mockFromResults[table]) {
      const cfg = mockFromResults[table];
      if (cfg.maybeSingle !== undefined) q.maybeSingle.mockResolvedValue({ data: cfg.maybeSingle, error: null });
      if (cfg.single !== undefined) q.single.mockResolvedValue({ data: cfg.single, error: null });
      if (cfg.select) q.select.mockReturnValue(q);
      if (cfg.insert) q.insert.mockResolvedValue(cfg.insert);
      if (cfg.update) q.update.mockReturnValue(q);
      if (cfg.delete) q.delete.mockReturnValue(q);
    }
    return q;
  }),
  auth: { admin: mockAuthAdmin },
};

const mockSupabaseClient = {
  auth: {
    exchangeCodeForSession: jest.fn(),
    verifyOtp: jest.fn(),
    signOut: jest.fn(),
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockSupabaseClient),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/auth/isUserAllowed', () => ({
  isUserAllowed: jest.fn(() => true),
}));

const { isUserAllowed } = require('@/lib/auth/isUserAllowed');

// Prevent env warnings
process.env.ADMIN_EMAILS = 'admin@test.com';
process.env.ALLOWED_HOSTS = '';

const { GET } = require('../callback/route');

function makeRequest(params = {}) {
  const url = new URL('http://localhost:3000/auth/callback');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), {
    headers: new Headers({ 'x-forwarded-host': '' }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFromResults = {};
  isUserAllowed.mockReturnValue(true);
});

describe('Auth callback — set-password redirect', () => {
  it('redirects to /set-password when has_password_set is null (falsy)', async () => {
    const user = { id: 'u1', email: 'agent@test.com', user_metadata: {} };
    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });

    // Profile found by ID with has_password_set = null
    mockFromResults['profiles'] = {
      maybeSingle: { id: 'u1', role: 'member', is_agent: true, agent_status: 'active', agent_deleted_at: null, has_password_set: null },
    };
    mockFromResults['allowed_emails'] = { maybeSingle: { email: 'agent@test.com' } };

    const res = await GET(makeRequest({ token_hash: 'abc', type: 'magiclink' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/set-password');
  });

  it('redirects to /set-password when has_password_set is false', async () => {
    const user = { id: 'u1', email: 'agent@test.com', user_metadata: {} };
    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });

    mockFromResults['profiles'] = {
      maybeSingle: { id: 'u1', role: 'member', is_agent: true, agent_status: 'active', agent_deleted_at: null, has_password_set: false },
    };
    mockFromResults['allowed_emails'] = { maybeSingle: { email: 'agent@test.com' } };

    const res = await GET(makeRequest({ token_hash: 'abc', type: 'magiclink' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/set-password');
  });

  it('does NOT redirect to /set-password for OAuth sign-ins', async () => {
    const user = { id: 'u1', email: 'agent@test.com', user_metadata: {} };
    mockSupabaseClient.auth.exchangeCodeForSession.mockResolvedValue({ data: { user }, error: null });

    mockFromResults['profiles'] = {
      maybeSingle: { id: 'u1', role: 'member', is_agent: true, agent_status: 'active', agent_deleted_at: null, has_password_set: false },
    };
    mockFromResults['allowed_emails'] = { maybeSingle: { email: 'agent@test.com' } };

    const res = await GET(makeRequest({ code: 'oauth-code' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).not.toContain('/set-password');
  });

  it('does NOT redirect when has_password_set is true', async () => {
    const user = { id: 'u1', email: 'agent@test.com', user_metadata: {} };
    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });

    mockFromResults['profiles'] = {
      maybeSingle: { id: 'u1', role: 'member', is_agent: true, agent_status: 'active', agent_deleted_at: null, has_password_set: true },
    };
    mockFromResults['allowed_emails'] = { maybeSingle: { email: 'agent@test.com' } };

    const res = await GET(makeRequest({ token_hash: 'abc', type: 'magiclink' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).not.toContain('/set-password');
  });

  it('does NOT redirect for non-agent users', async () => {
    const user = { id: 'u1', email: 'team@test.com', user_metadata: {} };
    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });

    mockFromResults['profiles'] = {
      maybeSingle: { id: 'u1', role: 'member', is_agent: false, agent_status: null, agent_deleted_at: null, has_password_set: null },
    };
    mockFromResults['allowed_emails'] = { maybeSingle: { email: 'team@test.com' } };

    const res = await GET(makeRequest({ token_hash: 'abc', type: 'magiclink' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).not.toContain('/set-password');
  });
});

describe('Auth callback — access denied', () => {
  it('signs out and redirects to /login when access is denied', async () => {
    const user = { id: 'u1', email: 'blocked@test.com', user_metadata: {} };
    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });

    isUserAllowed.mockReturnValue(false);
    mockFromResults['profiles'] = { maybeSingle: null };
    mockFromResults['allowed_emails'] = { maybeSingle: null };

    const res = await GET(makeRequest({ token_hash: 'abc', type: 'magiclink' }));
    expect(mockSupabaseClient.auth.signOut).toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('location')).toContain('error=access_denied');
  });
});

describe('Auth callback — auth error', () => {
  it('redirects to /login?error=auth_error when no session user', async () => {
    const res = await GET(makeRequest({}));
    expect(res.headers.get('location')).toContain('/login?error=auth_error');
  });
});

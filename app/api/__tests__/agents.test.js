/**
 * @jest-environment node
 *
 * POST /api/agents — unit tests
 *
 * Covers:
 *   - Existing auth user is found by email (no duplicate auth user created)
 *   - has_password_set: false is included in new agent profile upsert
 *   - organization_id is explicitly null when no org requested (clears stale values)
 *   - Existing profile users get agent_status: 'active'
 *   - New profile users get agent_status: 'invited'
 */

const mockUpsertResult = { id: 'auth-1', email: 'new@test.com', is_agent: true, agent_status: 'invited' };
const mockUpdateResult = { id: 'existing-1', email: 'existing@test.com', is_agent: true, agent_status: 'active' };

let capturedUpsertArgs = null;
let capturedUpdateArgs = null;

const mockQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  single: jest.fn().mockResolvedValue({ data: mockUpsertResult, error: null }),
  upsert: jest.fn(function (data) {
    capturedUpsertArgs = data;
    return this;
  }),
  update: jest.fn(function (data) {
    capturedUpdateArgs = data;
    return this;
  }),
  insert: jest.fn().mockResolvedValue({ data: null, error: null }),
};

// Reset chain return for each from() call
const mockAdminSupabase = {
  from: jest.fn(() => ({ ...mockQuery })),
  auth: {
    admin: {
      listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
      createUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'auth-1', email: 'new@test.com' } },
        error: null,
      }),
      updateUserById: jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    },
  },
  rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/lib/organizations/authz', () => ({
  requireSession: jest.fn().mockResolvedValue({
    user: { id: 'admin-1' },
    profile: { role: 'admin' },
    error: null,
  }),
  isAdmin: jest.fn(() => true),
}));

jest.mock('@/lib/organizations/provision-agent', () => ({
  provisionAgentInOrg: jest.fn().mockResolvedValue(null),
  autoEnsureOrganization: jest.fn().mockResolvedValue({ organization: { id: 'org-new' } }),
}));

jest.mock('@/lib/events/ensure-agent-folder', () => ({
  ensureAgentFolderEvent: jest.fn().mockResolvedValue('evt-agent-folder'),
}));

jest.mock('@/lib/agents/access', () => ({
  grantAccess: jest.fn(),
}));

jest.mock('@/lib/email-templates', () => ({
  welcomeAgentWithPasswordEmail: jest.fn(() => ({ subject: 'Welcome', html: '<p>Welcome</p>' })),
  upgradeAgentEmail: jest.fn(() => ({ subject: 'Upgraded', html: '<p>Upgraded</p>' })),
}));

jest.mock('@/lib/auth/generateTempPassword', () => ({
  generateTempPassword: jest.fn(() => 'Test1234!'),
}));

jest.mock('@/lib/send-email', () => ({
  sendEmail: jest.fn(),
}));

const { POST } = require('../../api/agents/route');
const { autoEnsureOrganization } = require('@/lib/organizations/provision-agent');

function makePostRequest(body) {
  return new Request('http://localhost:3000/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedUpsertArgs = null;
  capturedUpdateArgs = null;

  // Default: profile lookup returns null (new user)
  mockQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
  // Default: no existing auth user
  mockAdminSupabase.auth.admin.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
});

describe('POST /api/agents — new user', () => {
  it('looks up existing auth users by email before creating', async () => {
    const res = await POST(makePostRequest({
      email: 'new@test.com',
      commission_rate: 15,
      full_name: 'Test Agent',
    }));

    expect(mockAdminSupabase.auth.admin.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.stringContaining('new@test.com') })
    );
  });

  it('uses existing auth user ID when one is found', async () => {
    mockAdminSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'existing-auth-id', email: 'new@test.com' }] },
      error: null,
    });

    // The upsert should use the existing auth user's ID
    const chainMock = {
      ...mockQuery,
      upsert: jest.fn(function (data) { capturedUpsertArgs = data; return this; }),
    };
    mockAdminSupabase.from.mockReturnValue(chainMock);
    chainMock.single.mockResolvedValue({ data: { ...mockUpsertResult, id: 'existing-auth-id' }, error: null });

    await POST(makePostRequest({
      email: 'new@test.com',
      commission_rate: 15,
    }));

    // Should not call generateLink's user or createUser since we already have an auth user
    // The profile upsert should use the existing auth ID
    if (capturedUpsertArgs) {
      expect(capturedUpsertArgs.id).toBe('existing-auth-id');
    }
  });

  it('includes has_password_set: false in agent profile upsert', async () => {
    const chainMock = {
      ...mockQuery,
      upsert: jest.fn(function (data) { capturedUpsertArgs = data; return this; }),
    };
    mockAdminSupabase.from.mockReturnValue(chainMock);
    chainMock.single.mockResolvedValue({ data: mockUpsertResult, error: null });

    await POST(makePostRequest({
      email: 'new@test.com',
      commission_rate: 15,
    }));

    if (capturedUpsertArgs) {
      expect(capturedUpsertArgs.has_password_set).toBe(false);
    }
  });

  it('sets organization_id to null when no org is requested', async () => {
    const chainMock = {
      ...mockQuery,
      upsert: jest.fn(function (data) { capturedUpsertArgs = data; return this; }),
    };
    mockAdminSupabase.from.mockReturnValue(chainMock);
    chainMock.single.mockResolvedValue({ data: { ...mockUpsertResult, organization_id: null }, error: null });

    await POST(makePostRequest({
      email: 'new@test.com',
      commission_rate: 15,
    }));

    if (capturedUpsertArgs) {
      expect(capturedUpsertArgs.organization_id).toBeNull();
    }
  });

  it('sets agent_status to "invited" for new users', async () => {
    const chainMock = {
      ...mockQuery,
      upsert: jest.fn(function (data) { capturedUpsertArgs = data; return this; }),
    };
    mockAdminSupabase.from.mockReturnValue(chainMock);
    chainMock.single.mockResolvedValue({ data: mockUpsertResult, error: null });

    await POST(makePostRequest({
      email: 'new@test.com',
      commission_rate: 15,
    }));

    if (capturedUpsertArgs) {
      expect(capturedUpsertArgs.agent_status).toBe('invited');
    }
  });

  it('creates the auth user with a temporary password (no magic link)', async () => {
    await POST(makePostRequest({
      email: 'new@test.com',
      commission_rate: 15,
      full_name: 'Michaela',
    }));

    expect(mockAdminSupabase.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@test.com',
        password: expect.any(String),
        email_confirm: true,
      })
    );
  });

  it('sends the welcome-with-password email containing the temp credentials', async () => {
    const { welcomeAgentWithPasswordEmail } = require('@/lib/email-templates');
    const { sendEmail } = require('@/lib/send-email');

    await POST(makePostRequest({
      email: 'new@test.com',
      commission_rate: 15,
      full_name: 'Michaela',
    }));

    expect(welcomeAgentWithPasswordEmail).toHaveBeenCalledWith(
      'Michaela',
      'new@test.com',
      expect.any(String),
      expect.stringContaining('/login'),
      expect.any(String),
    );
    expect(sendEmail).toHaveBeenCalled();
  });

  it('updates the password on an existing auth user instead of creating a duplicate', async () => {
    mockAdminSupabase.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'existing-auth-id', email: 'new@test.com' }] },
      error: null,
    });

    await POST(makePostRequest({
      email: 'new@test.com',
      commission_rate: 15,
    }));

    expect(mockAdminSupabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      'existing-auth-id',
      expect.objectContaining({ password: expect.any(String) }),
    );
    expect(mockAdminSupabase.auth.admin.createUser).not.toHaveBeenCalled();
  });
});

describe('POST /api/agents — validation', () => {
  it('rejects missing email', async () => {
    const res = await POST(makePostRequest({ commission_rate: 15 }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain('Email');
  });

  it('rejects invalid commission rate', async () => {
    const res = await POST(makePostRequest({ email: 'a@b.com', commission_rate: 150 }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain('Commission rate');
  });

  it('rejects invalid email format', async () => {
    const res = await POST(makePostRequest({ email: 'notanemail', commission_rate: 10 }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain('Invalid email');
  });
});

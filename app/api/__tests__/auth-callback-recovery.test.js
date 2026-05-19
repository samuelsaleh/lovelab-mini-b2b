/**
 * @jest-environment node
 *
 * GET /auth/callback — recovery flow.
 *
 * The /api/forgot-password route hands users a link of the shape
 *   <site>/auth/callback?token_hash=...&type=recovery&next=/reset-password
 *
 * This test pins down the contract that the existing callback supports
 * type=recovery transparently, so /reset-password renders against a real
 * Supabase session instead of having to parse fragments client-side.
 */

const mockVerifyOtp = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockSignOut = jest.fn();

const userMaybeSingle = jest.fn();
const profileMaybeSingle = jest.fn();
const allowedMaybeSingle = jest.fn();
let profileChain;

const buildAdminFromMock = () => {
  const allowedChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: (...args) => allowedMaybeSingle(...args),
  };
  profileChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: (...args) => profileMaybeSingle(...args),
    insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };
  return jest.fn((table) => {
    if (table === 'allowed_emails') return allowedChain;
    return profileChain;
  });
};

let adminFromMock;

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      verifyOtp: (...args) => mockVerifyOtp(...args),
      exchangeCodeForSession: (...args) => mockExchangeCodeForSession(...args),
      signOut: (...args) => mockSignOut(...args),
    },
  })),
  createAdminClient: jest.fn(() => ({ from: adminFromMock })),
}));

jest.mock('@/lib/auth/isUserAllowed', () => ({
  isUserAllowed: jest.fn(() => true),
}));

const { GET } = require('../../auth/callback/route');
const { isUserAllowed } = require('@/lib/auth/isUserAllowed');

function makeRecoveryRequest({ token = 'tok_abc', type = 'recovery', next = '/reset-password' } = {}) {
  const params = new URLSearchParams();
  if (token) params.set('token_hash', token);
  if (type) params.set('type', type);
  if (next) params.set('next', next);
  return new Request(`http://localhost:3000/auth/callback?${params.toString()}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  adminFromMock = buildAdminFromMock();
  isUserAllowed.mockReturnValue(true);
  mockVerifyOtp.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'agent@example.com', user_metadata: {} } },
    error: null,
  });
  // Allowed_emails returns a row -> user is allowed
  allowedMaybeSingle.mockResolvedValue({ data: { email: 'agent@example.com' }, error: null });
  // Profile lookup: agent with password already set so we skip the /set-password gate
  profileMaybeSingle.mockResolvedValue({
    data: {
      id: 'user-1',
      role: 'member',
      is_agent: true,
      agent_status: 'active',
      agent_deleted_at: null,
      has_password_set: true,
    },
    error: null,
  });
});

describe('GET /auth/callback — type=recovery', () => {
  it('(a) calls verifyOtp with the recovery token_hash and type', async () => {
    await GET(makeRecoveryRequest());
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'tok_abc', type: 'recovery' });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('(b) on success redirects to ?next path (/reset-password)', async () => {
    const res = await GET(makeRecoveryRequest());
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/reset-password');
  });

  it('(c) on invalid token redirects to /login?error=auth_error', async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: null, error: { message: 'expired' } });
    const res = await GET(makeRecoveryRequest());
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login?error=auth_error');
  });

  it('forces /set-password (not /reset-password) for invited agents without a password', async () => {
    // Half-onboarded edge case: an invited agent who never set a password
    // hits /forgot-password. The existing gate routes them to /set-password
    // instead of /reset-password. Both pages can pick a password — this is
    // documented acceptable behavior, not a bug.
    profileMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'user-1',
        role: 'member',
        is_agent: true,
        agent_status: 'invited',
        agent_deleted_at: null,
        has_password_set: false,
      },
      error: null,
    });
    const res = await GET(makeRecoveryRequest());
    const location = res.headers.get('location');
    expect(location).toContain('/set-password');
  });

  it('redirects to /login?error=access_denied when the user is not allowed', async () => {
    isUserAllowed.mockReturnValueOnce(false);
    allowedMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(makeRecoveryRequest());
    expect(mockSignOut).toHaveBeenCalled();
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('access_denied');
  });

  it('does not delete an existing same-email profile when auth user id changed', async () => {
    profileMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'old-profile-id',
          email: 'agent@example.com',
          role: 'member',
          is_agent: true,
          agent_status: 'invited',
          agent_deleted_at: null,
          has_password_set: false,
          organization_id: 'org-1',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'old-profile-id',
          email: 'agent@example.com',
          role: 'member',
          is_agent: true,
          agent_status: 'invited',
          agent_deleted_at: null,
          has_password_set: false,
          organization_id: 'org-1',
        },
        error: null,
      });

    const res = await GET(makeRecoveryRequest());
    expect(res.status).toBe(307);
    expect(profileChain.update).toHaveBeenCalledWith(expect.objectContaining({
      agent_status: 'active',
    }));
    expect(profileChain.delete).not.toHaveBeenCalled();
    expect(profileChain.insert).not.toHaveBeenCalled();
  });
});

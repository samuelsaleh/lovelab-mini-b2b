/**
 * @jest-environment node
 *
 * PATCH /api/me/password-set must not let the browser assert onboarding
 * completion. The route owns both steps: update the Supabase Auth password,
 * then mark profiles.has_password_set=true.
 */

const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockProfileEq = jest.fn();
const mockProfileUpdate = jest.fn(() => ({ eq: mockProfileEq }));
const mockFrom = jest.fn(() => ({ update: mockProfileUpdate }));
const mockCheckRateLimit = jest.fn(() => null);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: (...args) => mockGetUser(...args),
      updateUser: (...args) => mockUpdateUser(...args),
    },
  })),
  createAdminClient: jest.fn(() => ({
    from: (...args) => mockFrom(...args),
  })),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...args) => mockCheckRateLimit(...args),
}));

const { PATCH } = require('../me/password-set/route');

function makeRequest(body) {
  return new Request('http://localhost:3000/api/me/password-set', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockReturnValue(null);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockUpdateUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockProfileEq.mockResolvedValue({ data: null, error: null });
});

describe('PATCH /api/me/password-set', () => {
  it('updates the auth password before marking the profile password-set', async () => {
    const res = await PATCH(makeRequest({ password: 'newgoodpw1!' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newgoodpw1!' });
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockProfileUpdate).toHaveBeenCalledWith({ has_password_set: true });
    expect(mockProfileEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('rejects requests without a real password and does not flip the profile flag', async () => {
    const res = await PATCH(makeRequest({}));

    expect(res.status).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests before changing the password', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const res = await PATCH(makeRequest({ password: 'newgoodpw1!' }));

    expect(res.status).toBe(401);
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });

  it('does not mark the profile password-set when Supabase rejects the password update', async () => {
    mockUpdateUser.mockResolvedValueOnce({ data: null, error: { message: 'Weak password' } });

    const res = await PATCH(makeRequest({ password: 'newgoodpw1!' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Weak password' });
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });
});

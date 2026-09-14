/**
 * @jest-environment node
 *
 * PATCH /api/me/password-set — after someone chooses their own password.
 * An invited employee also carries must_set_password on the auth user; it is
 * cleared here, best effort.
 */
const getUser = jest.fn();
const profileUpdate = jest.fn();
const updateUserById = jest.fn();
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: (...a) => getUser(...a) } })),
  createAdminClient: jest.fn(() => ({
    from: () => ({ update: (p) => { profileUpdate(p); return { eq: async () => ({ error: null }) }; } }),
    auth: { admin: { updateUserById: (...a) => updateUserById(...a) } },
  })),
}));

const { PATCH } = require('../me/password-set/route');
const req = () => new Request('http://localhost:3000/api/me/password-set', { method: 'PATCH' });

beforeEach(() => {
  jest.clearAllMocks();
  updateUserById.mockResolvedValue({ error: null });
});

test('marks the profile and clears the employee mark, keeping the rest of the metadata', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'emp-1', user_metadata: { full_name: 'Emp', must_set_password: true } } } });
  const res = await PATCH(req());
  expect(res.status).toBe(200);
  expect(profileUpdate).toHaveBeenCalledWith({ has_password_set: true });
  expect(updateUserById).toHaveBeenCalledWith('emp-1', { user_metadata: { full_name: 'Emp', must_set_password: false } });
});

test('an agent without the mark is unchanged on the auth side', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'agent-1', user_metadata: { full_name: 'A' } } } });
  expect((await PATCH(req())).status).toBe(200);
  expect(profileUpdate).toHaveBeenCalledWith({ has_password_set: true });
  expect(updateUserById).not.toHaveBeenCalled();
});

test('still succeeds when clearing the mark fails — has_password_set already ends the redirect', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  getUser.mockResolvedValue({ data: { user: { id: 'emp-1', user_metadata: { must_set_password: true } } } });
  updateUserById.mockResolvedValue({ error: { message: 'gotrue down' } });
  expect((await PATCH(req())).status).toBe(200);
  console.error.mockRestore();
});

test('needs a session', async () => {
  getUser.mockResolvedValue({ data: { user: null } });
  expect((await PATCH(req())).status).toBe(401);
});

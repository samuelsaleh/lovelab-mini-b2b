/**
 * @jest-environment node
 */

const createAdminClientMock = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const { getUserContext, resolveAgentIds } = require('../_lib/access');

function makeMaybeSingleChain(result) {
  const chain = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.single = jest.fn().mockResolvedValue(result);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  return chain;
}

function makeAwaitableRows(rows) {
  const chain = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.then = (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve);
  return chain;
}

describe('access helpers — same-email auth id fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getUserContext falls back to a same-email profile when id lookup misses', async () => {
    const idLookup = makeMaybeSingleChain({ data: null, error: null });
    const emailLookup = makeMaybeSingleChain({
      data: { id: 'old-profile-id', email: 'agent@example.com', role: 'admin' },
      error: null,
    });
    const admin = { from: jest.fn().mockReturnValueOnce(idLookup).mockReturnValueOnce(emailLookup) };
    createAdminClientMock.mockReturnValue(admin);

    const supabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'new-auth-id', email: 'agent@example.com' } },
        }),
      },
    };

    const ctx = await getUserContext(supabase);
    expect(ctx.profile).toMatchObject({ id: 'old-profile-id' });
    expect(ctx.isAdmin).toBe(true);
    expect(emailLookup.eq).toHaveBeenCalledWith('email', 'agent@example.com');
  });

  test('resolveAgentIds falls back to auth user email when profile id lookup misses', async () => {
    const profileLookup = makeMaybeSingleChain({ data: null, error: null });
    const emailRows = makeAwaitableRows([{ id: 'old-profile-id' }]);
    const admin = {
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({
            data: { user: { email: 'agent@example.com' } },
          }),
        },
      },
      from: jest.fn().mockReturnValueOnce(profileLookup).mockReturnValueOnce(emailRows),
    };

    const ids = await resolveAgentIds(admin, 'new-auth-id');
    expect(ids).toEqual(['new-auth-id', 'old-profile-id']);
    expect(admin.auth.admin.getUserById).toHaveBeenCalledWith('new-auth-id');
    expect(emailRows.eq).toHaveBeenCalledWith('email', 'agent@example.com');
  });
});

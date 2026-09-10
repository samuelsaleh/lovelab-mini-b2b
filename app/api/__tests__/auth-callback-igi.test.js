/**
 * @jest-environment node
 *
 * GET /auth/callback — an IGI Antwerp account signing in.
 *
 * Sam, 10 Sept 2026: "if I tell you the emails, do they only see the
 * relevant things?" The address is named in IGI_EMAILS; on first login a
 * profile is created marked is_igi, never admin, and they land on /igi.
 */
const mockSignOut = jest.fn();
const allowedMaybeSingle = jest.fn();
const profileMaybeSingle = jest.fn();
const profileInsert = jest.fn().mockResolvedValue({ data: null, error: null });
const profileUpdate = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      exchangeCodeForSession: jest.fn(async () => ({ data: { user: global.__user }, error: null })),
      verifyOtp: jest.fn(),
      signOut: (...a) => mockSignOut(...a),
    },
  })),
  createAdminClient: jest.fn(() => ({
    from: (table) => {
      if (table === 'allowed_emails') {
        return { select: () => ({ eq: () => ({ maybeSingle: (...a) => allowedMaybeSingle(...a) }) }) };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: (...a) => profileMaybeSingle(...a),
        insert: (...a) => profileInsert(...a),
        update: (patch) => { profileUpdate(patch); return { eq: async () => ({ error: null }) }; },
        delete: () => chain,
      };
      return chain;
    },
  })),
}));

const { GET } = require('../../auth/callback/route');

function req(next) {
  const p = new URLSearchParams({ code: 'oauth-code' });
  if (next) p.set('next', next);
  return new Request(`http://localhost:3000/auth/callback?${p}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = 'development';
  process.env.IGI_EMAILS = 'michael@igi.org, hardik@igi.org';
  process.env.ADMIN_EMAILS = 'sam@love-lab.com';
  global.__user = { id: 'igi-1', email: 'Michael@igi.org', user_metadata: { full_name: 'Michael' } };
  allowedMaybeSingle.mockResolvedValue({ data: null, error: null });
  profileMaybeSingle.mockResolvedValue({ data: null, error: null });
});

describe('an address on IGI_EMAILS', () => {
  test('is let in on first login with no profile yet, gets an IGI profile, and lands on /igi', async () => {
    const res = await GET(req('/'));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/igi');
    expect(profileInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'igi-1', is_igi: true, role: 'member' }));
  });

  test('is sent to /igi even when the link pointed at LoveLab screens', async () => {
    const res = await GET(req('/certificates'));
    expect(res.headers.get('location')).toBe('http://localhost:3000/igi');
  });

  test('is never an admin, even if also listed in ADMIN_EMAILS', async () => {
    process.env.ADMIN_EMAILS = 'sam@love-lab.com, michael@igi.org';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await GET(req('/'));
    expect(profileInsert).toHaveBeenCalledWith(expect.objectContaining({ is_igi: true, role: 'member' }));
    console.error.mockRestore();
  });

  test('an existing profile that lost the mark, or gained admin, is repaired', async () => {
    profileMaybeSingle.mockResolvedValue({ data: { id: 'igi-1', role: 'admin', is_igi: false, is_agent: false, has_password_set: true }, error: null });
    const res = await GET(req('/'));
    expect(profileUpdate).toHaveBeenCalledWith({ is_igi: true, role: 'member' });
    expect(res.headers.get('location')).toBe('http://localhost:3000/igi');
  });
});

describe('everyone else is unchanged', () => {
  test('an unknown address is still refused', async () => {
    global.__user = { id: 'x', email: 'stranger@example.com', user_metadata: {} };
    const res = await GET(req('/'));
    expect(mockSignOut).toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('error=access_denied');
  });

  test('a LoveLab admin still lands where they were going', async () => {
    global.__user = { id: 'sam', email: 'sam@love-lab.com', user_metadata: {} };
    allowedMaybeSingle.mockResolvedValue({ data: { email: 'sam@love-lab.com' }, error: null });
    profileMaybeSingle.mockResolvedValue({ data: { id: 'sam', role: 'admin', is_igi: false, is_agent: false, has_password_set: true }, error: null });
    const res = await GET(req('/certificates'));
    expect(res.headers.get('location')).toBe('http://localhost:3000/certificates');
  });
});

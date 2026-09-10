/**
 * @jest-environment node
 *
 * An IGI session never leaves its portal.
 *
 * Sam, 10 Sept 2026: "how am I sure when they log on they only see that?"
 * This is the check that runs on every request, before any page or API
 * route: an account marked is_igi asking for anything outside /igi is sent
 * back there (or refused, for an API call). Everyone else passes through.
 */
const getUser = jest.fn();
const profileMaybeSingle = jest.fn();

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: { getUser: (...a) => getUser(...a) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: (...a) => profileMaybeSingle(...a) }) }) }),
  })),
}));

const { updateSession } = require('../supabase/middleware');

function request(pathname) {
  const url = `https://b2b-lovelab.com${pathname}`;
  const req = new Request(url);
  return {
    url,
    nextUrl: new URL(url),
    headers: req.headers,
    cookies: { getAll: () => [], set: () => {} },
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  jest.clearAllMocks();
});

function asIgi() {
  getUser.mockResolvedValue({ data: { user: { id: 'igi-1' } } });
  profileMaybeSingle.mockResolvedValue({ data: { is_igi: true }, error: null });
}
function asLoveLab() {
  getUser.mockResolvedValue({ data: { user: { id: 'sam' } } });
  profileMaybeSingle.mockResolvedValue({ data: { is_igi: false }, error: null });
}

describe('an IGI account', () => {
  test.each([
    '/', '/certificates', '/certificates/stock', '/admin', '/admin/fair-assistant', '/documents', '/dashboard',
  ])('asking for %s is sent back to their portal', async (path) => {
    asIgi();
    const res = await updateSession(request(path));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://b2b-lovelab.com/igi');
  });

  test.each([
    '/api/igi/overview', '/api/documents', '/api/igi/their-side', '/api/igi/preview/todo', '/api/backup',
  ])('calling %s is refused outright', async (path) => {
    asIgi();
    const res = await updateSession(request(path));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  test.each(['/igi', '/igi/stock', '/igi/history', '/api/igi-portal/todo', '/api/igi-portal/models/m1/serial'])(
    'reaches %s, which is theirs', async (path) => {
      asIgi();
      const res = await updateSession(request(path));
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    },
  );

  test('is recognised by the profile row, not by anything the browser sends', async () => {
    asIgi();
    await updateSession(request('/certificates'));
    expect(profileMaybeSingle).toHaveBeenCalledTimes(1);
  });
});

describe('everyone else', () => {
  test('a LoveLab admin goes where they like, the certificate screens included', async () => {
    asLoveLab();
    for (const path of ['/certificates', '/admin', '/igi', '/api/igi/overview']) {
      const res = await updateSession(request(path));
      expect(res.status).toBe(200);
    }
  });

  test('a signed-out visitor is not touched here — the pages handle that', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await updateSession(request('/certificates'));
    expect(res.status).toBe(200);
    expect(profileMaybeSingle).not.toHaveBeenCalled();
  });
});

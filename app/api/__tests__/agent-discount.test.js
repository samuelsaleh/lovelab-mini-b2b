/**
 * @jest-environment node
 *
 * GET + POST /api/agent-discount — unit tests
 *
 * Covers:
 *   - GET returns 401 when no Supabase session
 *   - GET returns 400 when email is missing
 *   - GET proxies through to Laravel for an authenticated user
 *   - GET respects the rate limiter
 *   - POST returns 401 when no Supabase session
 *   - POST proxies through to Laravel for an authenticated user
 *
 * The route exists ONLY to forward requests to the LoveLab Laravel API
 * (which has no auth of its own), so the Supabase session check is the
 * single line of defense against PII enumeration.
 */

const mockGetUser = jest.fn();
const mockCheckRateLimit = jest.fn(() => null);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: (...args) => mockGetUser(...args) },
  }),
}));
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...args) => mockCheckRateLimit(...args),
}));

const { GET, POST } = require('../agent-discount/route');

function makeReq({ url = 'http://localhost/api/agent-discount', body = null } = {}) {
  return {
    url,
    json: body ? jest.fn().mockResolvedValue(body) : undefined,
    headers: new Map(),
  };
}

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockImplementation(() => null);
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe('GET /api/agent-discount', () => {
  it('returns 401 when no Supabase session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeReq({ url: 'http://localhost/api/agent-discount?email=a@b.com' }));
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 400 when email is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('proxies through to Laravel for an authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    global.fetch.mockResolvedValue({
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true, data: { code: 'X', percent: 10 } }),
    });

    const res = await GET(makeReq({ url: 'http://localhost/api/agent-discount?email=a@b.com' }));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/agent-discount/a%40b.com'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('respects the rate limiter — returns the limiter response without calling Laravel', async () => {
    const limited = { status: 429 };
    mockCheckRateLimit.mockReturnValueOnce(limited);
    const res = await GET(makeReq({ url: 'http://localhost/api/agent-discount?email=a@b.com' }));
    expect(res).toBe(limited);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('POST /api/agent-discount', () => {
  it('returns 401 when no Supabase session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ body: { email: 'a@b.com', percent: 5 } }));
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('proxies through to Laravel for an authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    global.fetch.mockResolvedValue({
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true }),
    });

    const res = await POST(makeReq({ body: { email: 'a@b.com', percent: 5 } }));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/agent-discount'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

/**
 * @jest-environment node
 *
 * POST /api/signup-request — admin notification routing.
 *
 * Per Sam's request, the admin notification email primarily goes to Alberto
 * (albertosaleh@gmail.com) and CC's Sam so both founders see incoming
 * access requests without anyone having to forward email manually.
 *
 *  (a) ADMIN_NOTIFICATION_EMAIL=a,b -> to:[a], cc:[b]
 *  (b) Single email -> to:[email], no cc field
 *  (c) Env unset    -> to:['albertosaleh@gmail.com'] (safe default)
 *  (d) Whitespace + duplicates trimmed and deduped
 */

const mockMaybeSingle = jest.fn();
const mockInsertChain = {
  select: jest.fn().mockReturnThis(),
  single: jest.fn(),
};

const fromMock = jest.fn(() => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: (...args) => mockMaybeSingle(...args),
  insert: jest.fn(() => mockInsertChain),
}));

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(() => ({
    from: fromMock,
  })),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

let capturedFetchBody = null;
const originalFetch = global.fetch;

function makeRequest(body) {
  return new Request('http://localhost:3000/api/signup-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  capturedFetchBody = null;
  // Default DB state: address is brand new (not in allowed_emails, no pending)
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockInsertChain.single.mockResolvedValue({ data: { token: 'tok_123' }, error: null });
  global.fetch = jest.fn(async (url, init) => {
    if (typeof url === 'string' && url.includes('api.resend.com')) {
      capturedFetchBody = JSON.parse(init.body);
      return { ok: true, status: 200, text: async () => '' };
    }
    return originalFetch(url, init);
  });
  process.env.RESEND_API_KEY = 'test_key';
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
});

afterAll(() => {
  global.fetch = originalFetch;
});

async function callRoute() {
  const { POST } = require('../signup-request/route');
  const res = await POST(makeRequest({ email: 'new@example.com', full_name: 'New Person' }));
  return res;
}

describe('POST /api/signup-request — admin recipients', () => {
  it('(a) splits ADMIN_NOTIFICATION_EMAIL into to + cc', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'albertosaleh@gmail.com,samuelsaleh@gmail.com';
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(capturedFetchBody).not.toBeNull();
    expect(capturedFetchBody.to).toEqual(['albertosaleh@gmail.com']);
    expect(capturedFetchBody.cc).toEqual(['samuelsaleh@gmail.com']);
  });

  it('(b) single recipient -> no cc field at all', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'solo@example.com';
    await callRoute();
    expect(capturedFetchBody.to).toEqual(['solo@example.com']);
    expect(capturedFetchBody.cc).toBeUndefined();
  });

  it('(c) env unset -> defaults to albertosaleh@gmail.com', async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    await callRoute();
    expect(capturedFetchBody.to).toEqual(['albertosaleh@gmail.com']);
    expect(capturedFetchBody.cc).toBeUndefined();
  });

  it('(c2) empty env value -> defaults to albertosaleh@gmail.com', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = '';
    await callRoute();
    expect(capturedFetchBody.to).toEqual(['albertosaleh@gmail.com']);
  });

  it('(d) trims whitespace and dedupes case-insensitively', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = '  Alberto@Gmail.com , albertOSaleh@Gmail.COM ,  Sam@Gmail.com  ';
    await callRoute();
    // After lowercasing + trimming + dedup we expect: alberto@gmail.com, albertosaleh@gmail.com, sam@gmail.com
    expect(capturedFetchBody.to).toEqual(['alberto@gmail.com']);
    expect(capturedFetchBody.cc).toEqual(['albertosaleh@gmail.com', 'sam@gmail.com']);
  });

  it('(d2) drops empty entries from comma soup', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'a@x.com,,, b@x.com,';
    await callRoute();
    expect(capturedFetchBody.to).toEqual(['a@x.com']);
    expect(capturedFetchBody.cc).toEqual(['b@x.com']);
  });

  it('uses friendly From name without "B2B"', async () => {
    process.env.SENDER_EMAIL = 'alberto@love-lab.com';
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.com';
    await callRoute();
    expect(capturedFetchBody.from).toBe('LoveLab <alberto@love-lab.com>');
  });
});

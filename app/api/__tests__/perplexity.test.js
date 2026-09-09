/**
 * @jest-environment node
 *
 * POST /api/perplexity — health-event wiring tests
 *
 * Focuses on the audit fix: upstream errors and network failures must be
 * surfaced through `recordHealthEvent` so admins get alerted when the
 * AI proxy is broken in production.
 */

const mockGetUser = jest.fn();
const mockCheckRateLimit = jest.fn(() => null);
const mockRecordHealthEvent = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: (...args) => mockGetUser(...args) },
  }),
}));
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...args) => mockCheckRateLimit(...args),
}));
jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: (...args) => mockRecordHealthEvent(...args),
}));

const { POST } = require('../perplexity/route');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_KEY = process.env.PERPLEXITY_API_KEY;

function makeReq(body) {
  return {
    url: 'http://localhost/api/perplexity',
    json: jest.fn().mockResolvedValue(body),
    headers: new Map(),
  };
}

const VALID_BODY = {
  model: 'sonar',
  messages: [{ role: 'user', content: 'hi' }],
  max_tokens: 100,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PERPLEXITY_API_KEY = 'test-key';
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) delete process.env.PERPLEXITY_API_KEY;
  else process.env.PERPLEXITY_API_KEY = ORIGINAL_KEY;
});

describe('POST /api/perplexity', () => {
  it('records a health event when upstream returns a non-OK response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({ error: { message: 'service unavailable' } }),
    });

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(503);

    expect(mockRecordHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'perplexity_proxy',
        severity: 'warn',
        message: 'service unavailable',
        context: expect.objectContaining({ status: 503 }),
      }),
    );
  });

  it('records a health event when upstream fetch rejects', async () => {
    global.fetch.mockRejectedValue(new Error('ETIMEDOUT'));

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(500);

    expect(mockRecordHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'perplexity_proxy',
        severity: 'warn',
        message: 'ETIMEDOUT',
      }),
    );
  });

  it('does NOT record a health event for a successful response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'ok' } }] }),
    });

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    expect(mockRecordHealthEvent).not.toHaveBeenCalled();
  });
});

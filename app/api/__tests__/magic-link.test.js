/**
 * @jest-environment node
 *
 * POST /api/magic-link — every assertion the YC review demands:
 *  (a) generateLink called with type:'magiclink' + correct redirect URL
 *  (b) sendEmail called with payload built from magicLinkEmail template
 *  (c) sendEmail IS called when email is in allowed_emails
 *  (d) sendEmail is NOT called when email is NOT in allowed_emails (no leak)
 *  (e) sendEmail is NOT called for invalid email format (still returns 200)
 *  (f) checkRateLimit called with prefix: 'magic-link'
 *  (g) generateLink throwing still returns 200 + logs
 */

const mockGenerateLink = jest.fn();
const mockSendEmail = jest.fn();
const mockMaybeSingle = jest.fn();
const mockCheckRateLimit = jest.fn(() => null);
const mockMagicLinkEmail = jest.fn(() => ({ subject: 'Sign in to LoveLab', html: '<p>magic</p>' }));

const fromChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: (...args) => mockMaybeSingle(...args),
};

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => fromChain),
    auth: { admin: { generateLink: mockGenerateLink } },
  })),
}));

jest.mock('@/lib/send-email', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...args) => mockCheckRateLimit(...args),
}));

jest.mock('@/lib/email-templates', () => ({
  magicLinkEmail: (...args) => mockMagicLinkEmail(...args),
}));

const { POST } = require('../magic-link/route');

function makeRequest(body, { headers = {} } = {}) {
  return new Request('http://localhost:3000/api/magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockReturnValue(null);
  mockMaybeSingle.mockResolvedValue({ data: { email: 'agent@example.com' }, error: null });
  mockGenerateLink.mockResolvedValue({
    data: {
      properties: {
        action_link: 'https://supabase.example/v1/verify?token=abc',
        hashed_token: 'abc',
      },
    },
    error: null,
  });
  mockSendEmail.mockResolvedValue({ sent: true, message_id: 'msg_1' });
});

describe('POST /api/magic-link — happy path (allowed email)', () => {
  it('returns 200 and ok:true', async () => {
    const res = await POST(makeRequest({ email: 'agent@example.com' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('(f) calls checkRateLimit with prefix "magic-link"', async () => {
    await POST(makeRequest({ email: 'agent@example.com' }));
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ prefix: 'magic-link' }),
    );
  });

  it('(a) calls generateLink with type:"magiclink" and the /auth/callback redirect', async () => {
    await POST(makeRequest({ email: 'agent@example.com' }));
    expect(mockGenerateLink).toHaveBeenCalledTimes(1);
    expect(mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'magiclink',
        email: 'agent@example.com',
        options: expect.objectContaining({
          redirectTo: expect.stringMatching(/\/auth\/callback$/),
        }),
      }),
    );
  });

  it('(b)+(c) calls sendEmail with the magicLinkEmail template payload', async () => {
    await POST(makeRequest({ email: 'agent@example.com' }));
    // Our own callback with token_hash, not Supabase's fragment-based action_link.
    expect(mockMagicLinkEmail).toHaveBeenCalledWith(
      'agent@example.com',
      expect.stringMatching(/\/auth\/callback\?token_hash=abc&type=magiclink$/),
      expect.any(String),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'agent@example.com',
        subject: 'Sign in to LoveLab',
      }),
    );
  });

  it('normalizes the email before lookup (lowercase + trim)', async () => {
    await POST(makeRequest({ email: '  Agent@Example.COM  ' }));
    expect(fromChain.eq).toHaveBeenCalledWith('email', 'agent@example.com');
  });
});

describe('POST /api/magic-link — defense in depth', () => {
  it('(d) does NOT send email when address is not in allowed_emails (no leak)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(makeRequest({ email: 'stranger@example.com' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('(e) does NOT send email for invalid email format but still returns 200', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(200);
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 200 for missing email body', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 200 for malformed JSON body', async () => {
    const res = await POST(makeRequest('not-json{', { headers: { 'Content-Type': 'application/json' } }));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/magic-link — failure modes', () => {
  it('returns 429 when rate limit is hit', async () => {
    mockCheckRateLimit.mockReturnValueOnce(
      // Mimic the real return value shape from lib/rateLimit
      new Response(JSON.stringify({ error: 'Too many' }), { status: 429 }),
    );
    const res = await POST(makeRequest({ email: 'agent@example.com' }));
    expect(res.status).toBe(429);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('(g) generateLink throwing still returns 200 + does not call sendEmail', async () => {
    mockGenerateLink.mockRejectedValueOnce(new Error('supabase down'));
    const res = await POST(makeRequest({ email: 'agent@example.com' }));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('still returns 200 when generateLink returns an error object', async () => {
    mockGenerateLink.mockResolvedValueOnce({ data: null, error: { message: 'rate limited' } });
    const res = await POST(makeRequest({ email: 'agent@example.com' }));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

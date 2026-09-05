/**
 * @jest-environment node
 *
 * POST /api/forgot-password — every assertion the YC review demands:
 *  (a) generateLink called with type:'recovery' + correct redirect URL
 *  (b) sendEmail called with payload built from resetPasswordEmail template
 *  (c) Returns 200 + sendEmail IS called even for emails NOT in allowed_emails
 *      (recovery must work for half-onboarded agents)
 *  (d) sendEmail is NOT called for invalid email format (still returns 200)
 *  (e) checkRateLimit called with prefix: 'forgot-password'
 *  (f) generateLink throwing still returns 200 + logs
 */

const mockGenerateLink = jest.fn();
const mockSendEmail = jest.fn();
const mockCheckRateLimit = jest.fn(() => null);
const mockResetPasswordEmail = jest.fn(() => ({ subject: 'Reset your LoveLab password', html: '<p>reset</p>' }));

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(() => ({
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
  resetPasswordEmail: (...args) => mockResetPasswordEmail(...args),
}));

const { POST } = require('../forgot-password/route');

function makeRequest(body, { headers = {} } = {}) {
  return new Request('http://localhost:3000/api/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockReturnValue(null);
  mockGenerateLink.mockResolvedValue({
    data: {
      properties: {
        action_link: 'https://supabase.example/v1/verify?token=xyz&type=recovery',
        hashed_token: 'xyz',
      },
    },
    error: null,
  });
  mockSendEmail.mockResolvedValue({ sent: true, message_id: 'msg_2' });
});

describe('POST /api/forgot-password — happy path', () => {
  it('returns 200 and ok:true', async () => {
    const res = await POST(makeRequest({ email: 'agent@example.com' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('(e) calls checkRateLimit with prefix "forgot-password"', async () => {
    await POST(makeRequest({ email: 'agent@example.com' }));
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ prefix: 'forgot-password' }),
    );
  });

  it('(a) calls generateLink with type:"recovery" and the next=/reset-password redirect', async () => {
    await POST(makeRequest({ email: 'agent@example.com' }));
    expect(mockGenerateLink).toHaveBeenCalledTimes(1);
    expect(mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'recovery',
        email: 'agent@example.com',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('/auth/callback?next=/reset-password'),
        }),
      }),
    );
  });

  it('(b) calls sendEmail with the resetPasswordEmail template payload', async () => {
    await POST(makeRequest({ email: 'agent@example.com' }));
    // The emailed link must be OUR callback carrying token_hash — the raw
    // Supabase action_link redirects with the session in a URL fragment the
    // server-side callback can't read, so the reset landed on /login?error=auth_error.
    expect(mockResetPasswordEmail).toHaveBeenCalledWith(
      'agent@example.com',
      expect.stringMatching(/\/auth\/callback\?next=\/reset-password&token_hash=xyz&type=recovery$/),
      expect.any(String),
    );
    expect(mockResetPasswordEmail.mock.calls[0][1]).not.toContain('supabase.example');
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'agent@example.com',
        subject: 'Reset your LoveLab password',
      }),
    );
  });

  it('(c) sendEmail IS called even when email lookup would not find the user (no allowlist pre-check)', async () => {
    // The route deliberately doesn't query allowed_emails; verify by checking
    // that sendEmail is still called for an arbitrary address. Supabase's
    // generateLink will no-op if the user doesn't exist.
    await POST(makeRequest({ email: 'never-onboarded@example.com' }));
    expect(mockGenerateLink).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it('normalizes the email before generateLink (lowercase + trim)', async () => {
    await POST(makeRequest({ email: '  Agent@Example.COM  ' }));
    expect(mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'agent@example.com' }),
    );
  });
});

describe('POST /api/forgot-password — input validation', () => {
  it('(d) does NOT call generateLink for invalid email format but still returns 200', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(200);
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 200 for missing email body', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('returns 200 for malformed JSON body', async () => {
    const res = await POST(makeRequest('not-json{'));
    expect(res.status).toBe(200);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });
});

describe('POST /api/forgot-password — failure modes', () => {
  it('returns 429 when rate limit is hit', async () => {
    mockCheckRateLimit.mockReturnValueOnce(
      new Response(JSON.stringify({ error: 'Too many' }), { status: 429 }),
    );
    const res = await POST(makeRequest({ email: 'agent@example.com' }));
    expect(res.status).toBe(429);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('(f) generateLink throwing still returns 200 + does not call sendEmail', async () => {
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

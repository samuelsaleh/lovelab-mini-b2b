/**
 * @jest-environment node
 *
 * sendBrandedAuthLink helper — covers the generate-link + send-email pattern
 * used by /api/magic-link, /api/forgot-password, and (in a follow-up commit)
 * the existing /api/agents invite flow.
 */

const mockGenerateLink = jest.fn();
const mockSendEmail = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(() => ({
    auth: { admin: { generateLink: mockGenerateLink } },
  })),
}));

jest.mock('@/lib/send-email', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}));

const { sendBrandedAuthLink } = require('../sendBrandedAuthLink.js');

const buildEmail = jest.fn((name, link, siteUrl) => ({
  subject: `Hi ${name}`,
  html: `<a href="${link}">click</a> at ${siteUrl}`,
}));

beforeEach(() => {
  jest.clearAllMocks();
  buildEmail.mockClear();
  mockGenerateLink.mockResolvedValue({
    data: {
      properties: {
        action_link: 'https://supabase.example/verify?token=abc',
        hashed_token: 'abc',
      },
    },
    error: null,
  });
  mockSendEmail.mockResolvedValue({ sent: true, message_id: 'msg_123' });
});

describe('sendBrandedAuthLink', () => {
  const baseArgs = () => ({
    type: 'magiclink',
    email: 'agent@example.com',
    fullName: 'Marc',
    redirectPath: '/auth/callback',
    buildEmail,
    siteUrl: 'https://app.lovelab.com',
  });

  it('calls generateLink with the supplied type, email, and redirect URL', async () => {
    await sendBrandedAuthLink(baseArgs());
    expect(mockGenerateLink).toHaveBeenCalledTimes(1);
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'agent@example.com',
      options: {
        redirectTo: 'https://app.lovelab.com/auth/callback',
        data: { full_name: 'Marc' },
      },
    });
  });

  it('passes the recovery type through unchanged', async () => {
    await sendBrandedAuthLink({ ...baseArgs(), type: 'recovery', redirectPath: '/auth/callback?next=/reset-password' });
    expect(mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'recovery',
        options: expect.objectContaining({ redirectTo: 'https://app.lovelab.com/auth/callback?next=/reset-password' }),
      }),
    );
  });

  it('emails OUR /auth/callback with token_hash + type, never Supabase\'s action_link', async () => {
    // action_link redirects with the session in the URL fragment, which the
    // server-side callback can never see — that was the "click the reset
    // link and land on /login?error=auth_error" bug.
    const link = 'https://app.lovelab.com/auth/callback?token_hash=abc&type=magiclink';
    const result = await sendBrandedAuthLink(baseArgs());
    expect(buildEmail).toHaveBeenCalledWith('Marc', link, 'https://app.lovelab.com');
    expect(buildEmail.mock.calls[0][1]).not.toContain('supabase.example');
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'agent@example.com',
        subject: 'Hi Marc',
        html: `<a href="${link}">click</a> at https://app.lovelab.com`,
        // The AbortController.signal MUST be wired through — the 8s timeout
        // is otherwise dead code.
        signal: expect.any(Object),
      }),
    );
    expect(result).toEqual({ ok: true, message_id: 'msg_123' });
  });

  it('keeps an existing ?next= on the redirect path and appends token_hash with &', async () => {
    mockGenerateLink.mockResolvedValueOnce({
      data: { properties: { action_link: 'https://supabase.example/verify?token=r3c', hashed_token: 'r3c' } },
      error: null,
    });
    await sendBrandedAuthLink({ ...baseArgs(), type: 'recovery', redirectPath: '/auth/callback?next=/reset-password' });
    expect(buildEmail).toHaveBeenCalledWith(
      'Marc',
      'https://app.lovelab.com/auth/callback?next=/reset-password&token_hash=r3c&type=recovery',
      'https://app.lovelab.com',
    );
  });

  it('URL-encodes the hashed token', async () => {
    mockGenerateLink.mockResolvedValueOnce({
      data: { properties: { hashed_token: 'a b&c' } },
      error: null,
    });
    await sendBrandedAuthLink(baseArgs());
    expect(buildEmail.mock.calls[0][1]).toBe(
      'https://app.lovelab.com/auth/callback?token_hash=a%20b%26c&type=magiclink',
    );
  });

  it('passes a real AbortSignal so the timeout actually fires', async () => {
    await sendBrandedAuthLink(baseArgs());
    const callArgs = mockSendEmail.mock.calls[0][0];
    expect(callArgs.signal).toBeDefined();
    // AbortSignal exposes .aborted boolean — quack-typing avoids importing
    // a polyfill in this Jest env.
    expect(typeof callArgs.signal.aborted).toBe('boolean');
  });

  it('translates an aborted send into reason: send_timeout for clearer logs', async () => {
    mockSendEmail.mockResolvedValueOnce({ sent: false, reason: 'aborted' });
    const result = await sendBrandedAuthLink(baseArgs());
    expect(result).toEqual({ ok: false, reason: 'send_timeout' });
  });

  it('falls back to email as the display name when fullName is missing', async () => {
    await sendBrandedAuthLink({ ...baseArgs(), fullName: undefined });
    expect(buildEmail).toHaveBeenCalledWith('agent@example.com', expect.any(String), expect.any(String));
  });

  it('returns ok:false with reason when generateLink errors', async () => {
    mockGenerateLink.mockResolvedValueOnce({ data: null, error: { message: 'rate limited' } });
    const result = await sendBrandedAuthLink(baseArgs());
    expect(result).toEqual({ ok: false, reason: 'generate_link_failed' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns ok:false with reason when generateLink throws', async () => {
    mockGenerateLink.mockRejectedValueOnce(new Error('boom'));
    const result = await sendBrandedAuthLink(baseArgs());
    expect(result).toEqual({ ok: false, reason: 'generate_link_threw' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns ok:false when generateLink succeeds but no hashed_token is returned', async () => {
    // An action_link alone is not enough — we refuse to email a link the
    // server-side callback cannot verify.
    mockGenerateLink.mockResolvedValueOnce({
      data: { properties: { action_link: 'https://supabase.example/verify?token=abc' } },
      error: null,
    });
    const result = await sendBrandedAuthLink(baseArgs());
    expect(result).toEqual({ ok: false, reason: 'no_hashed_token' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('propagates sendEmail failure as ok:false with the upstream reason', async () => {
    mockSendEmail.mockResolvedValueOnce({ sent: false, reason: 'no_api_key' });
    const result = await sendBrandedAuthLink(baseArgs());
    expect(result).toEqual({ ok: false, reason: 'no_api_key' });
  });

  it('returns send_threw when sendEmail throws unexpectedly', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('network down'));
    const result = await sendBrandedAuthLink(baseArgs());
    expect(result).toEqual({ ok: false, reason: 'send_threw' });
  });

  it('rejects invalid argument shapes without calling generateLink', async () => {
    const result = await sendBrandedAuthLink({ type: 'magiclink', email: 'x@y.com' });
    expect(result).toEqual({ ok: false, reason: 'invalid_args' });
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });
});

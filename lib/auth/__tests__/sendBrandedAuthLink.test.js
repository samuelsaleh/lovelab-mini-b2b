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
    data: { properties: { action_link: 'https://supabase.example/verify?token=abc' } },
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

  it('calls buildEmail with the action link and forwards the result to sendEmail', async () => {
    const result = await sendBrandedAuthLink(baseArgs());
    expect(buildEmail).toHaveBeenCalledWith('Marc', 'https://supabase.example/verify?token=abc', 'https://app.lovelab.com');
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: 'agent@example.com',
      subject: 'Hi Marc',
      html: '<a href="https://supabase.example/verify?token=abc">click</a> at https://app.lovelab.com',
    });
    expect(result).toEqual({ ok: true, message_id: 'msg_123' });
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

  it('returns ok:false when generateLink succeeds but no action_link is returned', async () => {
    mockGenerateLink.mockResolvedValueOnce({ data: { properties: {} }, error: null });
    const result = await sendBrandedAuthLink(baseArgs());
    expect(result).toEqual({ ok: false, reason: 'no_action_link' });
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

/**
 * @jest-environment node
 *
 * lib/sendCommissionReport — Phase 19/B6
 *
 * Covers:
 *   ✓ Recipient is always dionne@love-lab.com (never the agent)
 *   ✓ No reply-to, cc, or bcc
 *   ✓ Subject contains agent name + period label
 *   ✓ HTML body contains TOTAL DUE and bonus / loose-sales lines when relevant
 *   ✓ Attachment filename sanitised + .xlsx suffix
 *   ✓ Forwards sendEmail result + recipient
 *   ✓ Bonus / loose-sales lines hidden when their counts are zero
 */

const mockSendEmail = jest.fn();

jest.mock('../send-email.js', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}));

const { sendCommissionReportEmail, COMMISSION_REPORT_RECIPIENT } = require('../sendCommissionReport.js');

const baseArgs = {
  buffer: Buffer.from('fake'),
  agent: { name: 'Nicolas Vial', email: 'nicolas@love-lab.com' },
  period: { label: 'May 2026' },
  totals: {
    grandTotal: 1500,
    commissionTotal: 1000,
    bonusTotal: 400,
    looseSalesTotal: 100,
    orderCount: 5,
    bonusCount: 2,
    looseSalesCount: 1,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSendEmail.mockResolvedValue({ sent: true, message_id: 'm-1' });
});

describe('sendCommissionReportEmail', () => {
  test('always sends to dionne@love-lab.com only', async () => {
    const res = await sendCommissionReportEmail(baseArgs);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const payload = mockSendEmail.mock.calls[0][0];
    expect(payload.to).toBe(COMMISSION_REPORT_RECIPIENT);
    expect(payload.to).toBe('dionne@love-lab.com');
    expect(payload.replyTo).toBeUndefined();
    expect(payload.cc).toBeUndefined();
    expect(payload.bcc).toBeUndefined();
    expect(res.recipient).toBe('dionne@love-lab.com');
    expect(res.sent).toBe(true);
    expect(res.message_id).toBe('m-1');
  });

  test('subject contains agent name + period label', async () => {
    await sendCommissionReportEmail(baseArgs);
    expect(mockSendEmail.mock.calls[0][0].subject).toBe(
      'LoveLab — Commission for Nicolas Vial — May 2026',
    );
  });

  test('HTML body contains TOTAL DUE + bonus + loose lines when relevant', async () => {
    await sendCommissionReportEmail(baseArgs);
    const html = mockSendEmail.mock.calls[0][0].html;
    expect(html).toContain('Total due to agent');
    expect(html).toContain('Nicolas Vial');
    expect(html).toContain('5 B2B orders');
    expect(html).toContain('2 new-client bonuses');
    expect(html).toContain('B2C individual sales');
    expect(html).toContain('forward it to Nicolas Vial when you are ready');
  });

  test('hides bonus + loose lines when counts are zero', async () => {
    await sendCommissionReportEmail({
      ...baseArgs,
      totals: { ...baseArgs.totals, bonusCount: 0, bonusTotal: 0, looseSalesCount: 0, looseSalesTotal: 0 },
    });
    const html = mockSendEmail.mock.calls[0][0].html;
    expect(html).not.toContain('new-client bonus');
    expect(html).not.toContain('B2C individual sales');
  });

  test('attachment filename sanitised + .xlsx suffix', async () => {
    await sendCommissionReportEmail({
      ...baseArgs,
      agent: { name: 'A/B *Co', email: 'x@love-lab.com' },
    });
    const att = mockSendEmail.mock.calls[0][0].attachments[0];
    expect(att.filename).toBe('A-B -Co - May 2026.xlsx');
    expect(att.content).toEqual(baseArgs.buffer);
  });

  test('forwards sendEmail failure result with recipient added', async () => {
    mockSendEmail.mockResolvedValue({ sent: false, reason: 'resend_error', status: 422, error: 'bad domain' });
    const res = await sendCommissionReportEmail(baseArgs);
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('resend_error');
    expect(res.recipient).toBe('dionne@love-lab.com');
  });

  test('escapes HTML in agent name to avoid injection', async () => {
    await sendCommissionReportEmail({
      ...baseArgs,
      agent: { name: '<script>alert(1)</script>', email: 'x@love-lab.com' },
    });
    const html = mockSendEmail.mock.calls[0][0].html;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

/**
 * @jest-environment node
 *
 * lib/sendCommissionReport — organization reports (Phase 31)
 *
 * Covers:
 *   ✓ org mode speaks of the organization, not "the agent"
 *   ✓ one "Per agent" line per member who earned something, zero members hidden
 *   ✓ recipient stays Dionne, subject names the organization
 *   ✓ classic per-agent mail is unchanged (no "Per agent" block)
 */

const mockSendEmail = jest.fn();

jest.mock('../send-email.js', () => ({
  sendEmail: (...args) => mockSendEmail(...args),
}));

const { sendCommissionReportEmail, COMMISSION_REPORT_RECIPIENT } = require('../sendCommissionReport.js');

const totals = {
  grandTotal: 760,
  commissionTotal: 760,
  bonusTotal: 0,
  looseSalesTotal: 0,
  orderCount: 4,
  bonusCount: 0,
  looseSalesCount: 0,
};

const orgArgs = {
  buffer: Buffer.from('fake'),
  agent: { name: 'Sarah Goutard Organization', email: 'sarah@x.com' },
  period: { label: '20 October 2026' },
  totals,
  organization: { id: 'org-1', name: 'Sarah Goutard Organization' },
  memberBreakdown: [
    { agent_id: 'w', name: 'Wassila Mekidiche', orderCount: 3, commissionTotal: 600, bonusTotal: 0, total: 600 },
    { agent_id: 'r', name: 'Ruby Robin', orderCount: 1, commissionTotal: 160, bonusTotal: 0, total: 160 },
    { agent_id: 's', name: 'Sarah Goutard', orderCount: 0, commissionTotal: 0, bonusTotal: 0, total: 0 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSendEmail.mockResolvedValue({ sent: true, message_id: 'm-1' });
});

describe('sendCommissionReportEmail — organization mode', () => {
  test('speaks of the organization and lists each contributing member', async () => {
    await sendCommissionReportEmail(orgArgs);
    const { html, subject, to } = mockSendEmail.mock.calls[0][0];

    expect(to).toBe(COMMISSION_REPORT_RECIPIENT);
    expect(subject).toContain('Sarah Goutard Organization');

    expect(html).toContain('Total due to organization');
    expect(html).not.toContain('Total due to agent');
    expect(html).toContain('>Organization<');
    expect(html).toContain('Per agent');
    expect(html).toContain('Wassila Mekidiche');
    expect(html).toContain('Ruby Robin');
    // A member with nothing to pay is not listed.
    expect(html).not.toContain('Sarah Goutard</td>');
    expect(html).toContain('3 orders');
    expect(html).toContain('agent named on every line');
  });

  test('classic per-agent mail is unchanged', async () => {
    await sendCommissionReportEmail({
      buffer: Buffer.from('fake'),
      agent: { name: 'Nicolas Vial', email: 'nicolas@x.com' },
      period: { label: 'May 2026' },
      totals,
    });
    const { html } = mockSendEmail.mock.calls[0][0];
    expect(html).toContain('Total due to agent');
    expect(html).toContain('>Agent<');
    expect(html).not.toContain('Per agent');
  });
});

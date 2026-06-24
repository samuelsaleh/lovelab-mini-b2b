/**
 * @jest-environment node
 */

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const mockGenerate = jest.fn();
jest.mock('@/lib/synaliaReportService', () => ({
  generateSynaliaReportForAgent: (...args) => mockGenerate(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin-user' } } }),
    },
  }),
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
    })),
  })),
}));

const AGENT_ID = '3e3c4bcc-e6b8-4c64-8ac5-e1ee2537363f';

describe('POST /api/synalia-report/send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerate.mockResolvedValue({
      filename: 'Nicolas - SYNALIA T1 2026.xlsx',
      data: { orderCount: 2, clientCount: 1, grandTotal: 500 },
      drive: { ok: true, webViewLink: 'https://drive.google.com/file/d/abc/view' },
      email: { sent: true, recipient: 'dionne@love-lab.com' },
    });
  });

  test('returns ok payload for admin', async () => {
    const { POST } = require('../synalia-report/send/route');
    const req = new Request('http://localhost/api/synalia-report/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: AGENT_ID, year: 2026, quarter: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.email.sent).toBe(true);
    expect(json.drive.webViewLink).toContain('drive.google.com');
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        agentId: AGENT_ID,
        year: 2026,
        quarter: 1,
        uploadToDrive: true,
        sendEmail: true,
      }),
    );
  });
});

/**
 * @jest-environment node
 *
 * /api/commission-reports/generate POST — Phase 19/B6
 *
 * Covers:
 *   ✓ 401 when no auth + no cron secret
 *   ✓ 401 when cron secret header doesn't match
 *   ✓ 403 when authed user is not admin
 *   ✓ 400 when agent_id is not a UUID
 *   ✓ 400 when month is not YYYY-MM
 *   ✓ 200 single-agent mode delegates to generateAgentReport with the right period
 *   ✓ 200 batch mode (no agent_id) delegates to generateAllAgents
 *   ✓ Cron auth → triggerSource: 'cron'
 *   ✓ Admin auth → triggerSource: 'manual', triggeredBy: user.id
 *   ✓ Skip flags pass through to options
 *   ✓ Defaults to previous calendar month when no month given
 *   ✓ recordHealthEvent fires when batch has failures
 */

const mockGenerateAgentReport = jest.fn();
const mockGenerateAllAgents = jest.fn();
const mockPreviousMonthPeriod = jest.fn();
const mockRecordHealthEvent = jest.fn().mockResolvedValue({ ok: true });

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

const mockAdminSupabase = {
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(() =>
      Promise.resolve({ data: currentUser ? { role: currentRole } : null, error: null }),
    ),
  })),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: currentUser } })) },
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/lib/commissionReportService', () => ({
  generateAgentReport: (...args) => mockGenerateAgentReport(...args),
  generateAllAgents: (...args) => mockGenerateAllAgents(...args),
  previousMonthPeriod: (...args) => mockPreviousMonthPeriod(...args),
}));

jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: (...args) => mockRecordHealthEvent(...args),
}));

const { POST } = require('../commission-reports/generate/route');

function makeRequest({ body = {}, headers = {} } = {}) {
  return new global.Request('http://localhost/api/commission-reports/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const FIXED_PERIOD = {
  start: '2026-04-01T00:00:00.000Z',
  end: '2026-04-30T23:59:59.999Z',
  key: '2026-04',
  label: 'April 2026',
};

beforeEach(() => {
  jest.clearAllMocks();
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  delete process.env.CRON_SECRET;
  mockPreviousMonthPeriod.mockReturnValue(FIXED_PERIOD);
});

describe('/api/commission-reports/generate POST', () => {
  test('401 when not logged in and no cron secret', async () => {
    currentUser = null;
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockGenerateAgentReport).not.toHaveBeenCalled();
    expect(mockGenerateAllAgents).not.toHaveBeenCalled();
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  test('401 when cron secret header is wrong', async () => {
    process.env.CRON_SECRET = 'expected';
    currentUser = null; // no fallback to admin
    const res = await POST(makeRequest({ headers: { 'x-vercel-cron-secret': 'wrong' } }));
    expect(res.status).toBe(401);
  });

  test('admin auth → triggerSource manual + triggeredBy=user.id', async () => {
    mockGenerateAllAgents.mockResolvedValue({
      summary: { period: FIXED_PERIOD, total_agents: 0, sent: 0, skipped: 0, failed: 0 },
      results: [],
    });

    const res = await POST(makeRequest({ body: {} }));
    expect(res.status).toBe(200);
    const args = mockGenerateAllAgents.mock.calls[0][0];
    expect(args.options.triggerSource).toBe('manual');
    expect(args.options.triggeredBy).toBe('admin-user');
  });

  test('cron auth → triggerSource cron, even with no logged-in user', async () => {
    process.env.CRON_SECRET = 'expected';
    currentUser = null;
    mockGenerateAllAgents.mockResolvedValue({
      summary: { period: FIXED_PERIOD, total_agents: 0, sent: 0, skipped: 0, failed: 0 },
      results: [],
    });

    const res = await POST(makeRequest({
      headers: { 'x-vercel-cron-secret': 'expected' },
      body: {},
    }));
    expect(res.status).toBe(200);
    const args = mockGenerateAllAgents.mock.calls[0][0];
    expect(args.options.triggerSource).toBe('cron');
    expect(args.options.triggeredBy).toBeNull();
  });

  test('400 when agent_id is not a UUID', async () => {
    const res = await POST(makeRequest({ body: { agent_id: 'not-a-uuid' } }));
    expect(res.status).toBe(400);
    expect(mockGenerateAgentReport).not.toHaveBeenCalled();
  });

  test('400 when month is not YYYY-MM', async () => {
    const res = await POST(makeRequest({ body: { month: 'April-2026' } }));
    expect(res.status).toBe(400);
    expect(mockGenerateAgentReport).not.toHaveBeenCalled();
    expect(mockGenerateAllAgents).not.toHaveBeenCalled();
  });

  test('400 when month is malformed (e.g. 2026-13)', async () => {
    const res = await POST(makeRequest({ body: { month: '2026-13' } }));
    expect(res.status).toBe(400);
  });

  test('400 when JSON body is invalid', async () => {
    const req = new global.Request('http://localhost/api/commission-reports/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('200 single-agent mode delegates to generateAgentReport', async () => {
    mockGenerateAgentReport.mockResolvedValue({
      reportId: 'r-1',
      totals: { grandTotal: 500 },
    });

    const validUuid = '11111111-1111-1111-1111-111111111111';
    const res = await POST(makeRequest({
      body: { agent_id: validUuid, month: '2026-04' },
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mode).toBe('single');
    expect(json.period.key).toBe('2026-04');
    expect(json.period.label).toBe('April 2026');

    expect(mockGenerateAgentReport).toHaveBeenCalledTimes(1);
    const args = mockGenerateAgentReport.mock.calls[0][0];
    expect(args.agentId).toBe(validUuid);
    expect(args.period.key).toBe('2026-04');
    expect(mockGenerateAllAgents).not.toHaveBeenCalled();
  });

  test('200 batch mode delegates to generateAllAgents when no agent_id', async () => {
    mockGenerateAllAgents.mockResolvedValue({
      summary: { period: FIXED_PERIOD, total_agents: 3, sent: 2, skipped: 1, failed: 0 },
      results: [
        { agent_id: 'a', ok: true, email: { sent: true } },
        { agent_id: 'b', ok: true, email: { sent: true } },
        { agent_id: 'c', ok: true, skipped: true },
      ],
    });

    const res = await POST(makeRequest({ body: { month: '2026-04' } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mode).toBe('batch');
    expect(json.summary.sent).toBe(2);
    expect(json.summary.skipped).toBe(1);
  });

  test('defaults to previous calendar month when month is not given', async () => {
    mockGenerateAllAgents.mockResolvedValue({
      summary: { period: FIXED_PERIOD, total_agents: 0, sent: 0, skipped: 0, failed: 0 },
      results: [],
    });

    await POST(makeRequest({ body: {} }));
    expect(mockPreviousMonthPeriod).toHaveBeenCalled();
  });

  test('skip flags & recipient pass through to service options', async () => {
    mockGenerateAllAgents.mockResolvedValue({
      summary: { period: FIXED_PERIOD, total_agents: 0, sent: 0, skipped: 0, failed: 0 },
      results: [],
    });

    await POST(makeRequest({
      body: {
        send_email: false,
        upload_to_drive: false,
        skip_if_empty: false,
        recipient: 'test@love-lab.com',
        month: '2026-04',
      },
    }));

    const args = mockGenerateAllAgents.mock.calls[0][0];
    expect(args.options.sendEmail).toBe(false);
    expect(args.options.uploadToDrive).toBe(false);
    expect(args.options.skipIfEmpty).toBe(false);
    expect(args.options.recipient).toBe('test@love-lab.com');
  });

  test('records a warn health event when batch has failures', async () => {
    mockGenerateAllAgents.mockResolvedValue({
      summary: { period: FIXED_PERIOD, total_agents: 2, sent: 1, skipped: 0, failed: 1 },
      results: [
        { agent_id: 'a', agent_name: 'A', ok: true, email: { sent: true } },
        { agent_id: 'b', agent_name: 'B', ok: false, error: 'kaboom' },
      ],
    });

    const res = await POST(makeRequest({ body: { month: '2026-04' } }));
    expect(res.status).toBe(200);
    expect(mockRecordHealthEvent).toHaveBeenCalledTimes(1);
    const arg = mockRecordHealthEvent.mock.calls[0][0];
    expect(arg.severity).toBe('warn');
    expect(arg.source).toBe('commission_reports_batch');
    expect(arg.context.summary.failed).toBe(1);
    expect(arg.context.failures[0].agent_id).toBe('b');
  });

  test('does NOT record a health event when batch has zero failures', async () => {
    mockGenerateAllAgents.mockResolvedValue({
      summary: { period: FIXED_PERIOD, total_agents: 1, sent: 1, skipped: 0, failed: 0 },
      results: [{ agent_id: 'a', ok: true, email: { sent: true } }],
    });

    await POST(makeRequest({ body: { month: '2026-04' } }));
    expect(mockRecordHealthEvent).not.toHaveBeenCalled();
  });

  test('500 + critical health event when service throws', async () => {
    mockGenerateAllAgents.mockRejectedValue(new Error('boom'));
    const res = await POST(makeRequest({ body: { month: '2026-04' } }));
    expect(res.status).toBe(500);
    expect(mockRecordHealthEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordHealthEvent.mock.calls[0][0].severity).toBe('critical');
  });
});

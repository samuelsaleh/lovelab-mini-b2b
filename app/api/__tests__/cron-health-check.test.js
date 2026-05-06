/**
 * @jest-environment node
 *
 * /api/cron/health-check GET — Phase 17 route tests.
 *
 * Covers:
 *   - Rejects when CRON_SECRET env var is missing
 *   - Rejects when x-vercel-cron-secret header doesn't match
 *   - Calls runDailyHealthCheck and returns its summary on success
 *   - Records a critical health event + 500 if the runner throws
 */

const runDailyHealthCheck = jest.fn();
const recordHealthEvent = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/healthCheck', () => ({
  runDailyHealthCheck: (...args) => runDailyHealthCheck(...args),
}));

jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: (...args) => recordHealthEvent(...args),
}));

const { GET } = require('../cron/health-check/route');

function makeRequest(headers = {}) {
  return new global.Request('http://localhost/api/cron/health-check', { headers });
}

beforeEach(() => {
  runDailyHealthCheck.mockReset();
  recordHealthEvent.mockClear();
  delete process.env.CRON_SECRET;
});

describe('/api/cron/health-check GET', () => {
  test('returns 401 when CRON_SECRET env var is not set', async () => {
    const res = await GET(makeRequest({ 'x-vercel-cron-secret': 'whatever' }));
    expect(res.status).toBe(401);
    expect(runDailyHealthCheck).not.toHaveBeenCalled();
  });

  test('returns 401 when the header secret does not match', async () => {
    process.env.CRON_SECRET = 'expected-secret';
    const res = await GET(makeRequest({ 'x-vercel-cron-secret': 'wrong' }));
    expect(res.status).toBe(401);
    expect(runDailyHealthCheck).not.toHaveBeenCalled();
  });

  test('calls runDailyHealthCheck and returns the summary on success', async () => {
    process.env.CRON_SECRET = 'expected-secret';
    const fakeSummary = {
      started_at: 'now',
      finished_at: 'later',
      findings: {
        ghost_commissions: { ok: true, count: 0 },
        duplicate_agent_events: { ok: true, duplicate_groups: 0 },
        schema_drift: { ok: true, missing_tables: 0 },
      },
    };
    runDailyHealthCheck.mockResolvedValue(fakeSummary);

    const res = await GET(makeRequest({ 'x-vercel-cron-secret': 'expected-secret' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual(fakeSummary);
    expect(runDailyHealthCheck).toHaveBeenCalledTimes(1);
  });

  test('records a critical health event and returns 500 when runner throws', async () => {
    process.env.CRON_SECRET = 'expected-secret';
    runDailyHealthCheck.mockRejectedValue(new Error('catastrophe'));

    const res = await GET(makeRequest({ 'x-vercel-cron-secret': 'expected-secret' }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('Health check failed');
    expect(body.detail).toBe('catastrophe');

    expect(recordHealthEvent).toHaveBeenCalledTimes(1);
    const args = recordHealthEvent.mock.calls[0][0];
    expect(args.source).toBe('cron_health_check_route');
    expect(args.severity).toBe('critical');
    expect(args.message).toBe('catastrophe');
  });
});

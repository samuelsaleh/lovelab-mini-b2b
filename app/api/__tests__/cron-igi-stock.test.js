/**
 * @jest-environment node
 *
 * /api/cron/igi-stock GET — the nightly certificate-shelf read.
 *
 * Covers:
 *   - Rejects when CRON_SECRET is missing or the header does not match
 *   - Returns the sync summary on success
 *   - Warns when a mapped description stops appearing (an upstream rename)
 *   - Warns when the payload looks truncated
 *   - Records an error and returns 500 when the read fails
 */

const syncShelfSnapshot = jest.fn();
const recordHealthEvent = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/igi/syncShelf', () => ({
  syncShelfSnapshot: (...args) => syncShelfSnapshot(...args),
}));

jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: (...args) => recordHealthEvent(...args),
}));

const { GET } = require('../cron/igi-stock/route');

function makeRequest(headers = {}) {
  return new global.Request('http://localhost/api/cron/igi-stock', { headers });
}

function summary(overrides = {}) {
  return {
    snapshot_date: '2026-08-28',
    lines_read: 116,
    reported_count: 116,
    truncated: false,
    matched: 26,
    new_descriptions: [],
    vanished_descriptions: [],
    certificates_on_shelf: 3504,
    ...overrides,
  };
}

beforeEach(() => {
  syncShelfSnapshot.mockReset();
  recordHealthEvent.mockClear();
  delete process.env.CRON_SECRET;
});

describe('/api/cron/igi-stock GET', () => {
  test('refuses to run when CRON_SECRET is not configured', async () => {
    const res = await GET(makeRequest({ 'x-vercel-cron-secret': 'whatever' }));
    expect(res.status).toBe(401);
    expect(syncShelfSnapshot).not.toHaveBeenCalled();
  });

  test('refuses a request whose secret does not match', async () => {
    process.env.CRON_SECRET = 'real-secret';
    const res = await GET(makeRequest({ 'x-vercel-cron-secret': 'wrong' }));
    expect(res.status).toBe(401);
    expect(syncShelfSnapshot).not.toHaveBeenCalled();
  });

  test('refuses a request carrying no secret at all', async () => {
    process.env.CRON_SECRET = 'real-secret';
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  test('returns the summary when the read succeeds', async () => {
    process.env.CRON_SECRET = 'real-secret';
    syncShelfSnapshot.mockResolvedValue(summary());

    const res = await GET(makeRequest({ 'x-vercel-cron-secret': 'real-secret' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.matched).toBe(26);
    expect(body.certificates_on_shelf).toBe(3504);
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  test('warns when a mapped description stops appearing upstream', async () => {
    // This is the rename case: the model's shelf figure silently freezes, so it
    // has to be reported rather than written as zero.
    process.env.CRON_SECRET = 'real-secret';
    syncShelfSnapshot.mockResolvedValue(
      summary({ vanished_descriptions: ['IGI MULTIFIVE0.25'] }),
    );

    const res = await GET(makeRequest({ 'x-vercel-cron-secret': 'real-secret' }));
    expect(res.status).toBe(200);

    const event = recordHealthEvent.mock.calls[0][0];
    expect(event.source).toBe('cron_igi_stock');
    expect(event.severity).toBe('warn');
    expect(event.context.descriptions).toContain('IGI MULTIFIVE0.25');
  });

  test('warns when the payload looks truncated', async () => {
    process.env.CRON_SECRET = 'real-secret';
    syncShelfSnapshot.mockResolvedValue(
      summary({ truncated: true, lines_read: 40, reported_count: 116 }),
    );

    await GET(makeRequest({ 'x-vercel-cron-secret': 'real-secret' }));

    const event = recordHealthEvent.mock.calls.find((c) => /line count/.test(c[0].message));
    expect(event).toBeDefined();
    expect(event[0].severity).toBe('warn');
  });

  test('notes new descriptions so somebody links them', async () => {
    process.env.CRON_SECRET = 'real-secret';
    syncShelfSnapshot.mockResolvedValue(
      summary({ new_descriptions: ['IGI SOMETHING NEW 0.10'] }),
    );

    await GET(makeRequest({ 'x-vercel-cron-secret': 'real-secret' }));

    const event = recordHealthEvent.mock.calls.find((c) => /need linking/.test(c[0].message));
    expect(event[0].severity).toBe('info');
  });

  test('records an error and returns 500 when the ERP read fails', async () => {
    process.env.CRON_SECRET = 'real-secret';
    syncShelfSnapshot.mockRejectedValue(new Error('packing-stock returned HTTP 502'));

    const res = await GET(makeRequest({ 'x-vercel-cron-secret': 'real-secret' }));
    expect(res.status).toBe(500);

    const event = recordHealthEvent.mock.calls[0][0];
    expect(event.severity).toBe('error');
    expect(event.message).toMatch(/502/);
  });
});

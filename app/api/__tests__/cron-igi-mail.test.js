/**
 * @jest-environment node
 *
 * The hourly cron that sends the scheduled certificate emails on Antwerp
 * time (Sam, 24 Sept 2026).
 */

jest.mock('@/lib/supabase/server', () => ({ createAdminClient: jest.fn(() => ({ tag: 'admin' })) }));
jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn(async () => ({ ok: true })) }));
const runMorningDigest = jest.fn(async () => ({ kind: 'morning', sent: true }));
const runIgiWeekly = jest.fn(async () => ({ kind: 'igi_weekly', sent: true }));
const runOrderDigest = jest.fn(async () => ({ kind: 'order', sent: true }));
jest.mock('@/lib/igi/runDigests', () => ({
  runMorningDigest: (...a) => runMorningDigest(...a),
  runIgiWeekly: (...a) => runIgiWeekly(...a),
  runOrderDigest: (...a) => runOrderDigest(...a),
}));

const { GET, dueNow, brusselsClock } = require('../cron/igi-mail/route');
const { recordHealthEvent } = require('@/lib/healthEvent');

function req(query = '', headers = { 'x-vercel-cron-secret': 'secret' }) {
  return new global.Request(`http://localhost/api/cron/igi-mail${query}`, { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = 'secret';
  jest.useRealTimers();
  runMorningDigest.mockClear(); runIgiWeekly.mockClear(); runOrderDigest.mockClear();
});

describe('the Antwerp clock', () => {
  test('07:00 in summer is 05:00 UTC, and in winter 06:00 UTC', () => {
    expect(brusselsClock('2026-07-01T05:00:00Z')).toMatchObject({ hour: 7 });
    expect(brusselsClock('2026-12-01T06:00:00Z')).toMatchObject({ hour: 7 });
    expect(brusselsClock('2026-12-01T05:00:00Z')).toMatchObject({ hour: 6 });
  });
  test('knows a Friday and its ISO week', () => {
    // 25 Sept 2026 is a Friday in ISO week 39.
    expect(brusselsClock('2026-09-25T12:00:00Z')).toMatchObject({ weekday: 'Fri', hour: 14, isoWeek: 39 });
    expect(brusselsClock('2026-10-02T12:00:00Z')).toMatchObject({ weekday: 'Fri', isoWeek: 40 });
  });
});

describe('what is due', () => {
  test('the morning mail at 07:00, any day', () => {
    expect(dueNow('2026-09-24T05:00:00Z')).toEqual(['morning']);   // Thursday
    expect(dueNow('2026-09-24T06:00:00Z')).toEqual([]);
  });
  test('IGI every Friday at 14:00, Alberto only on even ISO weeks', () => {
    expect(dueNow('2026-09-25T12:00:00Z')).toEqual(['weekly']);           // week 39
    expect(dueNow('2026-10-02T12:00:00Z')).toEqual(['weekly', 'order']);  // week 40
    expect(dueNow('2026-09-24T12:00:00Z')).toEqual([]);                   // Thursday 14:00
  });
});

describe('GET', () => {
  test('refuses without the secret', async () => {
    expect((await GET(req('', {}))).status).toBe(401);
  });

  test('skips when nothing is due', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T10:00:00Z'));
    const body = await (await GET(req())).json();
    expect(body.skipped).toBe(true);
    expect(runMorningDigest).not.toHaveBeenCalled();
  });

  test('runs what is due and reports each result', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-02T12:00:00Z'));   // Friday, week 40, 14:00
    const body = await (await GET(req())).json();
    expect(body.ran).toEqual(['weekly', 'order']);
    expect(body.results.igi_weekly ?? body.results.weekly).toBeTruthy();
    expect(runIgiWeekly).toHaveBeenCalledWith({ tag: 'admin' });
    expect(runOrderDigest).toHaveBeenCalledWith({ tag: 'admin' });
    expect(runMorningDigest).not.toHaveBeenCalled();
  });

  test('?force runs one digest now, whatever the clock', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T10:00:00Z'));
    const body = await (await GET(req('?force=morning'))).json();
    expect(body.ran).toEqual(['morning']);
    expect(runMorningDigest).toHaveBeenCalledTimes(1);
    expect((await GET(req('?force=lunch'))).status).toBe(400);
  });

  test('a runner that throws is recorded and does not stop the others', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-02T12:00:00Z'));
    runIgiWeekly.mockRejectedValueOnce(new Error('mail down'));
    const body = await (await GET(req())).json();
    expect(body.results.weekly).toEqual({ sent: false, reason: 'error', error: 'mail down' });
    expect(body.results.order).toMatchObject({ sent: true });
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'cron_igi_mail', severity: 'error' }));
  });
});

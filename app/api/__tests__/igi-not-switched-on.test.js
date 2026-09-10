/**
 * @jest-environment node
 *
 * Before the switch-on file has been run, every certificate route hits a
 * table that does not exist. Sam, 10 Sept 2026, on his own machine: "IGI side
 * can't be opened", with a bare "Failed to load". It now says what to do.
 */
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn(), createAdminClient: jest.fn() }));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: jest.fn() }));

const lovelab = require('../igi/_lib/access');
const igi = require('../igi-portal/_lib/access');

const MISSING = { code: '42P01', message: 'relation "public.igi_models" does not exist' };

describe.each([['LoveLab', lovelab], ['IGI', igi]])('%s routes', (_name, helper) => {
  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  test('turn a missing certificate table into "not switched on yet", with the file to run', async () => {
    const res = helper.fail('X', MISSING, 'Failed to load');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.not_switched_on).toBe(true);
    expect(body.error).toMatch(/not switched on yet/);
    expect(body.error).toMatch(/igi-switch-on\.sql/);
  });

  test('recognise it from the message alone, as loadIgiWorld rethrows it', () => {
    expect(helper.isNotSwitchedOn(new Error('relation "public.igi_visits" does not exist'))).toBe(true);
    expect(helper.isNotSwitchedOn(new Error('relation igi_batches does not exist'))).toBe(true);
  });

  test('leave every other failure as it was', async () => {
    const res = helper.fail('X', new Error('connection reset'), 'Failed to load');
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to load');
    expect(helper.isNotSwitchedOn(new Error('relation "documents" does not exist'))).toBe(false);
  });
});

describe.each([['LoveLab', lovelab], ['IGI', igi]])('%s routes, database behind the app', (_name, helper) => {
  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  test('a missing column says to run the switch-on file again', async () => {
    const res = helper.fail('X', { code: '42703', message: 'column igi_models.requested_at does not exist' }, 'Failed');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.behind_the_app).toBe(true);
    expect(body.error).toMatch(/run database-migrations\/igi-switch-on\.sql again/i);
    expect(helper.isBehindTheApp(new Error('column igi_models.numbered_at does not exist'))).toBe(true);
    expect(helper.isBehindTheApp(new Error('column documents.foo does not exist'))).toBe(false);
  });
});

/**
 * @jest-environment node
 *
 * A new model, each company entering its own half: LoveLab add it through
 * POST /api/igi/models, IGI number it through PATCH /api/igi-portal/models/[id]/serial,
 * and a LoveLab admin can drive that second step from the preview.
 */

const getUserContext = jest.fn();
const authGetUser = jest.fn();
const checkRateLimit = jest.fn(() => null);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => global.__user),
  createAdminClient: jest.fn(() => global.__admin),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: (...a) => checkRateLimit(...a) }));
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => getUserContext(...a) }));

const models = require('../igi/models/route');
const portalSerial = require('../igi-portal/models/[modelId]/serial/route');
const previewSerial = require('../igi/preview/models/[modelId]/serial/route');

function req(body, method = 'POST') {
  return new global.Request('http://localhost/api/igi', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

/** One igi_models table, shared by whichever client reaches it. */
function table(rows) {
  const state = { rows: rows.map((r) => ({ ...r })), inserted: null, updates: [] };
  const from = (name) => {
    if (name === 'profiles') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }) };
    }
    let filter = () => true;
    let patch = null;
    const chain = {
      select: () => chain,
      eq: (col, val) => { const prev = filter; filter = (r) => prev(r) && r[col] === val; return chain; },
      maybeSingle: async () => ({ data: state.rows.find(filter) ?? null, error: null }),
      single: async () => {
        if (state.inserted && !patch) return { data: { id: 'new-id', ...state.inserted }, error: null };
        const target = state.rows.find(filter);
        Object.assign(target, patch);
        state.updates.push({ id: target.id, ...patch });
        return { data: { ...target }, error: null };
      },
      insert: (payload) => { state.inserted = payload; return chain; },
      update: (p) => { patch = p; return chain; },
    };
    return chain;
  };
  return { state, from, auth: { getUser: authGetUser } };
}

const WAITING = { id: 'm-new', name: 'Full Moonlight', stones: '1', carat: 0.5, shape: 'Round', state: 'awaiting_serial', serial: null };

beforeEach(() => {
  checkRateLimit.mockReset().mockReturnValue(null);
  getUserContext.mockReset().mockResolvedValue({ user: { id: 'sam' }, isAdmin: true });
  authGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'igi-1' } } });
  global.__admin = table([WAITING]);
  global.__user = table([WAITING]);
  global.__user.state.profile = { id: 'igi-1', is_igi: true };
});

describe('LoveLab add a model', () => {
  test('is born awaiting a serial, stamped with who asked', async () => {
    const res = await models.POST(req({ name: ' Full Moonlight ', stones: '1', carat: 0.5, shape: 'round' }));
    expect(res.status).toBe(201);
    const { model } = await res.json();
    expect(model).toMatchObject({ name: 'Full Moonlight', stones: '1', carat: 0.5, shape: 'Round', state: 'awaiting_serial' });
    expect(global.__admin.state.inserted).toMatchObject({ state: 'awaiting_serial', requested_by: 'sam' });
    expect(global.__admin.state.inserted.requested_at).toBeTruthy();
    expect(global.__admin.state.inserted).not.toHaveProperty('serial');
  });

  test('saves the name the way every other name reads, whatever was typed', async () => {
    // Sam, 11 Sept 2026: "MULTI MOONLIGHT" next to "Multi Moonlight" must not happen.
    const res = await models.POST(req({ name: 'multi  MOONLIGHT/sienna three', stones: '3', carat: 0.4, shape: 'Round' }));
    expect(res.status).toBe(201);
    expect((await res.json()).model.name).toBe('Multi Moonlight / Sienna 3');
    expect(global.__admin.state.inserted.name).toBe('Multi Moonlight / Sienna 3');
  });

  test('accepts a stone sum like 6+1 and refuses nonsense', async () => {
    expect((await models.POST(req({ name: 'X', stones: '6+1', carat: 1.2, shape: 'Oval' }))).status).toBe(201);
    expect((await models.POST(req({ name: 'X', stones: 'many', carat: 1, shape: 'Oval' }))).status).toBe(400);
    expect((await models.POST(req({ name: 'X', stones: '1', carat: 0, shape: 'Oval' }))).status).toBe(400);
    expect((await models.POST(req({ name: 'X', stones: '1', carat: 1, shape: '' }))).status).toBe(400);
    expect((await models.POST(req({ name: '', stones: '1', carat: 1, shape: 'Oval' }))).status).toBe(400);
  });

  test('is LoveLab-admin only', async () => {
    getUserContext.mockResolvedValue({ user: { id: 'x' }, isAdmin: false });
    expect((await models.POST(req({ name: 'X', stones: '1', carat: 1, shape: 'Oval' }))).status).toBe(403);
    getUserContext.mockResolvedValue({ user: null, isAdmin: false });
    expect((await models.POST(req({ name: 'X', stones: '1', carat: 1, shape: 'Oval' }))).status).toBe(401);
  });
});

describe('IGI number it', () => {
  const params = { params: Promise.resolve({ modelId: 'm-new' }) };

  test('through their own route, as their own user', async () => {
    const res = await portalSerial.PATCH(req({ serial: 'lgaj 6600' }, 'PATCH'), params);
    expect(res.status).toBe(200);
    expect((await res.json()).model).toMatchObject({ serial: 'LGAJ6600', state: 'in_use' });
    expect(global.__user.state.updates[0]).toMatchObject({ serial: 'LGAJ6600', state: 'in_use', numbered_by: 'igi-1' });
    // The service-role client was never touched.
    expect(global.__admin.state.updates).toHaveLength(0);
  });

  test('only IGI accounts may', async () => {
    global.__user.state.profile = { id: 'u', is_igi: false, role: 'admin' };
    expect((await portalSerial.PATCH(req({ serial: 'LGAJ6600' }, 'PATCH'), params)).status).toBe(403);
    authGetUser.mockResolvedValue({ data: { user: null } });
    expect((await portalSerial.PATCH(req({ serial: 'LGAJ6600' }, 'PATCH'), params)).status).toBe(401);
  });

  test('a bad serial is refused with the reason', async () => {
    const res = await portalSerial.PATCH(req({ serial: '6600' }, 'PATCH'), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/LGAJ6529/);
  });

  test('a LoveLab admin can do it from the preview, and it says they did', async () => {
    const res = await previewSerial.PATCH(req({ serial: 'LGAJ6601' }, 'PATCH'), params);
    expect(res.status).toBe(200);
    expect(global.__admin.state.updates[0]).toMatchObject({ serial: 'LGAJ6601', numbered_by: 'sam' });
    getUserContext.mockResolvedValue({ user: { id: 'x' }, isAdmin: false });
    expect((await previewSerial.PATCH(req({ serial: 'LGAJ6601' }, 'PATCH'), params)).status).toBe(403);
  });
});

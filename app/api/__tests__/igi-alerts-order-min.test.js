/**
 * @jest-environment node
 *
 * PATCH /api/igi/alerts — LoveLab's level on IGI's stock, beside the one on the shelf.
 */
const getUserContext = jest.fn();
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn(async () => ({})), createAdminClient: jest.fn(() => global.__db) }));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));
jest.mock('@/app/api/_lib/access', () => ({ getUserContext: (...a) => getUserContext(...a) }));

const { PATCH } = require('../igi/alerts/route');

function req(body) {
  return new global.Request('http://localhost/api/igi/alerts', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function db() {
  const captured = { patch: null, ids: null };
  const api = {
    captured,
    from() {
      return {
        update(patch) {
          captured.patch = patch;
          return {
            in(_col, ids) {
              captured.ids = ids;
              return { select: async () => ({ data: ids.map((id) => ({ id })), error: null }) };
            },
          };
        },
      };
    },
  };
  return api;
}

beforeEach(() => { getUserContext.mockResolvedValue({ user: { id: 'u1' }, isAdmin: true }); global.__db = db(); });

test('sets our level at IGI and forgets any earlier alert for it', async () => {
  const res = await PATCH(req({ model_ids: ['m1', 'm2'], order_min: 500 }));
  expect(res.status).toBe(200);
  expect(global.__db.captured.patch).toMatchObject({ order_min: 500, order_alerted_at: null });
  expect(global.__db.captured.patch).not.toHaveProperty('shelf_min');
  expect(global.__db.captured.ids).toEqual(['m1', 'm2']);
});

test('an empty level means no opinion', async () => {
  expect((await PATCH(req({ model_ids: ['m1'], order_min: null }))).status).toBe(200);
  expect(global.__db.captured.patch.order_min).toBeNull();
});

test('still sets the shelf level as before, and refuses nonsense', async () => {
  expect((await PATCH(req({ model_ids: ['m1'], shelf_min: 40 }))).status).toBe(200);
  expect(global.__db.captured.patch).toMatchObject({ shelf_min: 40 });
  expect((await PATCH(req({ model_ids: ['m1'], order_min: -1 }))).status).toBe(400);
  expect((await PATCH(req({ model_ids: ['m1'], order_min: 1.5 }))).status).toBe(400);
  expect((await PATCH(req({ model_ids: ['m1'] }))).status).toBe(400);
});

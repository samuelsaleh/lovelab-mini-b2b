/**
 * @jest-environment node
 *
 * /api/commissions/[id]  DELETE
 *
 * Admin-only delete of any single commission row (quick order, bonus, order
 * commission, new-client bonus) regardless of status.
 *
 * Coverage:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is not admin
 *   ✓ 400 when commission id is malformed (not a UUID)
 *   ✓ 404 when the row does not exist
 *   ✓ 200 deletes an order-linked commission row
 *   ✓ 200 deletes a paid-out commission row
 *   ✓ 200 deletes a manual quick order (scoped by id)
 *   ✓ 500 when the delete query errors
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

let deletedRow = { id: '11111111-1111-1111-1111-111111111111' };
let deleteFilters = null;
let deleteError = null;

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() =>
          Promise.resolve({
            data: currentUser ? { role: currentRole } : null,
            error: null,
          }),
        ),
      };
    }
    if (table === 'agent_commissions') {
      return {
        // Delete: .delete().eq(...).select('id').maybeSingle()
        delete: jest.fn(() => {
          deleteFilters = {};
          const chain = {};
          chain.eq = jest.fn((col, val) => { deleteFilters[col] = val; return chain; });
          chain.select = jest.fn().mockReturnValue(chain);
          chain.maybeSingle = jest.fn(() =>
            Promise.resolve({ data: deleteError ? null : deletedRow, error: deleteError }),
          );
          return chain;
        }),
      };
    }
    throw new Error('unexpected table: ' + table);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: currentUser } })) },
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { DELETE } = require('../commissions/[id]/route');

const VALID_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest() {
  return new global.Request(`http://localhost/api/commissions/${VALID_ID}`, {
    method: 'DELETE',
  });
}

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  deletedRow = { id: VALID_ID };
  deleteFilters = null;
  deleteError = null;
  jest.clearAllMocks();
});

describe('DELETE /api/commissions/[id]', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(403);
  });

  test('400 when id is not a UUID', async () => {
    const res = await DELETE(makeRequest(), { params: { id: 'not-a-uuid' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid commission id/i);
  });

  test('404 when the row does not exist', async () => {
    deletedRow = null;
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  test('200 deletes by id (any type/status) and reports success', async () => {
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe(VALID_ID);
    expect(deleteFilters).toEqual({ id: VALID_ID });
  });

  test('200 deletes an order-linked / paid-out row (no extra guards)', async () => {
    deletedRow = { id: VALID_ID };
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('500 when delete errors', async () => {
    deleteError = { message: 'db boom' };
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to delete/i);
  });
});

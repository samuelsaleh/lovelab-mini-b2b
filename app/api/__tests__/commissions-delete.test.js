/**
 * @jest-environment node
 *
 * /api/commissions/[id]  DELETE
 *
 * Admin-only delete of safe manual commission rows only. Quick orders and
 * ad-hoc bonuses can be deleted while unpaid and unreported; order-linked,
 * reported, and paid rows are protected to preserve the payout audit trail.
 *
 * Coverage:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is not admin
 *   ✓ 400 when commission id is malformed (not a UUID)
 *   ✓ 404 when the row does not exist
 *   ✓ 200 deletes an unpaid, unreported manual quick order
 *   ✓ 200 deletes an unpaid, unreported manual bonus
 *   ✓ 409 refuses paid rows
 *   ✓ 409 refuses reported rows
 *   ✓ 409 refuses order-linked rows
 *   ✓ 409 when a row changes between lookup and delete
 *   ✓ 500 when the delete query errors
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

let lookupRow = {
  id: '11111111-1111-1111-1111-111111111111',
  status: 'pending',
  report_id: null,
  document_id: null,
  type: 'order',
};
let lookupFilters = null;
let lookupError = null;
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
        // Lookup: .select(...).eq(...).maybeSingle()
        select: jest.fn(() => {
          lookupFilters = {};
          const chain = {};
          chain.eq = jest.fn((col, val) => {
            lookupFilters[col] = val;
            return chain;
          });
          chain.maybeSingle = jest.fn(() =>
            Promise.resolve({ data: lookupError ? null : lookupRow, error: lookupError }),
          );
          return chain;
        }),
        // Delete: .delete().eq(...).neq(...).is(...).select('id').maybeSingle()
        delete: jest.fn(() => {
          deleteFilters = {};
          const chain = {};
          chain.eq = jest.fn((col, val) => {
            deleteFilters[col] = val;
            return chain;
          });
          chain.neq = jest.fn((col, val) => {
            deleteFilters[`${col}_neq`] = val;
            return chain;
          });
          chain.is = jest.fn((col, val) => {
            deleteFilters[`${col}_is`] = val;
            return chain;
          });
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
  lookupRow = {
    id: VALID_ID,
    status: 'pending',
    report_id: null,
    document_id: null,
    type: 'order',
  };
  lookupFilters = null;
  lookupError = null;
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
    lookupRow = null;
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  test('200 deletes an unpaid, unreported manual quick order with race-safe guards', async () => {
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe(VALID_ID);
    expect(lookupFilters).toEqual({ id: VALID_ID });
    expect(deleteFilters).toEqual({
      id: VALID_ID,
      status_neq: 'paid',
      report_id_is: null,
      type: 'order',
      document_id_is: null,
    });
  });

  test('200 deletes an unpaid, unreported manual bonus', async () => {
    lookupRow = { ...lookupRow, type: 'bonus' };
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(deleteFilters).toMatchObject({
      id: VALID_ID,
      status_neq: 'paid',
      report_id_is: null,
      type: 'bonus',
      document_id_is: null,
    });
  });

  test('409 refuses paid rows', async () => {
    lookupRow = { ...lookupRow, status: 'paid' };
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/unpaid, unreported manual/i);
    expect(deleteFilters).toBeNull();
  });

  test('409 refuses reported rows', async () => {
    lookupRow = { ...lookupRow, report_id: 'report-1' };
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(409);
    expect(deleteFilters).toBeNull();
  });

  test('409 refuses order-linked rows', async () => {
    lookupRow = { ...lookupRow, document_id: 'doc-1', type: 'order' };
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(409);
    expect(deleteFilters).toBeNull();
  });

  test('409 when row changes before the guarded delete', async () => {
    deletedRow = null;
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no longer safe/i);
  });

  test('500 when delete errors', async () => {
    deleteError = { message: 'db boom' };
    const res = await DELETE(makeRequest(), { params: { id: VALID_ID } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to delete/i);
  });
});

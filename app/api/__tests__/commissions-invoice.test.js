/**
 * @jest-environment node
 *
 * /api/commissions/[id]  PATCH
 *
 * Admin-only update of the manual `invoice_number` note on a single commission
 * row. Lets an admin reconcile a commission against an accounting invoice.
 *
 * Coverage:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is not admin
 *   ✓ 400 when commission id is malformed (not a UUID)
 *   ✓ 400 when invoice_number is missing from the body
 *   ✓ 400 when invoice_number is the wrong type
 *   ✓ 404 when the row does not exist
 *   ✓ 200 saves a trimmed invoice number
 *   ✓ 200 clears the invoice number (blank string -> NULL)
 *   ✓ 200 caps over-long values
 *   ✓ 500 when the update query errors
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';

let updatedRow = { id: '11111111-1111-1111-1111-111111111111', invoice_number: 'INV-1' };
let updateValues = null;
let updateFilters = null;
let updateError = null;

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
        // Update: .update({...}).eq(...).select(...).maybeSingle()
        update: jest.fn((values) => {
          updateValues = values;
          updateFilters = {};
          const chain = {};
          chain.eq = jest.fn((col, val) => { updateFilters[col] = val; return chain; });
          chain.select = jest.fn().mockReturnValue(chain);
          chain.maybeSingle = jest.fn(() =>
            Promise.resolve({
              data: updateError ? null : (updatedRow ? { ...updatedRow, ...updateValues } : null),
              error: updateError,
            }),
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

const { PATCH } = require('../commissions/[id]/route');

const VALID_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(body) {
  return new global.Request(`http://localhost/api/commissions/${VALID_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  updatedRow = { id: VALID_ID, invoice_number: 'INV-1' };
  updateValues = null;
  updateFilters = null;
  updateError = null;
  jest.clearAllMocks();
});

describe('PATCH /api/commissions/[id]', () => {
  test('401 when no session', async () => {
    currentUser = null;
    const res = await PATCH(makeRequest({ invoice_number: 'X' }), { params: { id: VALID_ID } });
    expect(res.status).toBe(401);
  });

  test('403 when caller is not admin', async () => {
    currentRole = 'user';
    const res = await PATCH(makeRequest({ invoice_number: 'X' }), { params: { id: VALID_ID } });
    expect(res.status).toBe(403);
  });

  test('400 when id is not a UUID', async () => {
    const res = await PATCH(makeRequest({ invoice_number: 'X' }), { params: { id: 'not-a-uuid' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid commission id/i);
  });

  test('400 when invoice_number is missing', async () => {
    const res = await PATCH(makeRequest({}), { params: { id: VALID_ID } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invoice_number is required/i);
  });

  test('400 when invoice_number is the wrong type', async () => {
    const res = await PATCH(makeRequest({ invoice_number: 123 }), { params: { id: VALID_ID } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/must be a string/i);
  });

  test('404 when the row does not exist', async () => {
    updatedRow = null;
    const res = await PATCH(makeRequest({ invoice_number: 'INV-9' }), { params: { id: VALID_ID } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  test('200 saves a trimmed invoice number scoped by id', async () => {
    const res = await PATCH(makeRequest({ invoice_number: '  INV-42  ' }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updateValues).toEqual({ invoice_number: 'INV-42' });
    expect(updateFilters).toEqual({ id: VALID_ID });
  });

  test('200 clears the invoice number (blank -> NULL)', async () => {
    const res = await PATCH(makeRequest({ invoice_number: '   ' }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(updateValues).toEqual({ invoice_number: null });
  });

  test('200 accepts explicit null to clear', async () => {
    const res = await PATCH(makeRequest({ invoice_number: null }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(updateValues).toEqual({ invoice_number: null });
  });

  test('200 caps over-long values at 100 chars', async () => {
    const long = 'A'.repeat(250);
    const res = await PATCH(makeRequest({ invoice_number: long }), { params: { id: VALID_ID } });
    expect(res.status).toBe(200);
    expect(updateValues.invoice_number).toHaveLength(100);
  });

  test('500 when update errors', async () => {
    updateError = { message: 'db boom' };
    const res = await PATCH(makeRequest({ invoice_number: 'X' }), { params: { id: VALID_ID } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to update/i);
  });
});

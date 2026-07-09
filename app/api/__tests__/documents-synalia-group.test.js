/**
 * @jest-environment node
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';
let existingMetadata = { formState: { companyName: 'Client' } };
let updatePayload = null;

const VALID_ID = '11111111-1111-1111-1111-111111111111';

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() => Promise.resolve({ data: { role: currentRole }, error: null })),
      };
    }
    if (table === 'documents') {
      const chain = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.single = jest.fn(() => Promise.resolve({
        data: { id: VALID_ID, metadata: existingMetadata },
        error: null,
      }));
      chain.update = jest.fn((payload) => {
        updatePayload = payload;
        chain.single = jest.fn(() => Promise.resolve({
          data: { id: VALID_ID, metadata: payload.metadata },
          error: null,
        }));
        return chain;
      });
      return chain;
    }
    throw new Error(`unexpected table: ${table}`);
  }),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: currentUser } })) },
  }),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { PATCH } = require('../documents/[id]/synalia/route');

function makeRequest(body) {
  return new global.Request(`http://localhost/api/documents/${VALID_ID}/synalia`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  existingMetadata = { formState: { companyName: 'Client' } };
  updatePayload = null;
  mockAdminSupabase.from.mockClear();
});

describe('PATCH /api/documents/[id]/synalia', () => {
  test('accepts jewelerGroup and writes derived legacy synalia flags', async () => {
    const res = await PATCH(makeRequest({ jewelerGroup: 'MG' }), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(200);
    expect(updatePayload.metadata.jewelerGroup).toBe('MG');
    expect(updatePayload.metadata.synalia).toBe(false);
    expect(updatePayload.metadata.formState.jewelerGroup).toBe('MG');
    expect(updatePayload.metadata.formState.synalia).toBe(false);
  });

  test('keeps legacy boolean body compatible', async () => {
    const res = await PATCH(makeRequest({ synalia: true }), { params: Promise.resolve({ id: VALID_ID }) });
    expect(res.status).toBe(200);
    expect(updatePayload.metadata.jewelerGroup).toBe('SYNALIA');
    expect(updatePayload.metadata.synalia).toBe(true);
  });
});

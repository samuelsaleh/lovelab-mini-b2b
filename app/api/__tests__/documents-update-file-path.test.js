/**
 * @jest-environment node
 *
 * PUT /api/documents/:id — storage path integrity.
 *
 * A document update replaces the generated PDF, then later admin client emails
 * attach whatever storage object is referenced by documents.file_path. Non-admin
 * updates must only be able to persist paths returned by their own upload call
 * (`/api/documents/upload` scopes those paths under the authenticated user id).
 */

const DOC_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let oldDoc;
let updatePayload;
let mockDocumentsTable;

const mockStorageRemove = jest.fn();
const mockGetUserContext = jest.fn();
const mockIsUserOwnerOrSameEmail = jest.fn();
const mockRequireEventPermission = jest.fn();

function buildDocumentsTable() {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: oldDoc, error: null }),
      }),
    }),
    update: jest.fn((payload) => {
      updatePayload = payload;
      return {
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: DOC_ID, created_by: oldDoc.created_by, ...payload },
              error: null,
            }),
          }),
        }),
      };
    }),
  };
}

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'documents') return mockDocumentsTable;
    throw new Error('unexpected table: ' + table);
  }),
  storage: {
    from: jest.fn(() => ({
      remove: mockStorageRemove,
    })),
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: (...args) => mockGetUserContext(...args),
  isUserOwnerOrSameEmail: (...args) => mockIsUserOwnerOrSameEmail(...args),
  requireEventPermission: (...args) => mockRequireEventPermission(...args),
}));

jest.mock('@/lib/lovelab-sync', () => ({ syncConsignmentToLovelab: jest.fn() }));
jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn() }));
jest.mock('@/lib/commissionAttribution', () => ({
  resolveCommissionAgent: jest.fn(),
  upsertCommissionForDocument: jest.fn(),
}));
jest.mock('@/lib/newClientBonus', () => ({ maybeCreateBonusForOrder: jest.fn() }));

const { PUT } = require('../documents/[id]/route');

function makeRequest(body) {
  return new global.Request(`http://localhost/api/documents/${DOC_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = {
  event_id: null,
  client_name: 'Client',
  client_company: 'Company',
  document_type: 'order',
  file_name: 'order.pdf',
  file_size: 1234,
  total_amount: null,
  metadata: {},
  order_channel: 'b2b',
};

beforeEach(() => {
  oldDoc = { file_path: 'current-user/old.pdf', created_by: 'current-user', event_id: null };
  updatePayload = null;
  mockDocumentsTable = buildDocumentsTable();
  jest.clearAllMocks();
  mockAdminSupabase.from.mockImplementation((table) => {
    if (table === 'documents') return mockDocumentsTable;
    throw new Error('unexpected table: ' + table);
  });
  mockAdminSupabase.storage.from.mockReturnValue({ remove: mockStorageRemove });
  mockStorageRemove.mockResolvedValue({ data: null, error: null });
  mockGetUserContext.mockResolvedValue({
    user: { id: 'current-user', email: 'current@example.com' },
    profile: { id: 'current-user', role: 'member' },
    isAdmin: false,
  });
  mockIsUserOwnerOrSameEmail.mockResolvedValue(true);
  mockRequireEventPermission.mockResolvedValue({ allowed: false });
});

describe('PUT /api/documents/:id — file_path scope', () => {
  test('rejects non-admin updates that point at another user storage prefix before deleting anything', async () => {
    const res = await PUT(
      makeRequest({ ...BASE_BODY, file_path: 'other-user/stolen.pdf' }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/file path scope/i);
    expect(mockStorageRemove).not.toHaveBeenCalled();
    expect(mockDocumentsTable.update).not.toHaveBeenCalled();
  });

  test('accepts non-admin updates for the authenticated user upload prefix', async () => {
    const res = await PUT(
      makeRequest({ ...BASE_BODY, file_path: 'current-user/event/new.pdf' }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );

    expect(res.status).toBe(200);
    expect(updatePayload.file_path).toBe('current-user/event/new.pdf');
    expect(mockStorageRemove).toHaveBeenCalledWith(['current-user/old.pdf']);
  });
});

/**
 * @jest-environment node
 *
 * Soft-delete cascade — unit tests
 *
 * Covers:
 *   - DELETE /api/documents/:id sets `deleted_at` on the document AND flips
 *     linked agent_commissions to status='cancelled', skipping 'paid' rows.
 *   - POST /api/documents/:id/restore clears `deleted_at` AND flips
 *     'cancelled' commissions back to 'pending'.
 *   - When the cascade fails, recordHealthEvent is called with severity=error.
 */

const cascadeUpdate = jest.fn();
const cascadeNeq = jest.fn();
const cascadeEqStatus = jest.fn();
const cascadeEqDocId = jest.fn();
const docUpdate = jest.fn();

let cascadeShouldFail = false;

function makeAdminClient() {
  const docFetchChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: 'doc-1', created_by: 'user-1', event_id: null, deleted_at: '2026-05-06T12:00:00Z' },
      error: null,
    }),
  };

  const docUpdateChain = {
    update: docUpdate.mockImplementation((patch) => ({
      eq: jest.fn().mockResolvedValue({ data: null, error: null, _patch: patch }),
    })),
  };

  // Combined chain for documents:
  const documentsTable = {
    ...docFetchChain,
    ...docUpdateChain,
  };

  // agent_commissions cascade chain:
  const commissionsTable = {
    update: cascadeUpdate.mockImplementation((patch) => ({
      eq: cascadeEqDocId.mockImplementation((col, val) => ({
        neq: cascadeNeq.mockImplementation((col2, val2) =>
          Promise.resolve({
            data: null,
            error: cascadeShouldFail ? { message: 'rls_denied', code: '42501' } : null,
            _patch: patch,
            _docId: val,
            _excludedStatus: val2,
          }),
        ),
        eq: cascadeEqStatus.mockImplementation((col2, val2) =>
          Promise.resolve({
            data: null,
            error: cascadeShouldFail ? { message: 'rls_denied', code: '42501' } : null,
            _patch: patch,
            _docId: val,
            _statusFilter: val2,
          }),
        ),
      })),
    })),
  };

  return {
    from: jest.fn((table) => {
      if (table === 'documents') return documentsTable;
      if (table === 'agent_commissions') return commissionsTable;
      throw new Error('unexpected table: ' + table);
    }),
  };
}

const mockAdminSupabase = makeAdminClient();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({}),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

jest.mock('@/app/api/_lib/access', () => ({
  getUserContext: jest.fn().mockResolvedValue({ user: { id: 'admin-user' }, isAdmin: true }),
  isUserOwnerOrSameEmail: jest.fn().mockResolvedValue(true),
  requireEventPermission: jest.fn().mockResolvedValue({ allowed: true }),
  canAccessDocument: jest.fn().mockResolvedValue({ allowed: true }),
}));

const recordHealthEventMock = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@/lib/healthEvent', () => ({
  recordHealthEvent: (...args) => recordHealthEventMock(...args),
}));

const { DELETE } = require('../documents/[id]/route');
const { POST: RESTORE } = require('../documents/[id]/restore/route');

function makeRequest(url = 'http://localhost/api/documents/doc-1') {
  return new global.Request(url, { method: 'POST' });
}

beforeEach(() => {
  cascadeShouldFail = false;
  cascadeUpdate.mockClear();
  cascadeNeq.mockClear();
  cascadeEqStatus.mockClear();
  cascadeEqDocId.mockClear();
  docUpdate.mockClear();
  recordHealthEventMock.mockClear();
});

describe('DELETE /api/documents/:id — cascade to commissions', () => {
  test('sets status=cancelled and excludes paid rows', async () => {
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }) });
    expect(res.status).toBe(200);

    expect(cascadeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', notes: expect.any(String) }),
    );
    expect(cascadeEqDocId).toHaveBeenCalledWith('document_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(cascadeNeq).toHaveBeenCalledWith('status', 'paid');
    expect(recordHealthEventMock).not.toHaveBeenCalled();
  });

  test('records a health event when the cascade fails', async () => {
    cascadeShouldFail = true;
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }) });

    // Document still soft-deleted — we do not block the user response.
    expect(res.status).toBe(200);

    expect(recordHealthEventMock).toHaveBeenCalledTimes(1);
    expect(recordHealthEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'documents_delete_commission_cascade',
        severity: 'error',
        context: expect.objectContaining({ documentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }),
      }),
    );
  });
});

describe('POST /api/documents/:id/restore — cascade un-cancel', () => {
  test('flips cancelled commissions back to pending', async () => {
    const res = await RESTORE(makeRequest(), { params: Promise.resolve({ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }) });
    expect(res.status).toBe(200);

    expect(cascadeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', notes: null }),
    );
    expect(cascadeEqDocId).toHaveBeenCalledWith('document_id', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
    expect(cascadeEqStatus).toHaveBeenCalledWith('status', 'cancelled');
    expect(recordHealthEventMock).not.toHaveBeenCalled();
  });

  test('records a health event when the cascade fails', async () => {
    cascadeShouldFail = true;
    const res = await RESTORE(makeRequest(), { params: Promise.resolve({ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' }) });

    expect(res.status).toBe(200);
    expect(recordHealthEventMock).toHaveBeenCalledTimes(1);
    expect(recordHealthEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'documents_restore_commission_uncascade',
        severity: 'error',
      }),
    );
  });
});

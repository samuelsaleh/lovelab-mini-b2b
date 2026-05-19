/**
 * @jest-environment node
 *
 * DELETE /api/commission-reports/[id]
 *
 * Covers:
 *   ✓ 401 when no session
 *   ✓ 403 when caller is an agent (not admin)
 *   ✓ 400 for a malformed UUID
 *   ✓ 404 when report not found
 *   ✓ 200 + deleted:true — removes DB row and Storage file
 *   ✓ Storage remove failure is non-blocking (row still deleted)
 *   ✓ No storage call when storage_path is null
 */

const UUID = '11111111-2222-3333-4444-555555555555';

// ---------- per-test control knobs ----------
let currentUserId = 'admin-user';
let currentRole = 'admin';
let storageRemoveError = null;
let reportRow = {
  id: UUID,
  storage_path: 'Marc Schlund/Marc Schlund - 2026-05-13-1422.xlsx',
};

const storageRemoveMock = jest.fn();

jest.mock('@/lib/supabase/server', () => {
  const buildChain = () => {
    const chain = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.delete = jest.fn().mockReturnValue(chain);
    chain.update = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn(() => {
      if (reportRow === null) {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: reportRow, error: null });
    });
    // .delete().eq() should resolve
    chain.then = undefined;
    return chain;
  };

  const adminSupa = {
    from: jest.fn(() => buildChain()),
    storage: {
      from: jest.fn(() => ({
        remove: jest.fn(async () => {
          storageRemoveMock();
          if (storageRemoveError) return { error: { message: storageRemoveError } };
          return { error: null };
        }),
      })),
    },
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: currentUserId } }, error: null }) },
  };

  return {
    createClient: jest.fn().mockResolvedValue({
      auth: {
        getUser: jest.fn(async () => ({ data: { user: { id: currentUserId } }, error: null })),
      },
    }),
    createAdminClient: jest.fn(() => ({
      ...adminSupa,
      from: jest.fn((table) => {
        const chain = buildChain();
        if (table === 'profiles') {
          chain.single = jest.fn(() =>
            Promise.resolve({ data: { role: currentRole }, error: null })
          );
          chain.maybeSingle = chain.single;
        }
        if (table === 'commission_reports') {
          chain.maybeSingle = jest.fn(() => {
            if (reportRow === null) return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: reportRow, error: null });
          });
          // .delete().eq() — chain is awaitable (not a Promise, just an obj)
        }
        return chain;
      }),
      storage: adminSupa.storage,
    })),
  };
});

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { DELETE } = require('../commission-reports/[id]/route');

function makeReq(id) {
  return [
    new global.Request(`http://localhost/api/commission-reports/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  currentUserId = 'admin-user';
  currentRole = 'admin';
  storageRemoveError = null;
  storageRemoveMock.mockClear();
  reportRow = {
    id: UUID,
    storage_path: 'Marc Schlund/Marc Schlund - 2026-05-13-1422.xlsx',
  };
});

describe('DELETE /api/commission-reports/[id]', () => {
  test('401 when user is not authenticated', async () => {
    const { createClient } = require('@/lib/supabase/server');
    createClient.mockResolvedValueOnce({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });
    const res = await DELETE(...makeReq(UUID));
    expect(res.status).toBe(401);
  });

  test('403 when user is an agent (not admin)', async () => {
    currentRole = 'agent';
    const res = await DELETE(...makeReq(UUID));
    expect(res.status).toBe(403);
  });

  test('400 for a non-UUID id', async () => {
    const res = await DELETE(...makeReq('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  test('404 when the report does not exist', async () => {
    reportRow = null;
    const res = await DELETE(...makeReq(UUID));
    expect(res.status).toBe(404);
  });

  test('200 + deleted:true on success; calls Storage remove', async () => {
    const res = await DELETE(...makeReq(UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(body.id).toBe(UUID);
    expect(storageRemoveMock).toHaveBeenCalledTimes(1);
  });

  test('Storage error is non-blocking — row still deleted (200)', async () => {
    storageRemoveError = 'storage error';
    const res = await DELETE(...makeReq(UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  test('no Storage call when storage_path is null', async () => {
    reportRow = { id: UUID, storage_path: null };
    const res = await DELETE(...makeReq(UUID));
    expect(res.status).toBe(200);
    expect(storageRemoveMock).not.toHaveBeenCalled();
  });
});

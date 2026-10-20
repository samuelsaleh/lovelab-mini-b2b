/**
 * @jest-environment node
 *
 * POST /api/commission-reports/[id]/drive — push an archived report to Drive.
 *
 * Covers:
 *   ✓ 401 / 403 / 400
 *   ✓ 404 when the report does not exist
 *   ✓ organization report → uploaded under the organization's name, row
 *     updated with the Drive file id + link
 *   ✓ per-agent report → uploaded under the agent's name with the cached folder
 *   ✓ Drive failure → 502 with the reason, row untouched
 */

let currentUser = { id: 'admin-user' };
let currentRole = 'admin';
let reportRow = null;
let updatePayload = null;
let uploadArgs = null;
let uploadResult = { ok: true, fileId: 'f-1', webViewLink: 'https://drive/f-1' };

jest.mock('@/lib/commissionReportDrive', () => ({
  uploadCommissionReportToDrive: jest.fn(async (args) => { uploadArgs = args; return uploadResult; }),
}));

const mockAdminSupabase = {
  from: jest.fn((table) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(async () => ({ data: currentUser ? { role: currentRole } : null, error: null })),
      };
    }
    if (table === 'commission_reports') {
      const q = {};
      q.select = jest.fn(() => q);
      q.eq = jest.fn(() => q);
      q.update = jest.fn((payload) => { updatePayload = payload; return q; });
      q.maybeSingle = jest.fn(async () => (
        updatePayload ? { data: { id: reportRow.id, ...updatePayload }, error: null } : { data: reportRow, error: null }
      ));
      return q;
    }
    throw new Error('unexpected table: ' + table);
  }),
  storage: {
    from: jest.fn(() => ({
      download: jest.fn(async () => ({ data: new Blob([Buffer.from('xlsx-bytes')]), error: null })),
    })),
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: currentUser } })) },
  })),
  createAdminClient: jest.fn(() => mockAdminSupabase),
}));

jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

const { POST } = require('../commission-reports/[id]/drive/route');

const ID = '11111111-1111-1111-1111-111111111111';
const call = (id = ID) => POST(
  new global.Request(`http://localhost/api/commission-reports/${id}/drive`, { method: 'POST' }),
  { params: { id } },
);

beforeEach(() => {
  currentUser = { id: 'admin-user' };
  currentRole = 'admin';
  updatePayload = null;
  uploadArgs = null;
  uploadResult = { ok: true, fileId: 'f-1', webViewLink: 'https://drive/f-1' };
  reportRow = {
    id: ID,
    storage_path: 'Org/Org - 2026-10-20-1000.xlsx',
    period_key: '2026-10-20-1000',
    period_label: '20 October 2026',
    agent_id: 'sarah',
    agent: { full_name: 'Sarah Goutard', email: 'sarah@x.com', drive_folder_id: 'folder-sarah' },
    organization: { id: 'org-1', name: 'Sarah Goutard Organization' },
  };
});

describe('POST /api/commission-reports/[id]/drive', () => {
  test('401 without a session', async () => {
    currentUser = null;
    expect((await call()).status).toBe(401);
  });
  test('403 for a non-admin', async () => {
    currentRole = 'agent';
    expect((await call()).status).toBe(403);
  });
  test('400 for a malformed id', async () => {
    expect((await call('nope')).status).toBe(400);
  });
  test('404 when the report does not exist', async () => {
    reportRow = null;
    expect((await call()).status).toBe(404);
  });

  test('organization report uploads under the organization name and stores the link', async () => {
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(uploadArgs.agentName).toBe('Sarah Goutard Organization');
    expect(uploadArgs.periodKey).toBe('2026-10-20-1000');
    expect(uploadArgs.cachedFolderId).toBeNull();
    expect(Buffer.isBuffer(uploadArgs.buffer)).toBe(true);
    expect(updatePayload).toEqual({ drive_file_id: 'f-1', drive_view_link: 'https://drive/f-1' });
    expect(body.report.drive_view_link).toBe('https://drive/f-1');
  });

  test('per-agent report uploads under the agent name with the cached folder', async () => {
    reportRow.organization = null;
    const res = await call();
    expect(res.status).toBe(200);
    expect(uploadArgs.agentName).toBe('Sarah Goutard');
    expect(uploadArgs.cachedFolderId).toBe('folder-sarah');
  });

  test('Drive failure → 502 with the reason, nothing written', async () => {
    uploadResult = { ok: false, skipped: true, reason: 'env_not_set', error: 'GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID is not set' };
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error).toMatch(/GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID/);
    expect(updatePayload).toBeNull();
  });
});

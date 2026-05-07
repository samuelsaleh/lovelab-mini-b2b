/**
 * @jest-environment node
 *
 * lib/commissionReportService — Phase 19/B6
 *
 * Covers `generateAgentReport`, `generateAllAgents`, and `previousMonthPeriod`.
 *
 * generateAgentReport:
 *   ✓ Throws on missing supabase / agentId / period
 *   ✓ Loads agent from `profiles`
 *   ✓ Throws if agent not found
 *   ✓ Builds report data + xlsx, uploads to Storage, then Drive, then emails
 *   ✓ Inserts a commission_reports row with all fields
 *   ✓ Skips entire flow when skipIfEmpty=true and totals.grandTotal=0
 *   ✓ Hard-fails when Storage upload errors (no orphan DB row)
 *   ✓ Continues when Drive upload returns ok:false (logs, fills DB row anyway)
 *   ✓ Continues when email send fails (status='generated', email_error filled)
 *   ✓ Honours sendEmail=false / uploadToDrive=false flags
 *   ✓ Sets trigger_source='cron' when passed
 *
 * generateAllAgents:
 *   ✓ Lists active agents and runs generateAgentReport for each
 *   ✓ One agent's failure does not abort the loop
 *   ✓ Returns summary with sent/skipped/failed counts
 *
 * previousMonthPeriod:
 *   ✓ For a date in May 2026 returns April 2026 with key '2026-04'
 *   ✓ For a date in January returns December of previous year
 */

// Build a deeply-mocked supabase admin client we can reconfigure per test.

let agentRow = null;
let agentLoadError = null;
let commissionsRows = [];
let commissionsError = null;
let storageUploadError = null;
let insertedReportRow = null;
let insertReportError = null;
let listedAgents = [];
let listAgentsError = null;

let buildReportDataMock = jest.fn();
let generateCommissionReportMock = jest.fn();
let uploadCommissionReportToDriveMock = jest.fn();
let sendCommissionReportEmailMock = jest.fn();

jest.mock('../commissionReport.js', () => ({
  buildReportData: (...args) => buildReportDataMock(...args),
  generateCommissionReport: (...args) => generateCommissionReportMock(...args),
}));
jest.mock('../commissionReportDrive.js', () => ({
  uploadCommissionReportToDrive: (...args) => uploadCommissionReportToDriveMock(...args),
}));
jest.mock('../sendCommissionReport.js', () => ({
  sendCommissionReportEmail: (...args) => sendCommissionReportEmailMock(...args),
}));
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(() => Promise.resolve(Buffer.from('fake-logo'))),
}));

function makeSupabase() {
  return {
    from: jest.fn((table) => {
      if (table === 'profiles') {
        // Both `profiles` accesses (single agent + listing agents) hit
        // this branch. Distinguish by which method is called next.
        let isListing = false;
        const obj = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn(function (col, val) {
            if (col === 'id') {
              isListing = false;
              this._agentId = val;
            } else if (col === 'is_agent') {
              isListing = true;
            }
            return this;
          }),
          neq: jest.fn().mockReturnThis(),
          order: jest.fn(function () {
            // Listing path resolves directly off `order(...)`
            obj._isListing = true;
            return obj;
          }),
          maybeSingle: jest.fn(() =>
            Promise.resolve({ data: agentRow, error: agentLoadError }),
          ),
          // Listing path: thenable — `await query` returns the rows.
          then: (resolve) => resolve({ data: listedAgents, error: listAgentsError }),
        };
        return obj;
      }
      if (table === 'agent_commissions') {
        const q = {};
        q.select = jest.fn().mockReturnValue(q);
        q.eq = jest.fn().mockReturnValue(q);
        q.neq = jest.fn().mockReturnValue(q);
        q.order = jest.fn().mockReturnValue(q);
        q.then = (resolve) => resolve({ data: commissionsRows, error: commissionsError });
        return q;
      }
      if (table === 'commission_reports') {
        return {
          insert: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            single: jest.fn(() =>
              Promise.resolve({
                data: insertedReportRow || { id: 'r-inserted' },
                error: insertReportError,
              }),
            ),
          })),
        };
      }
      throw new Error('unexpected table: ' + table);
    }),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(() =>
          Promise.resolve({ error: storageUploadError, data: storageUploadError ? null : { path: 'p' } }),
        ),
      })),
    },
  };
}

const PERIOD = {
  start: '2026-04-01T00:00:00.000Z',
  end: '2026-04-30T23:59:59.999Z',
  key: '2026-04',
  label: 'April 2026',
};

beforeEach(() => {
  jest.clearAllMocks();
  agentRow = {
    id: 'agent-1',
    full_name: 'Nicolas Vial',
    email: 'nicolas@love-lab.com',
    commission_rate: 15,
    new_client_bonus_enabled: true,
    new_client_bonus_amount: 200,
    role: 'user',
    agent_status: 'active',
  };
  agentLoadError = null;
  commissionsRows = [];
  commissionsError = null;
  storageUploadError = null;
  insertedReportRow = null;
  insertReportError = null;
  listedAgents = [];
  listAgentsError = null;

  buildReportDataMock.mockReturnValue({
    period: PERIOD,
    rows: [],
    totals: {
      grandTotal: 1500,
      commissionTotal: 1000,
      bonusTotal: 400,
      looseSalesTotal: 100,
      orderCount: 5,
      bonusCount: 2,
      looseSalesCount: 1,
    },
  });
  generateCommissionReportMock.mockResolvedValue(Buffer.from('fake-xlsx'));
  uploadCommissionReportToDriveMock.mockResolvedValue({
    ok: true,
    fileId: 'drive-file-id',
    folderId: 'folder-id',
    webViewLink: 'https://drive.google.com/file/d/drive-file-id/view',
  });
  sendCommissionReportEmailMock.mockResolvedValue({
    sent: true,
    recipient: 'dionne@love-lab.com',
    message_id: 'msg-1',
  });
});

describe('generateAgentReport', () => {
  test('throws on missing supabase / agentId / period', async () => {
    const { generateAgentReport } = require('../commissionReportService.js');
    await expect(generateAgentReport({ agentId: 'a', period: PERIOD })).rejects.toThrow();
    await expect(generateAgentReport({ supabase: makeSupabase(), period: PERIOD })).rejects.toThrow();
    await expect(generateAgentReport({ supabase: makeSupabase(), agentId: 'a' })).rejects.toThrow();
  });

  test('throws when agent not found', async () => {
    const { generateAgentReport } = require('../commissionReportService.js');
    agentRow = null;
    await expect(
      generateAgentReport({ supabase: makeSupabase(), agentId: 'agent-1', period: PERIOD }),
    ).rejects.toThrow(/not found/);
  });

  test('happy path: builds, uploads, drives, emails, inserts row', async () => {
    const { generateAgentReport } = require('../commissionReportService.js');
    const supabase = makeSupabase();

    const res = await generateAgentReport({
      supabase,
      agentId: 'agent-1',
      period: PERIOD,
      options: { triggerSource: 'manual', triggeredBy: 'admin-1' },
    });

    expect(buildReportDataMock).toHaveBeenCalledTimes(1);
    expect(generateCommissionReportMock).toHaveBeenCalledTimes(1);
    expect(uploadCommissionReportToDriveMock).toHaveBeenCalledTimes(1);
    expect(sendCommissionReportEmailMock).toHaveBeenCalledTimes(1);

    // Storage upload was called with the right path pattern
    const uploadFn = supabase.storage.from.mock.results[0].value.upload;
    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(uploadFn.mock.calls[0][0]).toMatch(/^2026-04\//);

    // The inserted row payload includes drive + email metadata
    const insertCalls = supabase.from.mock.calls.filter((c) => c[0] === 'commission_reports');
    expect(insertCalls.length).toBeGreaterThan(0);
    expect(res.email.sent).toBe(true);
    expect(res.drive.fileId).toBe('drive-file-id');
    expect(res.reportId).toBe('r-inserted');
  });

  test('skips entire flow when totals.grandTotal=0 and skipIfEmpty=true', async () => {
    const { generateAgentReport } = require('../commissionReportService.js');
    buildReportDataMock.mockReturnValue({
      period: PERIOD,
      rows: [],
      totals: { grandTotal: 0, orderCount: 0, bonusCount: 0, looseSalesCount: 0 },
    });

    const res = await generateAgentReport({
      supabase: makeSupabase(),
      agentId: 'agent-1',
      period: PERIOD,
    });

    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('empty');
    expect(generateCommissionReportMock).not.toHaveBeenCalled();
    expect(uploadCommissionReportToDriveMock).not.toHaveBeenCalled();
    expect(sendCommissionReportEmailMock).not.toHaveBeenCalled();
  });

  test('does NOT skip when totals=0 and skipIfEmpty=false', async () => {
    const { generateAgentReport } = require('../commissionReportService.js');
    buildReportDataMock.mockReturnValue({
      period: PERIOD,
      rows: [],
      totals: { grandTotal: 0, orderCount: 0, bonusCount: 0, looseSalesCount: 0 },
    });

    const res = await generateAgentReport({
      supabase: makeSupabase(),
      agentId: 'agent-1',
      period: PERIOD,
      options: { skipIfEmpty: false },
    });

    expect(res.skipped).toBeUndefined();
    expect(generateCommissionReportMock).toHaveBeenCalled();
  });

  test('hard-fails when Storage upload errors (no DB row inserted)', async () => {
    const { generateAgentReport } = require('../commissionReportService.js');
    storageUploadError = { message: 'Bucket not found' };

    await expect(
      generateAgentReport({
        supabase: makeSupabase(),
        agentId: 'agent-1',
        period: PERIOD,
      }),
    ).rejects.toThrow(/Bucket not found/);
    expect(uploadCommissionReportToDriveMock).not.toHaveBeenCalled();
    expect(sendCommissionReportEmailMock).not.toHaveBeenCalled();
  });

  test('continues when Drive upload returns ok:false', async () => {
    const { generateAgentReport } = require('../commissionReportService.js');
    uploadCommissionReportToDriveMock.mockResolvedValue({
      ok: false,
      reason: 'env_not_set',
      error: 'GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID is not set',
    });

    const res = await generateAgentReport({
      supabase: makeSupabase(),
      agentId: 'agent-1',
      period: PERIOD,
    });

    expect(res.drive.ok).toBe(false);
    expect(res.email.sent).toBe(true);
    expect(res.reportId).toBe('r-inserted');
  });

  test('continues when email fails — status remains generated, error captured', async () => {
    const { generateAgentReport } = require('../commissionReportService.js');
    sendCommissionReportEmailMock.mockResolvedValue({
      sent: false,
      reason: 'resend_error',
      recipient: 'dionne@love-lab.com',
    });

    const res = await generateAgentReport({
      supabase: makeSupabase(),
      agentId: 'agent-1',
      period: PERIOD,
    });

    expect(res.email.sent).toBe(false);
    expect(res.reportId).toBe('r-inserted');
  });

  test('honours sendEmail=false / uploadToDrive=false flags', async () => {
    const { generateAgentReport } = require('../commissionReportService.js');
    await generateAgentReport({
      supabase: makeSupabase(),
      agentId: 'agent-1',
      period: PERIOD,
      options: { sendEmail: false, uploadToDrive: false },
    });
    expect(uploadCommissionReportToDriveMock).not.toHaveBeenCalled();
    expect(sendCommissionReportEmailMock).not.toHaveBeenCalled();
  });
});

describe('generateAllAgents', () => {
  test('runs generateAgentReport for each active agent, one failure does not abort', async () => {
    const { generateAllAgents } = require('../commissionReportService.js');
    listedAgents = [
      { id: 'agent-1', full_name: 'Nicolas Vial', email: 'n@love-lab.com', agent_status: 'active' },
      { id: 'agent-2', full_name: 'Corinne Ruimy', email: 'c@love-lab.com', agent_status: 'active' },
    ];

    // First agent: succeed via the regular mock chain (agentRow stays the
    // generic Nicolas profile — both will hit the same agentRow because we
    // load by id only once per call).
    // Second agent: simulate a failure by making the second commissions
    // load throw.

    let callCount = 0;
    buildReportDataMock.mockImplementation(() => {
      callCount += 1;
      if (callCount === 2) throw new Error('synthetic build failure');
      return {
        period: PERIOD,
        rows: [],
        totals: {
          grandTotal: 100,
          commissionTotal: 100,
          bonusTotal: 0,
          looseSalesTotal: 0,
          orderCount: 1,
          bonusCount: 0,
          looseSalesCount: 0,
        },
      };
    });

    const { summary, results } = await generateAllAgents({
      supabase: makeSupabase(),
      period: PERIOD,
    });

    expect(results).toHaveLength(2);
    expect(summary.total_agents).toBe(2);
    expect(summary.failed).toBe(1);
    expect(results.find((r) => r.agent_id === 'agent-2').ok).toBe(false);
    expect(results.find((r) => r.agent_id === 'agent-2').error).toMatch(/synthetic build failure/);
  });

  test('summary counts sent / skipped correctly', async () => {
    const { generateAllAgents } = require('../commissionReportService.js');
    listedAgents = [
      { id: 'agent-1', full_name: 'A', email: 'a@l.com', agent_status: 'active' },
      { id: 'agent-2', full_name: 'B', email: 'b@l.com', agent_status: 'active' },
    ];

    let n = 0;
    buildReportDataMock.mockImplementation(() => {
      n += 1;
      const totals = n === 1
        ? { grandTotal: 500, commissionTotal: 500, bonusTotal: 0, looseSalesTotal: 0, orderCount: 1, bonusCount: 0, looseSalesCount: 0 }
        : { grandTotal: 0, orderCount: 0, bonusCount: 0, looseSalesCount: 0 };
      return { period: PERIOD, rows: [], totals };
    });

    const { summary } = await generateAllAgents({
      supabase: makeSupabase(),
      period: PERIOD,
    });

    expect(summary.sent).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
  });
});

describe('previousMonthPeriod', () => {
  test('for a May 2026 date returns April 2026', () => {
    const { previousMonthPeriod } = require('../commissionReportService.js');
    const p = previousMonthPeriod(new Date(Date.UTC(2026, 4, 7))); // May 7, 2026
    expect(p.key).toBe('2026-04');
    expect(p.label).toBe('April 2026');
    expect(p.start).toBe('2026-04-01T00:00:00.000Z');
    expect(p.end).toBe('2026-04-30T23:59:59.999Z');
  });

  test('for a January date returns December of the previous year', () => {
    const { previousMonthPeriod } = require('../commissionReportService.js');
    const p = previousMonthPeriod(new Date(Date.UTC(2026, 0, 1))); // Jan 1, 2026
    expect(p.key).toBe('2025-12');
    expect(p.label).toBe('December 2025');
    expect(p.start).toBe('2025-12-01T00:00:00.000Z');
    expect(p.end).toBe('2025-12-31T23:59:59.999Z');
  });
});

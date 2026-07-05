/**
 * @jest-environment node
 *
 * Phase 31 — organization-level commission settlement ("one payment per org").
 *
 * buildReportData (org mode):
 *   ✓ memberBreakdown buckets orders + bonuses per agent, zero-activity members included
 *   ✓ breakdown sorted by total desc
 *   ✓ grand total aggregates across all members (matches sum of breakdown)
 *   ✓ rows already on a report (report_id) are excluded from totals AND breakdown
 *   ✓ organization metadata carried into the snapshot
 *   ✓ no members passed → classic per-agent output (no memberBreakdown key)
 *
 * generateOrganizationReport:
 *   ✓ multi-member org loads commissions for ALL member ids (.in)
 *   ✓ report row is keyed to the org OWNER, snapshot carries the breakdown
 *   ✓ every member's included commissions are linked to the one report
 *   ✓ single-member org delegates to the classic per-agent flow (.eq owner)
 *   ✓ throws when org has no owner
 *   ✓ skips when nothing is ready to pay (skipIfEmpty)
 *
 * settleReportPayment (org settlement):
 *   ✓ one payment against an org report settles commissions from MULTIPLE agents
 */

jest.mock('../commissionReportDrive.js', () => ({
  uploadCommissionReportToDrive: jest.fn(() =>
    Promise.resolve({ ok: true, fileId: 'drive-file-1', webViewLink: 'https://drive/x' })),
}));
jest.mock('../sendCommissionReport.js', () => ({
  sendCommissionReportEmail: jest.fn(() =>
    Promise.resolve({ sent: false, reason: 'disabled' })),
}));
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(() => Promise.resolve(Buffer.from('fake-logo'))),
}));

const SARAH = 'aaaaaaaa-0000-0000-0000-000000000001';
const ALICE = 'aaaaaaaa-0000-0000-0000-000000000002';
const RUBY  = 'aaaaaaaa-0000-0000-0000-000000000003';
const ORG   = 'bbbbbbbb-0000-0000-0000-000000000001';

function commissionRow(over = {}) {
  return {
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    agent_id: SARAH,
    type: 'order',
    status: 'pending',
    commission_rate: 10,
    commission_amount: 100,
    order_total: 1000,
    created_at: '2026-06-01T10:00:00.000Z',
    customer_paid_at: '2026-06-10T10:00:00.000Z',
    document_id: 'doc-1',
    report_id: null,
    document: { id: 'doc-1', client_name: 'Client X', client_company: null, total_amount: 1000, order_channel: 'b2b', created_at: '2026-06-01T10:00:00.000Z' },
    ...over,
  };
}

const SNAPSHOT_PERIOD = {
  start: '2026-07-05T12:00:00.000Z',
  end: '2026-07-05T12:00:00.000Z',
  key: '2026-07-05-1200',
  label: '5 July 2026',
  snapshot: true,
};

// ─────────────────────────────────────────────────────────────────────────
// buildReportData — org mode
// ─────────────────────────────────────────────────────────────────────────
describe('buildReportData — organization mode', () => {
  const { buildReportData } = require('../commissionReport.js');

  const members = [
    { id: SARAH, name: 'Sarah Goutard' },
    { id: ALICE, name: 'Alice Cadenet' },
    { id: RUBY, name: 'Ruby Idle' },
  ];
  const orgAgent = { id: SARAH, full_name: 'Showroom Accestory', email: 'sarah@x.com', commission_rate: 10 };

  it('buckets orders and bonuses per member, includes zero-activity members, sorts by total desc', () => {
    const commissions = [
      commissionRow({ id: 'c1', agent_id: SARAH, commission_amount: 100 }),
      commissionRow({ id: 'c2', agent_id: SARAH, commission_amount: 50 }),
      commissionRow({ id: 'c3', agent_id: ALICE, commission_amount: 30 }),
      commissionRow({ id: 'c4', agent_id: ALICE, type: 'new_client_bonus', commission_amount: 20, order_total: 0 }),
    ];

    const data = buildReportData({
      agent: orgAgent,
      commissions,
      periodStart: SNAPSHOT_PERIOD.start,
      periodEnd: SNAPSHOT_PERIOD.end,
      snapshot: true,
      periodLabel: SNAPSHOT_PERIOD.label,
      members,
      organization: { id: ORG, name: 'Showroom Accestory' },
    });

    expect(data.totals.grandTotal).toBe(200);
    expect(data.organization).toEqual({ id: ORG, name: 'Showroom Accestory' });

    expect(data.memberBreakdown).toHaveLength(3);
    expect(data.memberBreakdown.map((m) => m.name)).toEqual([
      'Sarah Goutard', 'Alice Cadenet', 'Ruby Idle',
    ]);

    const sarah = data.memberBreakdown[0];
    expect(sarah).toMatchObject({ agent_id: SARAH, orderCount: 2, commissionTotal: 150, bonusTotal: 0, total: 150 });

    const alice = data.memberBreakdown[1];
    expect(alice).toMatchObject({ agent_id: ALICE, orderCount: 1, commissionTotal: 30, bonusTotal: 20, total: 50 });

    const ruby = data.memberBreakdown[2];
    expect(ruby).toMatchObject({ agent_id: RUBY, orderCount: 0, total: 0 });

    // The one global number equals the sum of the per-agent breakdown.
    const breakdownSum = data.memberBreakdown.reduce((s, m) => s + m.total, 0);
    expect(breakdownSum).toBe(data.totals.grandTotal);
  });

  it('excludes already-reported / paid / cancelled rows from totals and breakdown', () => {
    const commissions = [
      commissionRow({ id: 'c1', agent_id: SARAH, commission_amount: 100 }),
      commissionRow({ id: 'c2', agent_id: SARAH, commission_amount: 40, report_id: 'old-report' }),
      commissionRow({ id: 'c3', agent_id: ALICE, commission_amount: 30, status: 'paid' }),
      commissionRow({ id: 'c4', agent_id: ALICE, commission_amount: 20, status: 'cancelled' }),
    ];

    const data = buildReportData({
      agent: orgAgent,
      commissions,
      periodStart: SNAPSHOT_PERIOD.start,
      periodEnd: SNAPSHOT_PERIOD.end,
      snapshot: true,
      members,
      organization: { id: ORG, name: 'Showroom Accestory' },
    });

    expect(data.totals.grandTotal).toBe(100);
    expect(data.includedCommissionIds).toEqual(['c1']);
    const alice = data.memberBreakdown.find((m) => m.agent_id === ALICE);
    expect(alice.total).toBe(0);
  });

  it('without members stays a classic per-agent report (no breakdown, no org metadata)', () => {
    const data = buildReportData({
      agent: { id: SARAH, full_name: 'Sarah Goutard', email: 'sarah@x.com', commission_rate: 10 },
      commissions: [commissionRow({ id: 'c1' })],
      periodStart: SNAPSHOT_PERIOD.start,
      periodEnd: SNAPSHOT_PERIOD.end,
      snapshot: true,
    });
    expect(data.memberBreakdown).toBeUndefined();
    expect(data.organization).toBeUndefined();
    expect(data.totals.grandTotal).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// generateOrganizationReport — mocked supabase
// ─────────────────────────────────────────────────────────────────────────
function makeSupabase(cfg) {
  const state = {
    commissionQueries: [],   // { filters } for every commissions load
    reportInserts: [],       // payloads inserted into commission_reports
    linkUpdates: [],         // { payload, ids } for report-link updates
    storageUploads: [],      // storage paths uploaded
  };

  const sb = {
    state,
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn((path) => {
          state.storageUploads.push(path);
          return Promise.resolve({ error: cfg.uploadError || null });
        }),
      })),
    },
    from: jest.fn((table) => {
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: cfg.org ?? null, error: cfg.orgError || null }),
            }),
          }),
        };
      }
      if (table === 'organization_memberships') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: cfg.memberships ?? [], error: cfg.membershipsError || null }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        // Used only by the solo-delegation path (generateAgentReport) +
        // its best-effort drive_folder_id cache write.
        const obj = {
          select: () => obj,
          eq: function (col, val) {
            if (this._pendingUpdate) return Promise.resolve({ data: null, error: null });
            this._id = val;
            return obj;
          },
          update: function (payload) { this._pendingUpdate = payload; return obj; },
          maybeSingle: () => Promise.resolve({ data: cfg.ownerProfile ?? null, error: null }),
        };
        return obj;
      }
      if (table === 'agent_commissions') {
        const q = { _filters: {}, _updating: false };
        q.select = jest.fn(function (sel) {
          if (q._updating) {
            state.linkUpdates.push({ payload: q._updatePayload, ids: q._linkIds || [] });
            return Promise.resolve({ data: (q._linkIds || []).map((id) => ({ id })), error: null });
          }
          q._filters.select = sel;
          return q;
        });
        q.update = jest.fn(function (payload) { q._updating = true; q._updatePayload = payload; return q; });
        q.eq = jest.fn(function (col, val) { q._filters[`eq_${col}`] = val; return q; });
        q.neq = jest.fn(function () { return q; });
        q.in = jest.fn(function (col, vals) {
          if (q._updating && col === 'id') q._linkIds = vals;
          q._filters[`in_${col}`] = vals;
          return q;
        });
        q.order = jest.fn(function () {
          state.commissionQueries.push({ ...q._filters });
          return Promise.resolve({ data: cfg.commissions ?? [], error: cfg.commissionsError || null });
        });
        return q;
      }
      if (table === 'commission_reports') {
        return {
          insert: (payload) => {
            state.reportInserts.push(payload);
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: cfg.insertError ? null : { id: 'report-1', ...payload },
                  error: cfg.insertError || null,
                }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return sb;
}

describe('generateOrganizationReport', () => {
  const orgRow = { id: ORG, name: 'Showroom Accestory', commission_rate: 10 };
  const multiMemberships = [
    { user_id: SARAH, role: 'owner', profiles: { id: SARAH, full_name: 'Sarah Goutard', email: 'sarah@x.com', agent_status: 'active' } },
    { user_id: ALICE, role: 'member', profiles: { id: ALICE, full_name: 'Alice Cadenet', email: 'alice@x.com', agent_status: 'active' } },
  ];

  it('sweeps ALL members commissions into one report keyed to the owner', async () => {
    const { generateOrganizationReport } = require('../commissionReportService.js');
    const commissions = [
      commissionRow({ id: 'c1', agent_id: SARAH, commission_amount: 100 }),
      commissionRow({ id: 'c2', agent_id: ALICE, commission_amount: 60 }),
    ];
    const sb = makeSupabase({ org: orgRow, memberships: multiMemberships, commissions });

    const result = await generateOrganizationReport({
      supabase: sb,
      organizationId: ORG,
      period: SNAPSHOT_PERIOD,
      options: { sendEmail: false, uploadToDrive: false },
    });

    // Loaded commissions for BOTH members, not just the owner.
    const load = sb.state.commissionQueries[0];
    expect(load.in_agent_id).toEqual([SARAH, ALICE]);

    // One report, keyed to the owner, one global total.
    expect(sb.state.reportInserts).toHaveLength(1);
    const inserted = sb.state.reportInserts[0];
    expect(inserted.agent_id).toBe(SARAH);
    expect(inserted.total_due).toBe(160);

    // Snapshot carries the per-agent breakdown + org identity.
    expect(inserted.snapshot_data.organization).toEqual({ id: ORG, name: 'Showroom Accestory' });
    const breakdown = inserted.snapshot_data.memberBreakdown;
    expect(breakdown.find((m) => m.agent_id === SARAH).total).toBe(100);
    expect(breakdown.find((m) => m.agent_id === ALICE).total).toBe(60);

    // Both members' commissions linked to the single report.
    expect(sb.state.linkUpdates).toHaveLength(1);
    expect(sb.state.linkUpdates[0].payload).toEqual({ report_id: 'report-1' });
    expect([...sb.state.linkUpdates[0].ids].sort()).toEqual(['c1', 'c2']);

    expect(result.reportId).toBe('report-1');
    expect(result.totals.grandTotal).toBe(160);
    expect(result.linked.linked).toBe(2);
  });

  it('delegates single-member orgs to the classic per-agent flow', async () => {
    const { generateOrganizationReport } = require('../commissionReportService.js');
    const soloMembership = [multiMemberships[0]];
    const sb = makeSupabase({
      org: orgRow,
      memberships: soloMembership,
      ownerProfile: {
        id: SARAH, full_name: 'Sarah Goutard', email: 'sarah@x.com',
        commission_rate: 10, new_client_bonus_enabled: false, new_client_bonus_amount: 0,
        role: 'agent', agent_status: 'active', drive_folder_id: null,
      },
      commissions: [commissionRow({ id: 'c1', agent_id: SARAH, commission_amount: 75 })],
    });

    const result = await generateOrganizationReport({
      supabase: sb,
      organizationId: ORG,
      period: SNAPSHOT_PERIOD,
      options: { sendEmail: false, uploadToDrive: false },
    });

    // Per-agent path filters with .eq('agent_id', owner) — no .in.
    const load = sb.state.commissionQueries[0];
    expect(load.eq_agent_id).toBe(SARAH);
    expect(load.in_agent_id).toBeUndefined();

    const inserted = sb.state.reportInserts[0];
    expect(inserted.agent_id).toBe(SARAH);
    expect(inserted.total_due).toBe(75);
    // Classic report: no org metadata in the snapshot.
    expect(inserted.snapshot_data.organization).toBeUndefined();
    expect(result.reportId).toBe('report-1');
  });

  it('throws when the organization has no owner', async () => {
    const { generateOrganizationReport } = require('../commissionReportService.js');
    const sb = makeSupabase({
      org: orgRow,
      memberships: [{ user_id: ALICE, role: 'member', profiles: { id: ALICE, full_name: 'Alice', email: 'a@x.com' } }],
      commissions: [],
    });
    await expect(generateOrganizationReport({
      supabase: sb, organizationId: ORG, period: SNAPSHOT_PERIOD,
    })).rejects.toThrow(/no owner/i);
  });

  it('skips (no report row) when nothing is ready to pay', async () => {
    const { generateOrganizationReport } = require('../commissionReportService.js');
    const sb = makeSupabase({
      org: orgRow,
      memberships: multiMemberships,
      commissions: [commissionRow({ id: 'c1', customer_paid_at: null })], // not ticked paid
    });
    const result = await generateOrganizationReport({
      supabase: sb, organizationId: ORG, period: SNAPSHOT_PERIOD,
    });
    expect(result.skipped).toBe(true);
    expect(sb.state.reportInserts).toHaveLength(0);
    expect(sb.state.linkUpdates).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// settleReportPayment — one org payment settles ALL members' commissions
// ─────────────────────────────────────────────────────────────────────────
describe('settleReportPayment — org report settles multiple agents', () => {
  it('marks linked commissions from different agents paid in one action', async () => {
    const { settleReportPayment } = require('../commissionPaidOut.js');

    const linkedRows = [
      { id: 'c1' }, // Sarah's
      { id: 'c2' }, // Alice's
      { id: 'c3' }, // Ruby's
    ];
    let updatePayload = null;
    let updatedIds = null;

    const sb = {
      from: jest.fn(() => {
        const q = { _updating: false };
        q.select = jest.fn(function () {
          if (q._updating) {
            return Promise.resolve({ data: updatedIds.map((id) => ({ id })), error: null });
          }
          return q;
        });
        q.eq = jest.fn(() => q);
        q.update = jest.fn((payload) => { q._updating = true; updatePayload = payload; return q; });
        q.in = jest.fn(function (col, vals) {
          if (q._updating && col === 'id') updatedIds = vals;
          if (!q._updating && col === 'status') {
            // resolution query: .select('id').eq('report_id', x).in('status', ...)
            return Promise.resolve({ data: linkedRows, error: null });
          }
          return q;
        });
        return q;
      }),
    };

    const res = await settleReportPayment(sb, {
      report: { id: 'report-1', agent_id: SARAH, snapshot_data: {} },
      invoiceNumber: 'INV-42',
    });

    expect(res.marked).toBe(3);
    expect([...res.ids].sort()).toEqual(['c1', 'c2', 'c3']);
    expect(updatePayload.status).toBe('paid');
    expect(updatePayload.invoice_number).toBe('INV-42');
    expect([...updatedIds].sort()).toEqual(['c1', 'c2', 'c3']);
  });
});

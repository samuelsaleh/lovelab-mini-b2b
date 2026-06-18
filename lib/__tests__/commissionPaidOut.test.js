/**
 * @jest-environment node
 *
 * lib/commissionPaidOut — Phase 29
 *
 * Covers the helpers that drive the new "paid happens at Record Payment" flow:
 *   - linkCommissionsToReport: "Send report now" links rows to a report
 *     (Reported state) without marking them paid.
 *   - settleReportPayment: Record Payment flips a report's still-pending rows to
 *     paid and stamps the matched invoice number.
 *       ✓ resolves via the report_id link column
 *       ✓ falls back to stored commission ids for legacy reports
 *       ✓ refuses document-id-only legacy snapshots
 *       ✓ stamps the invoice number only when one is supplied
 *       ✓ no-ops when there are no commissions to settle
 */

import {
  linkCommissionsToReport,
  settleReportPayment,
} from '../commissionPaidOut.js';

let acQueue = [];
let acChains = [];

function makeChain(result) {
  const chain = {};
  for (const m of ['select', 'eq', 'in', 'update', 'neq', 'order']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.then = (resolve) => resolve(result);
  acChains.push(chain);
  return chain;
}

function makeSupabase() {
  return {
    from: jest.fn((table) => {
      if (table === 'agent_commissions') {
        const result = acQueue.length ? acQueue.shift() : { data: [], error: null };
        return makeChain(result);
      }
      throw new Error('unexpected table: ' + table);
    }),
  };
}

beforeEach(() => {
  acQueue = [];
  acChains = [];
  jest.clearAllMocks();
});

describe('linkCommissionsToReport', () => {
  test('links the given pending commissions to the report', async () => {
    acQueue = [{ data: [{ id: 'c1' }, { id: 'c2' }], error: null }];
    const sb = makeSupabase();
    const res = await linkCommissionsToReport(sb, 'rep-1', ['c1', 'c2', 'c2']);
    expect(res).toEqual({ linked: 2, ids: ['c1', 'c2'] });
    const updateChain = acChains.find((c) => c.update.mock.calls.length > 0);
    expect(updateChain.update).toHaveBeenCalledWith({ report_id: 'rep-1' });
  });

  test('no-ops with empty inputs', async () => {
    const sb = makeSupabase();
    expect(await linkCommissionsToReport(sb, 'rep-1', [])).toEqual({ linked: 0, ids: [] });
    expect(await linkCommissionsToReport(sb, null, ['c1'])).toEqual({ linked: 0, ids: [] });
    expect(sb.from).not.toHaveBeenCalled();
  });

  test('throws when the update errors', async () => {
    acQueue = [{ data: null, error: { message: 'db boom' } }];
    const sb = makeSupabase();
    await expect(linkCommissionsToReport(sb, 'rep-1', ['c1'])).rejects.toThrow(/db boom/);
  });
});

describe('settleReportPayment', () => {
  test('resolves via report_id link, marks paid, stamps invoice', async () => {
    acQueue = [
      { data: [{ id: 'c1' }, { id: 'c2' }], error: null }, // resolution by report_id
      { data: [{ id: 'c1' }, { id: 'c2' }], error: null }, // settle update
    ];
    const sb = makeSupabase();
    const res = await settleReportPayment(sb, {
      report: { id: 'rep-1', agent_id: 'a1' },
      invoiceNumber: '  INV-9  ',
    });
    expect(res).toEqual({ marked: 2, ids: ['c1', 'c2'] });

    const settleChain = acChains.find((c) => c.update.mock.calls.length > 0);
    const payload = settleChain.update.mock.calls[0][0];
    expect(payload.status).toBe('paid');
    expect(payload.paid_at).toBeTruthy();
    expect(payload.invoice_number).toBe('INV-9'); // trimmed
  });

  test('does not stamp invoice when none supplied', async () => {
    acQueue = [
      { data: [{ id: 'c1' }], error: null },
      { data: [{ id: 'c1' }], error: null },
    ];
    const sb = makeSupabase();
    await settleReportPayment(sb, { report: { id: 'rep-1' }, invoiceNumber: '   ' });
    const settleChain = acChains.find((c) => c.update.mock.calls.length > 0);
    const payload = settleChain.update.mock.calls[0][0];
    expect(payload.status).toBe('paid');
    expect('invoice_number' in payload).toBe(false);
  });

  test('falls back to the report snapshot when no rows are linked', async () => {
    acQueue = [
      { data: [], error: null },             // resolution by report_id finds nothing
      { data: [{ id: 'x1' }], error: null }, // settle update
    ];
    const sb = makeSupabase();
    const res = await settleReportPayment(sb, {
      report: {
        id: 'legacy-1',
        agent_id: 'a1',
        snapshot_data: { includedCommissionIds: ['x1'] },
      },
      invoiceNumber: 'INV-1',
    });
    expect(res).toEqual({ marked: 1, ids: ['x1'] });
  });

  test('does not settle document-id-only snapshots', async () => {
    acQueue = [
      { data: [], error: null }, // resolution by report_id finds nothing
    ];
    const sb = makeSupabase();
    const res = await settleReportPayment(sb, {
      report: {
        id: 'legacy-doc-only',
        agent_id: 'a1',
        snapshot_data: { orders: [{ document_id: 'doc-1' }] },
      },
      invoiceNumber: 'INV-1',
    });
    expect(res).toEqual({ marked: 0, ids: [] });
    // Only the report_id lookup ran; no document-id query and no update.
    expect(acChains).toHaveLength(1);
    expect(acChains[0].update).not.toHaveBeenCalled();
  });

  test('no-ops when nothing resolves', async () => {
    acQueue = [{ data: [], error: null }]; // resolution empty, snapshot empty
    const sb = makeSupabase();
    const res = await settleReportPayment(sb, { report: { id: 'rep-1', snapshot_data: {} } });
    expect(res).toEqual({ marked: 0, ids: [] });
  });

  test('throws when report is missing', async () => {
    const sb = makeSupabase();
    await expect(settleReportPayment(sb, { report: null })).rejects.toThrow(/report is required/);
  });
});

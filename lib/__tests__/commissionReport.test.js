/**
 * Unit tests for lib/commissionReport.js.
 *
 * Covers:
 *   1. Window filtering — customer_paid_at must fall inside [start, end]
 *   2. Status filtering — cancelled and paid rows are excluded
 *   3. Type routing — orders go to orders, new_client_bonus to bonuses,
 *      B2C orders to looseSales
 *   4. Customer fuzzy-grouping — "SAS Little Factory" + "Little Factory"
 *      collapse into one customer summary row
 *   5. Totals math — gross/net/commission/bonus aggregate correctly
 *   6. Shipping derivation — gross − net = shipping (per Phase 19c rule)
 *   7. Empty period — handles zero commissions gracefully
 *   8. generateCommissionReport — produces a valid xlsx buffer
 */

import {
  buildReportData,
  generateCommissionReport,
} from '@/lib/commissionReport';
import ExcelJS from 'exceljs';

const PERIOD_START = '2026-04-01T00:00:00.000Z';
const PERIOD_END = '2026-04-30T23:59:59.999Z';

const baseAgent = {
  id: 'agent-1',
  full_name: 'Nicolas Test',
  email: 'nicolas@example.com',
  commission_rate: 15,
};

function mkOrder(overrides = {}) {
  return {
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    type: 'order',
    status: 'pending',
    commission_rate: 15,
    commission_amount: 150,
    order_total: 1000,
    created_at: '2026-04-15T09:00:00Z',
    customer_paid_at: '2026-04-20T10:00:00Z',
    document: {
      id: 'doc-1',
      client_name: 'Acme',
      client_company: 'Acme Corp',
      total_amount: 1050, // gross including 50€ shipping
      order_channel: 'b2b',
      metadata: {},
    },
    ...overrides,
  };
}

function mkBonus(overrides = {}) {
  return {
    id: `b-${Math.random().toString(36).slice(2, 8)}`,
    type: 'new_client_bonus',
    status: 'pending',
    commission_rate: 0,
    commission_amount: 200,
    order_total: 0,
    created_at: '2026-04-15T09:00:00Z',
    customer_paid_at: '2026-04-20T10:00:00Z',
    document: {
      id: 'doc-bonus-1',
      client_name: 'New Client',
      client_company: 'New Client Inc',
    },
    ...overrides,
  };
}

describe('buildReportData — window filtering', () => {
  // Phase 21: the report MUST honour the requested period — the "April"
  // report has to mean "April only", not "everything ready to pay right
  // now". Pre-Phase 21, periodStart/periodEnd were window-dressing on the
  // header / filename and the body swept in every pending+customer-paid
  // commission, which was exactly the bug Sam reported (Corinne's April
  // report contained May orders).

  it('includes commissions whose customer_paid_at is inside [start, end]', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({ customer_paid_at: '2026-04-15T00:00:00Z' })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(1);
    expect(data.totals.orderCount).toBe(1);
  });

  it('EXCLUDES a March order ticked Paid in May from the April window', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({
        created_at: '2026-03-15T09:00:00Z',
        customer_paid_at: '2026-05-07T10:00:00Z',
        document: { id: 'doc-1', client_company: 'Acme Corp', total_amount: 1050, order_channel: 'b2b', created_at: '2026-03-15T09:00:00Z' },
      })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(0);
  });

  it('EXCLUDES a May order from an April window', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({
        created_at: '2026-05-01T08:00:00Z',
        customer_paid_at: '2026-05-07T10:00:00Z',
        document: { id: 'doc-1', client_company: 'Acme Corp', total_amount: 1050, order_channel: 'b2b', created_at: '2026-05-01T08:00:00Z' },
      })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(0);
  });

  it('EXCLUDES an April-placed order ticked Paid in May (the customer_paid_at decides the window)', () => {
    // The report is keyed off when MOM ticked the box (customer_paid_at),
    // not when the order was placed. So an April-placed-but-May-ticked
    // commission is considered May earnings and shows up in May's report.
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({
        created_at: '2026-04-15T09:00:00Z',
        customer_paid_at: '2026-05-07T10:00:00Z',
        document: { id: 'doc-1', client_company: 'Acme Corp', total_amount: 1050, order_channel: 'b2b', created_at: '2026-04-15T09:00:00Z' },
      })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(0);
  });

  it('the same April-placed-but-May-ticked order DOES show up in a May-window report', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({
        created_at: '2026-04-15T09:00:00Z',
        customer_paid_at: '2026-05-07T10:00:00Z',
        document: { id: 'doc-1', client_company: 'Acme Corp', total_amount: 1050, order_channel: 'b2b', created_at: '2026-04-15T09:00:00Z' },
      })],
      periodStart: '2026-05-01T00:00:00.000Z',
      periodEnd: '2026-05-31T23:59:59.999Z',
    });
    expect(data.orders).toHaveLength(1);
  });

  it('excludes commissions with no customer_paid_at (still awaiting customer)', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({ customer_paid_at: null })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(0);
  });

  it('includes multiple in-window orders, excludes the out-of-window one', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ customer_paid_at: '2026-04-05T10:00:00Z', commission_amount: 100, document: { client_company: 'In-Window 1', created_at: '2026-04-01T00:00:00Z', order_channel: 'b2b' } }),
        mkOrder({ customer_paid_at: '2026-04-29T23:50:00Z', commission_amount: 200, document: { client_company: 'In-Window 2', created_at: '2026-04-15T00:00:00Z', order_channel: 'b2b' } }),
        mkOrder({ customer_paid_at: '2026-05-07T10:00:00Z', commission_amount: 999, document: { client_company: 'Out-Of-Window May', created_at: '2026-05-01T00:00:00Z', order_channel: 'b2b' } }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(2);
    expect(data.totals.commissionTotal).toBe(300);
  });

});

describe('buildReportData — Phase 27 manual quick orders (no document)', () => {
  it('uses client_label as the customer name when there is no document', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [{
        id: 'qo-1',
        type: 'order',
        status: 'pending',
        commission_rate: 10,
        commission_amount: 100,
        order_total: 1000,
        created_at: '2026-04-10T09:00:00Z',
        customer_paid_at: '2026-04-12T10:00:00Z',
        document: null,
        client_label: 'Old Client',
      }],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0].client).toBe('Old Client');
    expect(data.totals.commissionTotal).toBe(100);
    expect(data.totals.netTotal).toBe(1000);
    expect(data.includedCommissionIds).toContain('qo-1');
  });

  it('falls back to generic "Order" when neither document nor client_label is present', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [{
        id: 'qo-2',
        type: 'order',
        status: 'pending',
        commission_rate: 10,
        commission_amount: 50,
        order_total: 500,
        created_at: '2026-04-10T09:00:00Z',
        customer_paid_at: '2026-04-12T10:00:00Z',
        document: null,
        client_label: null,
      }],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0].client).toBe('Order');
  });
});

describe('buildReportData — status filtering', () => {
  it('excludes cancelled commissions even if customer_paid_at is in window', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({ status: 'cancelled' })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(0);
  });

  it('excludes already-paid commissions (those go in PAID OUT, not in this report)', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({ status: 'paid' })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(0);
  });

  it('includes status=approved alongside pending', () => {
    const orderA = mkOrder({ id: 'c-a', status: 'pending', commission_amount: 100, document: { client_company: 'A' } });
    const orderB = mkOrder({ id: 'c-b', status: 'approved', commission_amount: 200, document: { client_company: 'B' } });
    const data = buildReportData({
      agent: baseAgent,
      commissions: [orderA, orderB],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(2);
    expect(data.totals.commissionTotal).toBe(300);
    expect(data.includedCommissionIds).toEqual(['c-a', 'c-b']);
  });
});

describe('buildReportData — type routing', () => {
  it('routes type=order with order_channel=b2b to orders[]', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({ document: { client_company: 'B2B Co', order_channel: 'b2b' } })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(1);
    expect(data.looseSales).toHaveLength(0);
  });

  it('routes type=order with order_channel=b2c to looseSales[]', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({ document: { client_company: 'B2C Buyer', order_channel: 'b2c', total_amount: 1050 } })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(0);
    expect(data.looseSales).toHaveLength(1);
    expect(data.totals.looseSalesCount).toBe(1);
  });

  it('routes type=new_client_bonus to bonuses[]', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkBonus({ commission_amount: 200 })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.bonuses).toHaveLength(1);
    expect(data.bonuses[0].amount).toBe(200);
    expect(data.totals.bonusTotal).toBe(200);
  });

  it('routes legacy type=bonus to bonuses[] (older schema rows)', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkBonus({ type: 'bonus', commission_amount: 50 })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.bonuses).toHaveLength(1);
    expect(data.bonuses[0].amount).toBe(50);
  });

  it('honours includeLooseSales=false by hiding B2C orders entirely', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({ document: { client_company: 'B2C Buyer', order_channel: 'b2c', total_amount: 1050 } })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      includeLooseSales: false,
    });
    expect(data.orders).toHaveLength(1); // pushed back into orders
    expect(data.looseSales).toHaveLength(0);
  });
});

describe('buildReportData — customer fuzzy grouping', () => {
  it('collapses "SAS Little Factory" and "Little Factory" into one customer row', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ commission_amount: 100, document: { client_company: 'SAS Little Factory', total_amount: 1000 } }),
        mkOrder({ commission_amount: 200, document: { client_company: 'Little Factory', total_amount: 2000 } }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.customers).toHaveLength(1);
    expect(data.customers[0].count).toBe(2);
    expect(data.customers[0].commission).toBe(300);
  });

  it('collapses dotted legal entities like "S.A.R.L. Casadona" with "Casadona"', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ commission_amount: 50, document: { client_company: 'S.A.R.L. Casadona', total_amount: 500 } }),
        mkOrder({ commission_amount: 75, document: { client_company: 'Casadona', total_amount: 750 } }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.customers).toHaveLength(1);
    expect(data.customers[0].count).toBe(2);
  });

  it('keeps genuinely different customers separate', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ commission_amount: 100, document: { client_company: 'Acme' } }),
        mkOrder({ commission_amount: 200, document: { client_company: 'Globex' } }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.customers).toHaveLength(2);
  });

  it('attaches a new_client_bonus to the same fuzzy customer key', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ commission_amount: 100, document: { client_company: 'SAS Brand New' } }),
        mkBonus({ commission_amount: 200, document: { client_company: 'Brand New' } }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.customers).toHaveLength(1);
    expect(data.customers[0].commission).toBe(100);
    expect(data.customers[0].bonus).toBe(200);
    expect(data.customers[0].total).toBe(300);
  });

  it('sorts customers by total descending', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ commission_amount: 100, document: { client_company: 'Small Co' } }),
        mkOrder({ commission_amount: 500, document: { client_company: 'Big Co' } }),
        mkOrder({ commission_amount: 250, document: { client_company: 'Medium Co' } }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.customers.map((c) => c.name)).toEqual(['Big Co', 'Medium Co', 'Small Co']);
  });
});

describe('buildReportData — totals math', () => {
  it('aggregates grossTotal, netTotal, commissionTotal correctly', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ commission_amount: 150, order_total: 1000, document: { total_amount: 1050, client_company: 'A' } }),
        mkOrder({ commission_amount: 300, order_total: 2000, document: { total_amount: 2080, client_company: 'B' } }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.totals.grossTotal).toBe(3130);
    expect(data.totals.netTotal).toBe(3000);
    expect(data.totals.commissionTotal).toBe(450);
  });

  it('grandTotal = commissionTotal + bonusTotal + looseSalesTotal', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ commission_amount: 150, document: { client_company: 'B2B', order_channel: 'b2b' } }),
        mkOrder({ commission_amount: 80, document: { client_company: 'B2C', order_channel: 'b2c' } }),
        mkBonus({ commission_amount: 200 }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.totals.commissionTotal).toBe(150);
    expect(data.totals.looseSalesTotal).toBe(80);
    expect(data.totals.bonusTotal).toBe(200);
    expect(data.totals.grandTotal).toBe(430);
  });

  it('handles missing total_amount by falling back to order_total (no shipping deduction)', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({
          commission_amount: 100,
          order_total: 1000,
          document: { total_amount: null, client_company: 'NoShip' },
        }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders[0].gross).toBe(1000);
    expect(data.orders[0].net).toBe(1000);
    expect(data.orders[0].shipping).toBe(0);
  });

  it('derives shipping = gross − net per Phase 19c rule', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({
          commission_amount: 150,
          order_total: 1000,
          document: { total_amount: 1050, client_company: 'WithShip' },
        }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders[0].shipping).toBe(50);
  });
});

describe('buildReportData — empty / edge cases', () => {
  it('returns sane zeros when no commissions match', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.orders).toHaveLength(0);
    expect(data.customers).toHaveLength(0);
    expect(data.bonuses).toHaveLength(0);
    expect(data.totals.grandTotal).toBe(0);
    expect(data.totals.orderCount).toBe(0);
  });

  it('handles null commissions array gracefully', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: null,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.totals.grandTotal).toBe(0);
  });

  it('exposes period.label in human-readable form', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(data.period.label).toMatch(/April 2026/i);
  });
});

describe('generateCommissionReport — produces a real xlsx buffer', () => {
  it('renders a valid .xlsx without errors when there is data', async () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ commission_amount: 150, document: { client_company: 'Acme', total_amount: 1050 } }),
        mkBonus({ commission_amount: 200 }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    const buf = await generateCommissionReport({ data });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(2000);
    // .xlsx files start with the ZIP magic number 'PK\x03\x04'
    expect(buf.slice(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('renders a valid .xlsx even when all sections are empty', async () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    const buf = await generateCommissionReport({ data });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.slice(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('renders without throwing when given bad logo bytes', async () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder()],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    const buf = await generateCommissionReport({ data, logoBuffer: Buffer.from('not-a-real-png') });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('includes Love-Lab legal footer (BCE, address, hello@love-lab.com)', async () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder()],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    const buf = await generateCommissionReport({ data });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    let footerBlob = '';
    const last = ws.rowCount;
    for (let rowNum = Math.max(1, last - 20); rowNum <= last; rowNum++) {
      const v = ws.getRow(rowNum).getCell(1).value;
      if (typeof v === 'string') footerBlob += `${v}\n`;
    }
    expect(footerBlob).toContain('1017.670.055');
    expect(footerBlob).toContain('Banque-Carrefour des Entreprises');
    expect(footerBlob).toContain('hello@love-lab.com');
    expect(footerBlob).toContain('+32 494 039 945');
    expect(footerBlob).toContain('Schupstraat 20');
  });
});

describe('buildReportData — snapshot mode (Phase 22, 2026-05-13)', () => {
  // Sam's "Send report now" button no longer cares about calendar months.
  // It asks "what does mom owe right now?" and sweeps in everything
  // ticked customer_paid that hasn't been paid out yet, regardless of
  // when the customer paid. We test the screenshot scenario explicitly:
  // 80 customer-paid orders + 1 bonus, all from arbitrary dates, must
  // ALL appear when snapshot=true.

  it('snapshot=true ignores the period window entirely', () => {
    const farPast = mkOrder({
      commission_amount: 100,
      customer_paid_at: '2024-01-15T10:00:00Z',
      document: { client_company: 'Old', order_channel: 'b2b', created_at: '2024-01-01T00:00:00Z' },
    });
    const farFuture = mkOrder({
      commission_amount: 200,
      customer_paid_at: '2027-08-15T10:00:00Z',
      document: { client_company: 'Future', order_channel: 'b2b', created_at: '2027-08-01T00:00:00Z' },
    });
    const data = buildReportData({
      agent: baseAgent,
      commissions: [farPast, farFuture],
      // Tiny window — would exclude both rows in non-snapshot mode.
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      snapshot: true,
    });
    expect(data.orders).toHaveLength(2);
    expect(data.totals.commissionTotal).toBe(300);
  });

  it('snapshot=true still excludes cancelled / paid / bonus-not-paid rows', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [
        mkOrder({ status: 'cancelled', commission_amount: 999 }),
        mkOrder({ status: 'paid', commission_amount: 999 }),
        mkOrder({ customer_paid_at: null, commission_amount: 999 }),
        mkOrder({ commission_amount: 50, document: { client_company: 'Real', order_channel: 'b2b' } }),
      ],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      snapshot: true,
    });
    expect(data.orders).toHaveLength(1);
    expect(data.totals.commissionTotal).toBe(50);
  });

  it('the 80-orders + 1-bonus case all flow through', () => {
    // Mirrors the screenshot Sam pasted: 80 paid orders across many
    // months, one bonus, all customer-paid, none paid out. Snapshot
    // mode must include every row.
    const orders = Array.from({ length: 80 }, (_, i) =>
      mkOrder({
        id: `c-${i}`,
        commission_amount: 10,
        customer_paid_at: `2026-${String((i % 12) + 1).padStart(2, '0')}-15T10:00:00Z`,
        document: {
          id: `doc-${i}`,
          client_company: `Customer ${i % 30}`, // ~30 unique customers
          order_channel: 'b2b',
          total_amount: 1000,
        },
        order_total: 1000,
      }),
    );
    const bonus = mkBonus({ id: 'b-1', commission_amount: 250 });
    const data = buildReportData({
      agent: baseAgent,
      commissions: [...orders, bonus],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      snapshot: true,
    });
    expect(data.totals.orderCount).toBe(80);
    expect(data.totals.bonusCount).toBe(1);
    expect(data.totals.commissionTotal).toBe(800); // 80 × 10
    expect(data.totals.bonusTotal).toBe(250);
    expect(data.totals.grandTotal).toBe(1050);
  });

  it('uses the periodLabel param when provided (today\'s date for snapshot)', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({ customer_paid_at: '2026-04-20T10:00:00Z' })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      snapshot: true,
      periodLabel: '13 May 2026',
    });
    expect(data.period.label).toBe('13 May 2026');
  });

  it('falls back to "Month YYYY" label when periodLabel not given', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder()],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      // No snapshot, no periodLabel
    });
    expect(data.period.label).toMatch(/April 2026/i);
  });

  it('snapshot=false (default) still applies the calendar window', () => {
    const data = buildReportData({
      agent: baseAgent,
      commissions: [mkOrder({
        customer_paid_at: '2026-05-07T10:00:00Z',
        document: { client_company: 'OutOfWindow', order_channel: 'b2b', created_at: '2026-05-01T00:00:00Z' },
      })],
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      // snapshot omitted → defaults false
    });
    expect(data.orders).toHaveLength(0);
  });
});

/**
 * @jest-environment node
 */

const { buildSynaliaReportData, generateSynaliaReport } = require('../synaliaReport.js');

describe('synaliaReport', () => {
  test('buildSynaliaReportData groups by client and totals TTC', () => {
    const data = buildSynaliaReportData({
      agentName: 'Nicolas Vial',
      year: 2026,
      quarter: 1,
      orders: [
        {
          id: 'a',
          file_name: 'Order-A.pdf',
          client_company: 'Client A',
          total_amount: 100.5,
          created_at: '2026-02-01T00:00:00.000Z',
          metadata: { formState: { date: '2026-02-01' } },
        },
        {
          id: 'b',
          file_name: 'Order-B.pdf',
          client_company: 'Client A',
          total_amount: 50,
          created_at: '2026-03-01T00:00:00.000Z',
          metadata: { formState: { date: '2026-03-01' } },
        },
        {
          id: 'c',
          file_name: 'Order-C.pdf',
          client_name: 'Client B',
          total_amount: 200,
          created_at: '2026-01-15T00:00:00.000Z',
          metadata: { formState: { date: '2026-01-15' } },
        },
      ],
    });

    expect(data.orderCount).toBe(3);
    expect(data.clientCount).toBe(2);
    expect(data.grandTotal).toBe(350.5);
    expect(data.groups.find((g) => g.client === 'Client A')?.subtotal).toBe(150.5);
    expect(data.groups.find((g) => g.client === 'Client B')?.subtotal).toBe(200);
  });

  test('generateSynaliaReport returns xlsx buffer', async () => {
    const data = buildSynaliaReportData({
      agentName: 'Nicolas',
      year: 2026,
      quarter: 1,
      orders: [],
    });
    const buf = await generateSynaliaReport({ data });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
});

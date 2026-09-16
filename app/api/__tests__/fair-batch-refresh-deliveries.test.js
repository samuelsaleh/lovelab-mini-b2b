/**
 * @jest-environment node
 *
 * POST /api/fair-assistant/batches/:id/refresh-deliveries — "Check deliveries
 * now" (Sam, 15 Sep 2026). Asks Resend about every sent email of the batch;
 * an email sent before tracking existed is recorded first so it catches up.
 */
const refreshDelivery = jest.fn();
const recordSend = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@/lib/emailDeliveries', () => ({
  emailDeliveriesAvailable: jest.fn().mockResolvedValue(true),
  refreshDelivery: (...a) => refreshDelivery(...a),
  recordSend: (...a) => recordSend(...a),
}));
jest.mock('@/lib/rateLimit', () => ({ checkRateLimit: jest.fn(() => null) }));

let drafts = [];
const adminSupabase = {
  from: jest.fn((table) => {
    const chain = {};
    for (const m of ['select', 'eq', 'not', 'order', 'in']) chain[m] = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn(async () => ({ data: drafts, error: null }));
    if (table === 'fair_leads') chain.in = jest.fn(async () => ({ data: [{ id: 'lead-1', email: 'a@x.com' }], error: null }));
    return chain;
  }),
};
jest.mock('@/lib/fair-assistant/server', () => ({
  requireFairAdmin: jest.fn().mockResolvedValue({ adminSupabase }),
}));

const { POST } = require('../fair-assistant/batches/[id]/refresh-deliveries/route');
const call = () => POST(new global.Request('http://localhost/api/fair-assistant/batches/b1/refresh-deliveries', { method: 'POST' }), { params: Promise.resolve({ id: 'b1' }) });

beforeEach(() => { jest.clearAllMocks(); process.env.RESEND_API_KEY = 'k'; });

describe('refresh-deliveries', () => {
  test('asks Resend for each sent email and sums what changed', async () => {
    drafts = [
      { id: 'd1', lead_id: 'lead-1', message_id: 're_1', subject: 'Hi', sent_at: '2026-09-15T08:00:00Z', status: 'sent' },
      { id: 'd2', lead_id: 'lead-2', message_id: 're_2', subject: 'Hi', sent_at: '2026-09-15T08:00:00Z', status: 'sent' },
    ];
    refreshDelivery
      .mockResolvedValueOnce({ ok: true, status: 'delivered', changed: true })
      .mockResolvedValueOnce({ ok: true, status: 'bounced', changed: false });
    const json = await (await call()).json();
    expect(json).toEqual({ checked: 2, updated: 1, untracked: 0, errors: 0, byStatus: { delivered: 1, bounced: 1 } });
    expect(refreshDelivery).toHaveBeenCalledWith(adminSupabase, 're_1');
    expect(recordSend).not.toHaveBeenCalled();
  });

  test('an email sent before tracking existed is recorded, then refreshed', async () => {
    drafts = [{ id: 'd1', lead_id: 'lead-1', message_id: 're_old', subject: 'Hi', sent_at: '2026-09-10T08:00:00Z', status: 'sent' }];
    refreshDelivery
      .mockResolvedValueOnce({ ok: false, reason: 'untracked' })
      .mockResolvedValueOnce({ ok: true, status: 'delivered', changed: true });
    const json = await (await call()).json();
    expect(recordSend).toHaveBeenCalledWith(adminSupabase, expect.objectContaining({ resendId: 're_old', kind: 'fair_outreach', draftId: 'd1', recipient: 'a@x.com' }));
    expect(json).toMatchObject({ checked: 1, updated: 1, untracked: 1, errors: 0 });
  });

  test('without the Resend key it says so instead of pretending', async () => {
    delete process.env.RESEND_API_KEY;
    const res = await call();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/RESEND_API_KEY/);
  });
});

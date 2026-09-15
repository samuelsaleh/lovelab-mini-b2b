/**
 * @jest-environment node
 *
 * Opens and clicks (Sam, 15 Sep 2026): Resend's email.opened / email.clicked
 * used to be flattened into "delivered". Now the first open and click and a
 * counter are kept on the email and mirrored to the fair draft, so the batch
 * follow-up can say who opened. A bounce is never downgraded by a late open.
 */
jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn() }));

const { applyResendEvent, applyEngagement, refreshDelivery, _resetEmailDeliveriesProbe } = require('../emailDeliveries');

function makeAdmin({ deliveries = [], drafts = [], opensColumns = true } = {}) {
  const state = { deliveries: [...deliveries], drafts: [...drafts], writes: [] };
  function table(name) {
    const rows = name === 'email_deliveries' ? state.deliveries : name === 'fair_email_drafts' ? state.drafts : [];
    const filters = [];
    let pendingUpdate = null;
    let selected = null;
    const applyAll = () => rows.filter((r) => filters.every((f) => f(r)));
    const flush = () => {
      if (!pendingUpdate) return;
      const targets = applyAll();
      targets.forEach((r) => Object.assign(r, pendingUpdate));
      state.writes.push({ table: name, payload: pendingUpdate, count: targets.length });
      pendingUpdate = null;
    };
    const api = {
      select: jest.fn((cols) => { selected = cols; flush(); return api; }),
      eq: jest.fn((col, val) => { filters.push((r) => r[col] === val); return api; }),
      limit: jest.fn(async () => {
        if (name === 'email_deliveries' && selected === 'opened_at' && !opensColumns) return { data: null, error: { message: 'column "opened_at" does not exist' } };
        return { data: applyAll(), error: null };
      }),
      maybeSingle: jest.fn(async () => ({ data: applyAll()[0] || null, error: null })),
      single: jest.fn(async () => ({ data: applyAll()[0] || null, error: null })),
      update: jest.fn((payload) => { pendingUpdate = payload; return api; }),
      then: (resolve) => { flush(); return resolve({ data: applyAll(), error: null }); },
    };
    return api;
  }
  return { from: jest.fn((name) => table(name)), state };
}

const tracked = () => ({ resend_id: 're_1', kind: 'fair_outreach', draft_id: 'draft-1', status: 'sent', sent_at: '2026-09-15T08:00:00.000Z', last_event_at: null, opened_at: null, clicked_at: null, open_count: 0, click_count: 0 });
const draft = () => ({ id: 'draft-1', status: 'sent', delivery_status: null });

beforeEach(() => { _resetEmailDeliveriesProbe(); jest.clearAllMocks(); process.env.RESEND_API_KEY = 'k'; });

describe('opens and clicks', () => {
  test('an open marks delivered, keeps the first open time and counts', async () => {
    const admin = makeAdmin({ deliveries: [tracked()], drafts: [draft()] });
    const first = await applyResendEvent(admin, { type: 'email.opened', created_at: '2026-09-15T09:00:00.000Z', data: { email_id: 're_1' } });
    expect(first).toMatchObject({ ok: true, status: 'delivered', kind: 'opened', changed: true });
    const again = await applyResendEvent(admin, { type: 'email.opened', created_at: '2026-09-15T10:00:00.000Z', data: { email_id: 're_1' } });
    expect(again.changed).toBe(false);
    const row = admin.state.deliveries[0];
    expect(row).toMatchObject({ status: 'delivered', opened_at: '2026-09-15T09:00:00.000Z', open_count: 2, clicked_at: null, click_count: 0 });
    expect(admin.state.drafts[0]).toMatchObject({ delivery_status: 'delivered', opened_at: '2026-09-15T09:00:00.000Z', clicked_at: null });
  });

  test('a click is also an open, and counts separately', async () => {
    const admin = makeAdmin({ deliveries: [tracked()], drafts: [draft()] });
    await applyResendEvent(admin, { type: 'email.clicked', created_at: '2026-09-15T09:05:00.000Z', data: { email_id: 're_1' } });
    expect(admin.state.deliveries[0]).toMatchObject({ opened_at: '2026-09-15T09:05:00.000Z', clicked_at: '2026-09-15T09:05:00.000Z', open_count: 0, click_count: 1, status: 'delivered' });
    expect(admin.state.drafts[0].clicked_at).toBe('2026-09-15T09:05:00.000Z');
  });

  test('a late open never downgrades a bounce', async () => {
    const admin = makeAdmin({ deliveries: [{ ...tracked(), status: 'bounced', last_event_at: '2026-09-15T08:30:00.000Z' }], drafts: [{ ...draft(), delivery_status: 'bounced' }] });
    const res = await applyEngagement(admin, { resendId: 're_1', kind: 'opened', eventAt: '2026-09-15T09:00:00.000Z' });
    expect(res).toMatchObject({ ok: true, status: 'bounced' });
    expect(admin.state.deliveries[0]).toMatchObject({ status: 'bounced', opened_at: '2026-09-15T09:00:00.000Z', open_count: 1 });
    expect(admin.state.drafts[0].delivery_status).toBe('bounced');
  });

  test('without the opens migration an open still only means delivered', async () => {
    const admin = makeAdmin({ deliveries: [tracked()], drafts: [draft()], opensColumns: false });
    await applyResendEvent(admin, { type: 'email.opened', data: { email_id: 're_1' } });
    expect(admin.state.deliveries[0].status).toBe('delivered');
    expect(admin.state.deliveries[0].open_count).toBe(0);
    expect(admin.state.drafts[0]).not.toHaveProperty('opened_at');
  });

  test('the API-key poll treats last_event opened like the webhook', async () => {
    const admin = makeAdmin({ deliveries: [tracked()], drafts: [draft()] });
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ id: 're_1', last_event: 'opened' }) }));
    const res = await refreshDelivery(admin, 're_1', { fetchImpl });
    expect(res).toMatchObject({ ok: true, status: 'delivered', kind: 'opened' });
    expect(admin.state.deliveries[0].open_count).toBe(1);
    expect(admin.state.deliveries[0].checked_at).toBeTruthy();
  });

  test('an untracked email is reported, not invented', async () => {
    const admin = makeAdmin({ deliveries: [], drafts: [] });
    expect(await applyEngagement(admin, { resendId: 're_x', kind: 'opened' })).toEqual({ ok: false, reason: 'untracked' });
  });
});

/**
 * @jest-environment node
 *
 * lib/emailDeliveries — what happened to an email after Resend took it.
 *
 * Pins: the Resend event → status mapping, the plain-language advice for
 * each outcome, that a send is recorded and mirrored onto the order, that a
 * bounce updates the row, the order, the fair draft, and raises exactly one
 * admin alert, that stale events never overwrite newer ones, and that the
 * API-key poll and the daily sweep use the same path.
 */

jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn() }));

const {
  statusFromResendEvent,
  explainDelivery,
  recordSend,
  applyResendEvent,
  applyDeliveryUpdate,
  refreshDelivery,
  sweepPendingDeliveries,
  latestOrderDelivery,
  emailDeliveriesAvailable,
  _resetEmailDeliveriesProbe,
} = require('../emailDeliveries');

// ── A small in-memory Supabase double for the three tables involved ──────────
function makeAdmin({ tableExists = true, deliveries = [], documents = [], drafts = [] } = {}) {
  const state = { deliveries: [...deliveries], documents: [...documents], drafts: [...drafts], writes: [] };

  function table(name) {
    const rows = state[name === 'email_deliveries' ? 'deliveries' : name === 'documents' ? 'documents' : 'drafts'];
    const filters = [];
    let order = null;
    let limitN = null;
    let pendingUpdate = null;
    let pendingUpsert = null;
    const api = {
      select: jest.fn(() => api),
      eq: jest.fn((col, val) => { filters.push((r) => r[col] === val); return api; }),
      in: jest.fn((col, vals) => { filters.push((r) => vals.includes(r[col])); return api; }),
      lt: jest.fn((col, val) => { filters.push((r) => r[col] < val); return api; }),
      gt: jest.fn((col, val) => { filters.push((r) => r[col] > val); return api; }),
      order: jest.fn((col, opts) => { order = { col, asc: opts?.ascending !== false }; return api; }),
      limit: jest.fn((n) => {
        limitN = n;
        if (name === 'email_deliveries' && !tableExists) return Promise.resolve({ data: null, error: { message: 'relation "email_deliveries" does not exist' } });
        return Promise.resolve({ data: applyAll(), error: null });
      }),
      maybeSingle: jest.fn(async () => ({ data: applyAll()[0] || null, error: null })),
      single: jest.fn(async () => ({ data: applyAll()[0] || null, error: null })),
      update: jest.fn((payload) => { pendingUpdate = payload; return api; }),
      upsert: jest.fn(async (row, opts) => {
        state.writes.push({ table: name, op: 'upsert', row, opts });
        const existing = rows.find((r) => r.resend_id === row.resend_id);
        if (existing && opts?.ignoreDuplicates) return { error: null };
        if (existing) Object.assign(existing, row); else rows.push({ ...row });
        return { error: null };
      }),
      then: (resolve) => {
        // awaiting the chain after .update().eq() applies the update
        if (pendingUpdate) {
          const targets = applyAll();
          targets.forEach((r) => Object.assign(r, pendingUpdate));
          state.writes.push({ table: name, op: 'update', payload: pendingUpdate, count: targets.length });
          pendingUpdate = null;
          return resolve({ data: targets, error: null });
        }
        return resolve({ data: applyAll(), error: null });
      },
    };
    function applyAll() {
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (order) out = [...out].sort((a, b) => (a[order.col] < b[order.col] ? -1 : 1) * (order.asc ? 1 : -1));
      if (limitN != null) out = out.slice(0, limitN);
      return out;
    }
    // .update().eq().select().single() → return the updated row
    const origSelect = api.select;
    api.select = jest.fn(() => {
      if (pendingUpdate) {
        const targets = applyAll();
        targets.forEach((r) => Object.assign(r, pendingUpdate));
        state.writes.push({ table: name, op: 'update', payload: pendingUpdate, count: targets.length });
        pendingUpdate = null;
      }
      return api;
    });
    void origSelect;
    void pendingUpsert;
    return api;
  }

  return { from: jest.fn((name) => table(name)), state };
}

const DOC = { id: 'doc-1', metadata: { formState: { rows: [] } } };
const DRAFT = { id: 'draft-1', status: 'sent' };

beforeEach(() => {
  _resetEmailDeliveriesProbe();
  jest.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
});

describe('statusFromResendEvent', () => {
  test.each([
    ['email.sent', 'sent'], ['email.delivered', 'delivered'], ['email.delivery_delayed', 'delivery_delayed'],
    ['email.bounced', 'bounced'], ['email.complained', 'complained'], ['email.failed', 'failed'],
    ['email.suppressed', 'suppressed'], ['email.opened', 'delivered'], ['email.clicked', 'delivered'],
    ['delivered', 'delivered'], ['queued', 'sent'], ['email.received', 'unknown'], [undefined, 'unknown'],
  ])('%s → %s', (input, expected) => {
    expect(statusFromResendEvent(input)).toBe(expected);
  });
});

describe('explainDelivery', () => {
  test('delivered is good news', () => {
    expect(explainDelivery('delivered')).toMatchObject({ label: 'Delivered', tone: 'good' });
  });
  test('an unknown address says to check the spelling', () => {
    const e = explainDelivery('bounced', { message: '550 5.1.1 The email account that you tried to reach does not exist' });
    expect(e.tone).toBe('bad');
    expect(e.advice).toMatch(/does not exist/i);
    expect(e.advice).toMatch(/spelling/i);
  });
  test('a full mailbox says so', () => {
    expect(explainDelivery('bounced', { message: '552 5.2.2 Mailbox full' }).advice).toMatch(/mailbox is full/i);
  });
  test('a too-large message says to drop the catalogue', () => {
    expect(explainDelivery('bounced', { message: 'Message size too large' }).advice).toMatch(/catalogue/i);
  });
  test('a spam block names the sender to allow', () => {
    expect(explainDelivery('bounced', { message: '550 5.7.1 Message rejected as spam by policy' }).advice).toMatch(/dionne@love-lab.com/);
  });
  test('a Resend suppression points at the suppression list', () => {
    expect(explainDelivery('bounced', { bounceSubType: 'Suppressed', message: 'on the suppression list' }).advice).toMatch(/suppression list/i);
    expect(explainDelivery('suppressed').advice).toMatch(/suppression list/i);
  });
  test('a complaint says not to email again', () => {
    expect(explainDelivery('complained')).toMatchObject({ tone: 'bad' });
    expect(explainDelivery('complained').advice).toMatch(/do not email/i);
  });
  test('delayed says Resend keeps retrying', () => {
    expect(explainDelivery('delivery_delayed').advice).toMatch(/72 hours/);
  });
});

describe('recordSend', () => {
  test('stores the send and marks the order as emailed', async () => {
    const admin = makeAdmin({ documents: [{ ...DOC, metadata: { ...DOC.metadata } }] });
    const res = await recordSend(admin, {
      resendId: 're_1', kind: 'order_confirmation', documentId: 'doc-1', recipient: 'hej@hejskat.com', subject: 'Vielen Dank',
    });
    expect(res.ok).toBe(true);
    const upsert = admin.state.writes.find((w) => w.op === 'upsert');
    expect(upsert.row).toMatchObject({ resend_id: 're_1', kind: 'order_confirmation', document_id: 'doc-1', status: 'sent', recipient: 'hej@hejskat.com' });
    expect(upsert.opts).toMatchObject({ onConflict: 'resend_id', ignoreDuplicates: true });
    const doc = admin.state.documents[0];
    expect(doc.metadata.client_email).toMatchObject({ resend_id: 're_1', status: 'sent', recipient: 'hej@hejskat.com' });
    expect(doc.metadata.formState).toEqual({ rows: [] }); // nothing else in metadata is touched
  });

  test('joins several recipients into one string', async () => {
    const admin = makeAdmin();
    await recordSend(admin, { resendId: 're_2', kind: 'internal_notice', recipient: ['a@x.com', 'b@x.com'] });
    expect(admin.state.writes[0].row.recipient).toBe('a@x.com, b@x.com');
  });

  test('is a no-op without an id or when the table is missing', async () => {
    expect(await recordSend(makeAdmin(), { resendId: null })).toEqual({ ok: false, reason: 'no_resend_id' });
    const admin = makeAdmin({ tableExists: false });
    expect(await recordSend(admin, { resendId: 're_3' })).toEqual({ ok: false, reason: 'table_missing' });
    expect(admin.state.writes).toHaveLength(0);
  });
});

describe('applyResendEvent', () => {
  const tracked = () => ({
    resend_id: 're_9', kind: 'order_confirmation', document_id: 'doc-1', draft_id: 'draft-1',
    recipient: 'hej@hejskat.com', subject: 'Vielen Dank', status: 'sent',
    sent_at: '2026-09-09T09:28:00.000Z', last_event_at: null, detail: null,
  });

  test('a bounce updates the row, the order, the draft, and alerts an admin once', async () => {
    const { recordHealthEvent } = require('@/lib/healthEvent');
    const admin = makeAdmin({ deliveries: [tracked()], documents: [{ ...DOC, metadata: { ...DOC.metadata } }], drafts: [{ ...DRAFT }] });
    const res = await applyResendEvent(admin, {
      type: 'email.bounced',
      created_at: '2026-09-09T09:30:00.000Z',
      data: {
        email_id: 're_9', to: ['hej@hejskat.com'], subject: 'Vielen Dank',
        bounce: { type: 'Permanent', subType: 'MessageRejected', message: '550 5.1.1 user unknown' },
      },
    });
    expect(res).toMatchObject({ ok: true, status: 'bounced', changed: true });

    const row = admin.state.deliveries[0];
    expect(row).toMatchObject({ status: 'bounced', detail: '550 5.1.1 user unknown', bounce_type: 'Permanent', bounce_subtype: 'MessageRejected' });
    expect(row.advice).toMatch(/does not exist/i);

    expect(admin.state.documents[0].metadata.client_email).toMatchObject({ status: 'bounced', detail: '550 5.1.1 user unknown' });
    expect(admin.state.drafts[0]).toMatchObject({ delivery_status: 'bounced' });
    expect(admin.state.drafts[0].delivery_error).toMatch(/user unknown/);

    expect(recordHealthEvent).toHaveBeenCalledTimes(1);
    const ev = recordHealthEvent.mock.calls[0][0];
    expect(ev).toMatchObject({ source: 'email_delivery_bounced', severity: 'error' });
    expect(ev.message).toMatch(/Order confirmation to hej@hejskat.com bounced/);
    expect(ev.context.whatToDo).toMatch(/spelling/i);
  });

  test('delivered is recorded without an alert', async () => {
    const { recordHealthEvent } = require('@/lib/healthEvent');
    const admin = makeAdmin({ deliveries: [tracked()], documents: [{ ...DOC, metadata: {} }] });
    await applyResendEvent(admin, { type: 'email.delivered', created_at: '2026-09-09T09:29:00.000Z', data: { email_id: 're_9' } });
    expect(admin.state.deliveries[0].status).toBe('delivered');
    expect(admin.state.documents[0].metadata.client_email.status).toBe('delivered');
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  test('an open counts as delivered', async () => {
    const admin = makeAdmin({ deliveries: [tracked()] });
    await applyResendEvent(admin, { type: 'email.opened', created_at: '2026-09-09T10:00:00.000Z', data: { email_id: 're_9' } });
    expect(admin.state.deliveries[0].status).toBe('delivered');
  });

  test('an older event never overwrites a newer one', async () => {
    const admin = makeAdmin({ deliveries: [{ ...tracked(), status: 'bounced', last_event_at: '2026-09-09T09:30:00.000Z' }] });
    const res = await applyResendEvent(admin, { type: 'email.delivered', created_at: '2026-09-09T09:29:00.000Z', data: { email_id: 're_9' } });
    expect(res).toMatchObject({ ok: true, ignored: 'older_event', status: 'bounced' });
    expect(admin.state.deliveries[0].status).toBe('bounced');
  });

  test('the same status twice does not alert twice', async () => {
    const { recordHealthEvent } = require('@/lib/healthEvent');
    const admin = makeAdmin({ deliveries: [{ ...tracked(), status: 'bounced', last_event_at: '2026-09-09T09:30:00.000Z' }] });
    await applyResendEvent(admin, { type: 'email.bounced', created_at: '2026-09-09T09:31:00.000Z', data: { email_id: 're_9', bounce: { message: 'again' } } });
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  test('ignores events for emails we did not send, and non-email events', async () => {
    const admin = makeAdmin({ deliveries: [] });
    expect(await applyResendEvent(admin, { type: 'email.bounced', data: { email_id: 'stranger' } })).toEqual({ ok: false, reason: 'untracked' });
    expect(await applyResendEvent(admin, { type: 'domain.updated', data: {} })).toEqual({ ok: true, ignored: 'not_an_email_event' });
    expect(await applyResendEvent(admin, { type: 'email.received', data: { email_id: 're_9' } })).toMatchObject({ ok: true, ignored: 'unhandled_event' });
  });
});

describe('refreshDelivery and the sweep (API key path)', () => {
  test('asks Resend for one email and applies last_event', async () => {
    const admin = makeAdmin({ deliveries: [{ resend_id: 're_5', kind: 'fair_outreach', draft_id: 'draft-1', status: 'sent', sent_at: '2026-09-09T09:00:00.000Z' }], drafts: [{ ...DRAFT }] });
    const fetchImpl = jest.fn(async (url, init) => {
      expect(url).toBe('https://api.resend.com/emails/re_5');
      expect(init.headers.Authorization).toBe('Bearer test-key');
      return { ok: true, json: async () => ({ id: 're_5', last_event: 'delivered' }) };
    });
    const res = await refreshDelivery(admin, 're_5', { fetchImpl });
    expect(res).toMatchObject({ ok: true, status: 'delivered' });
    expect(admin.state.deliveries[0].checked_at).toBeTruthy();
    expect(admin.state.drafts[0].delivery_status).toBe('delivered');
  });

  test('a Resend error is reported, not thrown', async () => {
    const admin = makeAdmin({ deliveries: [{ resend_id: 're_6', status: 'sent', sent_at: '2026-09-09T09:00:00.000Z' }] });
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({ message: 'Invalid API key' }) }));
    expect(await refreshDelivery(admin, 're_6', { fetchImpl })).toMatchObject({ ok: false, reason: 'resend_error', status: 401, error: 'Invalid API key' });
  });

  test('the sweep only looks at pending emails between 10 minutes and 7 days old', async () => {
    const now = new Date('2026-09-10T06:00:00.000Z');
    const admin = makeAdmin({ deliveries: [
      { resend_id: 'fresh', status: 'sent', sent_at: '2026-09-10T05:55:00.000Z' },        // too fresh
      { resend_id: 'pending', status: 'sent', sent_at: '2026-09-09T09:00:00.000Z' },      // yes
      { resend_id: 'delayed', status: 'delivery_delayed', sent_at: '2026-09-08T09:00:00.000Z' }, // yes
      { resend_id: 'done', status: 'delivered', sent_at: '2026-09-09T09:00:00.000Z' },    // settled
      { resend_id: 'old', status: 'sent', sent_at: '2026-08-01T09:00:00.000Z' },          // too old
    ] });
    const fetchImpl = jest.fn(async (url) => ({
      ok: true,
      json: async () => ({ last_event: url.endsWith('/pending') ? 'delivered' : 'delivery_delayed' }),
    }));
    const summary = await sweepPendingDeliveries(admin, { now, fetchImpl });
    expect(summary).toMatchObject({ ok: true, checked: 2, errors: 0 });
    expect(fetchImpl.mock.calls.map(([u]) => u.split('/').pop()).sort()).toEqual(['delayed', 'pending']);
    expect(admin.state.deliveries.find((d) => d.resend_id === 'pending').status).toBe('delivered');
  });
});

describe('helpers', () => {
  test('latestOrderDelivery prefers embedded rows, newest first, then metadata', () => {
    expect(latestOrderDelivery({ email_deliveries: [
      { kind: 'order_confirmation', status: 'sent', sent_at: '2026-09-01T00:00:00Z' },
      { kind: 'order_confirmation', status: 'delivered', sent_at: '2026-09-09T00:00:00Z' },
      { kind: 'internal_notice', status: 'bounced', sent_at: '2026-09-10T00:00:00Z' },
    ] }).status).toBe('delivered');
    expect(latestOrderDelivery({ metadata: { client_email: { status: 'bounced' } } }).status).toBe('bounced');
    expect(latestOrderDelivery({})).toBeNull();
  });

  test('the table probe caches its answer until reset', async () => {
    const admin = makeAdmin({ tableExists: false });
    expect(await emailDeliveriesAvailable(admin)).toBe(false);
    expect(await emailDeliveriesAvailable(makeAdmin({ tableExists: true }))).toBe(false); // cached
    _resetEmailDeliveriesProbe();
    expect(await emailDeliveriesAvailable(makeAdmin({ tableExists: true }))).toBe(true);
  });
});

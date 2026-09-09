/**
 * @jest-environment node
 *
 * POST /api/webhooks/resend — Resend's delivery reports, signed.
 *
 * A request is only trusted when its Svix signature matches
 * RESEND_WEBHOOK_SECRET over the raw body; then the event goes to
 * lib/emailDeliveries. Unsigned, mis-signed or stale requests are refused
 * and never touch the database.
 */
const { createHmac } = require('node:crypto');

const applyResendEvent = jest.fn().mockResolvedValue({ ok: true, status: 'delivered' });
jest.mock('@/lib/emailDeliveries', () => ({ applyResendEvent: (...args) => applyResendEvent(...args) }));
jest.mock('@/lib/supabase/server', () => ({ createAdminClient: jest.fn(() => ({ tag: 'admin' })) }));
jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn().mockResolvedValue(undefined) }));

const { POST } = require('../webhooks/resend/route');

const SECRET = 'whsec_' + Buffer.from('webhook-secret-for-tests').toString('base64');

function sign(id, ts, body) {
  const key = Buffer.from(SECRET.slice('whsec_'.length), 'base64');
  return 'v1,' + createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

function makeRequest(body, { id = 'msg_1', ts = String(Math.floor(Date.now() / 1000)), signature } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (id) headers.set('svix-id', id);
  if (ts) headers.set('svix-timestamp', ts);
  headers.set('svix-signature', signature === undefined ? sign(id, ts, body) : signature);
  return new global.Request('http://localhost/api/webhooks/resend', { method: 'POST', headers, body });
}

const EVENT = { type: 'email.bounced', created_at: '2026-09-09T09:30:00.000Z', data: { email_id: 're_9', bounce: { message: 'user unknown' } } };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});

describe('POST /api/webhooks/resend', () => {
  it('applies a correctly signed event', async () => {
    const body = JSON.stringify(EVENT);
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    expect(applyResendEvent).toHaveBeenCalledTimes(1);
    const [admin, event] = applyResendEvent.mock.calls[0];
    expect(admin).toEqual({ tag: 'admin' });
    expect(event).toEqual(EVENT);
  });

  it('refuses a bad signature and never touches the database', async () => {
    const res = await POST(makeRequest(JSON.stringify(EVENT), { signature: 'v1,bm9wZQ==' }));
    expect(res.status).toBe(401);
    expect(applyResendEvent).not.toHaveBeenCalled();
  });

  it('refuses a stale timestamp', async () => {
    const ts = String(Math.floor(Date.now() / 1000) - 3600);
    const res = await POST(makeRequest(JSON.stringify(EVENT), { ts }));
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('timestamp_out_of_tolerance');
  });

  it('refuses when the secret is not configured', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await POST(makeRequest(JSON.stringify(EVENT)));
    expect(res.status).toBe(503);
  });

  it('rejects a signed but malformed body', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(400);
  });

  it('answers 200 even if the handler throws, and records it', async () => {
    const { recordHealthEvent } = require('@/lib/healthEvent');
    applyResendEvent.mockRejectedValueOnce(new Error('db down'));
    const res = await POST(makeRequest(JSON.stringify(EVENT)));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'resend_webhook', severity: 'error' }));
  });
});

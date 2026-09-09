/**
 * @jest-environment node
 *
 * lib/orderNotices — the one place internal order emails go through.
 *
 * Why this exists (Sam, 9 Sept 2026): Silke re-saved and emailed an order
 * and Alberto heard nothing. The old code called the Resend SDK and threw
 * the answer away, so a refused email left no trace. These tests pin that
 * a failed send is recorded, that drafts and non-revenue channels stay
 * silent, and that the three kinds produce distinct, correct emails.
 */

jest.mock('@/lib/send-email', () => ({ sendEmail: jest.fn() }));
jest.mock('@/lib/healthEvent', () => ({ recordHealthEvent: jest.fn() }));

const { notifyOrderEvent, shouldNotifyForDocument } = require('../orderNotices');

function fakeAdmin({ eventName = 'Nordstil', actorName = 'Silke Holdinghausen' } = {}) {
  return {
    from: jest.fn((table) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: table === 'events' ? { name: eventName } : { full_name: actorName },
        error: null,
      }),
    })),
  };
}

const sentOrder = {
  id: 'doc-1',
  status: 'sent',
  order_channel: 'b2b',
  document_type: 'order',
  client_company: 'Nanau Vertriebsgesellschaft mbH',
  client_name: 'Malwina Ernst',
  total_amount: 2497.5,
  event_id: 'evt-1',
};

describe('shouldNotifyForDocument', () => {
  test('sent b2b and b2c orders notify', () => {
    expect(shouldNotifyForDocument(sentOrder).ok).toBe(true);
    expect(shouldNotifyForDocument({ ...sentOrder, order_channel: 'b2c' }).ok).toBe(true);
  });
  test('drafts stay silent', () => {
    expect(shouldNotifyForDocument({ ...sentOrder, status: 'draft' })).toEqual({ ok: false, reason: 'draft' });
  });
  test.each(['internal', 'consignment', 'delete_from_stock'])('%s orders stay silent', (channel) => {
    expect(shouldNotifyForDocument({ ...sentOrder, order_channel: channel })).toEqual({ ok: false, reason: 'channel' });
  });
});

describe('notifyOrderEvent', () => {
  let sendEmail;
  let recordHealthEvent;

  beforeEach(() => {
    sendEmail = jest.fn().mockResolvedValue({ sent: true, message_id: 'm-1' });
    recordHealthEvent = jest.fn().mockResolvedValue({ ok: true });
    process.env.RESEND_API_KEY = 'test_key';
    delete process.env.ORDER_NOTIFICATION_EMAILS;
    delete process.env.SENDER_EMAIL;
  });

  test('created: goes to the order recipients with the New order subject', async () => {
    const res = await notifyOrderEvent(
      fakeAdmin(),
      { kind: 'created', document: sentOrder, actor: { id: 'u-1', email: 'silke@example.com' } },
      { sendEmail, recordHealthEvent },
    );
    expect(res.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const payload = sendEmail.mock.calls[0][0];
    expect(payload.to).toEqual(['alberto@love-lab.com', 'dionne@love-lab.com', 'elie@love-lab.com']);
    expect(payload.from).toBe('LoveLab <dionne@love-lab.com>');
    expect(payload.subject).toMatch(/^New order: Nanau Vertriebsgesellschaft mbH/);
    expect(payload.html).toContain('Nordstil');
    expect(payload.html).toContain('Silke Holdinghausen');
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  test('updated: says it is an update and names the version it replaces', async () => {
    await notifyOrderEvent(
      fakeAdmin(),
      {
        kind: 'updated',
        document: sentOrder,
        actor: { id: 'u-1' },
        replacedDocument: { created_at: '2026-09-02T10:00:00.000Z' },
      },
      { sendEmail, recordHealthEvent },
    );
    const payload = sendEmail.mock.calls[0][0];
    expect(payload.subject).toMatch(/^Order updated: Nanau/);
    expect(payload.html).toContain('2 Sept 2026');
    expect(payload.html).toMatch(/Updated by/);
  });

  test('sent_to_client: names the client address it went to', async () => {
    await notifyOrderEvent(
      fakeAdmin(),
      { kind: 'sent_to_client', document: sentOrder, actor: { email: 'silke@example.com' }, recipient: 'hej@hejskat.com' },
      { sendEmail, recordHealthEvent },
    );
    const payload = sendEmail.mock.calls[0][0];
    expect(payload.subject).toMatch(/^Order emailed to client: Nanau/);
    expect(payload.html).toContain('hej@hejskat.com');
  });

  test('honours ORDER_NOTIFICATION_EMAILS', async () => {
    process.env.ORDER_NOTIFICATION_EMAILS = 'albertosaleh@gmail.com, dionne@love-lab.com';
    await notifyOrderEvent(fakeAdmin(), { kind: 'created', document: sentOrder }, { sendEmail, recordHealthEvent });
    expect(sendEmail.mock.calls[0][0].to).toEqual(['albertosaleh@gmail.com', 'dionne@love-lab.com']);
  });

  test('a refused send is recorded, never swallowed', async () => {
    sendEmail.mockResolvedValue({ sent: false, reason: 'resend_error', status: 403, error: 'domain not verified' });
    const res = await notifyOrderEvent(fakeAdmin(), { kind: 'created', document: sentOrder }, { sendEmail, recordHealthEvent });
    expect(res.sent).toBe(false);
    expect(recordHealthEvent).toHaveBeenCalledTimes(1);
    const ev = recordHealthEvent.mock.calls[0][0];
    expect(ev.source).toBe('order_notice_created');
    expect(ev.severity).toBe('error');
    expect(ev.context).toMatchObject({ documentId: 'doc-1', status: 403, error: 'domain not verified' });
  });

  test('a throwing mailer is recorded and does not propagate', async () => {
    sendEmail.mockRejectedValue(new Error('network down'));
    const res = await notifyOrderEvent(fakeAdmin(), { kind: 'updated', document: sentOrder }, { sendEmail, recordHealthEvent });
    expect(res).toMatchObject({ sent: false, reason: 'threw' });
    expect(recordHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'order_notice_updated', severity: 'error' }));
  });

  test('drafts and silent channels never reach the mailer', async () => {
    await notifyOrderEvent(fakeAdmin(), { kind: 'created', document: { ...sentOrder, status: 'draft' } }, { sendEmail, recordHealthEvent });
    await notifyOrderEvent(fakeAdmin(), { kind: 'updated', document: { ...sentOrder, order_channel: 'consignment' } }, { sendEmail, recordHealthEvent });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  test('an unknown kind is refused', async () => {
    const res = await notifyOrderEvent(fakeAdmin(), { kind: 'deleted', document: sentOrder }, { sendEmail, recordHealthEvent });
    expect(res).toEqual({ sent: false, reason: 'bad_kind' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('no API key is a quiet skip, not an alert', async () => {
    delete process.env.RESEND_API_KEY;
    const res = await notifyOrderEvent(fakeAdmin(), { kind: 'created', document: sentOrder }, { sendEmail, recordHealthEvent });
    expect(res).toEqual({ sent: false, reason: 'no_api_key' });
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  test('falls back to the actor email when there is no profile name', async () => {
    const admin = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
    await notifyOrderEvent(admin, { kind: 'created', document: sentOrder, actor: { id: 'u-9', email: 'fallback@example.com' } }, { sendEmail, recordHealthEvent });
    expect(sendEmail.mock.calls[0][0].html).toContain('fallback@example.com');
  });
});

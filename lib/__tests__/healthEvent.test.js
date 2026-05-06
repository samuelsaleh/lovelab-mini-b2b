/**
 * @jest-environment node
 *
 * recordHealthEvent — unit tests
 *
 * Covers:
 *   - Validates required fields (source, severity, message)
 *   - Inserts a row for every accepted call
 *   - Sends an admin email for severity ≥ 'error'
 *   - Does NOT send for 'info' / 'warn'
 *   - Honours alertAdmin override (force on for 'warn', force off for 'error')
 *   - Throttles repeated alerts within ALERT_THROTTLE_MINUTES
 *   - Insert failure → returns ok:false, no email
 *   - Email failure → still returns ok:true, alerted:false
 */

import { recordHealthEvent } from '@/lib/healthEvent';

function makeClient({ insertOk = true, recentAlert = null, throwOnInsert = false } = {}) {
  const inserted = { id: 'evt-1', created_at: '2026-05-06T14:00:00.000Z' };
  const updates = [];
  const inserts = [];

  const fromImpl = (table) => {
    if (table !== 'system_health_events') {
      throw new Error('Unexpected table: ' + table);
    }
    return {
      insert(payload) {
        inserts.push(payload);
        if (throwOnInsert) {
          return {
            select() {
              return {
                single: () => Promise.reject(new Error('boom')),
              };
            },
          };
        }
        return {
          select() {
            return {
              single: () =>
                Promise.resolve(
                  insertOk
                    ? { data: inserted, error: null }
                    : { data: null, error: { message: 'rls_denied' } },
                ),
            };
          },
        };
      },
      update(patch) {
        updates.push(patch);
        return {
          eq() {
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      select() {
        // throttle lookup chain: select().eq().eq().not().gte().limit()
        const result = recentAlert
          ? { data: [{ id: 'previous-event' }], error: null }
          : { data: [], error: null };
        const chain = {};
        const ret = () => chain;
        chain.eq = jest.fn(ret);
        chain.not = jest.fn(ret);
        chain.gte = jest.fn(ret);
        chain.limit = jest.fn().mockResolvedValue(result);
        return chain;
      },
    };
  };

  return {
    from: jest.fn(fromImpl),
    __inserts: inserts,
    __updates: updates,
  };
}

describe('recordHealthEvent — input validation', () => {
  test('rejects missing source', async () => {
    const r = await recordHealthEvent({ severity: 'error', message: 'x' });
    expect(r).toMatchObject({ ok: false, reason: 'invalid_source' });
  });

  test('rejects unknown severity', async () => {
    const r = await recordHealthEvent({ source: 's', severity: 'fatal', message: 'x' });
    expect(r).toMatchObject({ ok: false, reason: 'invalid_severity' });
  });

  test('rejects missing message', async () => {
    const r = await recordHealthEvent({ source: 's', severity: 'error' });
    expect(r).toMatchObject({ ok: false, reason: 'invalid_message' });
  });
});

describe('recordHealthEvent — insertion', () => {
  test('inserts a row with the provided fields', async () => {
    const client = makeClient();
    const mailer = jest.fn().mockResolvedValue({ sent: true });

    const r = await recordHealthEvent({
      source: 'src',
      severity: 'info',
      message: 'hello',
      context: { foo: 'bar' },
      client,
      mailer,
    });

    expect(r.ok).toBe(true);
    expect(r.id).toBe('evt-1');
    expect(client.__inserts).toEqual([
      { source: 'src', severity: 'info', message: 'hello', context: { foo: 'bar' } },
    ]);
  });

  test('returns ok:false if insert fails', async () => {
    const client = makeClient({ insertOk: false });
    const mailer = jest.fn();

    const r = await recordHealthEvent({
      source: 'src',
      severity: 'error',
      message: 'boom',
      client,
      mailer,
    });

    expect(r).toMatchObject({ ok: false, reason: 'insert_failed' });
    expect(mailer).not.toHaveBeenCalled();
  });

  test('returns ok:false if insert throws', async () => {
    const client = makeClient({ throwOnInsert: true });
    const mailer = jest.fn();

    const r = await recordHealthEvent({
      source: 'src',
      severity: 'error',
      message: 'boom',
      client,
      mailer,
    });

    expect(r).toMatchObject({ ok: false, reason: 'insert_threw' });
    expect(mailer).not.toHaveBeenCalled();
  });
});

describe('recordHealthEvent — alerting policy', () => {
  test('does not email for severity=info', async () => {
    const client = makeClient();
    const mailer = jest.fn().mockResolvedValue({ sent: true });

    const r = await recordHealthEvent({
      source: 's', severity: 'info', message: 'm', client, mailer,
    });

    expect(r).toMatchObject({ ok: true, alerted: false });
    expect(mailer).not.toHaveBeenCalled();
  });

  test('does not email for severity=warn', async () => {
    const client = makeClient();
    const mailer = jest.fn().mockResolvedValue({ sent: true });

    const r = await recordHealthEvent({
      source: 's', severity: 'warn', message: 'm', client, mailer,
    });

    expect(r).toMatchObject({ ok: true, alerted: false });
    expect(mailer).not.toHaveBeenCalled();
  });

  test('emails for severity=error', async () => {
    const client = makeClient();
    const mailer = jest.fn().mockResolvedValue({ sent: true });

    const r = await recordHealthEvent({
      source: 's', severity: 'error', message: 'm', client, mailer,
    });

    expect(r).toMatchObject({ ok: true, alerted: true });
    expect(mailer).toHaveBeenCalledTimes(1);
    expect(client.__updates).toEqual([{ alerted_at: expect.any(String) }]);
  });

  test('emails for severity=critical', async () => {
    const client = makeClient();
    const mailer = jest.fn().mockResolvedValue({ sent: true });

    const r = await recordHealthEvent({
      source: 's', severity: 'critical', message: 'm', client, mailer,
    });

    expect(r).toMatchObject({ ok: true, alerted: true });
    expect(mailer).toHaveBeenCalledTimes(1);
  });

  test('alertAdmin:false suppresses email for error severity', async () => {
    const client = makeClient();
    const mailer = jest.fn().mockResolvedValue({ sent: true });

    const r = await recordHealthEvent({
      source: 's', severity: 'error', message: 'm',
      alertAdmin: false, client, mailer,
    });

    expect(r).toMatchObject({ ok: true, alerted: false });
    expect(mailer).not.toHaveBeenCalled();
  });

  test('alertAdmin:true forces email even for warn severity', async () => {
    const client = makeClient();
    const mailer = jest.fn().mockResolvedValue({ sent: true });

    const r = await recordHealthEvent({
      source: 's', severity: 'warn', message: 'm',
      alertAdmin: true, client, mailer,
    });

    expect(r).toMatchObject({ ok: true, alerted: true });
    expect(mailer).toHaveBeenCalledTimes(1);
  });
});

describe('recordHealthEvent — throttle', () => {
  test('skips email when a recent alert exists for same source+severity', async () => {
    const client = makeClient({ recentAlert: true });
    const mailer = jest.fn().mockResolvedValue({ sent: true });

    const r = await recordHealthEvent({
      source: 's', severity: 'error', message: 'm', client, mailer,
    });

    expect(r).toMatchObject({ ok: true, alerted: false, throttled: true });
    expect(mailer).not.toHaveBeenCalled();
  });
});

describe('recordHealthEvent — email delivery failures', () => {
  test('returns ok:true even when mailer fails', async () => {
    const client = makeClient();
    const mailer = jest.fn().mockResolvedValue({ sent: false, reason: 'no_api_key' });

    const r = await recordHealthEvent({
      source: 's', severity: 'error', message: 'm', client, mailer,
    });

    expect(r).toMatchObject({ ok: true, alerted: false });
    // We did not write alerted_at because the email did not actually go out.
    expect(client.__updates).toEqual([]);
  });

  test('returns ok:true even when mailer throws', async () => {
    const client = makeClient();
    const mailer = jest.fn().mockRejectedValue(new Error('network'));

    const r = await recordHealthEvent({
      source: 's', severity: 'error', message: 'm', client, mailer,
    });

    expect(r).toMatchObject({ ok: true, alerted: false });
  });
});

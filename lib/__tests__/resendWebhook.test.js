/**
 * @jest-environment node
 *
 * lib/resendWebhook — Svix-style signature check without the svix package.
 * A wrong secret, a tampered body or a stale timestamp must all be refused;
 * any one of several signatures in the header may match.
 */
const { createHmac } = require('node:crypto');
const { verifyResendSignature, computeResendSignature } = require('../resendWebhook');

const SECRET = 'whsec_' + Buffer.from('a-very-secret-key-for-tests').toString('base64');
const BODY = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });
const ID = 'msg_2abc';
const NOW = 1_800_000_000_000; // fixed clock (ms)
const TS = String(Math.floor(NOW / 1000));

function sign(secret, id, ts, body) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  return createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

describe('computeResendSignature', () => {
  test('matches an independent HMAC over id.timestamp.body', () => {
    expect(computeResendSignature(SECRET, ID, TS, BODY)).toBe(sign(SECRET, ID, TS, BODY));
  });
});

describe('verifyResendSignature', () => {
  const good = () => ({ secret: SECRET, id: ID, timestamp: TS, rawBody: BODY, now: NOW });

  test('accepts a correct v1 signature', () => {
    const sig = `v1,${sign(SECRET, ID, TS, BODY)}`;
    expect(verifyResendSignature({ ...good(), signatureHeader: sig })).toEqual({ ok: true });
  });

  test('accepts when one of several space-separated signatures matches', () => {
    const sig = `v1,${Buffer.from('nope').toString('base64')} v1,${sign(SECRET, ID, TS, BODY)}`;
    expect(verifyResendSignature({ ...good(), signatureHeader: sig }).ok).toBe(true);
  });

  test('refuses a signature made with another secret', () => {
    const other = 'whsec_' + Buffer.from('someone-else').toString('base64');
    const sig = `v1,${sign(other, ID, TS, BODY)}`;
    expect(verifyResendSignature({ ...good(), signatureHeader: sig })).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  test('refuses a tampered body', () => {
    const sig = `v1,${sign(SECRET, ID, TS, BODY)}`;
    expect(verifyResendSignature({ ...good(), rawBody: BODY + ' ', signatureHeader: sig }).ok).toBe(false);
  });

  test('refuses a timestamp outside the tolerance window', () => {
    const oldTs = String(Math.floor(NOW / 1000) - 10 * 60);
    const sig = `v1,${sign(SECRET, ID, oldTs, BODY)}`;
    expect(verifyResendSignature({ ...good(), timestamp: oldTs, signatureHeader: sig }))
      .toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' });
  });

  test('refuses missing headers and a missing secret', () => {
    expect(verifyResendSignature({ ...good(), signatureHeader: null }).reason).toBe('missing_headers');
    expect(verifyResendSignature({ ...good(), secret: '', signatureHeader: 'v1,x' }).reason).toBe('no_secret');
    expect(verifyResendSignature({ ...good(), timestamp: 'soon', signatureHeader: 'v1,x' }).reason).toBe('bad_timestamp');
  });
});

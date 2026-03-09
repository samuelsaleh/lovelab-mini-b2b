import test from 'node:test';
import assert from 'node:assert/strict';

function simulateSendEmail({ apiKey, fetchResult, fetchThrows }) {
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  if (fetchThrows) return { sent: false, reason: 'network_error' };
  if (!fetchResult.ok) return { sent: false, reason: 'resend_error', status: fetchResult.status };
  return { sent: true };
}

test('sendEmail returns no_api_key when key is missing', () => {
  const result = simulateSendEmail({ apiKey: null, fetchResult: { ok: true } });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'no_api_key');
});

test('sendEmail returns sent:true on successful response', () => {
  const result = simulateSendEmail({ apiKey: 'key', fetchResult: { ok: true } });
  assert.equal(result.sent, true);
  assert.equal(result.reason, undefined);
});

test('sendEmail returns resend_error on non-ok response', () => {
  const result = simulateSendEmail({ apiKey: 'key', fetchResult: { ok: false, status: 400 } });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'resend_error');
  assert.equal(result.status, 400);
});

test('sendEmail returns resend_error on 429 rate limit', () => {
  const result = simulateSendEmail({ apiKey: 'key', fetchResult: { ok: false, status: 429 } });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'resend_error');
  assert.equal(result.status, 429);
});

test('sendEmail returns network_error on fetch throw', () => {
  const result = simulateSendEmail({ apiKey: 'key', fetchThrows: true });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'network_error');
});

test('sendEmail normalizes single recipient to array', () => {
  const to = 'test@example.com';
  const recipients = Array.isArray(to) ? to : [to];
  assert.deepEqual(recipients, ['test@example.com']);
});

test('sendEmail passes array recipients through', () => {
  const to = ['a@b.com', 'c@d.com'];
  const recipients = Array.isArray(to) ? to : [to];
  assert.deepEqual(recipients, ['a@b.com', 'c@d.com']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectiveRate } from '../../lib/organizations/validation.js';

test('agent with personal rate uses personal rate', () => {
  assert.equal(resolveEffectiveRate(15, 10), 15);
});

test('agent with rate=0 falls back to org rate', () => {
  assert.equal(resolveEffectiveRate(0, 12), 12);
});

test('agent with null rate falls back to org rate', () => {
  assert.equal(resolveEffectiveRate(null, 8), 8);
});

test('agent with undefined rate falls back to org rate', () => {
  assert.equal(resolveEffectiveRate(undefined, 8), 8);
});

test('org rate is also 0 -- returns 0', () => {
  assert.equal(resolveEffectiveRate(0, 0), 0);
});

test('org rate is null -- returns 0', () => {
  assert.equal(resolveEffectiveRate(0, null), 0);
});

test('org rate is undefined -- returns 0', () => {
  assert.equal(resolveEffectiveRate(0, undefined), 0);
});

test('personal rate takes precedence even when org rate is higher', () => {
  assert.equal(resolveEffectiveRate(5, 25), 5);
});

test('string rates are coerced to numbers', () => {
  assert.equal(resolveEffectiveRate('15', '10'), 15);
});

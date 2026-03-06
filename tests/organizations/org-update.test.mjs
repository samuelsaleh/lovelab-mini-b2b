import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrgUpdate } from '../../lib/organizations/validation.js';

test('validates name update', () => {
  const result = validateOrgUpdate({ name: 'Venson Amsterdam' });
  assert.equal(result.valid, true);
  assert.equal(result.updates.name, 'Venson Amsterdam');
});

test('validates rate update', () => {
  const result = validateOrgUpdate({ commission_rate: 15 });
  assert.equal(result.valid, true);
  assert.equal(result.updates.commission_rate, 15);
});

test('validates territory update', () => {
  const result = validateOrgUpdate({ territory: 'Netherlands' });
  assert.equal(result.valid, true);
  assert.equal(result.updates.territory, 'Netherlands');
});

test('allows null rate', () => {
  const result = validateOrgUpdate({ commission_rate: null });
  assert.equal(result.valid, true);
  assert.equal(result.updates.commission_rate, null);
});

test('rejects empty name', () => {
  const result = validateOrgUpdate({ name: '' });
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('empty'));
});

test('rejects whitespace-only name', () => {
  const result = validateOrgUpdate({ name: '   ' });
  assert.equal(result.valid, false);
});

test('rejects rate > 100', () => {
  const result = validateOrgUpdate({ commission_rate: 150 });
  assert.equal(result.valid, false);
});

test('rejects rate < 0', () => {
  const result = validateOrgUpdate({ commission_rate: -5 });
  assert.equal(result.valid, false);
});

test('rejects NaN rate', () => {
  const result = validateOrgUpdate({ commission_rate: 'abc' });
  assert.equal(result.valid, false);
});

test('rejects empty body', () => {
  const result = validateOrgUpdate({});
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('No valid'));
});

test('handles multiple fields at once', () => {
  const result = validateOrgUpdate({
    name: 'New Name', territory: 'France', commission_rate: 12, conditions: 'Net 30',
  });
  assert.equal(result.valid, true);
  assert.equal(result.updates.name, 'New Name');
  assert.equal(result.updates.territory, 'France');
  assert.equal(result.updates.commission_rate, 12);
  assert.equal(result.updates.conditions, 'Net 30');
});

test('trims name', () => {
  const result = validateOrgUpdate({ name: '  Trimmed Name  ' });
  assert.equal(result.updates.name, 'Trimmed Name');
});

test('trims territory and conditions', () => {
  const result = validateOrgUpdate({ territory: '  NL  ', conditions: '  Net 30  ' });
  assert.equal(result.updates.territory, 'NL');
  assert.equal(result.updates.conditions, 'Net 30');
});

test('ignores unknown fields', () => {
  const result = validateOrgUpdate({ name: 'Test', unknown_field: 'ignored' });
  assert.equal(result.valid, true);
  assert.equal(result.updates.unknown_field, undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for org PATCH endpoint validation logic.
 * Tests the decision/validation patterns used by the endpoint.
 */

function validateOrgUpdate(body, profile) {
  if (!profile || profile.role !== 'admin') {
    return { error: 'Forbidden', status: 403 };
  }

  const updates = {};

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'Organization name cannot be empty', status: 400 };
    updates.name = name;
  }

  if (body.territory !== undefined) {
    updates.territory = body.territory || null;
  }

  if (body.commission_rate !== undefined) {
    const rate = body.commission_rate === null ? null : Number(body.commission_rate);
    if (rate !== null && (isNaN(rate) || rate < 0 || rate > 100)) {
      return { error: 'Commission rate must be between 0 and 100', status: 400 };
    }
    updates.commission_rate = rate;
  }

  if (body.conditions !== undefined) {
    updates.conditions = body.conditions || null;
  }

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update', status: 400 };
  }

  return { updates };
}

test('admin can update org name', () => {
  const result = validateOrgUpdate({ name: 'Venson Amsterdam' }, { role: 'admin' });
  assert.ok(result.updates);
  assert.equal(result.updates.name, 'Venson Amsterdam');
});

test('admin can update rate', () => {
  const result = validateOrgUpdate({ commission_rate: 15 }, { role: 'admin' });
  assert.ok(result.updates);
  assert.equal(result.updates.commission_rate, 15);
});

test('admin can update territory', () => {
  const result = validateOrgUpdate({ territory: 'Netherlands' }, { role: 'admin' });
  assert.ok(result.updates);
  assert.equal(result.updates.territory, 'Netherlands');
});

test('admin can set rate to null', () => {
  const result = validateOrgUpdate({ commission_rate: null }, { role: 'admin' });
  assert.ok(result.updates);
  assert.equal(result.updates.commission_rate, null);
});

test('non-admin gets 403', () => {
  const result = validateOrgUpdate({ name: 'Test' }, { role: 'member' });
  assert.equal(result.status, 403);
});

test('null profile gets 403', () => {
  const result = validateOrgUpdate({ name: 'Test' }, null);
  assert.equal(result.status, 403);
});

test('empty name rejected', () => {
  const result = validateOrgUpdate({ name: '' }, { role: 'admin' });
  assert.equal(result.status, 400);
  assert.ok(result.error.includes('empty'));
});

test('whitespace-only name rejected', () => {
  const result = validateOrgUpdate({ name: '   ' }, { role: 'admin' });
  assert.equal(result.status, 400);
});

test('rate > 100 rejected', () => {
  const result = validateOrgUpdate({ commission_rate: 150 }, { role: 'admin' });
  assert.equal(result.status, 400);
});

test('rate < 0 rejected', () => {
  const result = validateOrgUpdate({ commission_rate: -5 }, { role: 'admin' });
  assert.equal(result.status, 400);
});

test('NaN rate rejected', () => {
  const result = validateOrgUpdate({ commission_rate: 'abc' }, { role: 'admin' });
  assert.equal(result.status, 400);
});

test('empty body rejected', () => {
  const result = validateOrgUpdate({}, { role: 'admin' });
  assert.equal(result.status, 400);
  assert.ok(result.error.includes('No fields'));
});

test('multiple fields updated at once', () => {
  const result = validateOrgUpdate(
    { name: 'New Name', territory: 'France', commission_rate: 12, conditions: 'Net 30' },
    { role: 'admin' }
  );
  assert.ok(result.updates);
  assert.equal(result.updates.name, 'New Name');
  assert.equal(result.updates.territory, 'France');
  assert.equal(result.updates.commission_rate, 12);
  assert.equal(result.updates.conditions, 'Net 30');
});

test('name is trimmed', () => {
  const result = validateOrgUpdate({ name: '  Trimmed Name  ' }, { role: 'admin' });
  assert.equal(result.updates.name, 'Trimmed Name');
});

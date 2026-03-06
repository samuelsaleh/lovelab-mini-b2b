import test from 'node:test';
import assert from 'node:assert/strict';

import { isAdmin } from '../../lib/organizations/utils.js';

test('isAdmin returns true only for admin role', () => {
  assert.equal(isAdmin({ role: 'admin' }), true);
  assert.equal(isAdmin({ role: 'agent' }), false);
  assert.equal(isAdmin({ role: 'owner' }), false);
  assert.equal(isAdmin({ role: 'member' }), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
  assert.equal(isAdmin({}), false);
});

test('isAdmin is not fooled by truthy non-admin values', () => {
  assert.equal(isAdmin({ role: 'Admin' }), false);
  assert.equal(isAdmin({ role: 'ADMIN' }), false);
  assert.equal(isAdmin({ role: true }), false);
  assert.equal(isAdmin({ role: 1 }), false);
});

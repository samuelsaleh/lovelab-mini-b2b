import test from 'node:test';
import assert from 'node:assert/strict';

import { isAdmin } from '../../lib/organizations/utils.js';
import { shouldAllowOrgAccess } from '../../lib/organizations/validation.js';

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

test('shouldAllowOrgAccess grants admins unconditionally', () => {
  assert.equal(shouldAllowOrgAccess({ role: 'admin' }, null), true);
  assert.equal(shouldAllowOrgAccess({ role: 'admin' }, undefined), true);
});

test('shouldAllowOrgAccess denies without membership', () => {
  assert.equal(shouldAllowOrgAccess({ role: 'agent' }, null), false);
  assert.equal(shouldAllowOrgAccess({ role: 'agent' }, undefined), false);
});

test('shouldAllowOrgAccess allows active membership', () => {
  assert.equal(shouldAllowOrgAccess({ role: 'agent' }, { deleted_at: null }), true);
});

test('shouldAllowOrgAccess denies soft-deleted membership', () => {
  assert.equal(shouldAllowOrgAccess({ role: 'agent' }, { deleted_at: '2026-01-01' }), false);
});

test('shouldAllowOrgAccess denies null profile', () => {
  assert.equal(shouldAllowOrgAccess(null, { deleted_at: null }), false);
});

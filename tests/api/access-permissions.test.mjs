import test from 'node:test';
import assert from 'node:assert/strict';

// Replicate the permission ranking logic from app/api/_lib/access.js
const PERMISSION_RANK = { read: 1, edit: 2, manage: 3 };

function hasPermission(actual, required) {
  if (!actual) return false;
  return (PERMISSION_RANK[actual] || 0) >= (PERMISSION_RANK[required] || 1);
}

function simulateGetEventPermission({ isAdmin, isOwner, sharePermission }) {
  if (isAdmin) return 'manage';
  if (isOwner) return 'manage';
  return sharePermission || null;
}

function simulateRequireEventPermission(opts, required) {
  const actual = simulateGetEventPermission(opts);
  if (!actual) return { allowed: false, actual: null };
  return { allowed: hasPermission(actual, required), actual };
}

// Permission ranking tests
test('PERMISSION_RANK: read < edit < manage', () => {
  assert.ok(PERMISSION_RANK.read < PERMISSION_RANK.edit);
  assert.ok(PERMISSION_RANK.edit < PERMISSION_RANK.manage);
});

test('hasPermission: read satisfies read', () => {
  assert.ok(hasPermission('read', 'read'));
});

test('hasPermission: read does not satisfy edit', () => {
  assert.ok(!hasPermission('read', 'edit'));
});

test('hasPermission: edit satisfies read and edit', () => {
  assert.ok(hasPermission('edit', 'read'));
  assert.ok(hasPermission('edit', 'edit'));
});

test('hasPermission: manage satisfies all levels', () => {
  assert.ok(hasPermission('manage', 'read'));
  assert.ok(hasPermission('manage', 'edit'));
  assert.ok(hasPermission('manage', 'manage'));
});

test('hasPermission: null actual returns false', () => {
  assert.ok(!hasPermission(null, 'read'));
});

test('hasPermission: unknown permission returns false', () => {
  assert.ok(!hasPermission('unknown', 'read'));
});

// Event permission tests
test('admin always gets manage', () => {
  const result = simulateRequireEventPermission({ isAdmin: true }, 'manage');
  assert.equal(result.allowed, true);
  assert.equal(result.actual, 'manage');
});

test('owner gets manage', () => {
  const result = simulateRequireEventPermission({ isOwner: true }, 'manage');
  assert.equal(result.allowed, true);
  assert.equal(result.actual, 'manage');
});

test('shared read user can read but not edit', () => {
  const readResult = simulateRequireEventPermission({ sharePermission: 'read' }, 'read');
  assert.equal(readResult.allowed, true);
  const editResult = simulateRequireEventPermission({ sharePermission: 'read' }, 'edit');
  assert.equal(editResult.allowed, false);
});

test('shared edit user can edit but not manage', () => {
  const editResult = simulateRequireEventPermission({ sharePermission: 'edit' }, 'edit');
  assert.equal(editResult.allowed, true);
  const manageResult = simulateRequireEventPermission({ sharePermission: 'edit' }, 'manage');
  assert.equal(manageResult.allowed, false);
});

test('no permission returns not allowed', () => {
  const result = simulateRequireEventPermission({}, 'read');
  assert.equal(result.allowed, false);
  assert.equal(result.actual, null);
});

// resolveAgentIds logic tests
function simulateResolveAgentIds(agentId, profilesByEmail) {
  if (!agentId) return [agentId];
  const email = profilesByEmail.get(agentId)?.email;
  if (!email) return [agentId];
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [agentId];
  const allIds = [];
  for (const [id, p] of profilesByEmail) {
    if (p.email?.trim().toLowerCase() === normalized) allIds.push(id);
  }
  return allIds.length > 0 ? allIds : [agentId];
}

test('resolveAgentIds: returns single ID when no matches', () => {
  const db = new Map([['id1', { email: 'a@b.com' }]]);
  const result = simulateResolveAgentIds('id1', db);
  assert.deepEqual(result, ['id1']);
});

test('resolveAgentIds: returns multiple IDs for same email', () => {
  const db = new Map([
    ['id1', { email: 'a@b.com' }],
    ['id2', { email: 'a@b.com' }],
    ['id3', { email: 'other@b.com' }],
  ]);
  const result = simulateResolveAgentIds('id1', db);
  assert.deepEqual(result, ['id1', 'id2']);
});

test('resolveAgentIds: case-insensitive email matching', () => {
  const db = new Map([
    ['id1', { email: 'Test@Example.COM' }],
    ['id2', { email: 'test@example.com' }],
  ]);
  const result = simulateResolveAgentIds('id1', db);
  assert.deepEqual(result, ['id1', 'id2']);
});

test('resolveAgentIds: null agentId returns [null]', () => {
  const db = new Map();
  const result = simulateResolveAgentIds(null, db);
  assert.deepEqual(result, [null]);
});

test('resolveAgentIds: unknown agentId returns [agentId]', () => {
  const db = new Map();
  const result = simulateResolveAgentIds('unknown', db);
  assert.deepEqual(result, ['unknown']);
});

// isUserOwnerOrSameEmail logic tests
function simulateIsOwnerOrSameEmail(ownerId, currentUserId, profileMap) {
  if (!ownerId || !currentUserId) return false;
  if (ownerId === currentUserId) return true;
  const ownerEmail = profileMap.get(ownerId)?.email?.trim().toLowerCase() || '';
  const currentEmail = profileMap.get(currentUserId)?.email?.trim().toLowerCase() || '';
  return !!ownerEmail && ownerEmail === currentEmail;
}

test('isOwnerOrSameEmail: same ID returns true', () => {
  assert.ok(simulateIsOwnerOrSameEmail('id1', 'id1', new Map()));
});

test('isOwnerOrSameEmail: same email different IDs returns true', () => {
  const db = new Map([
    ['id1', { email: 'a@b.com' }],
    ['id2', { email: 'a@b.com' }],
  ]);
  assert.ok(simulateIsOwnerOrSameEmail('id1', 'id2', db));
});

test('isOwnerOrSameEmail: different email returns false', () => {
  const db = new Map([
    ['id1', { email: 'a@b.com' }],
    ['id2', { email: 'c@d.com' }],
  ]);
  assert.ok(!simulateIsOwnerOrSameEmail('id1', 'id2', db));
});

test('isOwnerOrSameEmail: null owner returns false', () => {
  assert.ok(!simulateIsOwnerOrSameEmail(null, 'id2', new Map()));
});

test('isOwnerOrSameEmail: null current user returns false', () => {
  assert.ok(!simulateIsOwnerOrSameEmail('id1', null, new Map()));
});

test('isOwnerOrSameEmail: missing profile returns false', () => {
  assert.ok(!simulateIsOwnerOrSameEmail('id1', 'id2', new Map()));
});

import test from 'node:test';
import assert from 'node:assert/strict';

// Tests for AgentFolderBrowser business logic patterns.
// Validates self-healing provisioning decisions and upload target resolution.

function shouldSelfHeal(currentFolderId, loadedFoldersCount, organizationId) {
  return !currentFolderId && loadedFoldersCount === 0 && Boolean(organizationId);
}

function resolveUploadTarget(currentFolderId, rootFolderId) {
  return currentFolderId || rootFolderId || null;
}

function resolveRootFolderId(folders) {
  if (!folders || folders.length === 0) return null;
  return folders[0].id;
}

function buildBreadcrumbs(folders, currentFolderId) {
  if (!currentFolderId) return [{ id: null, name: 'Root' }];
  const crumbs = [{ id: null, name: 'Root' }];
  const current = folders.find(f => f.id === currentFolderId);
  if (current) {
    crumbs.push({ id: current.id, name: current.name });
  }
  return crumbs;
}

// Self-healing tests
test('shouldSelfHeal: true when no folder, no loaded folders, has org', () => {
  assert.equal(shouldSelfHeal(null, 0, 'org-1'), true);
});

test('shouldSelfHeal: false when currentFolderId is set', () => {
  assert.equal(shouldSelfHeal('folder-1', 0, 'org-1'), false);
});

test('shouldSelfHeal: false when folders are loaded', () => {
  assert.equal(shouldSelfHeal(null, 3, 'org-1'), false);
});

test('shouldSelfHeal: false when no organizationId', () => {
  assert.equal(shouldSelfHeal(null, 0, null), false);
  assert.equal(shouldSelfHeal(null, 0, ''), false);
  assert.equal(shouldSelfHeal(null, 0, undefined), false);
});

// Upload target tests
test('resolveUploadTarget: uses currentFolderId when set', () => {
  assert.equal(resolveUploadTarget('folder-1', 'root-1'), 'folder-1');
});

test('resolveUploadTarget: falls back to rootFolderId', () => {
  assert.equal(resolveUploadTarget(null, 'root-1'), 'root-1');
});

test('resolveUploadTarget: returns null when both are null', () => {
  assert.equal(resolveUploadTarget(null, null), null);
});

// Root folder resolution tests
test('resolveRootFolderId: returns first folder id', () => {
  const folders = [{ id: 'f1' }, { id: 'f2' }];
  assert.equal(resolveRootFolderId(folders), 'f1');
});

test('resolveRootFolderId: returns null for empty array', () => {
  assert.equal(resolveRootFolderId([]), null);
});

test('resolveRootFolderId: returns null for null/undefined', () => {
  assert.equal(resolveRootFolderId(null), null);
  assert.equal(resolveRootFolderId(undefined), null);
});

// Breadcrumb tests
test('buildBreadcrumbs: root only when no currentFolderId', () => {
  const crumbs = buildBreadcrumbs([], null);
  assert.equal(crumbs.length, 1);
  assert.equal(crumbs[0].name, 'Root');
});

test('buildBreadcrumbs: root + current when folder is selected', () => {
  const folders = [{ id: 'f1', name: 'Documents' }];
  const crumbs = buildBreadcrumbs(folders, 'f1');
  assert.equal(crumbs.length, 2);
  assert.equal(crumbs[0].name, 'Root');
  assert.equal(crumbs[1].name, 'Documents');
});

test('buildBreadcrumbs: root only when folder not found', () => {
  const folders = [{ id: 'f1', name: 'Documents' }];
  const crumbs = buildBreadcrumbs(folders, 'nonexistent');
  assert.equal(crumbs.length, 1);
});

// Form modal org selector logic tests
function resolveOrgFields(selectedOrgId, orgs, isEdit) {
  if (isEdit || !selectedOrgId) return {};
  const org = orgs.find(o => o.id === selectedOrgId);
  if (!org) return {};
  return {
    commission_rate: org.commission_rate,
    agent_territory: org.territory,
    agent_conditions: org.conditions,
    agent_company: org.name,
  };
}

test('resolveOrgFields: auto-fills from org in create mode', () => {
  const orgs = [{ id: 'org-1', name: 'Venson', commission_rate: 15, territory: 'NL', conditions: 'Net 30' }];
  const fields = resolveOrgFields('org-1', orgs, false);
  assert.equal(fields.commission_rate, 15);
  assert.equal(fields.agent_territory, 'NL');
  assert.equal(fields.agent_company, 'Venson');
});

test('resolveOrgFields: returns empty in edit mode', () => {
  const orgs = [{ id: 'org-1', name: 'Venson', commission_rate: 15, territory: 'NL' }];
  const fields = resolveOrgFields('org-1', orgs, true);
  assert.deepEqual(fields, {});
});

test('resolveOrgFields: returns empty when no org selected', () => {
  const fields = resolveOrgFields(null, [], false);
  assert.deepEqual(fields, {});
});

test('resolveOrgFields: returns empty when org not found', () => {
  const fields = resolveOrgFields('nonexistent', [], false);
  assert.deepEqual(fields, {});
});

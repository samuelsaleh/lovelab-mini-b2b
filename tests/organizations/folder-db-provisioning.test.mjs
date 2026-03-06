import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the folder DB provisioning logic (root-only, no default subfolders).
 * We test the decision logic in isolation without hitting Supabase.
 */

function simulateEnsureOrgFolders(existingFolders, orgId, orgName, ownerId) {
  if (!orgId || !ownerId) throw new Error('organizationId and ownerAgentId are required');

  const rootName = orgName || 'Organization';
  const existingRoot = existingFolders.find(
    (f) => f.agent_id === ownerId && f.parent_id === null && f.name.toLowerCase() === rootName.toLowerCase()
  );

  if (existingRoot) {
    return { rootFolder: existingRoot, created: false };
  }

  const rootFolder = { id: `root-${orgId}`, agent_id: ownerId, name: rootName, parent_id: null };
  return { rootFolder, created: true };
}

test('creates root folder when none exist', () => {
  const result = simulateEnsureOrgFolders([], 'org-1', 'Venson Amsterdam', 'agent-1');
  assert.equal(result.created, true);
  assert.equal(result.rootFolder.name, 'Venson Amsterdam');
  assert.equal(result.rootFolder.parent_id, null);
});

test('idempotent on second call -- no new folder created', () => {
  const existing = [
    { id: 'root-1', agent_id: 'agent-1', name: 'Venson Amsterdam', parent_id: null },
  ];
  const result = simulateEnsureOrgFolders(existing, 'org-1', 'Venson Amsterdam', 'agent-1');
  assert.equal(result.created, false);
  assert.equal(result.rootFolder.id, 'root-1');
});

test('throws when organizationId is missing', () => {
  assert.throws(
    () => simulateEnsureOrgFolders([], null, 'Test', 'agent-1'),
    /required/
  );
});

test('throws when ownerAgentId is missing', () => {
  assert.throws(
    () => simulateEnsureOrgFolders([], 'org-1', 'Test', null),
    /required/
  );
});

test('uses "Organization" as default name when orgName is empty', () => {
  const result = simulateEnsureOrgFolders([], 'org-1', '', 'agent-1');
  assert.equal(result.rootFolder.name, 'Organization');
});

test('root folder case-insensitive matching', () => {
  const existing = [
    { id: 'root-1', agent_id: 'agent-1', name: 'venson amsterdam', parent_id: null },
  ];
  const result = simulateEnsureOrgFolders(existing, 'org-1', 'Venson Amsterdam', 'agent-1');
  assert.equal(result.created, false);
  assert.equal(result.rootFolder.id, 'root-1');
});

test('different agent_id creates new root even if same name exists', () => {
  const existing = [
    { id: 'root-1', agent_id: 'agent-other', name: 'Venson Amsterdam', parent_id: null },
  ];
  const result = simulateEnsureOrgFolders(existing, 'org-1', 'Venson Amsterdam', 'agent-1');
  assert.equal(result.created, true);
});

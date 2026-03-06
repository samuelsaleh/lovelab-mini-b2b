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

// Agent subfolder scenarios

function simulateEnsureAgentSubfolder(existingFolders, orgRootFolderId, agentId, agentName) {
  if (!orgRootFolderId || !agentId) throw new Error('orgRootFolderId and agentId are required');
  const folderName = agentName || 'Agent Folder';
  const existing = existingFolders.find(
    (f) => f.agent_id === agentId && f.parent_id === orgRootFolderId
  );
  if (existing) return { subfolder: existing, created: false };
  return {
    subfolder: { id: `sub-${agentId}`, agent_id: agentId, name: folderName, parent_id: orgRootFolderId },
    created: true,
  };
}

test('agent subfolder: creates under org root', () => {
  const result = simulateEnsureAgentSubfolder([], 'root-1', 'agent-1', 'Josephine');
  assert.equal(result.created, true);
  assert.equal(result.subfolder.parent_id, 'root-1');
});

test('agent subfolder: idempotent', () => {
  const existing = [
    { id: 'sub-1', agent_id: 'agent-1', name: 'Josephine', parent_id: 'root-1' },
  ];
  const result = simulateEnsureAgentSubfolder(existing, 'root-1', 'agent-1', 'Josephine');
  assert.equal(result.created, false);
  assert.equal(result.subfolder.id, 'sub-1');
});

test('agent subfolder: throws without root folder id', () => {
  assert.throws(() => simulateEnsureAgentSubfolder([], null, 'agent-1', 'Test'), /required/);
});

test('agent subfolder: throws without agent id', () => {
  assert.throws(() => simulateEnsureAgentSubfolder([], 'root-1', null, 'Test'), /required/);
});

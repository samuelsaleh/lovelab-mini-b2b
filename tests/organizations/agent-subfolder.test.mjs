import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the agent subfolder provisioning logic.
 * Simulates ensureAgentSubfolder behavior without hitting Supabase.
 */

function simulateEnsureAgentSubfolder(existingFolders, orgRootFolderId, agentId, agentName) {
  if (!orgRootFolderId || !agentId) {
    throw new Error('orgRootFolderId and agentId are required');
  }

  const folderName = agentName || 'Agent Folder';

  const existing = existingFolders.find(
    (f) => f.agent_id === agentId && f.parent_id === orgRootFolderId
  );

  if (existing) {
    return { subfolder: existing, created: false };
  }

  const subfolder = {
    id: `sub-${agentId}-${orgRootFolderId}`,
    agent_id: agentId,
    name: folderName,
    parent_id: orgRootFolderId,
  };
  return { subfolder, created: true };
}

test('creates subfolder when none exists', () => {
  const result = simulateEnsureAgentSubfolder([], 'root-1', 'agent-1', 'Josephine');
  assert.equal(result.created, true);
  assert.equal(result.subfolder.name, 'Josephine');
  assert.equal(result.subfolder.parent_id, 'root-1');
  assert.equal(result.subfolder.agent_id, 'agent-1');
});

test('idempotent on second call', () => {
  const existing = [
    { id: 'sub-1', agent_id: 'agent-1', name: 'Josephine', parent_id: 'root-1' },
  ];
  const result = simulateEnsureAgentSubfolder(existing, 'root-1', 'agent-1', 'Josephine');
  assert.equal(result.created, false);
  assert.equal(result.subfolder.id, 'sub-1');
});

test('throws when orgRootFolderId is missing', () => {
  assert.throws(
    () => simulateEnsureAgentSubfolder([], null, 'agent-1', 'Test'),
    /required/
  );
});

test('throws when agentId is missing', () => {
  assert.throws(
    () => simulateEnsureAgentSubfolder([], 'root-1', null, 'Test'),
    /required/
  );
});

test('throws when orgRootFolderId is undefined', () => {
  assert.throws(
    () => simulateEnsureAgentSubfolder([], undefined, 'agent-1', 'Test'),
    /required/
  );
});

test('throws when agentId is undefined', () => {
  assert.throws(
    () => simulateEnsureAgentSubfolder([], 'root-1', undefined, 'Test'),
    /required/
  );
});

test('different agents get different subfolders under same root', () => {
  const existing = [
    { id: 'sub-1', agent_id: 'agent-1', name: 'Josephine', parent_id: 'root-1' },
  ];
  const result = simulateEnsureAgentSubfolder(existing, 'root-1', 'agent-2', 'Chagai');
  assert.equal(result.created, true);
  assert.equal(result.subfolder.name, 'Chagai');
  assert.equal(result.subfolder.agent_id, 'agent-2');
});

test('uses agent name as subfolder name', () => {
  const result = simulateEnsureAgentSubfolder([], 'root-1', 'agent-1', 'Matthias Kingma');
  assert.equal(result.subfolder.name, 'Matthias Kingma');
});

test('uses default name when agentName is empty', () => {
  const result = simulateEnsureAgentSubfolder([], 'root-1', 'agent-1', '');
  assert.equal(result.subfolder.name, 'Agent Folder');
});

test('uses default name when agentName is null', () => {
  const result = simulateEnsureAgentSubfolder([], 'root-1', 'agent-1', null);
  assert.equal(result.subfolder.name, 'Agent Folder');
});

test('same agent under different roots creates separate subfolders', () => {
  const existing = [
    { id: 'sub-1', agent_id: 'agent-1', name: 'Josephine', parent_id: 'root-1' },
  ];
  const result = simulateEnsureAgentSubfolder(existing, 'root-2', 'agent-1', 'Josephine');
  assert.equal(result.created, true);
  assert.equal(result.subfolder.parent_id, 'root-2');
});

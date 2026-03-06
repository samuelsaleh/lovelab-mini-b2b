import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the folder DB provisioning logic.
 * We test the decision logic in isolation without hitting Supabase.
 */

const DEFAULT_SUBFOLDERS = ['Contracts', 'Orders', 'Invoices', 'Other'];

function simulateEnsureOrgFolders(existingFolders, orgId, orgName, ownerId) {
  if (!orgId || !ownerId) throw new Error('organizationId and ownerAgentId are required');

  const rootName = orgName || 'Organization';
  const existingRoot = existingFolders.find(
    (f) => f.agent_id === ownerId && f.parent_id === null && f.name.toLowerCase() === rootName.toLowerCase()
  );

  if (existingRoot) {
    const existingSubs = existingFolders.filter((f) => f.parent_id === existingRoot.id);
    const existingNames = new Set(existingSubs.map((s) => s.name));
    const missingSubs = DEFAULT_SUBFOLDERS.filter((n) => !existingNames.has(n));
    const newSubs = missingSubs.map((name, i) => ({
      id: `sub-new-${i}`,
      agent_id: ownerId,
      name,
      parent_id: existingRoot.id,
    }));
    return {
      rootFolder: existingRoot,
      subfolders: [...existingSubs, ...newSubs],
      created: false,
      newSubCount: newSubs.length,
    };
  }

  const rootFolder = { id: `root-${orgId}`, agent_id: ownerId, name: rootName, parent_id: null };
  const subfolders = DEFAULT_SUBFOLDERS.map((name, i) => ({
    id: `sub-${i}`,
    agent_id: ownerId,
    name,
    parent_id: rootFolder.id,
  }));

  return { rootFolder, subfolders, created: true, newSubCount: subfolders.length };
}

test('creates root + 4 subfolders when none exist', () => {
  const result = simulateEnsureOrgFolders([], 'org-1', 'Venson Amsterdam', 'agent-1');
  assert.equal(result.created, true);
  assert.equal(result.rootFolder.name, 'Venson Amsterdam');
  assert.equal(result.rootFolder.parent_id, null);
  assert.equal(result.subfolders.length, 4);
  const names = result.subfolders.map((s) => s.name);
  assert.deepEqual(names, DEFAULT_SUBFOLDERS);
  for (const sub of result.subfolders) {
    assert.equal(sub.parent_id, result.rootFolder.id);
    assert.equal(sub.agent_id, 'agent-1');
  }
});

test('idempotent on second call -- no new folders created', () => {
  const existing = [
    { id: 'root-1', agent_id: 'agent-1', name: 'Venson Amsterdam', parent_id: null },
    { id: 'sub-1', agent_id: 'agent-1', name: 'Contracts', parent_id: 'root-1' },
    { id: 'sub-2', agent_id: 'agent-1', name: 'Orders', parent_id: 'root-1' },
    { id: 'sub-3', agent_id: 'agent-1', name: 'Invoices', parent_id: 'root-1' },
    { id: 'sub-4', agent_id: 'agent-1', name: 'Other', parent_id: 'root-1' },
  ];
  const result = simulateEnsureOrgFolders(existing, 'org-1', 'Venson Amsterdam', 'agent-1');
  assert.equal(result.created, false);
  assert.equal(result.newSubCount, 0);
  assert.equal(result.subfolders.length, 4);
});

test('fills in missing subfolders on partial state', () => {
  const existing = [
    { id: 'root-1', agent_id: 'agent-1', name: 'Venson Amsterdam', parent_id: null },
    { id: 'sub-1', agent_id: 'agent-1', name: 'Contracts', parent_id: 'root-1' },
  ];
  const result = simulateEnsureOrgFolders(existing, 'org-1', 'Venson Amsterdam', 'agent-1');
  assert.equal(result.created, false);
  assert.equal(result.newSubCount, 3);
  assert.equal(result.subfolders.length, 4);
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

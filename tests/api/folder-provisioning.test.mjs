import test from 'node:test';
import assert from 'node:assert/strict';

// Tests for the folder-provisioning module's business logic.
// Validates the contract of ensureOrgRoot and ensureAgentSubfolder
// using simulations that mirror the real DB operations.

class MockDB {
  constructor() {
    this.folders = [];
    this.nextId = 1;
  }

  findRoot(organizationId) {
    return this.folders.find(f => f.organization_id === organizationId && f.parent_id === null);
  }

  findSubfolder(agentId, parentId) {
    return this.folders.find(f => f.agent_id === agentId && f.parent_id === parentId);
  }

  insertRoot(organizationId, ownerAgentId, name) {
    const folder = { id: `f${this.nextId++}`, organization_id: organizationId, agent_id: ownerAgentId, name, parent_id: null };
    this.folders.push(folder);
    return folder;
  }

  insertSubfolder(agentId, name, parentId) {
    const folder = { id: `f${this.nextId++}`, agent_id: agentId, name, parent_id: parentId };
    this.folders.push(folder);
    return folder;
  }
}

function ensureOrgRoot(db, organizationId, orgName, ownerAgentId) {
  if (!organizationId || !ownerAgentId) throw new Error('organizationId and ownerAgentId are required');
  const existing = db.findRoot(organizationId);
  if (existing) return { rootFolder: existing };
  const rootFolder = db.insertRoot(organizationId, ownerAgentId, orgName || 'Organization');
  return { rootFolder };
}

function ensureAgentSubfolder(db, orgRootFolderId, agentId, agentName) {
  if (!orgRootFolderId || !agentId) throw new Error('orgRootFolderId and agentId are required');
  const existing = db.findSubfolder(agentId, orgRootFolderId);
  if (existing) return { subfolder: existing };
  const subfolder = db.insertSubfolder(agentId, agentName || 'Agent Folder', orgRootFolderId);
  return { subfolder };
}

test('ensureOrgRoot creates root folder with organization_id', () => {
  const db = new MockDB();
  const { rootFolder } = ensureOrgRoot(db, 'org-1', 'Venson', 'owner-1');
  assert.ok(rootFolder.id);
  assert.equal(rootFolder.organization_id, 'org-1');
  assert.equal(rootFolder.name, 'Venson');
  assert.equal(rootFolder.parent_id, null);
});

test('ensureOrgRoot is idempotent', () => {
  const db = new MockDB();
  const r1 = ensureOrgRoot(db, 'org-1', 'Venson', 'owner-1');
  const r2 = ensureOrgRoot(db, 'org-1', 'Venson', 'owner-1');
  assert.equal(r1.rootFolder.id, r2.rootFolder.id);
  assert.equal(db.folders.length, 1);
});

test('ensureOrgRoot throws for missing organizationId', () => {
  const db = new MockDB();
  assert.throws(() => ensureOrgRoot(db, null, 'Name', 'owner'), /organizationId and ownerAgentId/);
});

test('ensureOrgRoot throws for missing ownerAgentId', () => {
  const db = new MockDB();
  assert.throws(() => ensureOrgRoot(db, 'org-1', 'Name', null), /organizationId and ownerAgentId/);
});

test('ensureOrgRoot uses default name when orgName is falsy', () => {
  const db = new MockDB();
  const { rootFolder } = ensureOrgRoot(db, 'org-1', '', 'owner-1');
  assert.equal(rootFolder.name, 'Organization');
});

test('two orgs with same name get separate roots', () => {
  const db = new MockDB();
  const r1 = ensureOrgRoot(db, 'org-1', 'Same Name', 'owner-1');
  const r2 = ensureOrgRoot(db, 'org-2', 'Same Name', 'owner-1');
  assert.notEqual(r1.rootFolder.id, r2.rootFolder.id);
  assert.equal(db.folders.length, 2);
});

test('ensureAgentSubfolder creates subfolder under root', () => {
  const db = new MockDB();
  const { rootFolder } = ensureOrgRoot(db, 'org-1', 'Venson', 'owner-1');
  const { subfolder } = ensureAgentSubfolder(db, rootFolder.id, 'agent-1', 'Alice');
  assert.ok(subfolder.id);
  assert.equal(subfolder.parent_id, rootFolder.id);
  assert.equal(subfolder.name, 'Alice');
});

test('ensureAgentSubfolder is idempotent', () => {
  const db = new MockDB();
  const { rootFolder } = ensureOrgRoot(db, 'org-1', 'Venson', 'owner-1');
  const s1 = ensureAgentSubfolder(db, rootFolder.id, 'agent-1', 'Alice');
  const s2 = ensureAgentSubfolder(db, rootFolder.id, 'agent-1', 'Alice');
  assert.equal(s1.subfolder.id, s2.subfolder.id);
  assert.equal(db.folders.length, 2);
});

test('ensureAgentSubfolder throws for missing rootFolderId', () => {
  const db = new MockDB();
  assert.throws(() => ensureAgentSubfolder(db, null, 'agent-1', 'Alice'), /orgRootFolderId and agentId/);
});

test('multiple agents get separate subfolders', () => {
  const db = new MockDB();
  const { rootFolder } = ensureOrgRoot(db, 'org-1', 'Venson', 'owner-1');
  const s1 = ensureAgentSubfolder(db, rootFolder.id, 'agent-1', 'Alice');
  const s2 = ensureAgentSubfolder(db, rootFolder.id, 'agent-2', 'Bob');
  assert.notEqual(s1.subfolder.id, s2.subfolder.id);
  assert.equal(db.folders.length, 3);
});

test('full flow: org root + two agent subfolders', () => {
  const db = new MockDB();
  const { rootFolder } = ensureOrgRoot(db, 'org-1', 'Venson Amsterdam', 'owner-1');
  ensureAgentSubfolder(db, rootFolder.id, 'agent-1', 'Chagai');
  ensureAgentSubfolder(db, rootFolder.id, 'agent-2', 'Josephine');

  assert.equal(db.folders.length, 3);
  assert.equal(db.findRoot('org-1').name, 'Venson Amsterdam');
  assert.equal(db.findSubfolder('agent-1', rootFolder.id).name, 'Chagai');
  assert.equal(db.findSubfolder('agent-2', rootFolder.id).name, 'Josephine');
});

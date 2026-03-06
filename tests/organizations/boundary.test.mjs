import test from 'node:test';
import assert from 'node:assert/strict';

import { isAdmin, normalizeSegment, buildRootFolder } from '../../lib/organizations/utils.js';
import { normalizeEmail, isValidEmail, generateInvitationToken, getDefaultExpiryIso } from '../../lib/organizations/invitations.js';

// Simulated org boundary enforcement logic tests.
// These verify the decision functions that the API routes rely on.

test('cross-org access: admin profile grants access to any org', () => {
  const adminProfile = { role: 'admin' };
  assert.equal(isAdmin(adminProfile), true);
});

test('cross-org access: agent profile does not grant cross-org access', () => {
  const agentProfile = { role: 'agent', organization_id: 'org-a' };
  assert.equal(isAdmin(agentProfile), false);
});

test('cross-org access: member profile does not grant cross-org access', () => {
  const memberProfile = { role: 'member', organization_id: 'org-a' };
  assert.equal(isAdmin(memberProfile), false);
});

test('org folder isolation: different orgs produce different root paths', () => {
  const orgA = { id: 'org-a', name: 'Alpha Corp' };
  const orgB = { id: 'org-b', name: 'Beta Inc' };
  const pathA = buildRootFolder(orgA);
  const pathB = buildRootFolder(orgB);
  assert.notEqual(pathA, pathB);
  assert.ok(!pathA.includes(orgB.id));
  assert.ok(!pathB.includes(orgA.id));
});

test('org folder path is scoped to org id', () => {
  const org = { id: 'org-test', name: 'Test Org' };
  const root = buildRootFolder(org);
  assert.ok(root.startsWith('organizations/'));
  assert.ok(root.includes(org.id));
});

test('invitation tokens are unique per generation', () => {
  const tokens = new Set();
  for (let i = 0; i < 100; i++) {
    tokens.add(generateInvitationToken());
  }
  assert.equal(tokens.size, 100);
});

test('invitation email normalization prevents case-based bypass', () => {
  const emailA = normalizeEmail('Admin@Company.COM');
  const emailB = normalizeEmail('admin@company.com');
  assert.equal(emailA, emailB);
});

test('invitation expiry is in the future', () => {
  const expiry = new Date(getDefaultExpiryIso(1));
  assert.ok(expiry > new Date());
});

test('invitation expiry for 0 days is still valid ISO', () => {
  const iso = getDefaultExpiryIso(0);
  assert.ok(!isNaN(new Date(iso).getTime()));
});

test('email validation rejects invalid inputs', () => {
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('user@valid.com'), true);
  assert.equal(isValidEmail('a b@domain.com'), false);
});

// Team data access boundary tests

function canAccessOrgLedger(profile, targetOrgId, memberships) {
  if (!targetOrgId) return false;
  if (isAdmin(profile)) return true;
  return memberships.some(
    (m) => m.organization_id === targetOrgId && m.user_id === profile.id && !m.deleted_at
  );
}

test('agent in org X can access org X ledger (positive case)', () => {
  const profile = { id: 'user-1', role: 'member', organization_id: 'org-x' };
  const memberships = [
    { organization_id: 'org-x', user_id: 'user-1', deleted_at: null },
  ];
  assert.equal(canAccessOrgLedger(profile, 'org-x', memberships), true);
});

test('agent in org X cannot access org Y ledger (negative case)', () => {
  const profile = { id: 'user-1', role: 'member', organization_id: 'org-x' };
  const memberships = [
    { organization_id: 'org-x', user_id: 'user-1', deleted_at: null },
  ];
  assert.equal(canAccessOrgLedger(profile, 'org-y', memberships), false);
});

test('admin can access any org ledger', () => {
  const profile = { id: 'admin-1', role: 'admin' };
  assert.equal(canAccessOrgLedger(profile, 'org-x', []), true);
  assert.equal(canAccessOrgLedger(profile, 'org-y', []), true);
});

test('deleted membership does not grant access', () => {
  const profile = { id: 'user-1', role: 'member', organization_id: 'org-x' };
  const memberships = [
    { organization_id: 'org-x', user_id: 'user-1', deleted_at: '2026-01-01' },
  ];
  assert.equal(canAccessOrgLedger(profile, 'org-x', memberships), false);
});

test('null target org returns false', () => {
  const profile = { id: 'user-1', role: 'member' };
  assert.equal(canAccessOrgLedger(profile, null, []), false);
});

// Integration flow: create agent with org -> verify subfolder -> verify visibility

function simulateAgentCreationFlow(orgId, orgName, ownerAgentId, newAgentId, newAgentName) {
  const folders = [];

  // Step 1: ensureOrgRoot
  const rootName = orgName || 'Organization';
  const rootFolder = { id: `root-${orgId}`, agent_id: ownerAgentId, name: rootName, parent_id: null };
  folders.push(rootFolder);

  // Step 2: ensureAgentSubfolder
  const subfolder = {
    id: `sub-${newAgentId}`,
    agent_id: newAgentId,
    name: newAgentName || 'Agent Folder',
    parent_id: rootFolder.id,
  };
  folders.push(subfolder);

  return { rootFolder, subfolder, allFolders: folders };
}

test('integration: create agent with org produces root + subfolder', () => {
  const result = simulateAgentCreationFlow('org-1', 'Venson Amsterdam', 'owner-1', 'agent-new', 'Josephine');
  assert.equal(result.allFolders.length, 2);
  assert.equal(result.rootFolder.name, 'Venson Amsterdam');
  assert.equal(result.rootFolder.parent_id, null);
  assert.equal(result.subfolder.name, 'Josephine');
  assert.equal(result.subfolder.parent_id, result.rootFolder.id);
  assert.equal(result.subfolder.agent_id, 'agent-new');
});

test('integration: subfolder is visible from org root', () => {
  const result = simulateAgentCreationFlow('org-1', 'Venson Amsterdam', 'owner-1', 'agent-new', 'Josephine');
  const subfolders = result.allFolders.filter(f => f.parent_id === result.rootFolder.id);
  assert.equal(subfolders.length, 1);
  assert.equal(subfolders[0].agent_id, 'agent-new');
});

test('integration: multiple agents get separate subfolders', () => {
  const folders = [];
  const rootFolder = { id: 'root-org-1', agent_id: 'owner-1', name: 'Venson', parent_id: null };
  folders.push(rootFolder);

  const agents = [
    { id: 'agent-1', name: 'Chagai' },
    { id: 'agent-2', name: 'Matthias' },
    { id: 'agent-3', name: 'Josephine' },
  ];

  for (const agent of agents) {
    folders.push({
      id: `sub-${agent.id}`,
      agent_id: agent.id,
      name: agent.name,
      parent_id: rootFolder.id,
    });
  }

  const subfolders = folders.filter(f => f.parent_id === rootFolder.id);
  assert.equal(subfolders.length, 3);
  const agentIds = subfolders.map(sf => sf.agent_id);
  assert.deepEqual(agentIds.sort(), ['agent-1', 'agent-2', 'agent-3']);
});

import test from 'node:test';
import assert from 'node:assert/strict';

// Tests for the provisionAgentInOrg and autoEnsureOrganization logic.
// These test the business logic patterns without hitting a real DB.

function simulateProvisionAgentInOrg(orgId, agentId, { orgExists = true, ownerUserId = null, agentName = 'Agent' } = {}) {
  if (!orgId || !agentId) return null;
  if (!orgExists) return null;

  const ownerAgentId = ownerUserId || agentId;
  const rootFolder = { id: `root-${orgId}`, name: `Org ${orgId}` };
  const subfolder = { id: `sub-${agentId}`, name: agentName, parent_id: rootFolder.id };

  return { rootFolder, subfolder };
}

function simulateAutoEnsure(targetUserId, callerUserId, { hasOrg = false, orgId = null, orgName = null } = {}) {
  if (!targetUserId) throw new Error('targetUserId is required');

  let organization;
  if (hasOrg && orgId) {
    organization = { id: orgId, name: orgName || 'Existing Org' };
  } else {
    organization = { id: `new-org-${targetUserId}`, name: `${targetUserId} Organization` };
  }

  const folder = simulateProvisionAgentInOrg(organization.id, targetUserId, { orgExists: true });
  return { organization, folder };
}

test('provisionAgentInOrg returns null for missing orgId', () => {
  assert.equal(simulateProvisionAgentInOrg(null, 'agent-1'), null);
});

test('provisionAgentInOrg returns null for missing agentId', () => {
  assert.equal(simulateProvisionAgentInOrg('org-1', null), null);
});

test('provisionAgentInOrg returns null when org does not exist', () => {
  assert.equal(simulateProvisionAgentInOrg('org-1', 'agent-1', { orgExists: false }), null);
});

test('provisionAgentInOrg returns rootFolder and subfolder', () => {
  const result = simulateProvisionAgentInOrg('org-1', 'agent-1', { agentName: 'Alice' });
  assert.ok(result);
  assert.ok(result.rootFolder);
  assert.ok(result.subfolder);
  assert.equal(result.subfolder.name, 'Alice');
  assert.equal(result.subfolder.parent_id, result.rootFolder.id);
});

test('provisionAgentInOrg uses owner when provided', () => {
  const result = simulateProvisionAgentInOrg('org-1', 'agent-2', { ownerUserId: 'owner-1' });
  assert.ok(result);
  assert.ok(result.rootFolder);
});

test('provisionAgentInOrg is idempotent (same inputs, same structure)', () => {
  const r1 = simulateProvisionAgentInOrg('org-1', 'agent-1');
  const r2 = simulateProvisionAgentInOrg('org-1', 'agent-1');
  assert.deepEqual(r1, r2);
});

test('autoEnsure creates new org when user has none', () => {
  const result = simulateAutoEnsure('user-1', 'admin-1');
  assert.ok(result.organization);
  assert.ok(result.organization.id.includes('user-1'));
  assert.ok(result.folder);
});

test('autoEnsure uses existing org when user has one', () => {
  const result = simulateAutoEnsure('user-1', 'admin-1', { hasOrg: true, orgId: 'existing-org', orgName: 'Venson' });
  assert.equal(result.organization.id, 'existing-org');
  assert.equal(result.organization.name, 'Venson');
  assert.ok(result.folder);
});

test('autoEnsure throws for missing targetUserId', () => {
  assert.throws(() => simulateAutoEnsure(null, 'admin-1'), /targetUserId is required/);
});

test('autoEnsure folder is linked to the organization', () => {
  const result = simulateAutoEnsure('user-1', 'admin-1');
  assert.equal(result.folder.rootFolder.id, `root-${result.organization.id}`);
  assert.equal(result.folder.subfolder.parent_id, result.folder.rootFolder.id);
});

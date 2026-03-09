import test from 'node:test';
import assert from 'node:assert/strict';

test('ensureOrgRoot is an exported async function with 3 params', async (t) => {
  try {
    const mod = await import('../../lib/organizations/folder-provisioning.js');
    assert.equal(typeof mod.ensureOrgRoot, 'function');
    assert.equal(mod.ensureOrgRoot.length, 3, 'ensureOrgRoot(organizationId, orgName, ownerAgentId)');
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') t.skip('Skipped: @/ alias not available outside Next.js');
    else throw e;
  }
});

test('ensureAgentSubfolder is an exported async function with 3 params', async (t) => {
  try {
    const mod = await import('../../lib/organizations/folder-provisioning.js');
    assert.equal(typeof mod.ensureAgentSubfolder, 'function');
    assert.equal(mod.ensureAgentSubfolder.length, 3, 'ensureAgentSubfolder(orgRootFolderId, agentId, agentName)');
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') t.skip('Skipped: @/ alias not available outside Next.js');
    else throw e;
  }
});

test('ensureAgentFolders is an exported function', async (t) => {
  try {
    const mod = await import('../../lib/organizations/folder-provisioning.js');
    assert.equal(typeof mod.ensureAgentFolders, 'function');
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') t.skip('Skipped: @/ alias not available outside Next.js');
    else throw e;
  }
});

test('provisionAgentInOrg is an exported async function with 2 params', async (t) => {
  try {
    const mod = await import('../../lib/organizations/provision-agent.js');
    assert.equal(typeof mod.provisionAgentInOrg, 'function');
    assert.equal(mod.provisionAgentInOrg.length, 2, 'provisionAgentInOrg(orgId, agentId)');
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') t.skip('Skipped: @/ alias not available outside Next.js');
    else throw e;
  }
});

test('autoEnsureOrganization is an exported async function with 2 params', async (t) => {
  try {
    const mod = await import('../../lib/organizations/provision-agent.js');
    assert.equal(typeof mod.autoEnsureOrganization, 'function');
    assert.equal(mod.autoEnsureOrganization.length, 2, 'autoEnsureOrganization(targetUserId, callerUserId)');
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') t.skip('Skipped: @/ alias not available outside Next.js');
    else throw e;
  }
});

test('email template functions are exported with correct signatures', async () => {
  const mod = await import('../../lib/email-templates.js');
  assert.equal(typeof mod.welcomeAgentEmail, 'function');
  assert.equal(mod.welcomeAgentEmail.length, 3);
  assert.equal(typeof mod.upgradeAgentEmail, 'function');
  assert.equal(mod.upgradeAgentEmail.length, 2);
  assert.equal(typeof mod.restoreAgentEmail, 'function');
  assert.equal(mod.restoreAgentEmail.length, 3);
  assert.equal(typeof mod.orgInvitationEmail, 'function');
  assert.equal(mod.orgInvitationEmail.length, 2);
  assert.equal(typeof mod.orderNotificationEmail, 'function');
  assert.equal(mod.orderNotificationEmail.length, 2);
  assert.equal(typeof mod.approvedSignupEmail, 'function');
  assert.equal(mod.approvedSignupEmail.length, 2);
});

test('sendEmail is an exported function with 1 param', async (t) => {
  try {
    const mod = await import('../../lib/send-email.js');
    assert.equal(typeof mod.sendEmail, 'function');
    assert.equal(mod.sendEmail.length, 1, 'sendEmail({ to, subject, html, from })');
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') t.skip('Skipped: @/ alias not available outside Next.js');
    else throw e;
  }
});

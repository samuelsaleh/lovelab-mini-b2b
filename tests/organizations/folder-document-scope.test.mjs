import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scopeOrganizationFolderDocuments,
  uniqueDocumentsById,
} from '../../lib/organizations/folder-document-scope.js';

const documents = [
  { id: 'owner-order', created_by: 'owner', creator: { email: 'sarah@example.com' } },
  { id: 'member-order', created_by: 'member', creator: { email: 'agent@example.com' } },
  // Same physical row returned through a second scope branch.
  { id: 'member-order', created_by: 'member', creator: { email: 'agent@example.com' } },
  // Historical profile ID for the same member email.
  { id: 'legacy-member-order', created_by: 'old-member', creator: { email: 'AGENT@example.com' } },
];

test('deduplicates documents by immutable ID', () => {
  assert.equal(uniqueDocumentsById(documents).length, 3);
});

test('organization root contains only owner orders', () => {
  const result = scopeOrganizationFolderDocuments({
    documents,
    organizationId: 'org',
    rootAgent: { id: 'owner', email: 'sarah@example.com' },
  });
  assert.deepEqual(result.map((doc) => doc.id), ['owner-order']);
});

test('Sub-agents grouping folder contains no loose orders', () => {
  const result = scopeOrganizationFolderDocuments({
    documents,
    organizationId: 'org',
    currentFolder: { id: 'group', name: 'Sub-agents', agent_id: 'owner' },
    rootAgent: { id: 'owner', email: 'sarah@example.com' },
  });
  assert.deepEqual(result, []);
});

test('member folder includes current and legacy IDs by normalized email', () => {
  const result = scopeOrganizationFolderDocuments({
    documents,
    organizationId: 'org',
    currentFolder: {
      id: 'member-folder',
      name: 'Wassila',
      agent_id: 'member',
      agent_email: 'agent@example.com',
    },
  });
  assert.deepEqual(result.map((doc) => doc.id), ['member-order', 'legacy-member-order']);
});

test('personal non-organization browser keeps all unique documents', () => {
  const result = scopeOrganizationFolderDocuments({ documents });
  assert.equal(result.length, 3);
});

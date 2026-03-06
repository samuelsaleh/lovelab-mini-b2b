import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SUBFOLDERS,
  buildRootFolder,
  normalizeSegment,
} from '../../lib/organizations/utils.js';

test('normalizeSegment converts names to stable slugs', () => {
  assert.equal(normalizeSegment('Venson Amsterdam'), 'venson-amsterdam');
  assert.equal(normalizeSegment('  Team  #1  '), 'team-1');
  assert.equal(normalizeSegment(''), '');
  assert.equal(normalizeSegment(null), '');
  assert.equal(normalizeSegment(undefined), '');
});

test('normalizeSegment handles special characters', () => {
  assert.equal(normalizeSegment('Café & Co.'), 'caf-co');
  assert.equal(normalizeSegment('Test---Multiple---Dashes'), 'test-multiple-dashes');
  assert.equal(normalizeSegment('  leading-trailing-  '), 'leading-trailing');
});

test('normalizeSegment is idempotent', () => {
  const input = 'Venson Amsterdam';
  const first = normalizeSegment(input);
  const second = normalizeSegment(first);
  assert.equal(first, second);
});

test('buildRootFolder uses organization id and slug', () => {
  const org = { id: 'org-123', name: 'Venson Amsterdam' };
  assert.equal(buildRootFolder(org), 'organizations/org-123-venson-amsterdam');
});

test('buildRootFolder falls back to id when name is empty', () => {
  const org = { id: 'org-456', name: '' };
  assert.equal(buildRootFolder(org), 'organizations/org-456-org-456');
});

test('buildRootFolder handles missing name', () => {
  const org = { id: 'org-789' };
  assert.equal(buildRootFolder(org), 'organizations/org-789-org-789');
});

test('buildRootFolder produces consistent paths for same org', () => {
  const org = { id: 'abc', name: 'Test Org' };
  assert.equal(buildRootFolder(org), buildRootFolder(org));
});

test('default subfolders are fixed and explicit', () => {
  assert.deepEqual(DEFAULT_SUBFOLDERS, ['Contracts', 'Orders', 'Invoices', 'Other']);
});

test('default subfolders are not empty', () => {
  assert.ok(DEFAULT_SUBFOLDERS.length > 0);
  for (const sub of DEFAULT_SUBFOLDERS) {
    assert.ok(sub.length > 0);
  }
});

test('buildRootFolder produces unique paths for different orgs', () => {
  const orgA = { id: 'org-a', name: 'Alpha' };
  const orgB = { id: 'org-b', name: 'Beta' };
  assert.notEqual(buildRootFolder(orgA), buildRootFolder(orgB));
});

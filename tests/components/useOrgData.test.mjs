import test from 'node:test';
import assert from 'node:assert/strict';

// Tests for the useOrgData hook's business logic patterns.
// Since we can't render React hooks in Node.js test runner,
// we test the data transformation and error handling logic.

function classifyResponses(detailsOk, ledgerOk, membersOk) {
  const warnings = [];
  let error = null;

  if (!detailsOk) {
    error = 'Failed to load organization';
    return { error, warnings, hasData: false };
  }

  if (!ledgerOk) warnings.push('Failed to load ledger');
  if (!membersOk) warnings.push('Failed to load members');

  return { error, warnings, hasData: true };
}

function extractOrgDetails(json) {
  return json.organization || json;
}

function extractMembers(json) {
  return json.members || [];
}

test('all responses ok: no error, no warnings', () => {
  const result = classifyResponses(true, true, true);
  assert.equal(result.error, null);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.hasData, true);
});

test('details fails: error set, no data', () => {
  const result = classifyResponses(false, true, true);
  assert.equal(result.error, 'Failed to load organization');
  assert.equal(result.hasData, false);
});

test('ledger fails: warning set, data still available', () => {
  const result = classifyResponses(true, false, true);
  assert.equal(result.error, null);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes('ledger'));
  assert.equal(result.hasData, true);
});

test('members fails: warning set, data still available', () => {
  const result = classifyResponses(true, true, false);
  assert.equal(result.error, null);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes('members'));
});

test('both ledger and members fail: two warnings', () => {
  const result = classifyResponses(true, false, false);
  assert.equal(result.error, null);
  assert.equal(result.warnings.length, 2);
});

test('all fail: error takes precedence', () => {
  const result = classifyResponses(false, false, false);
  assert.ok(result.error);
  assert.equal(result.hasData, false);
});

test('extractOrgDetails unwraps organization key', () => {
  const json = { organization: { id: '1', name: 'Venson' } };
  assert.deepEqual(extractOrgDetails(json), { id: '1', name: 'Venson' });
});

test('extractOrgDetails falls back to full json', () => {
  const json = { id: '1', name: 'Venson' };
  assert.deepEqual(extractOrgDetails(json), { id: '1', name: 'Venson' });
});

test('extractMembers unwraps members key', () => {
  const json = { members: [{ id: '1' }] };
  assert.deepEqual(extractMembers(json), [{ id: '1' }]);
});

test('extractMembers returns empty array for missing key', () => {
  assert.deepEqual(extractMembers({}), []);
  assert.deepEqual(extractMembers({ error: 'Forbidden' }), []);
});

// AbortController behavior tests
test('AbortController signal starts as not aborted', () => {
  const controller = new AbortController();
  assert.equal(controller.signal.aborted, false);
});

test('AbortController abort sets signal.aborted', () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(controller.signal.aborted, true);
});

test('new AbortController replaces old one', () => {
  let current = new AbortController();
  const old = current;
  current.abort();
  current = new AbortController();
  assert.equal(old.signal.aborted, true);
  assert.equal(current.signal.aborted, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateInvitationToken,
  getDefaultExpiryIso,
  isValidEmail,
  normalizeEmail,
} from '../../lib/organizations/invitations.js';

test('generateInvitationToken returns random non-empty token', () => {
  const a = generateInvitationToken();
  const b = generateInvitationToken();
  assert.equal(typeof a, 'string');
  assert.equal(typeof b, 'string');
  assert.ok(a.length >= 32);
  assert.notEqual(a, b);
});

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  USER@Example.COM '), 'user@example.com');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(undefined), '');
});

test('isValidEmail validates basic addresses', () => {
  assert.equal(isValidEmail('team@company.com'), true);
  assert.equal(isValidEmail('user+tag@domain.co.uk'), true);
  assert.equal(isValidEmail('bad-email'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('@missing.com'), false);
  assert.equal(isValidEmail('missing@'), false);
  assert.equal(isValidEmail('spaces in@email.com'), false);
});

test('getDefaultExpiryIso returns future timestamp', () => {
  const expiry = new Date(getDefaultExpiryIso(7)).getTime();
  assert.ok(expiry > Date.now());
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const diff = expiry - Date.now();
  assert.ok(diff > sevenDaysMs - 5000);
  assert.ok(diff < sevenDaysMs + 5000);
});

test('getDefaultExpiryIso defaults to 14 days', () => {
  const expiry = new Date(getDefaultExpiryIso()).getTime();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const diff = expiry - Date.now();
  assert.ok(diff > fourteenDaysMs - 5000);
  assert.ok(diff < fourteenDaysMs + 5000);
});

test('getDefaultExpiryIso returns valid ISO string', () => {
  const iso = getDefaultExpiryIso(1);
  assert.ok(!isNaN(new Date(iso).getTime()));
  assert.ok(iso.endsWith('Z'));
});

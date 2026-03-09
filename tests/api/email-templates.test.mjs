import test from 'node:test';
import assert from 'node:assert/strict';

import {
  welcomeAgentEmail,
  upgradeAgentEmail,
  restoreAgentEmail,
  orgInvitationEmail,
} from '../../lib/email-templates.js';

test('welcomeAgentEmail returns subject and html', () => {
  const result = welcomeAgentEmail('Alice', 'https://example.com/magic', 'https://example.com');
  assert.ok(result.subject.includes('Alice'));
  assert.ok(result.html.includes('Alice'));
  assert.ok(result.html.includes('https://example.com/magic'));
  assert.ok(result.html.includes('logo.png'));
});

test('welcomeAgentEmail includes brand color', () => {
  const result = welcomeAgentEmail('Bob', 'https://x.com/link', 'https://x.com');
  assert.ok(result.html.includes('#5D3A5E'));
});

test('upgradeAgentEmail returns subject and html', () => {
  const result = upgradeAgentEmail('Charlie', 'https://example.com');
  assert.ok(result.subject.includes('Charlie'));
  assert.ok(result.html.includes('Charlie'));
  assert.ok(result.html.includes('sales partner'));
});

test('restoreAgentEmail returns subject and html', () => {
  const result = restoreAgentEmail('Diana', 'https://example.com/magic', 'https://example.com');
  assert.ok(result.subject.includes('Diana'));
  assert.ok(result.html.includes('restored'));
  assert.ok(result.html.includes('https://example.com/magic'));
});

test('orgInvitationEmail returns subject and html', () => {
  const result = orgInvitationEmail('Venson Amsterdam', 'https://example.com');
  assert.ok(result.subject.includes('Venson Amsterdam'));
  assert.ok(result.html.includes('Venson Amsterdam'));
  assert.ok(result.html.includes('Sign in'));
});

test('all templates include footer', () => {
  const templates = [
    welcomeAgentEmail('A', 'https://x.com', 'https://x.com'),
    upgradeAgentEmail('B', 'https://x.com'),
    restoreAgentEmail('C', 'https://x.com', 'https://x.com'),
    orgInvitationEmail('D', 'https://x.com'),
  ];
  for (const t of templates) {
    assert.ok(t.html.includes('sent automatically'), `Missing footer in: ${t.subject}`);
  }
});

test('all templates have non-empty subject and html', () => {
  const templates = [
    welcomeAgentEmail('A', 'https://x.com', 'https://x.com'),
    upgradeAgentEmail('B', 'https://x.com'),
    restoreAgentEmail('C', 'https://x.com', 'https://x.com'),
    orgInvitationEmail('D', 'https://x.com'),
  ];
  for (const t of templates) {
    assert.ok(t.subject.length > 0);
    assert.ok(t.html.length > 0);
  }
});

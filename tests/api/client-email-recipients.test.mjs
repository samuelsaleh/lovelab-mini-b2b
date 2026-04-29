import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('client-facing email routes hide internal recipients with BCC', async () => {
  const routes = [
    'app/api/documents/send-email/route.js',
    'app/api/resources/send-email/route.js',
  ];

  for (const route of routes) {
    const source = await readFile(route, 'utf8');

    assert.match(source, /\bbcc:\s*(bccEmails|BCC_RECIPIENTS)\b/, `${route} should pass internal recipients via bcc`);
    assert.doesNotMatch(source, /\bcc:\s*(ccEmails|CC_RECIPIENTS|bccEmails|BCC_RECIPIENTS)\b/, `${route} must not expose internal recipients via visible cc`);
  }
});

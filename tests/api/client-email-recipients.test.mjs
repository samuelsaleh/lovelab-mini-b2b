import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

function readProjectFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('client document emails hide internal copies with bcc', () => {
  const route = readProjectFile('app/api/documents/send-email/route.js');

  assert.match(route, /const BCC_RECIPIENTS = \[[^\]]*albertosaleh@gmail\.com[^\]]*\]/);
  assert.match(route, /\bbcc:\s*bccEmails\b/);
  assert.doesNotMatch(route, /\bcc:\s*(ccEmails|BCC_RECIPIENTS|CC_RECIPIENTS)\b/);
});

test('resource emails hide Alberto copy with bcc', () => {
  const route = readProjectFile('app/api/resources/send-email/route.js');

  assert.match(route, /const BCC_RECIPIENTS = \[[^\]]*albertosaleh@gmail\.com[^\]]*\]/);
  assert.match(route, /\bbcc:\s*BCC_RECIPIENTS\b/);
  assert.doesNotMatch(route, /\bcc:\s*(CC_RECIPIENTS|BCC_RECIPIENTS)\b/);
});

test('resource helper text does not call the hidden copy a cc', () => {
  const translations = readProjectFile('lib/i18n/translations.js');
  const alwaysIncludedLines = translations
    .split('\n')
    .filter((line) => line.includes("'resources.alwaysIncluded'"));

  assert.ok(alwaysIncludedLines.length >= 4, 'expected localized resources.alwaysIncluded copy');
  for (const line of alwaysIncludedLines) {
    assert.doesNotMatch(line, /\bCC\b|en CC|in CC/i);
  }
});

/**
 * @jest-environment node
 *
 * A rejected AI key must read as a server problem, not a bad translation
 * (Sam, 15 Sep 2026: "the reply could not be read (API key is invalid)").
 */
const { describeApiFailure } = require('../fair-assistant/translate');

test('an authentication failure names the server key', () => {
  expect(describeApiFailure(new Error('API key is invalid'))).toMatch(/ANTHROPIC_API_KEY.*missing or invalid/);
  expect(describeApiFailure(new Error('ANTHROPIC_API_KEY is not configured'))).toMatch(/server admin/);
});

test('any other failure keeps the old wording with the detail', () => {
  expect(describeApiFailure(new Error('Unexpected token <'))).toBe('the reply could not be read (Unexpected token <)');
});

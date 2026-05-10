/**
 * @jest-environment node
 *
 * Canonical email validation — covers normalization + format checks used by
 * every auth route. If this regex ever needs to change, change it here.
 */

import { isValidEmail, normalizeEmail } from '../validation.js';

describe('normalizeEmail', () => {
  it('trims whitespace and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM  ')).toBe('foo@bar.com');
  });

  it('coerces null and undefined to empty string', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });

  it('handles already-clean addresses without changes', () => {
    expect(normalizeEmail('user@example.com')).toBe('user@example.com');
  });
});

describe('isValidEmail', () => {
  it('accepts standard addresses', () => {
    expect(isValidEmail('team@company.com')).toBe(true);
    expect(isValidEmail('user+tag@domain.co.uk')).toBe(true);
    expect(isValidEmail('a.b.c@long.subdomain.example.com')).toBe(true);
  });

  it('accepts addresses with surrounding whitespace and mixed case', () => {
    expect(isValidEmail('  Alice@Example.com  ')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail('plainstring')).toBe(false);
    expect(isValidEmail('@missing.com')).toBe(false);
    expect(isValidEmail('missing@')).toBe(false);
    expect(isValidEmail('no dot@domain')).toBe(false);
    expect(isValidEmail('spaces in@email.com')).toBe(false);
    expect(isValidEmail('two@@signs.com')).toBe(false);
  });
});

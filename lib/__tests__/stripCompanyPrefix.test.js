/**
 * @jest-environment node
 *
 * Unit coverage for stripCompanyPrefix(contactName, company) — the helper
 * that prevents "Cher Oxygene Marie Schultz," when the contact-name field
 * was filled with "Oxygene Marie Schultz" and the company is "Oxygene".
 *
 * Contract:
 *   - Strip leading company-name tokens (case-insensitive) with optional
 *     comma + whitespace separators between tokens and the rest.
 *   - Conservative: never reduce to empty; if stripping leaves "" we return
 *     the original input untouched.
 *   - Tolerant of regex-special characters in the company name.
 *   - No-ops cleanly when either argument is missing.
 */

const { stripCompanyPrefix } = require('../email-templates')

describe('stripCompanyPrefix', () => {
  it('strips a single-token company prefix', () => {
    expect(stripCompanyPrefix('Oxygene Marie Schultz', 'Oxygene')).toBe('Marie Schultz')
  })

  it('handles a comma+space separator after the company token', () => {
    expect(stripCompanyPrefix('Oxygene, Marie', 'Oxygene')).toBe('Marie')
  })

  it('strips a multi-word company prefix in order', () => {
    expect(stripCompanyPrefix('Acme Corp Marie Dupont', 'Acme Corp')).toBe('Marie Dupont')
  })

  it('is case-insensitive on the company tokens', () => {
    expect(stripCompanyPrefix('OXYGENE marie', 'Oxygene')).toBe('marie')
    expect(stripCompanyPrefix('oxygene Marie', 'OXYGENE')).toBe('Marie')
  })

  it('returns the original contact name unchanged when no prefix matches', () => {
    expect(stripCompanyPrefix('Marie Schultz', 'Oxygene')).toBe('Marie Schultz')
  })

  it('does not reduce the contact name to an empty string', () => {
    // contact == company exactly: stripping would empty the string. We
    // preserve the original so the greeting still has a name to show.
    expect(stripCompanyPrefix('Oxygene', 'Oxygene')).toBe('Oxygene')
    // Multi-word company that fully consumes the contact: same fallback.
    expect(stripCompanyPrefix('Acme Corp', 'Acme Corp')).toBe('Acme Corp')
  })

  it('handles regex-special characters in the company name', () => {
    // Pre-fix bug: a company like "Acme & Co." would crash a naive RegExp
    // ctor or partially-match. Helper escapes special chars before building
    // the prefix RegExp.
    expect(stripCompanyPrefix('Acme & Co. Marie', 'Acme & Co.')).toBe('Marie')
    // Parens in the company name shouldn't break either.
    expect(stripCompanyPrefix('LoveLab (B2B) Marie', 'LoveLab (B2B)')).toBe('Marie')
  })

  it('returns "" for an empty contact name and string-conserves a missing company', () => {
    expect(stripCompanyPrefix('', 'Oxygene')).toBe('')
    expect(stripCompanyPrefix(null, 'Oxygene')).toBe('')
    expect(stripCompanyPrefix('Marie', '')).toBe('Marie')
    expect(stripCompanyPrefix('Marie', null)).toBe('Marie')
    expect(stripCompanyPrefix('Marie', undefined)).toBe('Marie')
    expect(stripCompanyPrefix('  Marie  ', undefined)).toBe('Marie')
  })

  it('trims whitespace from both sides of the result', () => {
    expect(stripCompanyPrefix('  Oxygene   Marie  ', 'Oxygene')).toBe('Marie')
  })
})

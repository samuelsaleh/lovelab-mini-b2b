import { generateTempPassword } from '@/lib/auth/generateTempPassword';

describe('generateTempPassword', () => {
  test('uses first name + 4 digits + ! when full name provided', () => {
    const pw = generateTempPassword('Michaela Pechhacker');
    expect(pw).toMatch(/^Michaela\d{4}!$/);
  });

  test('takes only the first word', () => {
    const pw = generateTempPassword('Marie Claire Dubois');
    expect(pw).toMatch(/^Marie\d{4}!$/);
  });

  test('strips accents and diacritics', () => {
    const pw = generateTempPassword('Émilie');
    expect(pw).toMatch(/^Emilie\d{4}!$/);
  });

  test('capitalizes first letter, lowercases the rest', () => {
    const pw = generateTempPassword('PEDRO');
    expect(pw).toMatch(/^Pedro\d{4}!$/);
  });

  test('falls back to Lovelab-XXXX when name missing', () => {
    expect(generateTempPassword('')).toMatch(/^Lovelab-\d{4}$/);
    expect(generateTempPassword(null)).toMatch(/^Lovelab-\d{4}$/);
    expect(generateTempPassword(undefined)).toMatch(/^Lovelab-\d{4}$/);
  });

  test('falls back to Lovelab when name is all symbols', () => {
    expect(generateTempPassword('🎉🎉🎉')).toMatch(/^Lovelab-\d{4}$/);
    expect(generateTempPassword('---')).toMatch(/^Lovelab-\d{4}$/);
  });

  test('falls back when first token is a single character', () => {
    expect(generateTempPassword('A Person')).toMatch(/^Lovelab-\d{4}$/);
  });

  test('produces different passwords on repeated calls', () => {
    const passwords = new Set();
    for (let i = 0; i < 20; i++) passwords.add(generateTempPassword('Michaela'));
    expect(passwords.size).toBeGreaterThan(15);
  });
});

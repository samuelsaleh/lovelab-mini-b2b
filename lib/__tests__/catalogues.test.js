/**
 * Every agent gets every catalogue, in every language (Sam, 22 Sep 2026).
 */
import { CATALOGUES, CATALOGUE_FILES, getVisibleCatalogues } from '@/lib/catalogues';

describe('getVisibleCatalogues', () => {
  test('returns all catalogues for anyone, whatever the arguments', () => {
    expect(getVisibleCatalogues()).toBe(CATALOGUES);
    expect(getVisibleCatalogues({ isAdmin: false, userEmail: 'agent@example.com' })).toHaveLength(8);
    expect(getVisibleCatalogues({ isAdmin: true })).toHaveLength(8);
  });

  test('covers French (general and client variants), English, German, Polish and Greek', () => {
    const langs = CATALOGUES.map((c) => c.language);
    expect(langs.filter((l) => l === 'fr')).toHaveLength(4);
    for (const l of ['en', 'de', 'pl', 'el']) expect(langs).toContain(l);
    expect(CATALOGUE_FILES).toHaveLength(8);
  });
});

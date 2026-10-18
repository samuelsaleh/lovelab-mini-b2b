import { TRANSLATION_LANGUAGES, filterLanguages, languageName } from '../languages'

describe('doc-translate languages', () => {
  it('returns every language for an empty query', () => {
    expect(filterLanguages('')).toEqual(TRANSLATION_LANGUAGES)
    expect(filterLanguages('   ')).toEqual(TRANSLATION_LANGUAGES)
  })

  it('keeps only languages whose name starts with the typed letters', () => {
    const f = filterLanguages('f').map((l) => l.code)
    expect(f).toContain('fr')
    expect(f).toContain('fi')
    expect(f).not.toContain('de')
  })

  it('is case and accent insensitive and also matches the native name', () => {
    expect(filterLanguages('FRENCH').map((l) => l.code)).toEqual(['fr'])
    expect(filterLanguages('franc').map((l) => l.code)).toEqual(['fr'])
    expect(filterLanguages('neder').map((l) => l.code)).toEqual(['nl'])
    expect(filterLanguages('espan').map((l) => l.code)).toEqual(['es'])
  })

  it('returns nothing when no language matches', () => {
    expect(filterLanguages('zzz')).toEqual([])
  })

  it('has unique codes and covers the LoveLab markets', () => {
    const codes = TRANSLATION_LANGUAGES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of ['fr', 'nl', 'de', 'it', 'es', 'pt', 'zh', 'ja', 'ko', 'pl', 'el', 'tr', 'he', 'en']) {
      expect(codes).toContain(c)
    }
  })

  it('languageName resolves a code and falls back to the code', () => {
    expect(languageName('fr')).toBe('French')
    expect(languageName('xx')).toBe('xx')
  })
})

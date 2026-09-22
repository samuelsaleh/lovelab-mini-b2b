/**
 * Which language an agent is written to in: the stored choice wins, then
 * the country, then English.
 */
import { PRICE_LIST_LOCALES } from '@/lib/priceListAnnouncement';
import { isSupportedLanguage } from '@/lib/fair-assistant/languages';
import {
  AGENT_LANGUAGES,
  AGENT_LANGUAGE_LABELS,
  isAgentLanguage,
  suggestAgentLanguage,
  resolveAgentLanguage,
  languageSource,
  agentLanguageLabel,
} from '@/lib/agents/language';

describe('agent languages', () => {
  test('adding a language: label, copy pack and translator support must all exist', () => {
    for (const code of AGENT_LANGUAGES) {
      expect(AGENT_LANGUAGE_LABELS[code]).toBeTruthy();
      expect(PRICE_LIST_LOCALES[code]).toBeTruthy();
      expect(isSupportedLanguage(code)).toBe(true);
    }
  });

  test('the seven languages, each with a label', () => {
    expect(AGENT_LANGUAGES).toEqual(['en', 'fr', 'de', 'it', 'nl', 'pl', 'el']);
    for (const code of AGENT_LANGUAGES) expect(AGENT_LANGUAGE_LABELS[code]).toBeTruthy();
    expect(isAgentLanguage('pl')).toBe(true);
    expect(isAgentLanguage('es')).toBe(false);
    expect(isAgentLanguage(null)).toBe(false);
  });

  test('suggestAgentLanguage follows the country, limited to the seven', () => {
    expect(suggestAgentLanguage('Germany')).toBe('de');
    expect(suggestAgentLanguage('Deutschland')).toBe('de');
    expect(suggestAgentLanguage('Belgium')).toBe('fr');
    expect(suggestAgentLanguage('Poland')).toBe('pl');
    expect(suggestAgentLanguage('Greece')).toBe('el');
    expect(suggestAgentLanguage('Spain')).toBe('en'); // Spanish is not one we write in
    expect(suggestAgentLanguage('Atlantis')).toBe('en');
    expect(suggestAgentLanguage('')).toBe('en');
    expect(suggestAgentLanguage(undefined)).toBe('en');
  });

  test('resolveAgentLanguage: stored wins over country, country over default', () => {
    expect(resolveAgentLanguage({ agent_language: 'nl', agent_country: 'Belgium' })).toBe('nl');
    expect(resolveAgentLanguage({ agent_language: null, agent_country: 'Italy' })).toBe('it');
    expect(resolveAgentLanguage({ agent_language: 'xx', agent_country: 'Italy' })).toBe('it');
    expect(resolveAgentLanguage({})).toBe('en');
    expect(resolveAgentLanguage(null)).toBe('en');
  });

  test('languageSource says where the language came from', () => {
    expect(languageSource({ agent_language: 'fr' })).toBe('stored');
    expect(languageSource({ agent_country: 'France' })).toBe('country');
    expect(languageSource({ agent_country: 'United States' })).toBe('default');
    expect(languageSource({})).toBe('default');
  });

  test('agentLanguageLabel', () => {
    expect(agentLanguageLabel('el')).toBe('Ελληνικά');
    expect(agentLanguageLabel('zz')).toBe('ZZ');
  });
});

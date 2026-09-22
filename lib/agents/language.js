/**
 * The language LoveLab writes to an agent in.
 *
 * Sam, 22 Sep 2026: price list announcements go to every agent in their own
 * language. Until now no agent had a language at all — the portal language
 * lives in the browser, the client-email language is a per-send dropdown.
 * `profiles.agent_language` is the stored choice; when it is empty the
 * agent's country decides, and English is the last resort.
 *
 * Pure helpers, safe on client and server.
 */
import { primaryLanguageForCountry } from '@/lib/fair-assistant/languages';

export const AGENT_LANGUAGES = ['en', 'fr', 'de', 'it', 'nl', 'pl', 'el'];

export const AGENT_LANGUAGE_LABELS = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  el: 'Ελληνικά',
};

export function isAgentLanguage(code) {
  return typeof code === 'string' && AGENT_LANGUAGES.includes(code);
}

/** The language an agent's country suggests, limited to the ones we write in. */
export function suggestAgentLanguage(country) {
  const code = primaryLanguageForCountry(country);
  return isAgentLanguage(code) ? code : 'en';
}

/**
 * Where an agent's resolved language comes from:
 *   'stored'  — set on the profile,
 *   'country' — derived from agent_country,
 *   'default' — nothing to go on, English.
 */
export function languageSource(profile) {
  if (isAgentLanguage(profile?.agent_language)) return 'stored';
  if (suggestAgentLanguage(profile?.agent_country) !== 'en') return 'country';
  return 'default';
}

/** The one language to write to this agent in. Always one of AGENT_LANGUAGES. */
export function resolveAgentLanguage(profile) {
  if (isAgentLanguage(profile?.agent_language)) return profile.agent_language;
  return suggestAgentLanguage(profile?.agent_country);
}

export function agentLanguageLabel(code) {
  return AGENT_LANGUAGE_LABELS[code] || String(code || '').toUpperCase();
}

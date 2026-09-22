/**
 * Price list announcement email — every language complete, brand names
 * verbatim, the admin's note escaped, the in-force sentence present.
 */
import {
  PRICE_LIST_LOCALES,
  PRICE_LIST_ANNOUNCEMENT_LANGUAGES,
  getPriceListLocale,
  priceListAnnouncementEmail,
  collectionsForSubject,
  firstNameOf,
} from '@/lib/priceListAnnouncement';
import { AGENT_LANGUAGES } from '@/lib/agents/language';

const SITE = 'https://app.lovelab-antwerp.com';

describe('PRICE_LIST_LOCALES', () => {
  test('covers exactly the agent languages', () => {
    expect(PRICE_LIST_ANNOUNCEMENT_LANGUAGES).toEqual(AGENT_LANGUAGES);
    expect(Object.keys(PRICE_LIST_LOCALES).sort()).toEqual([...AGENT_LANGUAGES].sort());
  });

  test('every language has every key of the English pack, non-empty', () => {
    const keys = Object.keys(PRICE_LIST_LOCALES.en);
    for (const lang of AGENT_LANGUAGES) {
      const pack = PRICE_LIST_LOCALES[lang];
      expect(Object.keys(pack).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        const value = pack[key];
        if (typeof value === 'function') {
          expect(value({ name: 'Anna', collections: 'CUTY' }).trim()).not.toBe('');
        } else {
          expect(String(value).trim()).not.toBe('');
        }
      }
    }
  });

  test('unknown language falls back to English', () => {
    expect(getPriceListLocale('xx')).toBe(PRICE_LIST_LOCALES.en);
  });
});

describe('collectionsForSubject', () => {
  test('lists up to three by name, then counts the rest', () => {
    expect(collectionsForSubject(['CUTY'])).toBe('CUTY');
    expect(collectionsForSubject(['CUTY', 'CUBIX', 'HOLY'])).toBe('CUTY, CUBIX, HOLY');
    expect(collectionsForSubject(['CUTY', 'CUBIX', 'HOLY', 'MULTI THREE', 'MULTI FOUR'])).toBe('CUTY, CUBIX, HOLY +2');
  });
  test('all collections uses the language label', () => {
    expect(collectionsForSubject([], { allCollections: true, allLabel: 'Alle Kollektionen' })).toBe('Alle Kollektionen');
  });
});

describe('firstNameOf', () => {
  test('first token of the full name', () => {
    expect(firstNameOf('Anna Maria Rossi')).toBe('Anna');
    expect(firstNameOf('  ')).toBe('');
    expect(firstNameOf(null)).toBe('');
  });
});

describe('priceListAnnouncementEmail', () => {
  const base = {
    firstName: 'Anna',
    note: 'CUTY 0.30 ct: +5%\n\nSizes unchanged. <b>not html</b>',
    collectionLabels: ['CUTY', 'CUBIX'],
    fileName: 'Pricelist_LoveLab_2026_October.pdf',
  };

  test('is a full HTML document with logo, greeting, escaped note, collections, file and signature', () => {
    const { subject, html } = priceListAnnouncementEmail({ ...base, lang: 'en' }, SITE);
    expect(subject).toBe('New LoveLab price list — CUTY, CUBIX');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('/email/logo.png');
    expect(html).toContain('Dear Anna,');
    expect(html).toContain('CUTY 0.30 ct: +5%');
    expect(html).toContain('&lt;b&gt;not html&lt;/b&gt;');
    expect(html).not.toContain('<b>not html</b>');
    expect(html).toContain('Sizes unchanged.');
    expect(html).toContain('What has changed');
    expect(html).toContain('Collections concerned');
    expect(html).toContain('Pricelist_LoveLab_2026_October.pdf');
    expect(html).toContain('this is the price list in force');
    expect(html).toContain('Alberto Saleh');
  });

  test('renders every language with brand names verbatim and its own in-force sentence', () => {
    for (const lang of AGENT_LANGUAGES) {
      const { subject, html } = priceListAnnouncementEmail({ ...base, lang }, SITE);
      const L = PRICE_LIST_LOCALES[lang];
      expect(subject).toContain('CUTY, CUBIX');
      expect(html).toContain('CUTY');
      expect(html).toContain('CUBIX');
      expect(html).toContain(L.inForce.replace(/&/g, '&amp;').replace(/'/g, '&#39;'));
      expect(html).toContain(L.signoff);
    }
  });

  test('all collections replaces the list with the language word', () => {
    const { subject, html } = priceListAnnouncementEmail({ ...base, lang: 'de', collectionLabels: [], allCollections: true }, SITE);
    expect(subject).toBe('Neue LoveLab-Preisliste — Alle Kollektionen');
    expect(html).toContain('Alle Kollektionen');
    expect(html).not.toContain('CUBIX');
  });

  test('no first name gives the bare greeting', () => {
    const { html } = priceListAnnouncementEmail({ ...base, lang: 'fr', firstName: '' }, SITE);
    expect(html).toContain('Bonjour,');
    expect(html).not.toContain('Bonjour ,');
  });
});

/**
 * "New price list" announcement to agents — one email, seven languages.
 *
 * Sam, 22 Sep 2026: when a price list changes, every agent must hear it in
 * their own language, with the PDF attached, and be told that from now on
 * this is the list in force. The fixed copy below is hand-written per
 * language; only the admin's free-text note ("what changed") is translated
 * (lib/ai/translateText.js). Collection names are brand names and stay
 * verbatim.
 *
 * No server-only imports here: the admin modal renders the same HTML for
 * its preview, so what the agent receives is what the admin saw.
 */
import { renderEmail, hairline, BRAND, FONT_BODY } from './email-shell.js';
import { escapeHtml, textToHtmlParagraphs, signatureHtml } from './email-templates.js';
import { AGENT_LANGUAGES } from './agents/language.js';

export const PRICE_LIST_ANNOUNCEMENT_LANGUAGES = AGENT_LANGUAGES;

export const MAX_NOTE_LENGTH = 2000;

export const ENGLISH_VERSION_LABEL = 'English version';

export const PRICE_LIST_LOCALES = {
  en: {
    subject: ({ collections }) => `New LoveLab price list — ${collections}`,
    greeting: ({ name }) => (name ? `Dear ${name},` : 'Hello,'),
    intro: 'Please find attached the new LoveLab price list.',
    changesLabel: 'What has changed',
    collectionsLabel: 'Collections concerned',
    allCollections: 'All collections',
    attachedLabel: 'Attached file',
    inForce: 'From now on, this is the price list in force. Previous price lists are no longer valid — please use only this one for all quotes and orders.',
    signoff: 'Kind regards,',
  },
  fr: {
    subject: ({ collections }) => `Nouvelle liste de prix LoveLab — ${collections}`,
    greeting: ({ name }) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    intro: 'Veuillez trouver ci-joint la nouvelle liste de prix LoveLab.',
    changesLabel: 'Ce qui change',
    collectionsLabel: 'Collections concernées',
    allCollections: 'Toutes les collections',
    attachedLabel: 'Fichier joint',
    inForce: "À partir de maintenant, c'est cette liste de prix qui est en vigueur. Les listes précédentes ne sont plus valables — merci de n'utiliser que celle-ci pour tous vos devis et commandes.",
    signoff: 'Bien cordialement,',
  },
  de: {
    subject: ({ collections }) => `Neue LoveLab-Preisliste — ${collections}`,
    greeting: ({ name }) => (name ? `Guten Tag ${name},` : 'Guten Tag,'),
    intro: 'Anbei finden Sie die neue LoveLab-Preisliste.',
    changesLabel: 'Was sich geändert hat',
    collectionsLabel: 'Betroffene Kollektionen',
    allCollections: 'Alle Kollektionen',
    attachedLabel: 'Angehängte Datei',
    inForce: 'Ab sofort gilt diese Preisliste. Frühere Preislisten sind nicht mehr gültig — bitte verwenden Sie für alle Angebote und Bestellungen nur noch diese.',
    signoff: 'Mit freundlichen Grüßen,',
  },
  it: {
    subject: ({ collections }) => `Nuovo listino prezzi LoveLab — ${collections}`,
    greeting: ({ name }) => (name ? `Gentile ${name},` : 'Buongiorno,'),
    intro: 'In allegato trovate il nuovo listino prezzi LoveLab.',
    changesLabel: 'Cosa è cambiato',
    collectionsLabel: 'Collezioni interessate',
    allCollections: 'Tutte le collezioni',
    attachedLabel: 'File allegato',
    inForce: 'Da oggi questo è il listino prezzi in vigore. I listini precedenti non sono più validi — vi preghiamo di utilizzare solo questo per tutti i preventivi e gli ordini.',
    signoff: 'Cordiali saluti,',
  },
  nl: {
    subject: ({ collections }) => `Nieuwe LoveLab-prijslijst — ${collections}`,
    greeting: ({ name }) => (name ? `Beste ${name},` : 'Beste,'),
    intro: 'In de bijlage vindt u de nieuwe LoveLab-prijslijst.',
    changesLabel: 'Wat er verandert',
    collectionsLabel: 'Betrokken collecties',
    allCollections: 'Alle collecties',
    attachedLabel: 'Bijgevoegd bestand',
    inForce: 'Vanaf nu is dit de geldende prijslijst. Eerdere prijslijsten zijn niet langer geldig — gebruik alleen nog deze voor al uw offertes en bestellingen.',
    signoff: 'Met vriendelijke groet,',
  },
  pl: {
    subject: ({ collections }) => `Nowy cennik LoveLab — ${collections}`,
    greeting: ({ name }) => (name ? `Dzień dobry ${name},` : 'Dzień dobry,'),
    intro: 'W załączeniu przesyłamy nowy cennik LoveLab.',
    changesLabel: 'Co się zmieniło',
    collectionsLabel: 'Kolekcje, których dotyczy zmiana',
    allCollections: 'Wszystkie kolekcje',
    attachedLabel: 'Załączony plik',
    inForce: 'Od teraz obowiązuje ten cennik. Poprzednie cenniki tracą ważność — prosimy korzystać wyłącznie z tego cennika przy wszystkich wycenach i zamówieniach.',
    signoff: 'Z poważaniem,',
  },
  el: {
    subject: ({ collections }) => `Νέος τιμοκατάλογος LoveLab — ${collections}`,
    greeting: ({ name }) => (name ? `Γεια σας ${name},` : 'Γεια σας,'),
    intro: 'Επισυνάπτουμε τον νέο τιμοκατάλογο της LoveLab.',
    changesLabel: 'Τι άλλαξε',
    collectionsLabel: 'Συλλογές που αφορά',
    allCollections: 'Όλες οι συλλογές',
    attachedLabel: 'Συνημμένο αρχείο',
    inForce: 'Από τώρα και στο εξής ισχύει αυτός ο τιμοκατάλογος. Οι προηγούμενοι τιμοκατάλογοι δεν ισχύουν πλέον — παρακαλούμε χρησιμοποιείτε μόνο αυτόν για όλες τις προσφορές και παραγγελίες.',
    signoff: 'Με εκτίμηση,',
  },
};

export function getPriceListLocale(lang) {
  return PRICE_LIST_LOCALES[lang] || PRICE_LIST_LOCALES.en;
}

/** First name for the greeting: first token of the full name. */
export function firstNameOf(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

/**
 * The collections as they appear in the subject line. The subject must stay
 * readable when many collections changed: three by name, the rest counted.
 */
export function collectionsForSubject(labels, { allCollections, allLabel } = {}) {
  if (allCollections || !Array.isArray(labels) || labels.length === 0) return allLabel || '';
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`;
}

/**
 * Build the announcement email for one agent.
 *
 * @param {object} params
 * @param {string} params.lang           - One of PRICE_LIST_ANNOUNCEMENT_LANGUAGES.
 * @param {string} [params.firstName]    - Agent first name for the greeting.
 * @param {string} params.note           - The admin's note, already in `lang`.
 * @param {string} [params.englishNote]  - The note in English; appended as a second version when `lang` is not English.
 * @param {string[]} [params.collectionLabels] - Brand labels of the collections that changed.
 * @param {boolean} [params.allCollections]    - Every collection changed.
 * @param {string} params.fileName       - The attached PDF's file name.
 * @param {string} siteUrl               - Base URL for the logo in the shell.
 * @returns {{ subject: string, html: string }}
 */
export function priceListAnnouncementEmail({
  lang = 'en',
  firstName = '',
  note = '',
  englishNote = '',
  collectionLabels = [],
  allCollections = false,
  fileName = '',
}, siteUrl) {
  const L = getPriceListLocale(lang);
  const labels = Array.isArray(collectionLabels) ? collectionLabels.filter(Boolean) : [];
  const everyCollection = allCollections || labels.length === 0;

  const subject = L.subject({
    collections: collectionsForSubject(labels, { allCollections: everyCollection, allLabel: L.allCollections }),
  });

  const line = `margin:0 0 16px;font-family:${FONT_BODY};font-size:15px;line-height:1.7;color:${BRAND.text};`;
  const label = `margin:24px 0 8px;font-family:${FONT_BODY};font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};`;

  // Intro, what changed, collections, the in-force box — the part of the
  // email that is repeated in English below the agent's own language.
  const sections = (P, text) => {
    const noteHtml = textToHtmlParagraphs(text, `${line}margin-bottom:12px;`);
    const collectionRows = (everyCollection ? [P.allCollections] : labels).map((name, i) => {
      const rule = i === 0 ? '0' : `1px solid ${BRAND.line}`;
      return `<tr><td style="padding:10px 14px;border-top:${rule};font-family:${FONT_BODY};font-size:14px;font-weight:600;color:${BRAND.heading};">${escapeHtml(name)}</td></tr>`;
    }).join('');
    return `
      <p style="${line}">${escapeHtml(P.intro)}</p>
      ${noteHtml ? `<p style="${label}">${escapeHtml(P.changesLabel)}</p>${noteHtml}` : ''}
      <p style="${label}">${escapeHtml(P.collectionsLabel)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border:1px solid ${BRAND.line};border-radius:4px;border-collapse:separate;">
        ${collectionRows}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;border-collapse:separate;">
        <tr><td style="padding:14px 16px;background:#f7f5f8;border-left:3px solid ${BRAND.plum};font-family:${FONT_BODY};font-size:15px;line-height:1.7;color:${BRAND.heading};">${escapeHtml(P.inForce)}</td></tr>
      </table>`;
  };

  const dot = String(fileName).lastIndexOf('.');
  const ext = dot > 0 ? String(fileName).slice(dot + 1).toUpperCase() : '';
  const fileHtml = fileName ? `
      <p style="${label}">${escapeHtml(L.attachedLabel)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border:1px solid ${BRAND.line};border-radius:4px;border-collapse:separate;">
        <tr>
          <td style="padding:10px 14px;font-family:${FONT_BODY};font-size:14px;color:${BRAND.heading};">${escapeHtml(fileName)}</td>
          <td align="right" style="padding:10px 14px;font-family:${FONT_BODY};font-size:12px;color:${BRAND.muted};white-space:nowrap;">${escapeHtml(ext)}</td>
        </tr>
      </table>` : '';

  // Sam, 22 Sep 2026: every agent also gets the English version, so a
  // colleague or a client who reads English can be forwarded the same mail.
  // English agents get it once.
  const englishHtml = lang !== 'en' && String(englishNote || '').trim()
    ? `
      ${hairline()}
      <p style="${label}margin-top:0;">${escapeHtml(ENGLISH_VERSION_LABEL)}</p>
      ${sections(PRICE_LIST_LOCALES.en, englishNote)}`
    : '';

  const bodyHtml = `
      <p style="${line}">${escapeHtml(L.greeting({ name: firstNameOf(firstName) }))}</p>
      ${sections(L, note)}
      ${fileHtml}
      ${englishHtml}
      <p style="${line}margin-top:24px;">${escapeHtml(L.signoff)}</p>
      ${signatureHtml()}
  `;

  return {
    subject,
    html: renderEmail({ siteUrl, bodyHtml, title: subject, preheader: L.intro }),
  };
}

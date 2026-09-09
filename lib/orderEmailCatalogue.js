import path from 'node:path';
import fs from 'node:fs/promises';
import { catalogueRelativePath } from './catalogues';

const OCTOBER_ENGLISH = catalogueRelativePath('en-oct');
const OCTOBER_GERMAN = catalogueRelativePath('de-oct');
const OCTOBER_FRENCH_GENERAL = catalogueRelativePath('fr-premiere-general-oct');

export const ORDER_EMAIL_CATALOGUE_CANDIDATES = {
  en: [OCTOBER_ENGLISH],
  fr: [OCTOBER_FRENCH_GENERAL],
  de: [OCTOBER_GERMAN],
  it: [OCTOBER_ENGLISH],
  nl: [OCTOBER_ENGLISH],
};

// ─── Size budget ──────────────────────────────────────────────────────────
//
// The binding constraint is the RECIPIENT's mailbox, not Resend.
//
// Resend accepts 40 MB, so it happily sent a 22.6 MB catalogue (31 MB once
// base64-encoded). Google accepts 50 MB inbound, so the Gmail-hosted BCCs got
// it — but iCloud caps an incoming message at 20 MB, so the client's copy
// bounced with "Message size too large" (6 Sep 2026, order Cerise). Sizing to
// Resend's limit meant the people who most needed the email were the only ones
// who never received it.
//
// The real ceiling is the smallest mailbox we send to: iCloud at 20 MB,
// Outlook around 25 MB. Budget the whole encoded message at 18 MB.
export const MAX_MESSAGE_BYTES = 18 * 1024 * 1024;

// Base64 costs 4 bytes per 3, plus MIME line breaks — 1.37x is a safe figure.
export const BASE64_RATIO = 1.37;

// A catalogue may never use more than this on its own, whatever else fits.
// The catalogues in public/catalogues are 300 dpi re-exports kept under budget
// by scripts/build-email-catalogues.mjs; every one of them lands under 9 MB.
//
// They are stored re-exported rather than alongside print masters on purpose:
// this function reads its filename dynamically, so @vercel/nft bundles the
// whole public/catalogues directory into the serverless function. Shipping
// both a master and an email copy of each catalogue put that function at
// 256 MB and broke the deploy against Vercel's 250 MB limit.
export const MAX_CATALOGUE_BYTES = 11 * 1024 * 1024;

export const encodedSize = (bytes) => Math.ceil(bytes * BASE64_RATIO);

/**
 * Can a catalogue of `catalogueBytes` ride along with `reservedBytes` of other
 * attachments (the order PDF) and still clear the smallest recipient mailbox?
 */
export function catalogueFitsInMessage(catalogueBytes, reservedBytes = 0) {
  if (catalogueBytes > MAX_CATALOGUE_BYTES) return false;
  return encodedSize(catalogueBytes + reservedBytes) <= MAX_MESSAGE_BYTES;
}

/**
 * Read the catalogue to attach to an order email, or null when none fits.
 *
 * Returning null is a normal outcome, not a failure: the caller then links to
 * the catalogue instead, so the client always gets the order confirmation.
 *
 * @param {string} lang
 * @param {{ reservedBytes?: number }} [opts] bytes already spoken for by other
 *        attachments — pass the order PDF's size so the budget is honest.
 */
export async function readOrderEmailCatalogue(lang, { reservedBytes = 0 } = {}) {
  const tryRead = async (filename) => {
    if (!filename) return null;

    // Keep every segment in this one expression. Next.js output-file tracing
    // can then prove that only public/catalogues is needed by this function.
    // Passing `public/` in as a dynamic argument makes @vercel/nft conservatively
    // bundle the entire 3.6 GB public directory, including all packshots.
    const fullPath = path.join(process.cwd(), 'public', 'catalogues', filename);

    let size;
    try {
      ({ size } = await fs.stat(fullPath));
    } catch {
      return null;
    }

    if (!catalogueFitsInMessage(size, reservedBytes)) {
      console.warn(
        `[orderEmailCatalogue] Skipping "${filename}" (${(size / 1048576).toFixed(1)} MB, ` +
        `${(encodedSize(size + reservedBytes) / 1048576).toFixed(1)} MB encoded with the order PDF): ` +
        `over the ${(MAX_MESSAGE_BYTES / 1048576).toFixed(0)} MB budget that keeps us inside ` +
        `iCloud's 20 MB inbox limit. Run scripts/build-email-catalogues.mjs. ` +
        `The email will link to the catalogue instead.`,
      );
      return null;
    }

    try {
      const buffer = await fs.readFile(fullPath);
      return { filename: path.basename(filename), buffer };
    } catch {
      return null;
    }
  };

  const candidates = ORDER_EMAIL_CATALOGUE_CANDIDATES[lang]
    || ORDER_EMAIL_CATALOGUE_CANDIDATES.en;
  for (const filename of candidates) {
    const result = await tryRead(filename);
    if (result) return result;
  }

  if (lang !== 'en') {
    for (const filename of ORDER_EMAIL_CATALOGUE_CANDIDATES.en) {
      const result = await tryRead(filename);
      if (result) return result;
    }
  }
  return null;
}

/** The public URL a client can download the catalogue from. */
export function orderEmailCatalogueUrl(lang, siteUrl) {
  const candidates = ORDER_EMAIL_CATALOGUE_CANDIDATES[lang]
    || ORDER_EMAIL_CATALOGUE_CANDIDATES.en;
  const filename = candidates[0] || ORDER_EMAIL_CATALOGUE_CANDIDATES.en[0];
  if (!filename) return null;
  const encoded = `/catalogues/${filename}`
    .split('/')
    .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
    .join('/');
  return `${String(siteUrl || '').replace(/\/$/, '')}${encoded}`;
}

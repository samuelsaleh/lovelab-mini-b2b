import path from 'node:path';
import fs from 'node:fs/promises';
import { catalogueRelativePath } from './catalogues';

const OCTOBER_ENGLISH = catalogueRelativePath('en-oct');
const OCTOBER_GERMAN = catalogueRelativePath('de-oct');
const OCTOBER_FRENCH_GENERAL = catalogueRelativePath('fr-premiere-general-oct');

// Resend rejects any email whose content + attachments exceed 40 MB, and
// attachments travel base64-encoded (x1.33). The September French general
// catalogue is 47.7 MB on disk (60.6 MB encoded) and made every French order
// email fail with "exceeded the size limit (40MB)". The October editions are
// ~23 MB (~30 MB encoded) and go through. Keep every candidate here under
// MAX_CATALOGUE_BYTES — readOrderEmailCatalogue skips anything larger.
export const ORDER_EMAIL_CATALOGUE_CANDIDATES = {
  en: [OCTOBER_ENGLISH],
  fr: [OCTOBER_FRENCH_GENERAL],
  de: [OCTOBER_GERMAN],
  it: [OCTOBER_ENGLISH],
  nl: [OCTOBER_ENGLISH],
};

// Resend's hard limit is 40 MB for the whole request. The order PDF itself is
// usually well under 2 MB and the HTML is tiny, so a catalogue whose encoded
// size stays under 36 MB (27 MB on disk) leaves comfortable headroom.
export const MAX_CATALOGUE_BYTES = 27 * 1024 * 1024;

export async function readOrderEmailCatalogue(lang) {
  const tryRead = async (filename) => {
    if (!filename) return null;
    // Keep every segment in this one expression. Next.js output-file tracing
    // can then prove that only public/catalogues is needed by this function.
    // Passing `public/` in as a dynamic argument makes @vercel/nft conservatively
    // bundle the entire 3.6 GB public directory, including all packshots.
    const fullPath = path.join(process.cwd(), 'public', 'catalogues', filename);
    try {
      // Size guard: a catalogue too big for Resend must never be attached —
      // the whole order email would bounce with a 400 and the client would
      // get nothing. Better to send without it than not at all.
      const { size } = await fs.stat(fullPath);
      if (size > MAX_CATALOGUE_BYTES) {
        console.warn(
          `[orderEmailCatalogue] Skipping "${filename}": ${(size / 1048576).toFixed(1)} MB exceeds the ` +
          `${(MAX_CATALOGUE_BYTES / 1048576).toFixed(0)} MB attachment budget (Resend limit is 40 MB after base64).`,
        );
        return null;
      }
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

import path from 'node:path';
import fs from 'node:fs/promises';
import { catalogueRelativePath } from './catalogues';

const OCTOBER_ENGLISH = catalogueRelativePath('en-oct');
const OCTOBER_GERMAN = catalogueRelativePath('de-oct');

export const ORDER_EMAIL_CATALOGUE_CANDIDATES = {
  en: [OCTOBER_ENGLISH],
  fr: [
    'Francais/Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
    'Francais/_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
  ],
  de: [OCTOBER_GERMAN],
  it: [OCTOBER_ENGLISH],
  nl: [OCTOBER_ENGLISH],
};

export async function readOrderEmailCatalogue(lang) {
  const tryRead = async (filename) => {
    if (!filename) return null;
    // Keep every segment in this one expression. Next.js output-file tracing
    // can then prove that only public/catalogues is needed by this function.
    // Passing `public/` in as a dynamic argument makes @vercel/nft conservatively
    // bundle the entire 3.6 GB public directory, including all packshots.
    const fullPath = path.join(process.cwd(), 'public', 'catalogues', filename);
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

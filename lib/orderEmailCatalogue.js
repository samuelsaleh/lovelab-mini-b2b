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

export async function readOrderEmailCatalogue(lang, {
  publicDirectory = path.join(process.cwd(), 'public'),
} = {}) {
  const tryRead = async (filename) => {
    if (!filename) return null;
    const fullPath = path.join(publicDirectory, 'catalogues', filename);
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

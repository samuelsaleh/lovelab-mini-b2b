/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import {
  ORDER_EMAIL_CATALOGUE_CANDIDATES,
  readOrderEmailCatalogue,
} from '../orderEmailCatalogue';

describe('order email catalogue selection', () => {
  test('English, Italian, and Dutch use the retained October English catalogue', () => {
    const octoberEnglish = 'English/Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf';
    expect(ORDER_EMAIL_CATALOGUE_CANDIDATES.en).toEqual([octoberEnglish]);
    expect(ORDER_EMAIL_CATALOGUE_CANDIDATES.it).toEqual([octoberEnglish]);
    expect(ORDER_EMAIL_CATALOGUE_CANDIDATES.nl).toEqual([octoberEnglish]);
  });

  test('German uses the retained October German catalogue', () => {
    expect(ORDER_EMAIL_CATALOGUE_CANDIDATES.de).toEqual([
      'Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    ]);
  });

  test.each([
    ['en', 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf'],
    ['de', 'Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf'],
    ['it', 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf'],
    ['nl', 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf'],
    ['unknown', 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf'],
    ['fr', 'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf'],
  ])('%s resolves a real, non-empty PDF named %s', async (language, expectedName) => {
    const result = await readOrderEmailCatalogue(language);
    expect(result?.filename).toBe(expectedName);
    expect(result?.buffer.length).toBeGreaterThan(1000);
  });

  test('keeps the traced filesystem root narrowed to public/catalogues', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/orderEmailCatalogue.js'),
      'utf8',
    );
    expect(source).toContain("path.join(process.cwd(), 'public', 'catalogues', filename)");
    expect(source).not.toMatch(/publicDirectory\s*=/);
  });
});

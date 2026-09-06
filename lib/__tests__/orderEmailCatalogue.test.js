/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import {
  ORDER_EMAIL_CATALOGUE_CANDIDATES,
  MAX_CATALOGUE_BYTES,
  readOrderEmailCatalogue,
} from '../orderEmailCatalogue';

// Resend caps the whole email (base64-encoded attachments included) at 40 MB.
const RESEND_LIMIT_BYTES = 40 * 1024 * 1024;
const base64Size = (bytes) => Math.ceil(bytes / 3) * 4;

describe('order email catalogue selection', () => {
  test('French uses the October French general catalogue, not the 47 MB September one', () => {
    expect(ORDER_EMAIL_CATALOGUE_CANDIDATES.fr).toEqual([
      'Francais/Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    ]);
  });

  test('every candidate for every language fits Resend\'s 40 MB limit once base64-encoded, with room for the order PDF', () => {
    // 2026-09-05: French order emails all failed with "Email content and
    // attachment exceeded the size limit (40MB)" because the September
    // general catalogue (47.7 MB → 60.6 MB encoded) was attached.
    for (const [lang, candidates] of Object.entries(ORDER_EMAIL_CATALOGUE_CANDIDATES)) {
      for (const rel of candidates) {
        const { size } = fs.statSync(path.join(process.cwd(), 'public', 'catalogues', rel));
        expect({ lang, rel, size }).toEqual(expect.objectContaining({ size: expect.any(Number) }));
        expect(size).toBeLessThanOrEqual(MAX_CATALOGUE_BYTES);
        // 4 MB headroom for the order PDF + HTML body.
        expect(base64Size(size)).toBeLessThan(RESEND_LIMIT_BYTES - 4 * 1024 * 1024);
      }
    }
  });

  test('readOrderEmailCatalogue refuses to attach a file over the size budget instead of bouncing the email', async () => {
    const statSpy = jest.spyOn(fs.promises, 'stat').mockResolvedValue({ size: MAX_CATALOGUE_BYTES + 1 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(readOrderEmailCatalogue('fr')).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds'));
    } finally {
      statSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

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
    ['fr', 'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf'],
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

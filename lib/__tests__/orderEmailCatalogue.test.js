/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import {
  ORDER_EMAIL_CATALOGUE_CANDIDATES,
  MAX_CATALOGUE_BYTES,
  MAX_MESSAGE_BYTES,
  catalogueFitsInMessage,
  encodedSize,
  readOrderEmailCatalogue,
  orderEmailCatalogueUrl,
} from '../orderEmailCatalogue';

// The limits we are actually sending into. Resend's 40 MB is the least of
// them — an email it accepts still has to be let in by the recipient's
// mailbox, and iCloud is the strictest one LoveLab sends to.
const ICLOUD_INBOX_LIMIT = 20 * 1024 * 1024;
const OUTLOOK_INBOX_LIMIT = 25 * 1024 * 1024;
const RESEND_LIMIT_BYTES = 40 * 1024 * 1024;

// A generous order PDF; the real ones are well under this.
const ORDER_PDF_BYTES = 2 * 1024 * 1024;

const emailCopy = (rel) => path.join(process.cwd(), 'public', 'catalogues', 'email', rel);

describe('order email catalogue selection', () => {
  test('French uses the October French general catalogue, not the 47 MB September one', () => {
    expect(ORDER_EMAIL_CATALOGUE_CANDIDATES.fr).toEqual([
      'Francais/Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    ]);
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

  test('every language has a 300 dpi email copy on disk', () => {
    // Built by scripts/build-email-catalogues.mjs. Without it the sender falls
    // back to the print master, which is far too big to attach.
    for (const candidates of Object.values(ORDER_EMAIL_CATALOGUE_CANDIDATES)) {
      for (const rel of candidates) {
        expect(fs.existsSync(emailCopy(rel))).toBe(true);
      }
    }
  });

  // The regression this whole module exists for: on 6 Sep 2026 an order email
  // carrying the 22.6 MB German catalogue (31 MB encoded) was accepted by
  // Resend, delivered to the Google-hosted BCCs, and bounced for the iCloud
  // client with "Message size too large". The client got nothing.
  test.each(Object.entries(ORDER_EMAIL_CATALOGUE_CANDIDATES))(
    'the %s catalogue plus an order PDF clears the strictest recipient mailbox',
    (_lang, candidates) => {
      for (const rel of candidates) {
        const { size } = fs.statSync(emailCopy(rel));
        const message = encodedSize(size + ORDER_PDF_BYTES);

        expect(size).toBeLessThanOrEqual(MAX_CATALOGUE_BYTES);
        expect(message).toBeLessThan(ICLOUD_INBOX_LIMIT);
        expect(message).toBeLessThan(OUTLOOK_INBOX_LIMIT);
        expect(message).toBeLessThan(RESEND_LIMIT_BYTES);
      }
    },
  );

  test('the budget is set by the recipient, not by Resend', () => {
    expect(MAX_MESSAGE_BYTES).toBeLessThan(ICLOUD_INBOX_LIMIT);
  });

  test('encodedSize accounts for base64 inflation', () => {
    expect(encodedSize(3 * 1024 * 1024)).toBeGreaterThan(4 * 1024 * 1024);
  });

  describe('catalogueFitsInMessage', () => {
    test('accepts a re-exported catalogue alongside an order PDF', () => {
      expect(catalogueFitsInMessage(8 * 1024 * 1024, ORDER_PDF_BYTES)).toBe(true);
    });

    test('rejects a print master — the exact case that bounced', () => {
      expect(catalogueFitsInMessage(22.6 * 1024 * 1024, ORDER_PDF_BYTES)).toBe(false);
    });

    test('rejects a catalogue that only fits when the order PDF is ignored', () => {
      // 12 MB encodes to ~16.4 MB — under the 18 MB budget alone, over it once
      // a 2 MB order PDF rides along. Ignoring the order PDF is how a message
      // sneaks over a recipient's limit.
      const catalogue = 12 * 1024 * 1024;
      expect(encodedSize(catalogue)).toBeLessThan(MAX_MESSAGE_BYTES);
      expect(catalogueFitsInMessage(catalogue, ORDER_PDF_BYTES)).toBe(false);
    });
  });

  test.each([
    ['en', 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf'],
    ['de', 'Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf'],
    ['it', 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf'],
    ['nl', 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf'],
    ['unknown', 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf'],
    ['fr', 'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf'],
  ])('%s resolves a real, non-empty PDF named %s', async (language, expectedName) => {
    const result = await readOrderEmailCatalogue(language, { reservedBytes: ORDER_PDF_BYTES });
    expect(result?.filename).toBe(expectedName);
    expect(result?.buffer.length).toBeGreaterThan(1000);
  });

  test('serves the 300 dpi email copy, not the print master', async () => {
    const result = await readOrderEmailCatalogue('de', { reservedBytes: ORDER_PDF_BYTES });
    const rel = ORDER_EMAIL_CATALOGUE_CANDIDATES.de[0];
    expect(result.buffer.length).toBe(fs.statSync(emailCopy(rel)).size);
    expect(result.buffer.length).toBeLessThan(
      fs.statSync(path.join(process.cwd(), 'public', 'catalogues', rel)).size,
    );
  });

  test('returns null rather than attaching something that would bounce', async () => {
    const statSpy = jest.spyOn(fs.promises, 'stat')
      .mockResolvedValue({ size: MAX_CATALOGUE_BYTES + 1 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(readOrderEmailCatalogue('fr')).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('budget'));
    } finally {
      statSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  test('a big order PDF pushes the catalogue out instead of the email out', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // A 15 MB order PDF leaves no room for any catalogue — the confirmation
      // must still go, without one.
      await expect(
        readOrderEmailCatalogue('de', { reservedBytes: 15 * 1024 * 1024 }),
      ).resolves.toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  describe('orderEmailCatalogueUrl', () => {
    test('builds a URL-encoded public link for the language', () => {
      const url = orderEmailCatalogueUrl('de', 'https://b2b-lovelab.com');
      expect(url).toBe(
        'https://b2b-lovelab.com/catalogues/Oct%20DE_LoveLab_B2B_Catalogue%20General%20(210%20x%20210%20mm).pdf',
      );
    });

    test('keeps nested folders encoded segment by segment', () => {
      expect(orderEmailCatalogueUrl('fr', 'https://b2b-lovelab.com'))
        .toContain('/catalogues/Francais/Oct%20FR_');
    });

    test('falls back to English for an unknown language', () => {
      expect(orderEmailCatalogueUrl('pt', 'https://b2b-lovelab.com')).toContain('English/Oct%20EN_');
    });

    test('tolerates a trailing slash on the site URL', () => {
      expect(orderEmailCatalogueUrl('de', 'https://b2b-lovelab.com/'))
        .toBe(orderEmailCatalogueUrl('de', 'https://b2b-lovelab.com'));
    });
  });

  test('keeps the traced filesystem root narrowed to public/catalogues', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/orderEmailCatalogue.js'),
      'utf8',
    );
    expect(source).toContain("path.join(process.cwd(), 'public', 'catalogues', filename)");
    expect(source).toContain("path.join(process.cwd(), 'public', 'catalogues', 'email', filename)");
    expect(source).not.toMatch(/publicDirectory\s*=/);
  });
});

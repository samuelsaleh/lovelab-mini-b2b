import { ALLOWED_RESOURCE_PATH_RE, publicAssetHref } from '../publicAssetHref';

describe('publicAssetHref', () => {
  test('encodes spaces and parentheses per path segment', () => {
    expect(
      publicAssetHref('/catalogues/Francais/Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf'),
    ).toBe('/catalogues/Francais/Sept%20Fr%20LoveLab%20B2B%20Catalogue%20(210%20x%20210%20mm).pdf');
  });

  test('encodes Price Lists and Ean Codes folders', () => {
    expect(publicAssetHref('/Price Lists/Pricelist_LoveLab_2026.pdf')).toBe(
      '/Price%20Lists/Pricelist_LoveLab_2026.pdf',
    );
    expect(publicAssetHref('/Ean Codes/Final-GS1-Code.xlsx')).toBe(
      '/Ean%20Codes/Final-GS1-Code.xlsx',
    );
  });
});

describe('ALLOWED_RESOURCE_PATH_RE', () => {
  test('accepts nested catalogue paths used on the home page', () => {
    expect(ALLOWED_RESOURCE_PATH_RE.test(
      '/catalogues/Francais/Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
    )).toBe(true);
    expect(ALLOWED_RESOURCE_PATH_RE.test(
      '/catalogues/English/EN_LoveLab_B2B_Catalogue.pdf',
    )).toBe(true);
  });

  test('accepts price lists and EAN codes', () => {
    expect(ALLOWED_RESOURCE_PATH_RE.test('/Price Lists/Pricelist_LoveLab_2026.pdf')).toBe(true);
    expect(ALLOWED_RESOURCE_PATH_RE.test('/Ean Codes/Final-GS1-Code.xlsx')).toBe(true);
  });

  test('accepts brand presentation docs', () => {
    expect(ALLOWED_RESOURCE_PATH_RE.test(
      '/BRAND PRESENTATION DOCS/LoveLab_Presentation_Marque_FR.pdf',
    )).toBe(true);
    expect(ALLOWED_RESOURCE_PATH_RE.test(
      '/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf',
    )).toBe(true);
  });

  test('rejects path traversal and unrelated folders', () => {
    expect(ALLOWED_RESOURCE_PATH_RE.test('/catalogues/../.env')).toBe(false);
    expect(ALLOWED_RESOURCE_PATH_RE.test('/secret/file.pdf')).toBe(false);
  });
});

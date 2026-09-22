// Sam, 22 Sep 2026: every agent gets every catalogue, in every language,
// client variants included. The per-email / per-organisation gating that
// used to live here is gone; the signature stays so callers don't change.
export const CATALOGUES = [
  {
    id: 'fr-general-sept',
    label: 'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
    fileName: 'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
    pdf: '/catalogues/Francais/Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHPPy7GKXc/fzRUgvGrbqq5jf1DJ_DcTQ/view?embed',
    audience: 'nicolas',
    language: 'fr',
  },
  {
    id: 'fr-bijorka-sept',
    label: 'Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf',
    fileName: 'Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf',
    pdf: '/catalogues/Francais/Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHPPw_T2xI/Z_Tyy6Lp6OWkBRy1x5dCOg/view?embed',
    audience: 'showroom-accestory',
    language: 'fr',
  },
  {
    id: 'fr-premiere-france-oct',
    label: '_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    fileName: '_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    pdf: '/catalogues/Francais/_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAG8QTSZGDA/00BwwxPy9ZTg_g18XWm9EQ/view?embed',
    audience: 'showroom-accestory',
    language: 'fr',
  },
  {
    id: 'fr-premiere-general-oct',
    label: 'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    fileName: 'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    pdf: '/catalogues/Francais/Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHPP8Z87Jw/ke6GNZN7sohPEteltgMNQw/view?embed',
    audience: 'nicolas',
    language: 'fr',
  },
  {
    id: 'en-oct',
    label: 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    fileName: 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    pdf: '/catalogues/English/Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHPRGqBzAM/SfktKLBglSZg6NRcaJUVPQ/view?embed',
    audience: 'piotr-bastian',
    language: 'en',
  },
  {
    id: 'de-oct',
    label: 'Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    fileName: 'Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    pdf: '/catalogues/Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHPRJuRdEE/1afvONAix_iVpw1g-amYpA/view?embed',
    audience: 'bastian',
    language: 'de',
  },
  {
    id: 'pl-oct',
    label: 'Oct PL_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    fileName: 'Oct PL_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    pdf: '/catalogues/Oct PL_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHQGQ1u494/hPqGe37Hk1ARHkoXuLc6JA/view?embed',
    audience: 'piotr',
    language: 'pl',
  },
  {
    id: 'gr-oct',
    label: 'Oct GR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    fileName: 'Oct GR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    pdf: '/catalogues/Oct GR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHQGQ87t08/QA0XcMNgmBtRNhcIzVlhOA/view?embed',
    audience: 'admin',
    language: 'el',
  },
];

export const CATALOGUE_FILES = CATALOGUES.map(({ fileName, pdf }) => ({
  name: fileName,
  path: pdf,
}));

export function catalogueRelativePath(id) {
  const catalogue = CATALOGUES.find((item) => item.id === id);
  return catalogue?.pdf.replace(/^\/catalogues\//, '') || null;
}

export function getVisibleCatalogues() {
  return CATALOGUES;
}

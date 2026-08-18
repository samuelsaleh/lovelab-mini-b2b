const SHOWROOM_ACCESTORY_ORG_ID = '171e2660-88f9-4677-a346-72d7c71462e9';

const NICOLAS_EMAIL = 'nicolas.vial@ascension-france.com';
const PIOTR_EMAIL = 'piotr.kicinski84@gmail.com';
const BASTIAN_EMAIL = 'bastianmeyer319@hotmail.com';

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

export function getVisibleCatalogues({
  isAdmin = false,
  userEmail = '',
  organizationId = '',
} = {}) {
  if (isAdmin) return CATALOGUES;

  const email = String(userEmail || '').trim().toLowerCase();
  const isShowroomAccestory = organizationId === SHOWROOM_ACCESTORY_ORG_ID;

  return CATALOGUES.filter((catalogue) => {
    switch (catalogue.audience) {
      case 'nicolas':
        return email === NICOLAS_EMAIL;
      case 'showroom-accestory':
        return isShowroomAccestory;
      case 'piotr-bastian':
        return email === PIOTR_EMAIL || email === BASTIAN_EMAIL;
      case 'piotr':
        return email === PIOTR_EMAIL;
      case 'bastian':
        return email === BASTIAN_EMAIL;
      default:
        return false;
    }
  });
}

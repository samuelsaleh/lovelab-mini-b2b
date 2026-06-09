// Centralized list of B2B downloadable resources — used by:
//   - ResourcesCard on the home page (browse / send-to-self / email-to-client)
//   - Fair Assistant Outreach tab (attach to fair follow-up emails)
//
// `path` is relative to the deployed site root (i.e. files live under /public).
// `name` is the human-readable filename used as the email attachment label.

export const CATALOGUE_FILES = [
  { name: 'FR — LoveLab B2B Catalogue.pdf', path: '/catalogues/_FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf' },
  { name: 'EN — LoveLab B2B Catalogue.pdf', path: '/catalogues/EN_LoveLab_B2B_Catalogue.pdf' },
  { name: 'DE — LoveLab B2B Catalogue.pdf', path: '/catalogues/DE_LoveLab_B2B_Catalogue.pdf' },
];

// Pack order templates are no longer static files. They are generated per pack
// and served from /api/pack-templates (see lib/packTemplates.js). Consumers
// fetch the live list and fill the `packs` group below at runtime. Pack
// attachments resolve server-side via packTemplateIdFromPath + resolvePackTemplate.

export const PRICE_LIST_FILES = [
  { name: 'Pricelist_LoveLab_2025.pdf', path: '/Price Lists/Pricelist_LoveLab_2025.pdf' },
  { name: 'Pricelist_LoveLab_2026.pdf', path: '/Price Lists/Pricelist_LoveLab_2026.pdf' },
];

export const EAN_FILES = [
  { name: 'Final-GS1-Code.xlsx', path: '/Ean Codes/Final-GS1-Code.xlsx' },
];

/**
 * Grouped list for the Fair Assistant picker. The `packs` group ships empty and
 * is filled at runtime from GET /api/pack-templates (dynamic, live-named).
 */
export const B2B_RESOURCE_GROUPS = [
  { id: 'catalogues', label: 'Catalogues',   files: CATALOGUE_FILES },
  { id: 'packs',      label: 'Order Packs',  files: [] },
  { id: 'pricelists', label: 'Price Lists',  files: PRICE_LIST_FILES },
  { id: 'ean',        label: 'EAN / GS1',    files: EAN_FILES },
];

/**
 * Flat lookup by path — used by the send route to materialize STATIC
 * attachments. Pack templates are NOT here; they resolve via
 * packTemplateIdFromPath + resolvePackTemplate in lib/packTemplates.js.
 */
export const ALL_B2B_FILES = [
  ...CATALOGUE_FILES,
  ...PRICE_LIST_FILES,
  ...EAN_FILES,
];

export function findB2BFileByPath(path) {
  return ALL_B2B_FILES.find((f) => f.path === path) || null;
}

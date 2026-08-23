/**
 * Analytics name merges. Orders store messy labels (ISO codes, DE/FR colour
 * names, the same client typed three ways). Dashboard + Claude tools share
 * these maps so a slice and a table cannot disagree.
 */

export const CLIENT_ALIASES = {
  // Same buying group — Sam: merge DE / Stage / FR's Friends into one client.
  stage: 'Friends',
  'the stage': 'Friends',
  "fr's friends": 'Friends',
  'frs friends': 'Friends',
  'fr friends': 'Friends',
  'friends fr': 'Friends',
  'friends france': 'Friends',
  friends: 'Friends',
  de: 'Friends',
  'de friends': 'Friends',
  'friends de': 'Friends',
  'friends germany': 'Friends',
  "de's friends": 'Friends',
  'des friends': 'Friends',
}

/**
 * Thread-colour nicknames (German, French, typos). Values are English / catalog
 * spellings; buildColorBreakdown still snaps onto the active palette after this.
 */
export const CORD_COLOR_ALIASES = {
  stage: 'Sage',
  sage: 'Sage',
  // German
  rot: 'Red',
  schwarz: 'Black',
  weiss: 'White',
  weiß: 'White',
  gruen: 'Green',
  grün: 'Green',
  grau: 'Grey',
  silber: 'Silver Grey',
  silbergrau: 'Silver Grey',
  'silber grau': 'Silver Grey',
  rosa: 'Pink',
  gelb: 'Yellow',
  orange: 'Orange',
  braun: 'Brown',
  lila: 'Lila',
  lavendel: 'Lavendel',
  bordeaux: 'Bordeaux',
  gold: 'Gold',
  elfenbein: 'Ivory',
  marine: 'Navy Blue',
  marineblau: 'Navy Blue',
  'marine blau': 'Navy Blue',
  royalblau: 'Royal Blue',
  'royal blau': 'Royal Blue',
  tuerkis: 'Turquoise',
  türkis: 'Turquoise',
  // French
  rouge: 'Red',
  noir: 'Black',
  blanc: 'White',
  vert: 'Green',
  gris: 'Grey',
  'gris argent': 'Silver Grey',
  'gris argente': 'Silver Grey',
  'gris argenté': 'Silver Grey',
  rose: 'Pink',
  'rose bebe': 'Baby pink',
  'rose bébé': 'Baby pink',
  'baby pink': 'Baby pink',
  jaune: 'Yellow',
  marron: 'Brown',
  brun: 'Brown',
  violet: 'Purple',
  ivoire: 'Ivory',
  champagne: 'Champagne',
  'bleu marine': 'Navy Blue',
  'bleu royal': 'Royal Blue',
  turquoise: 'Turquoise',
}

function aliasKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
}

export function resolveClientName(raw) {
  const trimmed = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return { key: 'unknown', name: 'Unknown' }
  const aliased = CLIENT_ALIASES[aliasKey(trimmed)]
  const name = aliased || trimmed
  return { key: name.toLowerCase(), name }
}

export function clientNameFromDoc(d) {
  return resolveClientName(d?.client_company || d?.client_name || '')
}

export function aliasCordColorName(name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return ''
  return CORD_COLOR_ALIASES[aliasKey(trimmed)] || trimmed
}

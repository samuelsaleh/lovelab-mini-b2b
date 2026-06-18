import manifest from './packshot-manifest.json'

// Necklace collections reuse their bracelet counterpart's packshots until
// dedicated necklace photography exists. Resolve the alias before any manifest
// lookup so findPackshot / getCollectionImages transparently serve the bracelet
// images for a necklace id.
const PACKSHOT_ALIAS = {
  CUTY_NECK: 'CUTY',
  M3_NECK: 'M3',
  M4_NECK: 'M4',
}

function resolveCollectionId(collectionId) {
  return PACKSHOT_ALIAS[collectionId] || collectionId
}

const HOUSING_ALIASES = {
  White: 'WG', Yellow: 'YG', Pink: 'RG',
  WWW: 'WG', YYY: 'YG', PPP: 'RG', YWP: 'MIX',
}

// New collections (Moonlight / Sienna / Iconix) use the CUTY-style shiny names
// (Yellow / White / Pink) PLUS five matte finishes. The shiny names alias to
// YG/WG/RG exactly like every other collection, but the matte tiles are their
// own canonical values — they must NOT be collapsed to WG/YG/RG by the
// substring rules below, otherwise e.g. "White" and "White Matte" would resolve
// to the same image. They are passed through verbatim so the matte manifest
// entries match the catalog tile exactly.
const MATTE_HOUSING_TILES = new Set([
  'Yellow Matte', 'White Matte', 'Pink Matte', 'Gray Matte', 'Black Matte',
])

// When a color has no packshot, fall back to the closest visually similar one
// so users still see a relevant preview. Order matters: first available wins.
const COLOR_FALLBACKS = {
  'Royal Blue': ['Navy Blue', 'Light Blue', 'Turq Blue', 'Turquoise', 'Jeans Blue'],
  'Royal blue': ['Navy Blue', 'Light Blue', 'Turq Blue', 'Turquoise', 'Jeans Blue'],
}

function normalizeHousing(raw) {
  if (!raw) return null
  const trimmed = raw.trim()
  // Matte tiles are canonical — return verbatim so a matte finish never aliases
  // onto its shiny counterpart (or another metal).
  if (MATTE_HOUSING_TILES.has(trimmed)) return trimmed
  if (['WG', 'YG', 'RG', 'MIX'].includes(trimmed)) return trimmed
  if (HOUSING_ALIASES[trimmed]) return HOUSING_ALIASES[trimmed]
  const lower = trimmed.toLowerCase()
  if (lower.includes('white')) return 'WG'
  if (lower.includes('yellow')) return 'YG'
  if (lower.includes('rose') || lower.includes('pink')) return 'RG'
  return null
}

/**
 * Find the best matching packshot image URL.
 *
 * @param {string} collectionId - catalog collection id (CUTY, M3, MF, SSF, etc.)
 * @param {object} opts
 * @param {string} [opts.housing] - housing value from catalog (White, Yellow, WG, YG, etc.)
 * @param {string} [opts.color] - cord color name (Gold, Black, etc.)
 * @param {string} [opts.shape] - shape name for Matchy/Shapy (Heart, Pear, etc.)
 * @param {string} [opts.subgroup] - Bezel/Prong for Matchy/Shapy, Attached/Detached for M3
 * @returns {string|null} URL path or null
 */
export function findPackshot(collectionId, opts = {}) {
  const images = manifest[resolveCollectionId(collectionId)]
  if (!images || images.length === 0) return null

  const h = normalizeHousing(opts.housing)
  const color = opts.color || null
  const shape = opts.shape || null
  const subgroup = opts.subgroup || null

  let candidates = images

  if (shape) {
    const byShape = candidates.filter(img => img.shape && img.shape.toLowerCase() === shape.toLowerCase())
    if (byShape.length > 0) candidates = byShape
  }

  if (subgroup) {
    const bySub = candidates.filter(img => img.subgroup && img.subgroup.toLowerCase() === subgroup.toLowerCase())
    if (bySub.length > 0) candidates = bySub
  }

  if (h) {
    const byHousing = candidates.filter(img => normalizeHousing(img.housing) === h)
    if (byHousing.length > 0) candidates = byHousing
  }

  if (color) {
    const colorLower = color.toLowerCase()
    const byColor = candidates.filter(img => img.color && img.color.toLowerCase() === colorLower)
    if (byColor.length > 0) return byColor[0].url

    // Fallback to a visually similar color when the requested color has no packshot yet
    const fallbacks = COLOR_FALLBACKS[color] || []
    for (const fallback of fallbacks) {
      const fallbackLower = fallback.toLowerCase()
      const byFallback = candidates.filter(img => img.color && img.color.toLowerCase() === fallbackLower)
      if (byFallback.length > 0) return byFallback[0].url
    }
  }

  return candidates.length > 0 ? candidates[0].url : null
}

/**
 * Get all images for a collection, optionally filtered.
 */
export function getCollectionImages(collectionId, opts = {}) {
  const images = manifest[resolveCollectionId(collectionId)]
  if (!images) return []

  let result = [...images]
  const h = normalizeHousing(opts.housing)
  const shape = opts.shape || null
  const subgroup = opts.subgroup || null

  if (shape) {
    result = result.filter(img => img.shape && img.shape.toLowerCase() === shape.toLowerCase())
  }
  if (subgroup) {
    result = result.filter(img => img.subgroup && img.subgroup.toLowerCase() === subgroup.toLowerCase())
  }
  if (h) {
    result = result.filter(img => normalizeHousing(img.housing) === h)
  }

  return result
}

/**
 * Get available filter options for a collection.
 */
export function getCollectionFilters(collectionId) {
  const images = manifest[collectionId]
  if (!images) return { housings: [], shapes: [], subgroups: [] }

  const housings = [...new Set(images.map(i => i.housing).filter(Boolean))]
  const shapes = [...new Set(images.map(i => i.shape).filter(Boolean))]
  const subgroups = [...new Set(images.map(i => i.subgroup).filter(Boolean))]

  return { housings, shapes, subgroups }
}

export function getAllCollectionIds() {
  return Object.keys(manifest)
}

const COLLECTION_LABELS = {
  CUTY: 'CUTY', CUBIX: 'CUBIX',
  CUTY_NECK: 'CUTY NECKLACE', M3_NECK: 'MULTI THREE NECKLACE', M4_NECK: 'MULTI FOUR NECKLACE',
  M3: 'MULTI THREE', M4: 'MULTI FOUR', M5: 'MULTI FIVE',
  MF: 'MATCHY', SSF: 'SHAPY SHINE', SSPF: 'SHAPY SPARKLE',
  // 2026 new collections
  MFM: 'Original Moonlight', MNO: 'Long Moonlight', MNH: 'Multi Moonlight',
  SI1: 'Sienna One', SI2P: 'Sienna Two', SI3: 'Sienna Three',
  SI4: 'Sienna Four', SI5: 'Sienna Five',
  ZAHA: 'Za-Ha', LUVA: 'Flower Heart', LUMA: 'Flower Marquise',
  RIV4: 'Riviera Four', RIV8: 'Riviera Eight',
  LIN3: 'Linea Three', LIN5: 'Linea Five',
}

export function getCollectionLabel(id) {
  return COLLECTION_LABELS[id] || id
}

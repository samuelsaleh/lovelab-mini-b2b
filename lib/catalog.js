// ─── HOUSING OPTIONS ───
export const HOUSING = {
  standard: ['Yellow', 'White', 'Pink'],
  goldMetal: ['White', 'Yellow', 'Pink'],
  goldMetalNoRose: ['White', 'Yellow'],
  multiThree: {
    attached: ['WWW', 'YYY', 'PPP'],
    notAttached: ['WWW', 'YYY', 'PPP', 'YWP'],
  },
  matchy: {
    bezel: [
      { id: 'white-white', label: 'WW' },
      { id: 'yellow-yellow', label: 'YY' },
      { id: 'pink-pink', label: 'PP' },
      { id: 'white-yellow', label: 'WY' },
      { id: 'white-pink', label: 'WP' },
      { id: 'yellow-pink', label: 'YP' },
    ],
    prong: [
      { id: 'white', label: 'White' },
      { id: 'yellow', label: 'Yellow' },
      { id: 'pink', label: 'Pink' },
    ],
  },
  // Keep flat aliases for backward compatibility
  matchyBezel: [
    { id: 'white-white', label: 'WW' },
    { id: 'yellow-yellow', label: 'YY' },
    { id: 'pink-pink', label: 'PP' },
    { id: 'white-yellow', label: 'WY' },
    { id: 'white-pink', label: 'WP' },
    { id: 'yellow-pink', label: 'YP' },
  ],
  matchyProng: [
    { id: 'white', label: 'White' },
    { id: 'yellow', label: 'Yellow' },
    { id: 'pink', label: 'Pink' },
  ],
  shapyShine: {
    bezel: ['Yellow', 'White', 'Pink'],
    prong: ['Yellow', 'White', 'Pink'],
  },
  // Keep flat aliases for backward compatibility
  shapyShineBezel: ['Yellow', 'White', 'Pink'],
  shapyShineProng: ['Yellow', 'White', 'Pink'],
  sparkleProng: ['Prong'],
  // New collections (Moonlight, Sienna, Iconix): housing is a single combined
  // metal + finish tile (no separate shiny/matte selector). Names follow the
  // existing CUTY convention — shiny golds are just 'Yellow' / 'White' / 'Pink'
  // (pink = rose gold), and the matte finishes append ' Matte'. Order matters:
  // the first entry ('Yellow') is the default shown.
  // metalEight = 3 shiny golds + 5 mattes (Moonlight + Sienna).
  metalEight: [
    'Yellow', 'White', 'Pink',
    'Yellow Matte', 'White Matte', 'Pink Matte', 'Gray Matte', 'Black Matte',
  ],
  // metalThree = the 3 shiny golds only (Iconix / Special Pieces).
  metalThree: ['Yellow', 'White', 'Pink'],
}

// ─── COLLECTIONS ───
// Size options by bracelet type
export const SIZES_NYLON = ['XS', 'S', 'M', 'L', 'XL']
export const SIZES_SILK = ['S/M', 'L/XL']

// Necklace sizes. Same two grouped buckets as silk bracelets, but with their
// own measurement metadata (worn length + maximum opening) so the quote and
// order form can surface the centimetres next to the size.
export const SIZES_NECKLACE = ['S/M', 'L/XL']
export const NECKLACE_SIZE_INFO = {
  'S/M': { normalCm: 22, maxCm: 62 },
  'L/XL': { normalCm: 24, maxCm: 64 },
}

// Human-readable measurement hint for a necklace size, e.g.
// "S/M — 22 cm (max 62 cm)". Returns '' for non-necklace sizes.
export function necklaceSizeLabel(size) {
  const info = NECKLACE_SIZE_INFO[size]
  if (!info) return ''
  return `${size} — ${info.normalCm} cm (max ${info.maxCm} cm)`
}

// Size label for display in pickers. Necklaces surface the centimetre info;
// every other product (including silk bracelets that reuse the S/M, L/XL
// labels) just shows the plain size so the necklace measurements never leak
// onto a bracelet.
export function sizeDisplayLabel(col, size) {
  if (getProductType(col) === 'necklace') {
    const lbl = necklaceSizeLabel(size)
    if (lbl) return lbl
  }
  return size
}

// ─── PRODUCT TYPE ───
// Every collection is either a bracelet (default) or a necklace. Existing
// collections omit the field and are treated as bracelets; the necklace
// collections set productType: 'necklace' explicitly.
export const PRODUCT_TYPES = { BRACELET: 'bracelet', NECKLACE: 'necklace' }

export function getProductType(col) {
  return col?.productType || 'bracelet'
}

// Filter a collection list down to one product type. Treats a missing
// productType as 'bracelet' so legacy entries keep showing under Bracelets.
export function getCollectionsByType(cols, type) {
  const want = type || 'bracelet'
  return (cols || []).filter((c) => getProductType(c) === want)
}

// Closure-driven size options for the nylon bracelet-thread collections (CUTY,
// CUBIX, MULTI THREE/FOUR/FIVE, MATCHY FANCY, SHAPY SHINE FANCY, HOLY — every
// bracelet that opts in via `hasClosure`). Braided bracelets ship in the
// collection's regular individual sizes; non-braided bracelets only come in the
// grouped silk sizes (S/M, L/XL). Collections without `hasClosure` (silk
// bracelets, necklaces) are unaffected and always return col.sizes.
export function sizeOptionsForClosure(col, closureType) {
  if (!col?.sizes) return []
  if (col.hasClosure && closureType === 'nonBraided') return SIZES_SILK
  return col.sizes
}

// The new silk collections (Sienna, Iconix) only ship in a single (Thin) silk
// thickness — no Thick option. Collections without a `thicknessOptions` field
// keep the default Thin/Thick choice.
export const THIN_ONLY = ['Thin']

// Allowed silk thicknesses for a collection (defaults to both Thin and Thick).
export function getThicknessOptions(col) {
  return Array.isArray(col?.thicknessOptions) && col.thicknessOptions.length > 0
    ? col.thicknessOptions
    : ['Thin', 'Thick']
}

// Shape options by collection family
export const SHAPES_HOLY = ['Cross', 'Hamsa', 'Star of David', 'Greek Cross']
export const SHAPES_MATCHY = ['Pear', 'Heart', 'Emerald']
export const SHAPES_SHAPY_SHINE = ['Heart', 'Pear', 'Marquise', 'Oval', 'Emerald', 'Cushion', 'Long Cushion']
export const SHAPES_SHAPY_SPARKLE = ['Round', 'Pear', 'Oval', 'Heart', 'Princess', 'Cushion', 'Marquise', 'Emerald', 'Long Cushion']

// Certificate types: 'igi' | 'inhouse' | 'both'
// When 'both', prices/retail.<year> are objects { igi: [...], inhouse: [...] } with null for unavailable carats.
// When single type, prices/retail.<year> are objects with only that key.
export const CERT_TYPES = { IGI: 'igi', INHOUSE: 'inhouse' }
export const CERT_LABELS = { igi: 'IGI', inhouse: 'In-house' }

// ─── PRICE LISTS ───
// Each collection's `prices` and `retail` fields are keyed by pricelist year.
// 2025 is the legacy list (kept available for 6 months for old clients still on
// the previous pricing). 2026 is the current list and the default for new orders.
// See public/Price Lists/Pricelist_LoveLab_{2025,2026}.pdf for the source of truth.
export const PRICELISTS = ['2025', '2026']
export const DEFAULT_PRICELIST = '2026'
export const PRICELIST_LABELS = {
  '2025': '2025 prices',
  '2026': '2026 prices',
}

export const COLLECTIONS = [
  { id: 'CUTY', label: 'CUTY', carats: ['0.05', '0.10', '0.20', '0.30'], certificate: 'both',
    prices: {
      '2025': { igi: [30, 40, 65, 90],  inhouse: [20, 30, null, null] },
      '2026': { igi: [30, 40, 70, 100], inhouse: [24, 34, null, null] },
    },
    retail: {
      '2025': { igi: [105, 155, 315, 430], inhouse: [95, 145, null, null] },
      // 2026 PDF: CUTY in-house B2C is €75 (0.05) / €120 (0.10).
      '2026': { igi: [105, 155, 315, 430], inhouse: [75, 120, null, null] },
    },
    minC: 3, cord: 'nylon', housing: 'standard', sizes: SIZES_NYLON, hasClosure: true },
  { id: 'CUBIX', label: 'CUBIX', carats: ['0.05', '0.10', '0.20'], certificate: 'both',
    prices: {
      '2025': { igi: [30, 40, 70], inhouse: [24, 34, null] },
      '2026': { igi: [30, 40, 70], inhouse: [24, 34, null] },
    },
    retail: {
      // CUBIX IGI B2C numbers per the 2025 + 2026 PDFs (both identical).
      // Pre-existing catalog had IGI 0.05 at €105 — wrong. Fixed to €120.
      '2025': { igi: [120, 155, 340], inhouse: [95, 145, null] },
      '2026': { igi: [120, 155, 340], inhouse: [95, 145, null] },
    },
    minC: 3, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_SILK, hasClosure: true },
  { id: 'M3', label: 'MULTI THREE', carats: ['0.15', '0.30', '0.60', '0.90'], certificate: 'igi',
    prices: {
      '2025': { igi: [55, 85, 165, 240] },
      '2026': { igi: [65, 95, 175, 250] },
    },
    retail: {
      '2025': { igi: [260, 400, 800, 1150] },
      '2026': { igi: [260, 400, 800, 1150] },
    },
    minC: 2, cord: 'nylon', housing: 'multiThree', sizes: SIZES_NYLON, hasClosure: true,
    allowedColors: ['Bordeaux', 'Red', 'Gold', 'Silver Grey', 'Black', 'Navy Blue', 'Royal Blue'] },
  { id: 'M4', label: 'MULTI FOUR', carats: ['0.20', '0.40'], certificate: 'igi',
    prices: {
      '2025': { igi: [75, 100] },
      '2026': { igi: [85, 110] },
    },
    retail: {
      '2025': { igi: [360, 500] },
      '2026': { igi: [360, 500] },
    },
    minC: 2, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_NYLON, hasClosure: true,
    allowedColors: ['Bordeaux', 'Red', 'Gold', 'Silver Grey', 'Black', 'Navy Blue', 'Royal Blue'] },
  { id: 'M5', label: 'MULTI FIVE', carats: ['0.25', '0.50'], certificate: 'igi',
    prices: {
      '2025': { igi: [85, 120] },
      '2026': { igi: [95, 130] },
    },
    retail: {
      '2025': { igi: [400, 580] },
      '2026': { igi: [400, 580] },
    },
    minC: 2, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_NYLON, hasClosure: true,
    allowedColors: ['Bordeaux', 'Red', 'Gold', 'Silver Grey', 'Black', 'Navy Blue', 'Royal Blue'] },
  { id: 'MF', label: 'MATCHY FANCY', carats: ['0.60', '1.00'], certificate: 'igi',
    prices: {
      '2025': { igi: [180, 290] },
      '2026': { igi: [200, 310] },
    },
    retail: {
      '2025': { igi: [550, 885] },
      '2026': { igi: [550, 885] },
    },
    minC: 2, cord: 'nylon', housing: 'matchy', shapes: SHAPES_MATCHY, sizes: SIZES_NYLON, hasClosure: true },
  { id: 'SSF', label: 'SHAPY SHINE FANCY', carats: ['0.10', '0.30', '0.50'], certificate: 'igi',
    prices: {
      '2025': { igi: [50, 90, 145] },
      '2026': { igi: [55, 100, 155] },
    },
    retail: {
      '2025': { igi: [180, 330, 450] },
      '2026': { igi: [180, 330, 450] },
    },
    minC: 2, cord: 'shine', housing: 'shapyShine', shapes: SHAPES_SHAPY_SHINE, sizes: SIZES_NYLON, hasClosure: true },
  { id: 'SSPF', label: 'SHAPY SPARKLE FANCY', carats: ['0.70', '1.00'], certificate: 'igi',
    prices: {
      '2025': { igi: [225, 300] },
      '2026': { igi: [240, 325] },
    },
    retail: {
      '2025': { igi: [550, 850] },
      '2026': { igi: [550, 850] },
    },
    minC: 2, cord: 'silk', housing: 'sparkleProng', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_SILK },
  // Both Shapy Sparkle Round variants ship on silk only, like Shapy Sparkle
  // Fancy — they were modelled as silk-or-braided-nylon by mistake, which left
  // the order form's MATERIAL cell undecided (Sam, 2026-08-10).
  { id: 'SSRG', label: 'SHAPY SPARKLE RND G/H', carats: ['0.50', '0.70', '1.00'], certificate: 'inhouse',
    prices: {
      '2025': { inhouse: [115, 145, 205] },
      '2026': { inhouse: [125, 165, 225] },
    },
    retail: {
      '2025': { inhouse: [290, 360, 500] },
      '2026': { inhouse: [290, 360, 500] },
    },
    minC: 2, cord: 'silk', housing: 'sparkleProng', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_SILK },
  { id: 'SSRD', label: 'SHAPY SPARKLE RND D VVS', carats: ['0.50', '0.70', '1.00'], certificate: 'igi',
    prices: {
      '2025': { igi: [180, 200, 285] },
      '2026': { igi: [200, 220, 305] },
    },
    retail: {
      '2025': { igi: [550, 650, 850] },
      '2026': { igi: [550, 650, 850] },
    },
    minC: 2, cord: 'silk', housing: 'sparkleProng', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_SILK },
  // HOLY is not in either 2025 or 2026 PDF — kept at current values for both
  // pricelists (per Sam's product-team confirmation).
  { id: 'HOLY', label: 'HOLY (D VVS)', carats: ['0.50', '0.70', '1.00'], certificate: 'igi',
    prices: {
      '2025': { igi: [260, 425, 550] },
      '2026': { igi: [260, 425, 550] },
    },
    retail: {
      '2025': { igi: [650, 1000, 1325] },
      '2026': { igi: [650, 1000, 1325] },
    },
    minC: 2, cord: 'nylon', housing: 'standard', shapes: SHAPES_HOLY, sizes: SIZES_NYLON, hasClosure: true },

  // ─── 2026 NEW COLLECTIONS: MOONLIGHT / SIENNA / ICONIX ───
  // Prices are the single source of truth from moonlightcoollection_25052026.xlsx
  // (B2B = col G, B2C = col H), identical across housing/finish/cord/size.
  // All IGI / 925 silver. 2025 and 2026 buckets are intentionally identical
  // (these products did not exist on the 2025 list). Cord palette is restricted
  // Cord palette via allowedColors — note the casing differs between nylon
  // ('Silver Grey') and silk ('Silver grey') to match each CORD_COLORS palette
  // exactly. Gold thread was removed for Moonlight / Sienna / Za-Ha (Sam,
  // July 2026) — Iconix / Linea still offer Gold.

  // MOONLIGHT — nylon, 8 housing tiles (3 gold shiny + 5 matte)
  { id: 'MFM', label: 'Original Moonlight', carats: ['0.10', '0.30', '0.50', '0.70', '1'], certificate: 'igi',
    prices: {
      '2025': { igi: [56, 105, 225, 300, 400] },
      '2026': { igi: [56, 105, 225, 300, 400] },
    },
    retail: {
      '2025': { igi: [170, 315, 675, 900, 1200] },
      '2026': { igi: [170, 315, 675, 900, 1200] },
    },
    minC: 2, cord: 'nylon', housing: 'metalEight', sizes: SIZES_NYLON,
    allowedColors: ['Silver Grey', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'MNO', label: 'Long Moonlight', carats: ['0.05', '0.10', '0.20', '0.30'], certificate: 'igi',
    prices: {
      '2025': { igi: [56, 68, 82, 105] },
      '2026': { igi: [56, 68, 82, 105] },
    },
    retail: {
      '2025': { igi: [170, 205, 245, 315] },
      '2026': { igi: [170, 205, 245, 315] },
    },
    minC: 2, cord: 'nylon', housing: 'metalEight', sizes: SIZES_NYLON,
    allowedColors: ['Silver Grey', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'MNH', label: 'Multi Moonlight', carats: ['0.15', '0.20', '0.30', '0.40'], certificate: 'igi',
    prices: {
      '2025': { igi: [68, 75, 86, 130] },
      '2026': { igi: [68, 75, 86, 130] },
    },
    retail: {
      '2025': { igi: [205, 215, 260, 390] },
      '2026': { igi: [205, 215, 260, 390] },
    },
    minC: 2, cord: 'nylon', housing: 'metalEight', sizes: SIZES_NYLON,
    allowedColors: ['Silver Grey', 'Black', 'Bordeaux', 'Brown'] },

  // SIENNA — silk, 8 housing tiles (3 gold shiny + 5 matte)
  { id: 'SI1', label: 'Sienna One', carats: ['0.10', '0.20', '0.30'], certificate: 'igi',
    prices: {
      '2025': { igi: [105, 130, 150] },
      '2026': { igi: [105, 130, 150] },
    },
    retail: {
      '2025': { igi: [315, 390, 450] },
      '2026': { igi: [315, 390, 450] },
    },
    minC: 2, cord: 'silk', housing: 'metalEight', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'SI2P', label: 'Sienna Two', carats: ['0.20'], certificate: 'igi',
    prices: {
      '2025': { igi: [120] },
      '2026': { igi: [120] },
    },
    retail: {
      '2025': { igi: [360] },
      '2026': { igi: [360] },
    },
    minC: 2, cord: 'silk', housing: 'metalEight', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'SI3', label: 'Sienna Three', carats: ['0.15', '0.30'], certificate: 'igi',
    prices: {
      '2025': { igi: [65, 120] },
      '2026': { igi: [65, 120] },
    },
    retail: {
      '2025': { igi: [195, 360] },
      '2026': { igi: [195, 360] },
    },
    minC: 2, cord: 'silk', housing: 'metalEight', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'SI4', label: 'Sienna Four', carats: ['0.20', '0.40'], certificate: 'igi',
    prices: {
      '2025': { igi: [80, 150] },
      '2026': { igi: [80, 150] },
    },
    retail: {
      '2025': { igi: [240, 450] },
      '2026': { igi: [240, 450] },
    },
    minC: 2, cord: 'silk', housing: 'metalEight', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'SI5', label: 'Sienna Five', carats: ['0.25', '0.50'], certificate: 'igi',
    prices: {
      '2025': { igi: [95, 170] },
      '2026': { igi: [95, 170] },
    },
    retail: {
      '2025': { igi: [285, 510] },
      '2026': { igi: [285, 510] },
    },
    minC: 2, cord: 'silk', housing: 'metalEight', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Black', 'Bordeaux', 'Brown'] },

  // ICONIX / SPECIAL PIECES — 3 housing tiles (gold shiny only)
  // Silk pieces:
  { id: 'ZAHA', label: 'Za-Ha', carats: ['0.30'], certificate: 'igi',
    prices: {
      '2025': { igi: [110] },
      '2026': { igi: [110] },
    },
    retail: {
      '2025': { igi: [330] },
      '2026': { igi: [330] },
    },
    minC: 2, cord: 'silk', housing: 'metalThree', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'LUVA', label: 'Flower Heart', carats: ['0.40'], certificate: 'igi',
    // B2B rounded per the official 2026 PDF (2026-07-19): 149.50 → 150.
    prices: {
      '2025': { igi: [150] },
      '2026': { igi: [150] },
    },
    retail: {
      '2025': { igi: [450] },
      '2026': { igi: [450] },
    },
    minC: 2, cord: 'silk', housing: 'metalThree', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Gold', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'LUMA', label: 'Flower Marquise', carats: ['0.40'], certificate: 'igi',
    prices: {
      '2025': { igi: [130] },
      '2026': { igi: [130] },
    },
    retail: {
      '2025': { igi: [380] },
      '2026': { igi: [380] },
    },
    minC: 2, cord: 'silk', housing: 'metalThree', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Gold', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'RIV4', label: 'Riviera Four', carats: ['0.20', '0.40'], certificate: 'igi',
    prices: {
      '2025': { igi: [90, 115] },
      '2026': { igi: [90, 115] },
    },
    retail: {
      '2025': { igi: [270, 345] },
      '2026': { igi: [270, 345] },
    },
    minC: 2, cord: 'silk', housing: 'metalThree', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Gold', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'RIV8', label: 'Riviera Eight', carats: ['0.40', '0.80'], certificate: 'igi',
    // B2B corrected per the official 2026 PDF (2026-07-19): 130/175 → 115/150.
    prices: {
      '2025': { igi: [115, 150] },
      '2026': { igi: [115, 150] },
    },
    retail: {
      '2025': { igi: [400, 520] },
      '2026': { igi: [400, 520] },
    },
    minC: 2, cord: 'silk', housing: 'metalThree', sizes: SIZES_SILK, thicknessOptions: THIN_ONLY,
    allowedColors: ['Silver grey', 'Gold', 'Black', 'Bordeaux', 'Brown'] },
  // Linea pieces — nylon:
  { id: 'LIN3', label: 'Linea Three', carats: ['0.30'], certificate: 'igi',
    prices: {
      '2025': { igi: [115] },
      '2026': { igi: [115] },
    },
    retail: {
      '2025': { igi: [345] },
      '2026': { igi: [345] },
    },
    minC: 2, cord: 'nylon', housing: 'metalThree', sizes: SIZES_NYLON,
    allowedColors: ['Silver Grey', 'Gold', 'Black', 'Bordeaux', 'Brown'] },
  { id: 'LIN5', label: 'Linea Five', carats: ['0.50'], certificate: 'igi',
    prices: {
      '2025': { igi: [175] },
      '2026': { igi: [175] },
    },
    retail: {
      '2025': { igi: [520] },
      '2026': { igi: [520] },
    },
    minC: 2, cord: 'nylon', housing: 'metalThree', sizes: SIZES_NYLON,
    allowedColors: ['Silver Grey', 'Gold', 'Black', 'Bordeaux', 'Brown'] },

  // ─── NECKLACES ───
  // IGI-only necklace versions of CUTY / MULTI THREE / MULTI FOUR. They reuse
  // the bracelet housing options, packshots (via aliasing in packshot-lookup),
  // and the attached/detached behaviour (Multi Three only). Prices are flat
  // across both sizes and identical for 2025/2026 (new products). Sizes are the
  // grouped S/M and L/XL necklace buckets (see NECKLACE_SIZE_INFO for cm).
  { id: 'CUTY_NECK', label: 'CUTY NECKLACE', productType: 'necklace', carats: ['0.10', '0.20', '0.30'], certificate: 'igi',
    prices: {
      '2025': { igi: [50, 88, 125] },
      '2026': { igi: [50, 88, 125] },
    },
    retail: {
      '2025': { igi: [195, 395, 540] },
      '2026': { igi: [195, 395, 540] },
    },
    minC: 3, cord: 'nylon', housing: 'standard', sizes: SIZES_NECKLACE },
  { id: 'M3_NECK', label: 'MULTI THREE NECKLACE', productType: 'necklace', carats: ['0.15', '0.30', '0.60'], certificate: 'igi',
    prices: {
      '2025': { igi: [81, 119, 219] },
      '2026': { igi: [81, 119, 219] },
    },
    retail: {
      '2025': { igi: [325, 500, 1000] },
      '2026': { igi: [325, 500, 1000] },
    },
    minC: 2, cord: 'nylon', housing: 'multiThree', sizes: SIZES_NECKLACE,
    allowedColors: ['Silver Grey', 'Gold', 'Bordeaux', 'Red', 'Black', 'Navy Blue'] },
  { id: 'M4_NECK', label: 'MULTI FOUR NECKLACE', productType: 'necklace', carats: ['0.20', '0.40'], certificate: 'igi',
    prices: {
      '2025': { igi: [106, 138] },
      '2026': { igi: [106, 138] },
    },
    retail: {
      '2025': { igi: [450, 625] },
      '2026': { igi: [450, 625] },
    },
    minC: 2, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_NECKLACE,
    allowedColors: ['Silver Grey', 'Gold', 'Bordeaux', 'Red', 'Black', 'Navy Blue'] },
  // Multi Five necklace — same nylon Multi family as the M3/M4 necklaces, keeps
  // every carat of the M5 bracelet. Prices = M5 bracelet × 1.20 (B2B exact;
  // retail rounded UP to nearest €5: 400→480, 580→700), identical across both
  // pricelist years. Capped to the same 6-colour Multi necklace palette.
  { id: 'M5_NECK', label: 'MULTI FIVE NECKLACE', productType: 'necklace', carats: ['0.25', '0.50'], certificate: 'igi',
    prices: {
      '2025': { igi: [114, 156] },
      '2026': { igi: [114, 156] },
    },
    retail: {
      '2025': { igi: [480, 700] },
      '2026': { igi: [480, 700] },
    },
    minC: 2, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_NECKLACE,
    allowedColors: ['Silver Grey', 'Gold', 'Bordeaux', 'Red', 'Black', 'Navy Blue'] },
  // Shapy Shine necklace: necklace version of SHAPY SHINE FANCY (SSF). IGI-only,
  // all 7 Shapy Shine shapes, reuses SSF packshots (alias in packshot-lookup).
  // Ships on the NYLON cord palette (like every other necklace) — necklaces use
  // nylon colours only. Prices = SSF 2026 +20% (B2B exact, retail rounded up to
  // nearest 5), identical across both pricelist years. Same housing as the SSF
  // bracelet (bezel/prong + Yellow/White/Pink metal); the shape is chosen on the
  // selection grid (shape cards) and locked per line.
  { id: 'SSF_NECK', label: 'SHAPY SHINE NECKLACE', productType: 'necklace', carats: ['0.10', '0.30', '0.50'], certificate: 'igi',
    prices: {
      '2025': { igi: [66, 120, 186] },
      '2026': { igi: [66, 120, 186] },
    },
    retail: {
      '2025': { igi: [220, 400, 540] },
      '2026': { igi: [220, 400, 540] },
    },
    minC: 2, cord: 'nylon', housing: 'shapyShine', shapes: SHAPES_SHAPY_SHINE, sizes: SIZES_NECKLACE },

  // ─── 2026 NEW NECKLACES: CUBIX / MATCHY / SHAPY SPARKLE / HOLY ───
  // Necklace versions of the matching bracelets. Pricing rule (same as the
  // Shapy Shine necklace): B2B = bracelet B2B × 1.20 (exact); B2C = bracelet
  // retail × 1.20 rounded UP to the nearest €5. Identical across 2025/2026
  // (new products). All keep every carat of their bracelet and reuse the
  // bracelet housing/shapes/packshots (alias in packshot-lookup). Shapy
  // Sparkle + Holy necklaces ship on the 21-colour Shine thread (NOT silk);
  // Holy is capped to 4 colours via allowedColors. Admin-only preview at
  // launch (see ADMIN_ONLY_COLLECTION_IDS).

  // CUBIX necklace — IGI only (like the other necklaces), full nylon palette.
  { id: 'CUBIX_NECK', label: 'CUBIX NECKLACE', productType: 'necklace', carats: ['0.05', '0.10', '0.20'], certificate: 'igi',
    prices: {
      '2025': { igi: [36, 48, 84] },
      '2026': { igi: [36, 48, 84] },
    },
    retail: {
      '2025': { igi: [145, 190, 410] },
      '2026': { igi: [145, 190, 410] },
    },
    minC: 3, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_NECKLACE },
  // Matchy Fancy necklace — full nylon palette, bezel/prong housing + shapes.
  { id: 'MF_NECK', label: 'MATCHY FANCY NECKLACE', productType: 'necklace', carats: ['0.60', '1.00'], certificate: 'igi',
    prices: {
      '2025': { igi: [240, 372] },
      '2026': { igi: [240, 372] },
    },
    retail: {
      '2025': { igi: [660, 1065] },
      '2026': { igi: [660, 1065] },
    },
    minC: 2, cord: 'nylon', housing: 'matchy', shapes: SHAPES_MATCHY, sizes: SIZES_NECKLACE },
  // Shapy Sparkle necklace — single product. Only exists in 0.70 / 1.00 ct,
  // IGI, prong (no bezel). Nylon thread (full 21-colour nylon palette — not
  // silk), reuses the Shapy Sparkle Fancy bracelet packshots. Prices = SSPF
  // bracelet × 1.20 (B2C up to 5).
  { id: 'SSPF_NECK', label: 'SHAPY SPARKLE NECKLACE', productType: 'necklace', carats: ['0.70', '1.00'], certificate: 'igi',
    prices: {
      '2025': { igi: [288, 390] },
      '2026': { igi: [288, 390] },
    },
    retail: {
      '2025': { igi: [660, 1020] },
      '2026': { igi: [660, 1020] },
    },
    minC: 2, cord: 'nylon', housing: 'sparkleProng', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_NECKLACE },
  // Holy necklace — Nylon thread (not silk) capped to 4 colours, standard
  // metal + shapes.
  { id: 'HOLY_NECK', label: 'HOLY NECKLACE', productType: 'necklace', carats: ['0.50', '0.70', '1.00'], certificate: 'igi',
    prices: {
      '2025': { igi: [312, 510, 660] },
      '2026': { igi: [312, 510, 660] },
    },
    retail: {
      '2025': { igi: [780, 1200, 1590] },
      '2026': { igi: [780, 1200, 1590] },
    },
    minC: 2, cord: 'nylon', housing: 'standard', shapes: SHAPES_HOLY, sizes: SIZES_NECKLACE,
    allowedColors: ['Silver Grey', 'Black', 'Red', 'Ivory'] },
]

// ─── Admin-only (preview) collections ───
// The 2026 Moonlight / Sienna / Iconix collections are still a preview: only
// admins should SEE them in the builder, order form, packshot gallery and AI
// advisor. They stay in COLLECTIONS (so saved orders, quotes and lookups keep
// resolving), but pickers must filter through getVisibleCollections(isAdmin).
export const ADMIN_ONLY_COLLECTION_IDS = new Set([
  // Moonlight (nylon)
  'MFM', 'MNO', 'MNH',
  // Sienna (silk)
  'SI1', 'SI2P', 'SI3', 'SI4', 'SI5',
  // Iconix — silk
  'ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8',
  // Iconix — Linea (nylon)
  'LIN3', 'LIN5',
])

export function isAdminOnlyCollection(id) {
  return ADMIN_ONLY_COLLECTION_IDS.has(id)
}

// Collection visibility for agents with partial preview access lives in
// collectionAccess.js — re-exported here so existing catalog imports keep working.
export {
  getVisibleCollections,
  canSeeCollection,
  getGrantedPreviewCollectionIds,
  getPromptPreviewOptions,
  ICONIX_PREVIEW_COLLECTION_IDS,
} from './collectionAccess.js'

// ─── Pricelist helpers ───
// Coerce any user-supplied year value to a valid pricelist key. Falls back to
// DEFAULT_PRICELIST when the input is missing, malformed, or not in PRICELISTS.
// We intentionally accept both string ('2026') and number (2026) inputs because
// older saved metadata may have stored years as numbers.
export function resolvePricelist(pricelistYear) {
  if (pricelistYear == null) return DEFAULT_PRICELIST
  const key = String(pricelistYear)
  return PRICELISTS.includes(key) ? key : DEFAULT_PRICELIST
}

// ─── Certificate helpers ───
export function getDefaultCert(col) {
  if (!col) return 'igi'
  if (col.certificate === 'both') return 'igi'
  return col.certificate
}

// Pull the year-scoped price/retail bucket for a collection. Internal helper —
// every public getter routes through this so the "fallback to DEFAULT_PRICELIST"
// rule is enforced in exactly one place.
function bucketFor(col, field, pricelistYear) {
  if (!col || !col[field]) return null
  const year = resolvePricelist(pricelistYear)
  return col[field][year] || col[field][DEFAULT_PRICELIST] || null
}

export function getAvailableCerts(col, caratIdx, pricelistYear) {
  if (!col) return ['igi']
  if (col.certificate === 'both') {
    if (caratIdx == null) return ['igi', 'inhouse']
    const bucket = bucketFor(col, 'prices', pricelistYear)
    const certs = ['igi']
    if (bucket?.inhouse && bucket.inhouse[caratIdx] != null) certs.push('inhouse')
    return certs
  }
  return [col.certificate]
}

export function getPrice(col, caratIdx, certType, pricelistYear) {
  if (!col || caratIdx == null) return 0
  const ct = certType || getDefaultCert(col)
  const bucket = bucketFor(col, 'prices', pricelistYear)
  if (!bucket) return 0
  const arr = bucket[ct] || bucket.igi || bucket.inhouse
  if (!arr) return 0
  const v = arr[caratIdx]
  return v != null ? v : 0
}

export function getRetail(col, caratIdx, certType, pricelistYear) {
  if (!col || caratIdx == null) return 0
  const ct = certType || getDefaultCert(col)
  const bucket = bucketFor(col, 'retail', pricelistYear)
  if (!bucket) return 0
  const arr = bucket[ct] || bucket.igi || bucket.inhouse
  if (!arr) return 0
  const v = arr[caratIdx]
  return v != null ? v : 0
}

// ─── LOCAL QUOTE CALCULATION ───
// `opts.pricelistYear` controls which year's prices/retail are used. Defaults to
// DEFAULT_PRICELIST. Older callers that pass a single argument keep working
// transparently — they just get 2026 numbers (which is the same behaviour as
// before this feature shipped, since catalog.js was already on 2026).
export function calculateQuote(lines, opts = {}) {
  const pricelistYear = resolvePricelist(opts.pricelistYear)
  const qLines = []
  const warnings = []

  for (const l of lines) {
    if (!l.collectionId) continue
    const col = COLLECTIONS.find((c) => c.id === l.collectionId)
    if (!col) continue

    const configs = l.colorConfigs || []
    if (configs.length === 0) continue

    for (const cfg of configs) {
      if (cfg.caratIdx === null || cfg.caratIdx === undefined) continue
      const rawIdx = cfg.caratIdx
      const maxIdx = col.carats.length - 1
      const ci = Math.max(0, Math.min(rawIdx, maxIdx))
      if (ci !== rawIdx) {
        warnings.push(`${col.label}: carat index ${rawIdx} out of range, using ${col.carats[ci]} ct`)
      }
      const rawQty = cfg.qty
      const qty = Math.max(1, Math.round(rawQty || 1))
      if (rawQty !== undefined && rawQty !== null && rawQty <= 0) {
        warnings.push(`${col.label} ${cfg.colorName || ''}: quantity was ${rawQty}, set to 1`.trim())
      }

      const certType = cfg.certType || getDefaultCert(col)
      const catalogPrice = getPrice(col, ci, certType, pricelistYear)
      const unitB2B = (cfg.priceOverride != null && cfg.priceOverride >= 0) ? cfg.priceOverride : catalogPrice
      const retailUnit = getRetail(col, ci, certType, pricelistYear)

      qLines.push({
        product: col.label,
        carat: col.carats[ci],
        certType,
        housing: cfg.housing || null,
        multiAttached: cfg.multiAttached ?? null,
        shape: cfg.shape || null,
        size: cfg.size || null,
        // For silk-only collections (cord:'silk') cordType may be absent on
        // configs built before the Phase-22 fix — fall back to col.cord so
        // buildMaterial always has something to work with.
        cordType: cfg.cordType || (cfg.thickness ? col.cord : null) || null,
        thickness: cfg.thickness || null,
        // Bracelet thread closure ('braided' | 'nonBraided' | null) — only
        // surfaced for the nylon bracelets that opt in via hasClosure (CUTY,
        // CUBIX, MULTI THREE/FOUR/FIVE, MATCHY FANCY, SHAPY SHINE FANCY, HOLY).
        // Silk bracelets and necklaces always emit null so OrderForm renders
        // the N/A em-dash instead of an empty editable cell.
        closureType: col.hasClosure ? (cfg.closureType || null) : null,
        colorName: cfg.colorName,
        qty,
        unitB2B,
        unitOverride: (cfg.priceOverride != null && cfg.priceOverride >= 0) ? cfg.priceOverride : null,
        lineTotal: qty * unitB2B,
        retailUnit,
        retailTotal: qty * retailUnit,
      })
    }
  }

  const subtotal = qLines.reduce((s, l) => s + l.lineTotal, 0)
  const totalPieces = qLines.reduce((s, l) => s + l.qty, 0)
  const discountPercent = 0
  const discountAmount = 0
  const total = subtotal
  const totalRetail = qLines.reduce((s, l) => s + l.retailTotal, 0)

  return {
    lines: qLines,
    subtotal,
    discountPercent,
    discountAmount,
    total,
    totalPieces,
    totalRetail,
    minimumMet: true,
    warnings,
    pricelistYear,
  }
}

// ─── CORD OPTIONS (for collections with multiple cord types) ───
// No collection currently ships on more than one thread — Shapy Sparkle Round
// moved to silk-only. The `silkBraided` entry stays so the builder and order
// form keep supporting a multi-thread collection if one is added back.
export const CORD_OPTIONS = {
  silkBraided: ['braidedNylon', 'silk'],
}

// Display labels for cord type keys
export const CORD_TYPE_LABELS = {
  silk: 'Silk',
  braidedNylon: 'Braided Nylon',
  braided: 'Braided Nylon',
  nylon: 'Nylon',
  shine: 'Shine',
}

// ─── CORD COLORS ───
export const CORD_COLORS = {
  nylon: [
    { n: 'Red', h: '#E5010B' }, { n: 'Bordeaux', h: '#A52A4A' }, { n: 'Dark Pink', h: '#E388A1' },
    { n: 'Light Pink', h: '#F9C8D5' }, { n: 'Fluo Pink', h: '#FF1583' }, { n: 'Orange', h: '#FF8C00' },
    { n: 'Gold', h: '#CFA962' }, { n: 'Yellow', h: '#FFDD00' }, { n: 'Fluo Yellow', h: '#FDFD2A' },
    { n: 'Green', h: '#008447' }, { n: 'Turquoise', h: '#008B8B' }, { n: 'Light Blue', h: '#A3D5E4' },
    { n: 'Royal Blue', h: '#4169E1' }, { n: 'Navy Blue', h: '#000080' }, { n: 'Lilac', h: '#C4A5D1' },
    { n: 'Purple', h: '#5F3C96' }, { n: 'Brown', h: '#442E2D' }, { n: 'Black', h: '#000000' },
    { n: 'Silver Grey', h: '#C4C4C4' }, { n: 'White', h: '#FFFFFF' }, { n: 'Ivory', h: '#FCF8ED' },
  ],
  braidedNylon: [
    { n: 'Red', h: '#E5010B' }, { n: 'Bordeaux', h: '#A52A4A' }, { n: 'Dark Pink', h: '#E388A1' },
    { n: 'Light Pink', h: '#F9C8D5' }, { n: 'Fluo Pink', h: '#FF1583' }, { n: 'Orange', h: '#FF8C00' },
    { n: 'Gold', h: '#CFA962' }, { n: 'Yellow', h: '#FFDD00' }, { n: 'Fluo Yellow', h: '#FDFD2A' },
    { n: 'Green', h: '#008447' }, { n: 'Turquoise', h: '#008B8B' }, { n: 'Light Blue', h: '#A3D5E4' },
    { n: 'Royal Blue', h: '#4169E1' }, { n: 'Navy Blue', h: '#000080' }, { n: 'Lilac', h: '#C4A5D1' },
    { n: 'Purple', h: '#5F3C96' }, { n: 'Brown', h: '#442E2D' }, { n: 'Black', h: '#000000' },
    { n: 'Silver Grey', h: '#C4C4C4' }, { n: 'White', h: '#FFFFFF' }, { n: 'Ivory', h: '#FCF8ED' },
  ],
  shine: [
    { n: 'Dark Pink', h: '#FFA2D0' }, { n: 'Light Pink', h: '#f5cdd1' }, { n: 'Lilac', h: '#A08A97' },
    { n: 'Purple', h: '#463678' }, { n: 'Red', h: '#ff0000' }, { n: 'Bordeaux', h: '#770116' },
    { n: 'Turq Blue', h: '#3B6E8E' }, { n: 'Royal Blue', h: '#4169E1' }, { n: 'Navy Blue', h: '#2b3f61' },
    { n: 'Light Blue', h: '#7DAFE9' },
    { n: 'Ivory', h: '#FCFAEC' }, { n: 'Black', h: '#000000' }, { n: 'Brown', h: '#411900' },
    { n: 'Green', h: '#008000' }, { n: 'Yellow', h: '#fee900' }, { n: 'Orange', h: '#ff6700' },
    { n: 'Gold', h: '#e2b741' }, { n: 'Silver Grey', h: '#8b8b8b' }, { n: 'Fluo Pink', h: '#ff3988' },
    { n: 'Fluo Yellow', h: '#EBEE16' }, { n: 'White', h: '#FFFFFF' },
  ],
  // Silk palette used by both thin and thick silk threads.
  silk: [
    { n: 'Light Blue', h: '#A3D5E4', code: '262' },
    { n: 'Baby pink', h: '#F9C8D5', code: '265' },
    { n: 'Champagne', h: '#F5DEB3', code: '212' },
    { n: 'Lavendel', h: '#C4A5D1', code: '382' },
    { n: 'Old pink', h: '#D4A5A5', code: '335' },
    { n: 'Mint green', h: '#98D8C8', code: '273' },
    { n: 'Peach', h: '#FFDAB9', code: '275' },
    { n: 'Olive green', h: '#808000', code: '299' },
    { n: 'Silver grey', h: '#C4C4C4', code: '316' },
    { n: 'Gold', h: '#CFA962', code: '304' },
    { n: 'Lila', h: '#CC99CC', code: '302' },
    { n: 'Pink', h: '#FF85A2', code: '208' },
    { n: 'Red', h: '#E5010B', code: '204' },
    { n: 'Jeans blue', h: '#5B7DB1', code: '248' },
    { n: 'Royal blue', h: '#4169E1', code: '224' },
    { n: 'Navy Blue', h: '#000080', code: '225' },
    { n: 'Green', h: '#008447', code: '229' },
    { n: 'Grey', h: '#808080', code: '240' },
    { n: 'Brown', h: '#442E2D', code: '214' },
    { n: 'Black', h: '#000000', code: '233' },
    // Added for the new silk collections (Sienna, Iconix). `code` is a
    // placeholder until the real silk thread code is provided by Sam.
    { n: 'Bordeaux', h: '#770116', code: 'TBD' },
  ],
  holy: [
    { n: 'Brown', h: '#411900' }, { n: 'Grey', h: '#8b8b8b' }, { n: 'Green', h: '#008000' },
    { n: 'Ivory', h: '#fdf7e7' }, { n: 'Royal Blue', h: '#000080' }, { n: 'Pink', h: '#ff69b4' },
    { n: 'Black', h: '#000000' }, { n: 'Red', h: '#ff0000' },
  ],
}

// ─── CORD HELPERS ───
// The cord type drives both the MATERIAL cell in the order form and which
// CORD_COLORS palette a thread colour is picked from, so builder, packs and
// order form must all resolve it the same way. Collections listed in
// CORD_OPTIONS (Shapy Sparkle Round) ship on the first option — braided
// nylon — unless silk was explicitly chosen.
export function getDefaultCordType(col) {
  if (!col) return null
  const opts = CORD_OPTIONS[col.cord]
  if (opts && opts.length > 0) return opts[0]
  return col.cord === 'silk' ? 'silk' : null
}

// Silk is always ordered in a thickness, so a silk collection with none picked
// yet falls back to its first option rather than showing an empty MATERIAL.
export function getDefaultThickness(col, cordType) {
  const ct = cordType || getDefaultCordType(col)
  if (ct !== 'silk') return null
  return getThicknessOptions(col)[0] || null
}

// Order-form MATERIAL label, e.g. 'Braided Nylon' or 'Silk (Thin)'.
export function buildMaterialLabel(cordType, thickness) {
  const ct = cordType || (thickness ? 'silk' : null)
  if (!ct) return ''
  const label = CORD_TYPE_LABELS[ct] || ct
  return thickness ? `${label} (${thickness})` : label
}

export function parseMaterialLabel(material) {
  if (!material || typeof material !== 'string') return { cordType: '', thickness: '' }
  const m = material.match(/^(.+?)\s*\((\w+)\)\s*$/)
  const label = (m ? m[1] : material).trim()
  const thickness = m ? m[2] : ''
  const cordType = Object.entries(CORD_TYPE_LABELS).find(([, v]) => v === label)?.[0] || label.toLowerCase()
  return { cordType, thickness }
}

// Older configs stored the braided thread as 'braided'; both spellings map to
// the same palette.
const CORD_PALETTE_ALIASES = { braided: 'braidedNylon' }

export function cordPaletteFor(col, cordType) {
  if (!col) return []
  const chosen = CORD_OPTIONS[col.cord] ? (cordType || getDefaultCordType(col)) : col.cord
  const key = CORD_PALETTE_ALIASES[chosen] || chosen
  const palette = CORD_COLORS[key] || CORD_COLORS[col.cord] || []
  return col.allowedColors ? palette.filter(c => col.allowedColors.includes(c.n)) : palette
}

// Palettes spell shared colours differently ('Silver Grey' on nylon vs
// 'Silver grey' on silk). Snap a stored name onto the active palette's
// spelling so a select can pre-select it instead of rendering blank.
export function normalizeCordColorName(col, cordType, name) {
  if (!name) return ''
  const palette = cordPaletteFor(col, cordType)
  if (palette.some(c => c.n === name)) return name
  const match = palette.find(c => c.n.toLowerCase() === String(name).toLowerCase())
  return match ? match.n : name
}

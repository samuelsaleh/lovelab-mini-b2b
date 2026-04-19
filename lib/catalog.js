// ─── HOUSING OPTIONS ───
export const HOUSING = {
  standard: ['Yellow', 'White'],
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
      { id: 'white-yellow', label: 'WY' },
    ],
    prong: [
      { id: 'white', label: 'White' },
      { id: 'yellow', label: 'Yellow' },
    ],
  },
  // Keep flat aliases for backward compatibility
  matchyBezel: [
    { id: 'white-white', label: 'WW' },
    { id: 'yellow-yellow', label: 'YY' },
    { id: 'white-yellow', label: 'WY' },
  ],
  matchyProng: [
    { id: 'white', label: 'White' },
    { id: 'yellow', label: 'Yellow' },
  ],
  shapyShine: {
    bezel: ['Yellow', 'White'],
    prong: ['Yellow', 'White'],
  },
  // Keep flat aliases for backward compatibility
  shapyShineBezel: ['Yellow', 'White'],
  shapyShineProng: ['Yellow', 'White'],
  sparkleProng: ['Prong'],
}

// ─── COLLECTIONS ───
// Size options by bracelet type
export const SIZES_NYLON = ['XS', 'S', 'M', 'L', 'XL']
export const SIZES_SILK = ['S/M', 'L/XL']

// Shape options by collection family
export const SHAPES_HOLY = ['Cross', 'Hamsa', 'Star of David', 'Greek Cross']
export const SHAPES_MATCHY = ['Pear', 'Heart', 'Emerald']
export const SHAPES_SHAPY_SHINE = ['Heart', 'Pear', 'Marquise', 'Oval', 'Emerald', 'Cushion', 'Long Cushion']
export const SHAPES_SHAPY_SPARKLE = ['Round', 'Pear', 'Oval', 'Heart', 'Princess', 'Cushion', 'Marquise', 'Emerald', 'Long Cushion']

// Certificate types: 'igi' | 'inhouse' | 'both'
// When 'both', prices/retail are objects { igi: [...], inhouse: [...] } with null for unavailable carats.
// When single type, prices/retail are objects with only that key.
export const CERT_TYPES = { IGI: 'igi', INHOUSE: 'inhouse' }
export const CERT_LABELS = { igi: 'IGI', inhouse: 'In-house' }

export const COLLECTIONS = [
  { id: 'CUTY', label: 'CUTY', carats: ['0.05', '0.10', '0.20', '0.30'], certificate: 'both',
    prices: { igi: [30, 40, 70, 100], inhouse: [24, 34, null, null] },
    retail: { igi: [105, 155, 315, 430], inhouse: [95, 145, null, null] },
    minC: 3, cord: 'nylon', housing: 'standard', sizes: SIZES_NYLON },
  { id: 'CUBIX', label: 'CUBIX', carats: ['0.05', '0.10', '0.20'], certificate: 'both',
    prices: { igi: [30, 40, 70], inhouse: [24, 34, null] },
    retail: { igi: [105, 155, 340], inhouse: [95, 145, null] },
    minC: 3, cord: 'nylon', housing: 'goldMetalNoRose', sizes: SIZES_SILK },
  { id: 'M3', label: 'MULTI THREE', carats: ['0.15', '0.30', '0.60', '0.90'], certificate: 'igi',
    prices: { igi: [65, 95, 175, 250] }, retail: { igi: [260, 400, 800, 1150] },
    minC: 2, cord: 'nylon', housing: 'multiThree', sizes: SIZES_NYLON,
    allowedColors: ['Bordeaux', 'Red', 'Gold', 'Silver Grey', 'Black', 'Navy Blue'] },
  { id: 'M4', label: 'MULTI FOUR', carats: ['0.20', '0.40'], certificate: 'igi',
    prices: { igi: [85, 110] }, retail: { igi: [360, 500] },
    minC: 2, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_NYLON,
    allowedColors: ['Bordeaux', 'Red', 'Gold', 'Silver Grey', 'Black', 'Navy Blue'] },
  { id: 'M5', label: 'MULTI FIVE', carats: ['0.25', '0.50'], certificate: 'igi',
    prices: { igi: [95, 130] }, retail: { igi: [400, 580] },
    minC: 2, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_NYLON,
    allowedColors: ['Bordeaux', 'Red', 'Gold', 'Silver Grey', 'Black', 'Navy Blue'] },
  { id: 'MF', label: 'MATCHY FANCY', carats: ['0.60', '1.00'], certificate: 'igi',
    prices: { igi: [200, 310] }, retail: { igi: [550, 885] },
    minC: 2, cord: 'nylon', housing: 'matchy', shapes: SHAPES_MATCHY, sizes: SIZES_NYLON },
  { id: 'SSF', label: 'SHAPY SHINE FANCY', carats: ['0.10', '0.30', '0.50'], certificate: 'igi',
    prices: { igi: [55, 100, 155] }, retail: { igi: [180, 330, 450] },
    minC: 2, cord: 'shine', housing: 'shapyShine', shapes: SHAPES_SHAPY_SHINE, sizes: SIZES_NYLON },
  { id: 'SSPF', label: 'SHAPY SPARKLE FANCY', carats: ['0.70', '1.00'], certificate: 'igi',
    prices: { igi: [240, 325] }, retail: { igi: [550, 850] },
    minC: 2, cord: 'silk', housing: 'sparkleProng', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_SILK },
  { id: 'SSRG', label: 'SHAPY SPARKLE RND G/H', carats: ['0.50', '0.70', '1.00'], certificate: 'inhouse',
    prices: { inhouse: [125, 165, 225] }, retail: { inhouse: [290, 360, 500] },
    minC: 2, cord: 'silkBraided', housing: 'sparkleProng', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_SILK },
  { id: 'SSRD', label: 'SHAPY SPARKLE RND D VVS', carats: ['0.50', '0.70', '1.00'], certificate: 'igi',
    prices: { igi: [200, 220, 305] }, retail: { igi: [550, 650, 850] },
    minC: 2, cord: 'silkBraided', housing: 'sparkleProng', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_SILK },
  { id: 'HOLY', label: 'HOLY (D VVS)', carats: ['0.50', '0.70', '1.00'], certificate: 'igi',
    prices: { igi: [260, 425, 550] }, retail: { igi: [650, 1000, 1325] },
    minC: 2, cord: 'nylon', housing: 'standard', shapes: SHAPES_HOLY, sizes: SIZES_NYLON },
]

// ─── Certificate helpers ───
export function getDefaultCert(col) {
  if (!col) return 'igi'
  if (col.certificate === 'both') return 'igi'
  return col.certificate
}

export function getAvailableCerts(col, caratIdx) {
  if (!col) return ['igi']
  if (col.certificate === 'both') {
    if (caratIdx == null) return ['igi', 'inhouse']
    const certs = ['igi']
    if (col.prices.inhouse && col.prices.inhouse[caratIdx] != null) certs.push('inhouse')
    return certs
  }
  return [col.certificate]
}

export function getPrice(col, caratIdx, certType) {
  if (!col || caratIdx == null) return 0
  const ct = certType || getDefaultCert(col)
  const arr = col.prices[ct] || col.prices.igi || col.prices.inhouse
  if (!arr) return 0
  const v = arr[caratIdx]
  return v != null ? v : 0
}

export function getRetail(col, caratIdx, certType) {
  if (!col || caratIdx == null) return 0
  const ct = certType || getDefaultCert(col)
  const arr = col.retail[ct] || col.retail.igi || col.retail.inhouse
  if (!arr) return 0
  const v = arr[caratIdx]
  return v != null ? v : 0
}

// ─── LOCAL QUOTE CALCULATION ───
export function calculateQuote(lines) {
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
      const catalogPrice = getPrice(col, ci, certType)
      const unitB2B = (cfg.priceOverride != null && cfg.priceOverride >= 0) ? cfg.priceOverride : catalogPrice
      const retailUnit = getRetail(col, ci, certType)

      qLines.push({
        product: col.label,
        carat: col.carats[ci],
        certType,
        housing: cfg.housing || null,
        multiAttached: cfg.multiAttached ?? null,
        shape: cfg.shape || null,
        size: cfg.size || null,
        cordType: cfg.cordType || null,
        thickness: cfg.thickness || null,
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
  }
}

// ─── CORD OPTIONS (for collections with multiple cord types) ───
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
    { n: 'Navy Blue', h: '#000080' }, { n: 'Lilac', h: '#C4A5D1' },
    { n: 'Purple', h: '#5F3C96' }, { n: 'Brown', h: '#442E2D' }, { n: 'Black', h: '#000000' },
    { n: 'Silver Grey', h: '#C4C4C4' }, { n: 'White', h: '#FFFFFF' }, { n: 'Ivory', h: '#FCF8ED' },
  ],
  braidedNylon: [
    { n: 'Red', h: '#E5010B' }, { n: 'Bordeaux', h: '#A52A4A' }, { n: 'Dark Pink', h: '#E388A1' },
    { n: 'Light Pink', h: '#F9C8D5' }, { n: 'Fluo Pink', h: '#FF1583' }, { n: 'Orange', h: '#FF8C00' },
    { n: 'Gold', h: '#CFA962' }, { n: 'Yellow', h: '#FFDD00' }, { n: 'Fluo Yellow', h: '#FDFD2A' },
    { n: 'Green', h: '#008447' }, { n: 'Turquoise', h: '#008B8B' }, { n: 'Light Blue', h: '#A3D5E4' },
    { n: 'Navy Blue', h: '#000080' }, { n: 'Lilac', h: '#C4A5D1' },
    { n: 'Purple', h: '#5F3C96' }, { n: 'Brown', h: '#442E2D' }, { n: 'Black', h: '#000000' },
    { n: 'Silver Grey', h: '#C4C4C4' }, { n: 'White', h: '#FFFFFF' }, { n: 'Ivory', h: '#FCF8ED' },
  ],
  shine: [
    { n: 'Dark Pink', h: '#FFA2D0' }, { n: 'Light Pink', h: '#f5cdd1' }, { n: 'Lilac', h: '#A08A97' },
    { n: 'Purple', h: '#463678' }, { n: 'Red', h: '#ff0000' }, { n: 'Bordeaux', h: '#770116' },
    { n: 'Turq Blue', h: '#3B6E8E' }, { n: 'Navy Blue', h: '#2b3f61' }, { n: 'Light Blue', h: '#7DAFE9' },
    { n: 'Ivory', h: '#FCFAEC' }, { n: 'Black', h: '#000000' }, { n: 'Brown', h: '#411900' },
    { n: 'Green', h: '#008000' }, { n: 'Yellow', h: '#fee900' }, { n: 'Orange', h: '#ff6700' },
    { n: 'Gold', h: '#e2b741' }, { n: 'Grey', h: '#8b8b8b' }, { n: 'Fluo Pink', h: '#ff3988' },
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
  ],
  holy: [
    { n: 'Brown', h: '#411900' }, { n: 'Grey', h: '#8b8b8b' }, { n: 'Green', h: '#008000' },
    { n: 'Ivory', h: '#fdf7e7' }, { n: 'Royal Blue', h: '#000080' }, { n: 'Pink', h: '#ff69b4' },
    { n: 'Black', h: '#000000' }, { n: 'Red', h: '#ff0000' },
  ],
}

// ─── HOUSING OPTIONS ───
export const HOUSING = {
  standard: ['Yellow', 'White', 'Rose'],
  goldMetal: ['White Gold', 'Yellow Gold', 'Rose Gold'],
  multiThree: {
    attached: ['WWW', 'YYY', 'PPP'],
    notAttached: ['WWW', 'YYY', 'PPP', 'WYP'],
  },
  matchy: {
    bezel: [
      { id: 'white-white', label: 'White + White' },
      { id: 'yellow-yellow', label: 'Yellow + Yellow' },
      { id: 'pink-pink', label: 'Pink + Pink' },
      { id: 'white-yellow', label: 'White + Yellow' },
      { id: 'white-pink', label: 'White + Pink' },
      { id: 'yellow-pink', label: 'Yellow + Pink' },
    ],
    prong: [
      { id: 'white', label: 'White' },
      { id: 'yellow', label: 'Yellow' },
    ],
  },
  // Keep flat aliases for backward compatibility
  matchyBezel: [
    { id: 'white-white', label: 'White + White' },
    { id: 'yellow-yellow', label: 'Yellow + Yellow' },
    { id: 'pink-pink', label: 'Pink + Pink' },
    { id: 'white-yellow', label: 'White + Yellow' },
    { id: 'white-pink', label: 'White + Pink' },
    { id: 'yellow-pink', label: 'Yellow + Pink' },
  ],
  matchyProng: [
    { id: 'white', label: 'White' },
    { id: 'yellow', label: 'Yellow' },
  ],
  shapyShine: {
    bezel: ['Yellow', 'White', 'Rose'],
    prong: ['Yellow', 'White', 'Rose'],
  },
  // Keep flat aliases for backward compatibility
  shapyShineBezel: ['Yellow', 'White', 'Rose'],
  shapyShineProng: ['Yellow', 'White', 'Rose'],
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

export const COLLECTIONS = [
  { id: 'CUTY', label: 'CUTY', carats: ['0.05', '0.10', '0.20', '0.30'], prices: [20, 30, 65, 90], retail: [75, 120, 315, 430], minC: 1, cord: 'nylon', housing: 'standard', sizes: SIZES_NYLON },
  { id: 'CUBIX', label: 'CUBIX', carats: ['0.05', '0.10', '0.20'], prices: [24, 34, 70], retail: [95, 145, 340], minC: 1, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_SILK },
  { id: 'M3', label: 'MULTI THREE', carats: ['0.15', '0.30', '0.60', '0.90'], prices: [55, 85, 165, 240], retail: [260, 400, 800, 1150], minC: 2, cord: 'nylon', housing: 'multiThree', sizes: SIZES_NYLON },
  { id: 'M4', label: 'MULTI FOUR', carats: ['0.20', '0.40'], prices: [75, 100], retail: [360, 500], minC: 2, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_NYLON },
  { id: 'M5', label: 'MULTI FIVE', carats: ['0.25', '0.50'], prices: [85, 120], retail: [400, 580], minC: 2, cord: 'nylon', housing: 'goldMetal', sizes: SIZES_NYLON },
  { id: 'MF', label: 'MATCHY FANCY', carats: ['0.60', '1.00'], prices: [180, 290], retail: [550, 885], minC: 2, cord: 'nylon', housing: 'matchy', shapes: SHAPES_MATCHY, sizes: SIZES_NYLON },
  { id: 'SSF', label: 'SHAPY SHINE FANCY', carats: ['0.10', '0.30', '0.50'], prices: [50, 90, 145], retail: [180, 330, 450], minC: 2, cord: 'shine', housing: 'shapyShine', shapes: SHAPES_SHAPY_SHINE, sizes: SIZES_NYLON },
  { id: 'SSPF', label: 'SHAPY SPARKLE FANCY', carats: ['0.70', '1.00'], prices: [225, 300], retail: [550, 850], minC: 2, cord: 'silk', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_SILK },
  { id: 'SSRG', label: 'SHAPY SPARKLE RND G/H', carats: ['0.50', '0.70', '1.00'], prices: [115, 145, 205], retail: [290, 360, 500], minC: 2, cord: 'silk', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_SILK },
  { id: 'SSRD', label: 'SHAPY SPARKLE RND D VVS', carats: ['0.50', '0.70', '1.00'], prices: [180, 200, 285], retail: [550, 650, 850], minC: 2, cord: 'silk', shapes: SHAPES_SHAPY_SPARKLE, sizes: SIZES_SILK },
  { id: 'HOLY', label: 'HOLY (D VVS)', carats: ['0.50', '0.70', '1.00'], prices: [260, 425, 550], retail: [650, 1000, 1325], minC: 2, cord: 'holy', housing: 'standard', shapes: SHAPES_HOLY, sizes: SIZES_NYLON },
]

// ─── LOCAL QUOTE CALCULATION ───
export function calculateQuote(lines) {
  const qLines = []
  const warnings = []

  for (const l of lines) {
    if (!l.collectionId) continue
    const col = COLLECTIONS.find((c) => c.id === l.collectionId)
    if (!col) continue

    // New model: colorConfigs array (each with own carat/housing/shape/size/qty)
    const configs = l.colorConfigs || []
    if (configs.length === 0) continue

    for (const cfg of configs) {
      const rawIdx = cfg.caratIdx !== null && cfg.caratIdx !== undefined ? cfg.caratIdx : 0
      // Bounds check: clamp caratIdx to valid range, warn if clamped
      const ci = Math.max(0, Math.min(rawIdx, col.prices.length - 1))
      if (ci !== rawIdx) {
        warnings.push(`${col.label}: carat index ${rawIdx} out of range, using ${col.carats[ci]} ct`)
      }
      // Validate quantity: warn on zero/negative, clamp to 1 minimum
      const rawQty = cfg.qty
      const qty = Math.max(1, Math.round(rawQty || 1))
      if (rawQty !== undefined && rawQty !== null && rawQty <= 0) {
        warnings.push(`${col.label} ${cfg.colorName || ''}: quantity was ${rawQty}, set to 1`.trim())
      }

      const unitB2B = col.prices[ci] ?? 0
      const retailUnit = col.retail[ci] ?? 0

      // Warn about min-per-color violations
      if (qty < (col.minC || 1)) {
        warnings.push(`${col.label} ${cfg.colorName || ''}: ${qty} pcs is below minimum ${col.minC} per color`.trim())
      }

      qLines.push({
        product: col.label,
        carat: col.carats[ci],
        housing: cfg.housing || null,
        shape: cfg.shape || null,
        size: cfg.size || null,
        colorName: cfg.colorName,
        qty,
        unitB2B,
        lineTotal: qty * unitB2B,
        retailUnit,
        retailTotal: qty * retailUnit,
      })
    }
  }

  const subtotal = qLines.reduce((s, l) => s + l.lineTotal, 0)
  const totalPieces = qLines.reduce((s, l) => s + l.qty, 0)
  const discountPercent = subtotal >= 1600 ? 10 : 0
  const discountAmount = Math.round((subtotal * discountPercent) / 100)
  const total = subtotal - discountAmount
  const totalRetail = qLines.reduce((s, l) => s + l.retailTotal, 0)

  if (subtotal > 0 && subtotal < 800) {
    warnings.push('Below minimum order of €800')
  }

  return {
    lines: qLines,
    subtotal,
    discountPercent,
    discountAmount,
    total,
    totalPieces,
    totalRetail,
    minimumMet: subtotal >= 800,
    warnings,
  }
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
  shine: [
    { n: 'Dark Pink', h: '#FFA2D0' }, { n: 'Light Pink', h: '#f5cdd1' }, { n: 'Lilac', h: '#A08A97' },
    { n: 'Purple', h: '#463678' }, { n: 'Red', h: '#ff0000' }, { n: 'Bordeaux', h: '#770116' },
    { n: 'Turq Blue', h: '#3B6E8E' }, { n: 'Navy', h: '#2b3f61' }, { n: 'Light Blue', h: '#7DAFE9' },
    { n: 'Ivory', h: '#FCFAEC' }, { n: 'Black', h: '#000000' }, { n: 'Brown', h: '#411900' },
    { n: 'Green', h: '#008000' }, { n: 'Yellow', h: '#fee900' }, { n: 'Orange', h: '#ff6700' },
    { n: 'Yellow Gold', h: '#e2b741' }, { n: 'Grey', h: '#8b8b8b' }, { n: 'Fluo Pink', h: '#ff3988' },
    { n: 'Fluo Yellow', h: '#EBEE16' }, { n: 'White', h: '#FFFFFF' },
  ],
  silk: [
    { n: 'Light Blue', h: '#A3D5E4' }, { n: 'Baby Pink', h: '#F9C8D5' }, { n: 'Champagne', h: '#F5DEB3' },
    { n: 'Lavendel', h: '#C4A5D1' }, { n: 'Old Pink', h: '#D4A5A5' }, { n: 'Mint Green', h: '#98D8C8' },
    { n: 'Peach', h: '#FFDAB9' }, { n: 'Olive Green', h: '#808000' }, { n: 'Silver Grey', h: '#C4C4C4' },
    { n: 'Gold', h: '#CFA962' }, { n: 'Lila', h: '#CC99CC' }, { n: 'Pink', h: '#FF85A2' },
    { n: 'Red', h: '#E5010B' }, { n: 'Jeans Blue', h: '#5B7DB1' }, { n: 'Royal Blue', h: '#4169E1' },
    { n: 'Navy Blue', h: '#000080' }, { n: 'Green', h: '#008447' }, { n: 'Grey', h: '#808080' },
    { n: 'Brown', h: '#442E2D' }, { n: 'Black', h: '#000000' },
  ],
  holy: [
    { n: 'Brown', h: '#411900' }, { n: 'Grey', h: '#8b8b8b' }, { n: 'Green', h: '#008000' },
    { n: 'Ivory', h: '#fdf7e7' }, { n: 'Royal Blue', h: '#000080' }, { n: 'Pink', h: '#ff69b4' },
    { n: 'Black', h: '#000000' }, { n: 'Red', h: '#ff0000' },
  ],
}

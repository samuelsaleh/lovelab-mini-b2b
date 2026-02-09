// ─── COLLECTIONS ───
export const COLLECTIONS = [
  { id: 'CUTY', label: 'CUTY', carats: ['0.05', '0.10', '0.20', '0.30'], prices: [20, 30, 65, 90], retail: [75, 120, 315, 430], minC: 3, cord: 'nylon' },
  { id: 'CUBIX', label: 'CUBIX', carats: ['0.05', '0.10', '0.20'], prices: [24, 34, 70], retail: [95, 145, 340], minC: 3, cord: 'nylon' },
  { id: 'M3', label: 'MULTI THREE', carats: ['0.15', '0.30', '0.60', '0.90'], prices: [55, 85, 165, 240], retail: [260, 400, 800, 1150], minC: 2, cord: 'nylon' },
  { id: 'M4', label: 'MULTI FOUR', carats: ['0.20', '0.40'], prices: [75, 100], retail: [360, 500], minC: 2, cord: 'nylon' },
  { id: 'M5', label: 'MULTI FIVE', carats: ['0.25', '0.50'], prices: [85, 120], retail: [400, 580], minC: 2, cord: 'nylon' },
  { id: 'MF', label: 'MATCHY FANCY', carats: ['0.60', '1.00'], prices: [180, 290], retail: [550, 885], minC: 2, cord: 'nylon' },
  { id: 'SSF', label: 'SHAPY SHINE FANCY', carats: ['0.10', '0.30', '0.50'], prices: [50, 90, 145], retail: [180, 330, 450], minC: 2, cord: 'shine' },
  { id: 'SSPF', label: 'SHAPY SPARKLE FANCY', carats: ['0.70', '1.00'], prices: [225, 300], retail: [550, 850], minC: 2, cord: 'silk' },
  { id: 'SSRG', label: 'SHAPY SPARKLE RND G/H', carats: ['0.50', '0.70', '1.00'], prices: [115, 145, 205], retail: [290, 360, 500], minC: 2, cord: 'silk' },
  { id: 'SSRD', label: 'SHAPY SPARKLE RND D VVS', carats: ['0.50', '0.70', '1.00'], prices: [180, 200, 285], retail: [550, 650, 850], minC: 2, cord: 'silk' },
  { id: 'HOLY', label: 'HOLY (D VVS)', carats: ['0.50', '0.70', '1.00'], prices: [260, 425, 550], retail: [650, 1000, 1325], minC: 2, cord: 'holy' },
]

// ─── CORD COLORS ───
export const CORD_COLORS = {
  nylon: [
    { n: 'Red', h: '#E5010B' }, { n: 'Bordeaux', h: '#A52A4A' }, { n: 'Dark Pink', h: '#E388A1' },
    { n: 'Light Pink', h: '#F9C8D5' }, { n: 'Fluo Pink', h: '#FF1583' }, { n: 'Orange', h: '#FF8C00' },
    { n: 'Gold', h: '#CFA962' }, { n: 'Yellow', h: '#FFDD00' }, { n: 'Fluo Yellow', h: '#FDFD2A' },
    { n: 'Green', h: '#008447' }, { n: 'Turquoise', h: '#008B8B' }, { n: 'Light Blue', h: '#A3D5E4' },
    { n: 'Navy Blue', h: '#000080' }, { n: 'Dark Blue', h: '#00008B' }, { n: 'Lilac', h: '#C4A5D1' },
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
    { n: 'Light Blue', h: '#A3D5E4' }, { n: 'Baby Pink', h: '#F9C8D5' }, { n: 'Gold', h: '#CFA962' },
    { n: 'Silver Grey', h: '#C4C4C4' }, { n: 'Lavendel', h: '#C4A5D1' }, { n: 'Olive Green', h: '#808000' },
    { n: 'Old Pink', h: '#D4A5A5' }, { n: 'Peach', h: '#FFDAB9' }, { n: 'Black', h: '#000000' },
    { n: 'Grey', h: '#808080' }, { n: 'Champagne', h: '#F5DEB3' }, { n: 'Royal Blue', h: '#4169E1' },
    { n: 'Red', h: '#E5010B' }, { n: 'Mint Green', h: '#98D8C8' }, { n: 'Ivory', h: '#FCF8ED' },
    { n: 'Green', h: '#008447' }, { n: 'Orange', h: '#FF8C00' }, { n: 'Yellow', h: '#FFDD00' },
    { n: 'Jeans Blue', h: '#5B7DB1' }, { n: 'Navy Blue', h: '#000080' },
  ],
  holy: [
    { n: 'Brown', h: '#411900' }, { n: 'Grey', h: '#8b8b8b' }, { n: 'Green', h: '#008000' },
    { n: 'Ivory', h: '#fdf7e7' }, { n: 'Royal Blue', h: '#000080' }, { n: 'Pink', h: '#ff69b4' },
    { n: 'Black', h: '#000000' }, { n: 'Red', h: '#ff0000' },
  ],
}

// ═══ LOVELAB BRAND COLORS ═══
export const colors = {
  // New Clean Palette
  bg: '#ffffff',
  bgOff: '#f9f9f9',
  text: '#111111',
  textLight: '#666666',
  border: '#eaeaea',
  primary: '#000000',
  accent: '#0070f3',
  
  // Brand Colors
  inkPlum: '#5D3A5E', // Original brand plum
  luxeGold: '#c5a059',
  
  // Legacy Brand Colors (Kept for compatibility)
  lumiereIvory: '#F8F5F2',
  charcoal: '#4F4F4F',
  porcelain: '#FFFFFF',
  softRose: '#F0B5C0',
  lavender: '#D1B3E0',
  softPink: '#F5C0D8',
  ice: '#EFF5F7',
  lineGray: '#E3E3E3',
  lovelabBg: '#FDF7FA',
  
  // Brand Gradient
  gradientDeep: '#8957AF',
  gradientMedium: '#C987C7',
  gradientLight: '#E09BC0',
  gradientPink: '#EDA5B8',
  
  // Custom
  lovelabDark: '#4A2545',
  lovelabMuted: '#8A6A7D',
  lovelabAccent: '#C4A084',
  lovelabPink: '#D486C3',
  lovelabBorder: '#DCC5D5',
}

// ═══ TYPOGRAPHY ═══
export const fonts = {
  heading: "'Playfair Display', serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: '"JetBrains Mono", monospace',
  label: "'Montserrat', sans-serif",
}

// ═══ RESPONSIVE HELPERS ═══
export const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768
export const isTablet = () => typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024

// ═══ BRAND GRADIENT ═══
export const brandGradient = `linear-gradient(135deg, ${colors.gradientDeep} 0%, ${colors.gradientMedium} 33%, ${colors.gradientLight} 66%, ${colors.gradientPink} 100%)`

// ═══ REUSABLE STYLES ═══

// Updated Label
export const lbl = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#888',
  marginBottom: 6,
  fontWeight: 600,
}

// Restored Input (used in ClientGate etc)
export const inp = {
  padding: '8px 11px',
  borderRadius: 8,
  border: `1px solid ${colors.lineGray}`,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  background: colors.lumiereIvory,
  color: colors.charcoal,
  boxSizing: 'border-box',
}

// Updated Tag (Cleaner, no border)
export const tag = (active) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  fontSize: 13,
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid transparent', // No visible border for cleaner look
  background: active ? colors.inkPlum : '#f3f3f3', // Light gray background for inactive
  color: active ? '#fff' : '#444',
  fontWeight: active ? 500 : 400,
  transition: 'all 0.15s ease',
  outline: 'none',
})

// Updated Qty Button
export const qBtn = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: '#444',
}

// Updated Qty Input
export const qInp = {
  width: 40,
  height: 28,
  border: 'none',
  textAlign: 'center',
  fontSize: 13,
  outline: 'none',
  fontWeight: 600,
  color: colors.inkPlum,
  background: '#fff',
}

// Updated Quick Qty
export const qtyQuick = (active) => ({
  fontSize: 11,
  padding: '4px 8px',
  borderRadius: 4,
  background: active ? colors.inkPlum : '#f0f0f0',
  color: active ? '#fff' : '#666',
  border: 'none',
  cursor: 'pointer',
})

// Restored Mode Pill
export const modePill = (active) => ({
  padding: '8px 18px',
  borderRadius: 20,
  border: 'none',
  background: active ? colors.inkPlum : 'transparent',
  color: active ? '#fff' : colors.charcoal,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'all .15s',
  whiteSpace: 'nowrap',
})

// Restored Total Bar
export const totalBar = {
  background: '#fff',
  borderTop: `1px solid ${colors.lineGray}`,
  padding: '12px 18px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
}

export const totalBarAmount = {
  fontSize: 22,
  fontWeight: 800,
  color: colors.inkPlum,
}

export const totalBarMeta = {
  fontSize: 11,
  color: '#999',
}

// Restored Preset Card
export const presetCard = {
  padding: '14px 18px',
  borderRadius: 12,
  border: `1px solid ${colors.lineGray}`,
  background: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  transition: 'all .12s',
  flex: '1 1 140px',
  minWidth: 140,
}

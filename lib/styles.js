// ═══ LOVELAB BRAND COLORS ═══
export const colors = {
  // Core palette
  bg: '#ffffff',
  bgOff: '#f8f8f8',
  text: '#111111',
  textLight: '#666666',
  textMuted: '#999999',
  border: '#e8e8e8',
  borderLight: '#f0f0f0',
  
  // Brand Colors
  inkPlum: '#5D3A5E',
  luxeGold: '#c5a059',
  
  // Legacy (kept for compatibility)
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
  
  // Semantic
  success: '#27ae60',
  warning: '#e67e22',
  danger: '#dc2626',
  info: '#3b82f6',
  
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

// ═══ SPACING SCALE ═══
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
}

// ═══ RESPONSIVE HELPERS ═══
export const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768
export const isTablet = () => typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024

// ═══ BRAND GRADIENT ═══
export const brandGradient = `linear-gradient(135deg, ${colors.gradientDeep} 0%, ${colors.gradientMedium} 33%, ${colors.gradientLight} 66%, ${colors.gradientPink} 100%)`

// ═══ BUTTON PRESETS ═══
const btnBase = {
  borderRadius: 10,
  fontFamily: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all .15s',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
}

export const btn = {
  primary: {
    ...btnBase,
    padding: '10px 24px',
    border: 'none',
    background: colors.inkPlum,
    color: '#fff',
    fontSize: 13,
  },
  secondary: {
    ...btnBase,
    padding: '10px 24px',
    border: `1.5px solid ${colors.inkPlum}`,
    background: '#fff',
    color: colors.inkPlum,
    fontSize: 13,
  },
  ghost: {
    ...btnBase,
    padding: '8px 16px',
    border: 'none',
    background: 'transparent',
    color: '#888',
    fontSize: 12,
    fontWeight: 600,
  },
  danger: {
    ...btnBase,
    padding: '8px 16px',
    border: '1px solid #fecaca',
    background: '#fef2f2',
    color: '#dc2626',
    fontSize: 12,
  },
  sm: {
    ...btnBase,
    padding: '6px 14px',
    fontSize: 11,
    borderRadius: 8,
  },
}

// ═══ CARD PRESET ═══
export const card = {
  background: '#fff',
  borderRadius: 12,
  border: `1px solid ${colors.border}`,
  boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
  overflow: 'hidden',
}

// ═══ INPUT PRESETS ═══
export const inp = {
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fff',
  color: '#333',
  boxSizing: 'border-box',
  height: 40,
}

export const inputSm = {
  ...inp,
  padding: '5px 8px',
  fontSize: 12,
  height: 32,
}

// ═══ LABEL ═══
export const lbl = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#999',
  marginBottom: 6,
  fontWeight: 600,
}

// ═══ TAG / CHIP ═══
export const tag = (active) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  fontSize: 13,
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid transparent',
  background: active ? colors.inkPlum : '#f3f3f3',
  color: active ? '#fff' : '#444',
  fontWeight: active ? 500 : 400,
  transition: 'all 0.15s ease',
  outline: 'none',
})

// ═══ QTY CONTROLS ═══
export const qBtn = {
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
  color: '#444',
  borderRadius: 8,
}

export const qInp = {
  width: 48,
  height: 44,
  border: 'none',
  textAlign: 'center',
  fontSize: 14,
  outline: 'none',
  fontWeight: 600,
  color: colors.inkPlum,
  background: '#fff',
}

export const qtyQuick = (active) => ({
  fontSize: 11,
  padding: '4px 8px',
  borderRadius: 4,
  background: active ? colors.inkPlum : '#f0f0f0',
  color: active ? '#fff' : '#666',
  border: 'none',
  cursor: 'pointer',
})

// ═══ MODE PILL ═══
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

// ═══ TOTAL BAR ═══
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

// ═══ PRESET CARD ═══
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

// ═══ SECTION HEADING ═══
export const sectionHeading = {
  fontSize: 14,
  fontWeight: 700,
  color: colors.inkPlum,
  margin: '0 0 4px',
}

// ═══ DIVIDER ═══
export const divider = {
  height: 1,
  background: colors.borderLight,
  border: 'none',
  margin: `${spacing.lg}px 0`,
}

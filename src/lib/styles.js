// ═══ LOVELAB BRAND COLORS ═══
export const colors = {
  // Primary
  inkPlum: '#5D3A5E',
  luxeGold: '#C9A665',
  lumiereIvory: '#F8F5F2',
  charcoal: '#4F4F4F',
  
  // Secondary/UI
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
  body: "'Inter', -apple-system, sans-serif",
  label: "'Montserrat', sans-serif",
}

// ═══ RESPONSIVE HELPERS ═══
export const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768
export const isTablet = () => typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024

// ═══ BRAND GRADIENT ═══
export const brandGradient = `linear-gradient(135deg, ${colors.gradientDeep} 0%, ${colors.gradientMedium} 33%, ${colors.gradientLight} 66%, ${colors.gradientPink} 100%)`

// ═══ REUSABLE STYLES ═══
export const lbl = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: colors.lovelabMuted,
  textTransform: 'uppercase',
  marginBottom: 6,
}

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

export const tag = (on) => ({
  padding: '6px 12px',
  borderRadius: 18,
  border: on ? `1.5px solid ${colors.inkPlum}` : `1px solid ${colors.lineGray}`,
  background: on ? colors.inkPlum : colors.porcelain,
  color: on ? colors.porcelain : colors.charcoal,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
  fontFamily: 'inherit',
  transition: 'all .12s',
  whiteSpace: 'nowrap',
})

export const qBtn = {
  width: 34,
  height: 34,
  border: 'none',
  background: colors.lumiereIvory,
  cursor: 'pointer',
  fontSize: 16,
  color: colors.charcoal,
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export const qInp = {
  width: 44,
  height: 34,
  border: 'none',
  borderLeft: `1px solid ${colors.lineGray}`,
  borderRight: `1px solid ${colors.lineGray}`,
  textAlign: 'center',
  fontSize: 13,
  fontFamily: 'inherit',
  fontWeight: 600,
  color: colors.inkPlum,
  background: colors.porcelain,
  outline: 'none',
}

// ═══ MODE TOGGLE PILL ═══
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

// ═══ LIVE TOTAL BAR ═══
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

// ═══ QUICK QTY BUTTON ═══
export const qtyQuick = (active) => ({
  padding: '4px 10px',
  borderRadius: 6,
  border: active ? `1.5px solid ${colors.inkPlum}` : `1px solid ${colors.lineGray}`,
  background: active ? colors.inkPlum : '#fff',
  color: active ? '#fff' : colors.charcoal,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'all .1s',
})

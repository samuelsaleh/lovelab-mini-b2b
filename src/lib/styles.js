export const fonts = {
  body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", monospace',
}

export const colors = {
  bg: '#ffffff',
  bgOff: '#f9f9f9',
  text: '#111111',
  textLight: '#666666',
  border: '#eaeaea',
  primary: '#000000',
  accent: '#0070f3',
  inkPlum: '#222', // Keeping the brand color but using it more selectively
  luxeGold: '#c5a059',
}

export const lbl = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#888',
  marginBottom: 6,
  fontWeight: 600,
}

// Cleaner tag style - no borders by default, softer active state
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
  // Hover state would be handled in CSS, but inline we can't easily. 
  // This clean flat look reduces "heaviness".
})

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

export const qInp = {
  width: 40,
  height: 28,
  border: 'none',
  textAlign: 'center',
  fontSize: 13,
  outline: 'none',
  fontWeight: 600,
  color: '#222',
  background: '#fff', // Ensure input background is white
}

export const qtyQuick = (active) => ({
  fontSize: 11,
  padding: '4px 8px',
  borderRadius: 4,
  background: active ? '#222' : '#f0f0f0',
  color: active ? '#fff' : '#666',
  border: 'none',
  cursor: 'pointer',
})

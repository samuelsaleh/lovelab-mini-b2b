export const lbl = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: '#aaa',
  textTransform: 'uppercase',
  marginBottom: 6,
}

export const inp = {
  padding: '8px 11px',
  borderRadius: 8,
  border: '1px solid #e5e5e5',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  background: '#fafafa',
  color: '#333',
  boxSizing: 'border-box',
}

export const tag = (on) => ({
  padding: '6px 12px',
  borderRadius: 18,
  border: on ? '1.5px solid #222' : '1px solid #e0e0e0',
  background: on ? '#222' : '#fff',
  color: on ? '#fff' : '#555',
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
  background: '#f5f5f3',
  cursor: 'pointer',
  fontSize: 16,
  color: '#333',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export const qInp = {
  width: 44,
  height: 34,
  border: 'none',
  borderLeft: '1px solid #e5e5e5',
  borderRight: '1px solid #e5e5e5',
  textAlign: 'center',
  fontSize: 13,
  fontFamily: 'inherit',
  fontWeight: 600,
  color: '#222',
  background: '#fff',
  outline: 'none',
}

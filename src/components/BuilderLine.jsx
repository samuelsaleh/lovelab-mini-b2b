import { memo } from 'react'
import { COLLECTIONS, CORD_COLORS } from '../lib/catalog'
import { isLight } from '../lib/utils'
import { lbl, tag, qBtn, qInp } from '../lib/styles'

export default memo(function BuilderLine({ line, index, total, onChange, onRemove }) {
  const col = line.collectionId ? COLLECTIONS.find((c) => c.id === line.collectionId) : null
  const palette = col ? CORD_COLORS[col.cord] || CORD_COLORS.nylon : []

  const set = (patch) => onChange(line.uid, patch)

  const toggleColor = (name) => {
    const has = line.colors.includes(name)
    set({ colors: has ? line.colors.filter((c) => c !== name) : [...line.colors, name] })
  }

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{ padding: '10px 14px', background: '#fafaf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => set({ expanded: !line.expanded })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>
            {col ? col.label : `Line ${index + 1}`}
            {col && line.caratIdx !== null && (
              <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>
                {col.carats[line.caratIdx]}ct · €{col.prices[line.caratIdx]}
              </span>
            )}
          </span>
          {line.colors.length > 0 && (
            <span style={{ fontSize: 10, color: '#aaa' }}>
              {line.colors.length} col · {line.colors.length * line.qty} pcs
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {total > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(line.uid) }}
              style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#ccc', padding: '0 4px' }}
            >
              ×
            </button>
          )}
          <span style={{ fontSize: 12, color: '#ccc', transform: line.expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s', display: 'inline-block' }}>
            ▼
          </span>
        </div>
      </div>

      {/* Body */}
      {line.expanded && (
        <div style={{ padding: '12px 14px' }}>
          {/* Collection */}
          <div style={{ marginBottom: 12 }}>
            <div style={lbl}>Collection</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {COLLECTIONS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => set({ collectionId: line.collectionId === c.id ? null : c.id, caratIdx: null, colors: [], qty: c.minC })}
                  style={tag(line.collectionId === c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Carat */}
          {col && (
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Carat</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {col.carats.map((ct, ci) => (
                  <button key={ct} onClick={() => set({ caratIdx: line.caratIdx === ci ? null : ci })} style={tag(line.caratIdx === ci)}>
                    {ct}ct — €{col.prices[ci]}
                    <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 4 }}>ret €{col.retail[ci]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Colors */}
          {col && (
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>Colors ({line.colors.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {palette.map((c) => (
                  <button
                    key={c.n}
                    title={c.n}
                    onClick={() => toggleColor(c.n)}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', background: c.h, flexShrink: 0, padding: 0,
                      border: line.colors.includes(c.n) ? '2.5px solid #222' : isLight(c.h) ? '1px solid #ddd' : '1px solid transparent',
                      cursor: 'pointer', transition: 'transform .1s',
                      transform: line.colors.includes(c.n) ? 'scale(1.15)' : 'scale(1)',
                      boxShadow: line.colors.includes(c.n) ? '0 0 0 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  />
                ))}
              </div>
              {line.colors.length > 0 && (
                <div style={{ fontSize: 9, color: '#aaa', marginTop: 4 }}>{line.colors.join(', ')}</div>
              )}
            </div>
          )}

          {/* Qty */}
          {col && (
            <div>
              <div style={lbl}>Qty per color (rec min: {col.minC})</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                  <button style={qBtn} onClick={() => set({ qty: Math.max(1, line.qty - 1) })}>−</button>
                  <input
                    type="number"
                    value={line.qty}
                    onChange={(e) => set({ qty: Math.max(1, parseInt(e.target.value) || 1) })}
                    style={qInp}
                  />
                  <button style={qBtn} onClick={() => set({ qty: line.qty + 1 })}>+</button>
                </div>
                {line.qty < col.minC && (
                  <span style={{ fontSize: 10, color: '#c0392b' }}>⚠ Below rec. min {col.minC}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

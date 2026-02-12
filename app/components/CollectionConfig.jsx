'use client'

import { useState, useCallback } from 'react'
import { CORD_COLORS, HOUSING } from '@/lib/catalog'
import { fmt, isLight } from '@/lib/utils'
import { colors } from '@/lib/styles'
import { mkColorConfig } from './BuilderPage'

const QTY_PRESETS = [1, 3, 5, 10]

export default function CollectionConfig({ line, col, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(true)
  const [sameForAll, setSameForAll] = useState(false)
  const [sharedSettings, setSharedSettings] = useState({
    caratIdx: null, housing: null, housingType: null,
    multiAttached: null, shape: null, size: null,
  })

  const palette = CORD_COLORS[col.cord] || CORD_COLORS.nylon
  const set = (patch) => onChange(line.uid, patch)

  // Color counts
  const colorCounts = {}
  line.colorConfigs.forEach(c => {
    colorCounts[c.colorName] = (colorCounts[c.colorName] || 0) + 1
  })

  // Completion check
  const isConfigComplete = (cfg) => {
    if (cfg.caratIdx === null) return false
    if (col.housing && !cfg.housing) return false
    if (col.shapes && col.shapes.length > 0 && !cfg.shape) return false
    if (col.sizes && col.sizes.length > 0 && !cfg.size) return false
    return true
  }

  const completeCount = line.colorConfigs.filter(c => isConfigComplete(c)).length
  const totalQty = line.colorConfigs.reduce((sum, c) => sum + c.qty, 0)
  const lineTotal = line.colorConfigs.reduce((sum, cfg) => {
    const price = cfg.caratIdx !== null ? col.prices[cfg.caratIdx] : 0
    return sum + (cfg.qty * price)
  }, 0)

  // Add a color
  const addColor = (colorName) => {
    const newCfg = sameForAll
      ? { ...mkColorConfig(colorName, col.minC), ...sharedSettings }
      : mkColorConfig(colorName, col.minC)
    set({ colorConfigs: [...line.colorConfigs, newCfg] })
  }

  // Remove a color config
  const removeConfig = (cfgId) => {
    set({ colorConfigs: line.colorConfigs.filter(c => c.id !== cfgId) })
  }

  // Update a color config
  const updateConfig = (cfgId, updates) => {
    set({
      colorConfigs: line.colorConfigs.map(c =>
        c.id === cfgId ? { ...c, ...updates } : c
      ),
    })
  }

  // Duplicate a color config (copy all settings, new id, insert right after)
  const duplicateConfig = (cfgId) => {
    const original = line.colorConfigs.find(c => c.id === cfgId)
    if (!original) return
    const copy = { ...original, id: Date.now() + Math.random() }
    const idx = line.colorConfigs.findIndex(c => c.id === cfgId)
    const updated = [...line.colorConfigs]
    updated.splice(idx + 1, 0, copy)
    set({ colorConfigs: updated })
  }

  // Toggle same-for-all & update shared settings
  const handleSameForAllToggle = () => {
    const next = !sameForAll
    setSameForAll(next)
    if (next && line.colorConfigs.length > 0) {
      // Use first config's settings as shared base
      const first = line.colorConfigs.find(c => c.caratIdx !== null) || line.colorConfigs[0]
      if (first) {
        const s = {
          caratIdx: first.caratIdx,
          housing: first.housing,
          housingType: first.housingType,
          multiAttached: first.multiAttached,
          shape: first.shape,
          size: first.size,
        }
        setSharedSettings(s)
      }
    }
  }

  // Update shared settings and propagate to all configs
  const updateShared = (updates) => {
    const next = { ...sharedSettings, ...updates }
    setSharedSettings(next)
    if (line.colorConfigs.length > 0) {
      set({
        colorConfigs: line.colorConfigs.map(cfg => ({ ...cfg, ...updates })),
      })
    }
  }

  // Housing options resolver
  const hasHousing = !!col.housing
  const hasShapes = col.shapes && col.shapes.length > 0
  const hasSizes = col.sizes && col.sizes.length > 0

  const renderHousingSelector = (cfg, patchFn) => {
    const selectedCarat = cfg.caratIdx !== null ? col.carats[cfg.caratIdx] : null
    const shapyShineBezelOnly = col.housing === 'shapyShine' && selectedCarat === '0.10'

    if (col.housing === 'standard') {
      return (
        <select
          value={cfg.housing || ''}
          onChange={(e) => patchFn({ housing: e.target.value || null })}
          style={selectStyle}
        >
          <option value="">Housing...</option>
          {HOUSING.standard.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      )
    }
    if (col.housing === 'goldMetal') {
      return (
        <select
          value={cfg.housing || ''}
          onChange={(e) => patchFn({ housing: e.target.value || null })}
          style={selectStyle}
        >
          <option value="">Housing...</option>
          {HOUSING.goldMetal.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      )
    }
    if (col.housing === 'multiThree') {
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={cfg.multiAttached === true ? 'attached' : cfg.multiAttached === false ? 'notAttached' : ''}
            onChange={(e) => {
              const v = e.target.value
              patchFn({ multiAttached: v === 'attached' ? true : v === 'notAttached' ? false : null, housing: null })
            }}
            style={{ ...selectStyle, minWidth: 80 }}
          >
            <option value="">Type...</option>
            <option value="attached">Attached</option>
            <option value="notAttached">Not Attached</option>
          </select>
          {cfg.multiAttached !== null && (
            <select
              value={cfg.housing || ''}
              onChange={(e) => patchFn({ housing: e.target.value || null })}
              style={selectStyle}
            >
              <option value="">Housing...</option>
              {(cfg.multiAttached ? HOUSING.multiThree.attached : HOUSING.multiThree.notAttached).map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          )}
        </div>
      )
    }
    if (col.housing === 'matchy') {
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={cfg.housingType || ''}
            onChange={(e) => patchFn({ housingType: e.target.value || null, housing: null })}
            style={{ ...selectStyle, minWidth: 70 }}
          >
            <option value="">Type...</option>
            <option value="bezel">Bezel</option>
            <option value="prong">Prong</option>
          </select>
          {cfg.housingType && (
            <select
              value={cfg.housing || ''}
              onChange={(e) => patchFn({ housing: e.target.value || null })}
              style={selectStyle}
            >
              <option value="">Housing...</option>
              {(cfg.housingType === 'bezel' ? HOUSING.matchyBezel : HOUSING.matchyProng).map(h => (
                <option key={h.id || h} value={h.label || h}>{h.label || h}</option>
              ))}
            </select>
          )}
        </div>
      )
    }
    if (col.housing === 'shapyShine') {
      if (shapyShineBezelOnly) {
        return (
          <select
            value={cfg.housing || ''}
            onChange={(e) => patchFn({ housing: e.target.value || null, housingType: 'bezel' })}
            style={selectStyle}
          >
            <option value="">Housing...</option>
            {HOUSING.shapyShineBezel.map(h => <option key={h} value={`Bezel ${h}`}>Bezel {h}</option>)}
          </select>
        )
      }
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={cfg.housingType || ''}
            onChange={(e) => patchFn({ housingType: e.target.value || null, housing: null })}
            style={{ ...selectStyle, minWidth: 70 }}
          >
            <option value="">Type...</option>
            <option value="bezel">Bezel</option>
            <option value="prong">Prong</option>
          </select>
          {cfg.housingType && (
            <select
              value={cfg.housing || ''}
              onChange={(e) => patchFn({ housing: e.target.value || null })}
              style={selectStyle}
            >
              <option value="">Housing...</option>
              {(cfg.housingType === 'bezel' ? HOUSING.shapyShineBezel : HOUSING.shapyShineProng).map(h => (
                <option key={h} value={cfg.housingType === 'bezel' ? `Bezel ${h}` : `Prong ${h}`}>
                  {h}
                </option>
              ))}
            </select>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div style={{
      border: '1px solid #e8e8e8', borderRadius: 12, marginBottom: 12,
      overflow: 'hidden', background: '#fff',
      boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
    }}>
      {/* ─── Header ─── */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '12px 16px', cursor: 'pointer', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          background: expanded ? '#fafafa' : '#fff',
          borderBottom: expanded ? '1px solid #eee' : 'none',
          transition: 'background .15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 14, fontWeight: 700,
            color: line.colorConfigs.length > 0 ? colors.inkPlum : '#333',
          }}>
            {col.label}
          </span>
          <span style={{ fontSize: 12, color: '#999' }}>
            €{col.prices[0]}-€{col.prices[col.prices.length - 1]}
          </span>
          {line.colorConfigs.length > 0 && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: `${colors.inkPlum}10`, color: colors.inkPlum,
              fontWeight: 600,
            }}>
              {line.colorConfigs.length} color{line.colorConfigs.length !== 1 ? 's' : ''} · {totalQty} pcs
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lineTotal > 0 && (
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>{fmt(lineTotal)}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(line.uid) }}
            style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#ccc', padding: 4 }}
            title="Remove collection"
          >x</button>
          <span style={{
            fontSize: 10, color: '#ccc',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform .2s', display: 'inline-block',
          }}>▼</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '14px 16px' }}>
          {/* ─── Color Palette ─── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Click colors to add
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {palette.map(c => {
                const count = colorCounts[c.n] || 0
                return (
                  <div key={c.n} style={{ position: 'relative' }}>
                    <button
                      title={c.n}
                      onClick={() => addColor(c.n)}
                      style={{
                        width: 30, height: 30, borderRadius: '50%', background: c.h, padding: 0,
                        border: count > 0 ? `2.5px solid ${colors.inkPlum}` : isLight(c.h) ? '1px solid #ddd' : '1px solid transparent',
                        cursor: 'pointer', transition: 'transform .1s',
                        transform: count > 0 ? 'scale(1.08)' : 'scale(1)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    />
                    {count > 0 && (
                      <span style={{
                        position: 'absolute', top: -3, right: -3,
                        width: 14, height: 14, borderRadius: '50%',
                        background: colors.inkPlum, color: '#fff',
                        fontSize: 8, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {count}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── Same for all toggle ─── */}
          {line.colorConfigs.length > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 8, background: '#f8f8f8',
              marginBottom: 12,
            }}>
              <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>Same settings for all colors</span>
              <button
                onClick={handleSameForAllToggle}
                style={{
                  padding: '4px 14px', borderRadius: 14, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                  border: sameForAll ? `1px solid ${colors.inkPlum}` : '1px solid #ddd',
                  background: sameForAll ? colors.inkPlum : '#f5f5f5',
                  color: sameForAll ? '#fff' : '#999',
                }}
              >
                {sameForAll ? 'ON' : 'OFF'}
              </button>
            </div>
          )}

          {/* ─── Shared settings row (when same-for-all is ON) ─── */}
          {sameForAll && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, border: `1px solid ${colors.inkPlum}20`,
              background: '#fdf7fa', marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.inkPlum, marginBottom: 8 }}>Shared Settings</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {/* Carat */}
                <select
                  value={sharedSettings.caratIdx !== null ? sharedSettings.caratIdx : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value)
                    updateShared({ caratIdx: val, housing: null, housingType: null, multiAttached: null, shape: null, size: null })
                  }}
                  style={selectStyle}
                >
                  <option value="">Carat...</option>
                  {col.carats.map((ct, ci) => (
                    <option key={ct} value={ci}>{ct} ct - €{col.prices[ci]}</option>
                  ))}
                </select>

                {/* Housing */}
                {hasHousing && sharedSettings.caratIdx !== null && (
                  renderHousingSelector(sharedSettings, updateShared)
                )}

                {/* Shape */}
                {hasShapes && sharedSettings.caratIdx !== null && (!hasHousing || !!sharedSettings.housing) && (
                  <select
                    value={sharedSettings.shape || ''}
                    onChange={(e) => updateShared({ shape: e.target.value || null })}
                    style={selectStyle}
                  >
                    <option value="">Shape...</option>
                    {col.shapes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}

                {/* Size */}
                {hasSizes && sharedSettings.caratIdx !== null && (!hasHousing || !!sharedSettings.housing) && (!hasShapes || !!sharedSettings.shape) && (
                  <select
                    value={sharedSettings.size || ''}
                    onChange={(e) => updateShared({ size: e.target.value || null })}
                    style={selectStyle}
                  >
                    <option value="">Size...</option>
                    {col.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* ─── Config Table ─── */}
          {line.colorConfigs.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eee' }}>
                    <th style={thStyle}>Color</th>
                    <th style={thStyle}>Carat</th>
                    {hasHousing && <th style={thStyle}>Housing</th>}
                    {hasShapes && <th style={thStyle}>Shape</th>}
                    {hasSizes && <th style={thStyle}>Size</th>}
                    <th style={thStyle}>Qty</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                    <th style={{ ...thStyle, width: 54 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {line.colorConfigs.map(cfg => {
                    const colorDef = palette.find(p => p.n === cfg.colorName) || { h: '#ccc' }
                    const price = cfg.caratIdx !== null ? col.prices[cfg.caratIdx] : 0
                    const rowTotal = price * cfg.qty
                    const complete = isConfigComplete(cfg)

                    return (
                      <tr key={cfg.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        {/* Color (editable dropdown) */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              width: 14, height: 14, borderRadius: '50%', background: colorDef.h,
                              border: isLight(colorDef.h) ? '1px solid #ddd' : 'none', flexShrink: 0,
                            }} />
                            <select
                              value={cfg.colorName}
                              onChange={(e) => updateConfig(cfg.id, { colorName: e.target.value })}
                              style={{ ...selectStyle, fontWeight: 500, minWidth: 90 }}
                            >
                              {palette.map(c => (
                                <option key={c.n} value={c.n}>{c.n}</option>
                              ))}
                            </select>
                          </div>
                        </td>

                        {/* Carat */}
                        <td style={tdStyle}>
                          {sameForAll ? (
                            <span style={{ color: '#888', fontSize: 11 }}>
                              {sharedSettings.caratIdx !== null ? `${col.carats[sharedSettings.caratIdx]} ct` : '-'}
                            </span>
                          ) : (
                            <select
                              value={cfg.caratIdx !== null ? cfg.caratIdx : ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : parseInt(e.target.value)
                                updateConfig(cfg.id, { caratIdx: val, housing: null, housingType: null, multiAttached: null, shape: null, size: null })
                              }}
                              style={selectStyle}
                            >
                              <option value="">-</option>
                              {col.carats.map((ct, ci) => (
                                <option key={ct} value={ci}>{ct} ct - €{col.prices[ci]}</option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* Housing */}
                        {hasHousing && (
                          <td style={tdStyle}>
                            {sameForAll ? (
                              <span style={{ color: '#888', fontSize: 11 }}>{sharedSettings.housing || '-'}</span>
                            ) : cfg.caratIdx !== null ? (
                              renderHousingSelector(cfg, (updates) => updateConfig(cfg.id, updates))
                            ) : (
                              <span style={{ color: '#ccc', fontSize: 11 }}>-</span>
                            )}
                          </td>
                        )}

                        {/* Shape */}
                        {hasShapes && (
                          <td style={tdStyle}>
                            {sameForAll ? (
                              <span style={{ color: '#888', fontSize: 11 }}>{sharedSettings.shape || '-'}</span>
                            ) : cfg.caratIdx !== null && (!hasHousing || !!cfg.housing) ? (
                              <select
                                value={cfg.shape || ''}
                                onChange={(e) => updateConfig(cfg.id, { shape: e.target.value || null })}
                                style={selectStyle}
                              >
                                <option value="">-</option>
                                {col.shapes.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <span style={{ color: '#ccc', fontSize: 11 }}>-</span>
                            )}
                          </td>
                        )}

                        {/* Size */}
                        {hasSizes && (
                          <td style={tdStyle}>
                            {sameForAll ? (
                              <span style={{ color: '#888', fontSize: 11 }}>{sharedSettings.size || '-'}</span>
                            ) : cfg.caratIdx !== null && (!hasHousing || !!cfg.housing) && (!hasShapes || !!cfg.shape) ? (
                              <select
                                value={cfg.size || ''}
                                onChange={(e) => updateConfig(cfg.id, { size: e.target.value || null })}
                                style={selectStyle}
                              >
                                <option value="">-</option>
                                {col.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <span style={{ color: '#ccc', fontSize: 11 }}>-</span>
                            )}
                          </td>
                        )}

                        {/* Quantity */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <button
                              onClick={() => updateConfig(cfg.id, { qty: Math.max(1, cfg.qty - 1) })}
                              style={qtyBtnStyle}
                            >-</button>
                            <input
                              type="number"
                              value={cfg.qty}
                              onChange={(e) => updateConfig(cfg.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                              style={qtyInputStyle}
                            />
                            <button
                              onClick={() => updateConfig(cfg.id, { qty: cfg.qty + 1 })}
                              style={qtyBtnStyle}
                            >+</button>
                          </div>
                          {cfg.qty < col.minC && (
                            <div style={{ fontSize: 9, color: '#e74c3c', marginTop: 2 }}>Min {col.minC}</div>
                          )}
                        </td>

                        {/* Row total */}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: rowTotal > 0 ? '#333' : '#ccc' }}>
                          {rowTotal > 0 ? fmt(rowTotal) : '-'}
                        </td>

                        {/* Duplicate + Remove */}
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                            <button
                              onClick={() => duplicateConfig(cfg.id)}
                              title="Duplicate row"
                              style={{
                                background: 'none', border: 'none', color: '#ccc', cursor: 'pointer',
                                fontSize: 12, padding: '2px 4px', transition: 'color .15s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = colors.inkPlum }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc' }}
                            >+</button>
                            <button
                              onClick={() => removeConfig(cfg.id)}
                              title="Remove row"
                              style={{
                                background: 'none', border: 'none', color: '#ccc', cursor: 'pointer',
                                fontSize: 14, padding: '2px 4px', transition: 'color .15s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#e74c3c' }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc' }}
                            >x</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {line.colorConfigs.length === 0 && (
            <div style={{ fontSize: 12, color: '#bbb', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
              Click colors above to start building
            </div>
          )}

          {/* Section subtotal */}
          {lineTotal > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0 0', borderTop: '1px solid #f0f0f0', marginTop: 10,
            }}>
              <span style={{ fontSize: 12, color: '#888' }}>
                {completeCount}/{line.colorConfigs.length} complete · {totalQty} pcs
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum }}>{fmt(lineTotal)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Table styles ───
const selectStyle = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid #e0e0e0',
  fontSize: 11, fontFamily: 'inherit', outline: 'none', color: '#333',
  background: '#fff', cursor: 'pointer', minWidth: 60,
}

const thStyle = {
  padding: '8px 6px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: '#999', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '8px 6px', verticalAlign: 'middle',
}

const qtyBtnStyle = {
  width: 24, height: 24, borderRadius: 4, border: '1px solid #e0e0e0',
  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
  fontFamily: 'inherit',
}

const qtyInputStyle = {
  width: 36, height: 24, border: '1px solid #e0e0e0', borderRadius: 4,
  textAlign: 'center', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
  outline: 'none', color: colors.inkPlum,
}

import { memo, useState } from 'react'
import { COLLECTIONS, CORD_COLORS, HOUSING } from '../lib/catalog'
import { isLight } from '../lib/utils'
import { lbl, tag, qBtn, qInp, colors } from '../lib/styles'
import { mkColorConfig } from './BuilderPage'

const QTY_PRESETS = [1, 3, 5, 10]

// ─── Accordion Section (shared helper) ───
const AccordionSection = ({ label, value, isOpen, onToggle, children, isCompleted }) => (
  <div style={{ borderBottom: '1px solid #f0f0f0' }}>
    <div
      onClick={onToggle}
      style={{
        padding: '12px 14px', cursor: 'pointer', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        background: isOpen ? '#fafafa' : '#fff', transition: 'background 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: isCompleted ? colors.luxeGold : '#999',
          width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${isCompleted ? colors.luxeGold : '#ddd'}`,
          borderRadius: '50%', marginRight: 4,
        }}>
          {isCompleted ? '✓' : (isOpen ? '•' : '')}
        </span>
        <span style={{ fontSize: 13, fontWeight: isOpen ? 600 : 400, color: '#222' }}>{label}</span>
      </div>
      {value && !isOpen && (
        <span style={{ fontSize: 13, color: '#222', fontWeight: 500 }}>{value}</span>
      )}
    </div>
    {isOpen && (
      <div style={{ padding: '0 14px 14px 42px', animation: 'fadeIn 0.2s ease-in-out' }}>
        {children}
      </div>
    )}
  </div>
)

// ─── ColorConfigCard: one per-color config with carat, housing, shape, size, qty ───
const ColorConfigCard = ({ cfg, col, palette, onUpdate, onRemove, onDuplicate, defaultExpanded, simplified }) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const patch = (updates) => onUpdate(cfg.id, updates)

  // Derived state
  const selectedCarat = cfg.caratIdx !== null ? col.carats[cfg.caratIdx] : null
  const hasHousing = !!col.housing
  const hasShapes = col.shapes && col.shapes.length > 0
  const hasSizes = col.sizes && col.sizes.length > 0
  const shapyShineBezelOnly = col.housing === 'shapyShine' && selectedCarat === '0.10'

  // Completion checks
  const caratDone = cfg.caratIdx !== null
  const housingDone = !hasHousing || !!cfg.housing
  const shapeDone = !hasShapes || !!cfg.shape
  const sizeDone = !hasSizes || !!cfg.size
  const isComplete = caratDone && housingDone && shapeDone && sizeDone

  // Color swatch
  const colorDef = palette.find((p) => p.n === cfg.colorName) || { h: '#ccc' }

  // Build summary
  const summaryParts = []
  if (selectedCarat) summaryParts.push(`${selectedCarat}ct`)
  if (cfg.housing) summaryParts.push(cfg.housing)
  if (cfg.shape) summaryParts.push(cfg.shape)
  if (cfg.size) summaryParts.push(cfg.size)
  summaryParts.push(`qty ${cfg.qty}`)
  const summary = summaryParts.join(' · ')

  return (
    <div style={{
      border: `1px solid ${isComplete ? '#e0e0e0' : '#f0e0d0'}`,
      borderRadius: 10, marginBottom: 8, overflow: 'hidden', background: '#fff',
    }}>
      {/* Card header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '8px 12px', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          background: expanded ? '#fafafa' : '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%', background: colorDef.h,
            border: isLight(colorDef.h) ? '1px solid #ddd' : '1px solid transparent', flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>{cfg.colorName}</span>
          {!expanded && (
            <span style={{ fontSize: 11, color: '#888' }}>{summary}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isComplete && (
            <span style={{ fontSize: 10, color: colors.luxeGold, fontWeight: 600 }}>✓</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(cfg.id) }}
            style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 13, padding: '0 3px' }}
            title="Duplicate this color config"
          >❐</button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(cfg.id) }}
            style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16, padding: '0 3px' }}
            title="Remove this color config"
          >×</button>
        </div>
      </div>

      {/* Card body */}
      {expanded && (
        <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #f5f5f5' }}>
          {/* Carat / Housing / Shape / Size — hidden in simplified (consistent) mode */}
          {!simplified && (
            <>
              {/* Carat */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...lbl, marginBottom: 4 }}>Carat</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {col.carats.map((ct, ci) => (
                    <button
                      key={ct}
                      onClick={() => patch({
                        caratIdx: ci,
                        housing: null, housingType: null, multiAttached: null,
                        shape: null, size: null,
                      })}
                      style={tag(cfg.caratIdx === ci)}
                    >
                      {ct}ct <span style={{ opacity: 0.4, margin: '0 3px' }}>|</span> €{col.prices[ci]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Housing (conditional) */}
              {caratDone && hasHousing && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...lbl, marginBottom: 4 }}>Housing</div>
                  {col.housing === 'standard' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {HOUSING.standard.map((h) => (
                        <button key={h} onClick={() => patch({ housing: h })} style={tag(cfg.housing === h)}>{h}</button>
                      ))}
                    </div>
                  )}
                  {col.housing === 'goldMetal' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {HOUSING.goldMetal.map((h) => (
                        <button key={h} onClick={() => patch({ housing: h })} style={tag(cfg.housing === h)}>{h}</button>
                      ))}
                    </div>
                  )}
                  {col.housing === 'multiThree' && (
                    <div>
                      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                        <button onClick={() => patch({ multiAttached: true, housing: null })} style={tag(cfg.multiAttached === true)}>Attached</button>
                        <button onClick={() => patch({ multiAttached: false, housing: null })} style={tag(cfg.multiAttached === false)}>Not Attached</button>
                      </div>
                      {cfg.multiAttached !== null && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {(cfg.multiAttached ? HOUSING.multiThree.attached : HOUSING.multiThree.notAttached).map((h) => (
                            <button key={h} onClick={() => patch({ housing: h })} style={tag(cfg.housing === h)}>{h}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {col.housing === 'matchy' && (
                    <div>
                      <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                        <button onClick={() => patch({ housingType: 'bezel', housing: null })} style={tag(cfg.housingType === 'bezel')}>Bezel</button>
                        <button onClick={() => patch({ housingType: 'prong', housing: null })} style={tag(cfg.housingType === 'prong')}>Prong</button>
                      </div>
                      {cfg.housingType && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {(cfg.housingType === 'bezel' ? HOUSING.matchyBezel : HOUSING.matchyProng).map((h) => (
                            <button key={h.id || h} onClick={() => patch({ housing: h.label || h })} style={tag(cfg.housing === (h.label || h))}>
                              {h.label || h}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {col.housing === 'shapyShine' && (
                    <div>
                      {shapyShineBezelOnly ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {HOUSING.shapyShineBezel.map((h) => (
                            <button key={h} onClick={() => patch({ housing: `Bezel ${h}`, housingType: 'bezel' })} style={tag(cfg.housing === `Bezel ${h}`)}>
                              Bezel {h}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                            <button onClick={() => patch({ housingType: 'bezel', housing: null })} style={tag(cfg.housingType === 'bezel')}>Bezel</button>
                            <button onClick={() => patch({ housingType: 'prong', housing: null })} style={tag(cfg.housingType === 'prong')}>Prong</button>
                          </div>
                          {cfg.housingType && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {(cfg.housingType === 'bezel' ? HOUSING.shapyShineBezel : HOUSING.shapyShineProng).map((h) => (
                                <button key={h} onClick={() => patch({ housing: cfg.housingType === 'bezel' ? `Bezel ${h}` : `Prong ${h}` })} style={tag(cfg.housing === (cfg.housingType === 'bezel' ? `Bezel ${h}` : `Prong ${h}`))}>
                                  {h}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Shape (conditional) */}
              {caratDone && housingDone && hasShapes && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...lbl, marginBottom: 4 }}>Shape</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {col.shapes.map((s) => (
                      <button key={s} onClick={() => patch({ shape: s })} style={tag(cfg.shape === s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size (conditional) */}
              {caratDone && housingDone && shapeDone && hasSizes && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...lbl, marginBottom: 4 }}>Size</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {col.sizes.map((s) => (
                      <button key={s} onClick={() => patch({ size: s })} style={tag(cfg.size === s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Quantity — always shown */}
          <div>
            <div style={{ ...lbl, marginBottom: 4 }}>Quantity</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #eee', background: '#fff' }}>
                <button style={{ ...qBtn, width: 28, height: 28, fontSize: 14 }} onClick={() => patch({ qty: Math.max(1, cfg.qty - 1) })}>−</button>
                <input
                  type="number"
                  value={cfg.qty}
                  onChange={(e) => patch({ qty: Math.max(1, parseInt(e.target.value) || 1) })}
                  style={{ ...qInp, width: 40, height: 28, fontSize: 12 }}
                />
                <button style={{ ...qBtn, width: 28, height: 28, fontSize: 14 }} onClick={() => patch({ qty: cfg.qty + 1 })}>+</button>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {QTY_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => patch({ qty: p })}
                    style={{
                      padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      border: cfg.qty === p ? `1px solid ${colors.luxeGold}` : '1px solid #eee',
                      background: cfg.qty === p ? '#fdf7f0' : '#fafafa',
                      color: cfg.qty === p ? colors.luxeGold : '#888',
                      fontFamily: 'inherit',
                    }}
                  >{p}</button>
                ))}
              </div>
            </div>
            {cfg.qty < col.minC && (
              <div style={{ fontSize: 10, color: '#e74c3c', marginTop: 4 }}>
                ⚠ Minimum recommended: {col.minC}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main BuilderLine ───
export default memo(function BuilderLine({ line, index, total, onChange, onRemove, onDuplicate }) {
  const col = line.collectionId ? COLLECTIONS.find((c) => c.id === line.collectionId) : null
  const palette = col ? CORD_COLORS[col.cord] || CORD_COLORS.nylon : []

  const [activeSection, setActiveSection] = useState('collection')

  // Consistent mode: set carat/housing/shape/size once, auto-fill all colors
  const [consistent, setConsistent] = useState(false)
  const [sharedSettings, setSharedSettings] = useState({
    caratIdx: null, housing: null, housingType: null,
    multiAttached: null, shape: null, size: null,
  })

  const set = (patch) => onChange(line.uid, patch)

  // Helper: update a shared setting and propagate to all existing configs
  const updateShared = (updates) => {
    const next = { ...sharedSettings, ...updates }
    setSharedSettings(next)
    // Propagate to all existing color configs
    if (line.colorConfigs.length > 0) {
      set({
        colorConfigs: line.colorConfigs.map((cfg) => ({ ...cfg, ...updates })),
      })
    }
  }

  // Summary
  const totalQty = line.colorConfigs.reduce((sum, c) => sum + c.qty, 0)
  const completeConfigs = col
    ? line.colorConfigs.filter((cfg) => {
        if (cfg.caratIdx === null) return false
        if (col.housing && !cfg.housing) return false
        if (col.shapes && col.shapes.length > 0 && !cfg.shape) return false
        if (col.sizes && col.sizes.length > 0 && !cfg.size) return false
        return true
      }).length
    : 0
  const summaryLine = [
    col ? col.label : '',
    line.colorConfigs.length > 0 ? `${line.colorConfigs.length} color${line.colorConfigs.length > 1 ? 's' : ''}` : '',
    line.colorConfigs.length > 0 ? `${totalQty} pcs` : '',
    completeConfigs > 0 && completeConfigs < line.colorConfigs.length
      ? `${completeConfigs}/${line.colorConfigs.length} complete`
      : '',
  ].filter(Boolean).join(' · ')

  // Add color config
  const addColorConfig = (colorName) => {
    const minC = col ? col.minC : 3
    const newCfg = consistent
      ? { ...mkColorConfig(colorName, minC), ...sharedSettings }
      : mkColorConfig(colorName, minC)
    set({ colorConfigs: [...line.colorConfigs, newCfg] })
  }

  // Update a specific color config
  const updateConfig = (cfgId, updates) => {
    set({
      colorConfigs: line.colorConfigs.map((c) =>
        c.id === cfgId ? { ...c, ...updates } : c
      ),
    })
  }

  // Remove a specific color config
  const removeConfig = (cfgId) => {
    set({ colorConfigs: line.colorConfigs.filter((c) => c.id !== cfgId) })
  }

  // Duplicate a specific color config (copies all settings, new id)
  const duplicateConfig = (cfgId) => {
    const original = line.colorConfigs.find((c) => c.id === cfgId)
    if (!original) return
    const copy = { ...original, id: Date.now() + Math.random() }
    // Insert right after the original
    const idx = line.colorConfigs.findIndex((c) => c.id === cfgId)
    const updated = [...line.colorConfigs]
    updated.splice(idx + 1, 0, copy)
    set({ colorConfigs: updated })
  }

  // Apply first complete config's settings to all other configs
  const applyToAll = () => {
    if (line.colorConfigs.length < 2) return
    const source = line.colorConfigs.find((cfg) => cfg.caratIdx !== null)
    if (!source) return
    set({
      colorConfigs: line.colorConfigs.map((cfg) => ({
        ...cfg,
        caratIdx: source.caratIdx,
        housing: source.housing,
        housingType: source.housingType,
        multiAttached: source.multiAttached,
        shape: source.shape,
        size: source.size,
        // keep each config's own qty and colorName
      })),
    })
  }

  // Count how many configs exist per color name (for badge)
  const colorCounts = {}
  line.colorConfigs.forEach((c) => {
    colorCounts[c.colorName] = (colorCounts[c.colorName] || 0) + 1
  })

  // Check if any config is complete (for "apply to all" button)
  const hasAnyComplete = col && line.colorConfigs.some((cfg) => {
    if (cfg.caratIdx === null) return false
    if (col.housing && !cfg.housing) return false
    if (col.shapes && col.shapes.length > 0 && !cfg.shape) return false
    if (col.sizes && col.sizes.length > 0 && !cfg.size) return false
    return true
  })

  return (
    <div style={{
      border: '1px solid #eee', borderRadius: 12, marginBottom: 12,
      overflow: 'hidden', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
    }}>
      {/* Header */}
      <div
        style={{
          padding: '14px 16px', background: '#fff', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
          borderBottom: line.expanded ? '1px solid #eee' : 'none',
        }}
        onClick={() => set({ expanded: !line.expanded })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', background: '#f5f5f5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#888',
          }}>
            {index + 1}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>
              {col ? col.label : 'New Line'}
            </span>
            {col && (
              <span style={{ fontSize: 12, color: '#888' }}>{summaryLine}</span>
            )}
            {!col && (
              <span style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>Start building...</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {col && (
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate && onDuplicate(line.uid) }}
              style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#ccc', padding: 4 }}
              title="Duplicate line"
            >❐</button>
          )}
          {total > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(line.uid) }}
              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#ddd', padding: 4 }}
              title="Remove line"
            >×</button>
          )}
          <span style={{ fontSize: 10, color: '#ccc', transform: line.expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>▼</span>
        </div>
      </div>

      {/* Body */}
      {line.expanded && (
        <div>
          {/* 1. Collection */}
          <AccordionSection
            label="Collection"
            value={col ? col.label : null}
            isOpen={activeSection === 'collection'}
            onToggle={() => setActiveSection(activeSection === 'collection' ? null : 'collection')}
            isCompleted={!!col}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLLECTIONS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    set({ collectionId: c.id, colorConfigs: [] })
                    setActiveSection('colors')
                  }}
                  style={tag(line.collectionId === c.id)}
                >{c.label}</button>
              ))}
            </div>
          </AccordionSection>

          {/* 2. Consistent toggle + shared selectors */}
          {col && (
            <div style={{ borderBottom: '1px solid #f0f0f0', padding: '10px 14px 10px 42px' }}>
              {/* Toggle row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: consistent ? 10 : 0 }}>
                <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>Same settings for all colors?</span>
                <button
                  onClick={() => setConsistent(!consistent)}
                  style={{
                    padding: '4px 14px', borderRadius: 14, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                    border: consistent ? `1px solid ${colors.luxeGold}` : '1px solid #ddd',
                    background: consistent ? colors.luxeGold : '#f5f5f5',
                    color: consistent ? '#fff' : '#999',
                  }}
                >
                  {consistent ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Shared selectors (only when consistent is ON) */}
              {consistent && (
                <div>
                  {/* Shared Carat */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ ...lbl, marginBottom: 4 }}>Carat</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {col.carats.map((ct, ci) => (
                        <button
                          key={ct}
                          onClick={() => updateShared({
                            caratIdx: ci,
                            housing: null, housingType: null, multiAttached: null,
                            shape: null, size: null,
                          })}
                          style={tag(sharedSettings.caratIdx === ci)}
                        >
                          {ct}ct <span style={{ opacity: 0.4, margin: '0 3px' }}>|</span> €{col.prices[ci]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Shared Housing */}
                  {sharedSettings.caratIdx !== null && !!col.housing && (() => {
                    const sCarat = col.carats[sharedSettings.caratIdx]
                    const sBezelOnly = col.housing === 'shapyShine' && sCarat === '0.10'
                    return (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ ...lbl, marginBottom: 4 }}>Housing</div>
                        {col.housing === 'standard' && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {HOUSING.standard.map((h) => (
                              <button key={h} onClick={() => updateShared({ housing: h })} style={tag(sharedSettings.housing === h)}>{h}</button>
                            ))}
                          </div>
                        )}
                        {col.housing === 'goldMetal' && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {HOUSING.goldMetal.map((h) => (
                              <button key={h} onClick={() => updateShared({ housing: h })} style={tag(sharedSettings.housing === h)}>{h}</button>
                            ))}
                          </div>
                        )}
                        {col.housing === 'multiThree' && (
                          <div>
                            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                              <button onClick={() => updateShared({ multiAttached: true, housing: null })} style={tag(sharedSettings.multiAttached === true)}>Attached</button>
                              <button onClick={() => updateShared({ multiAttached: false, housing: null })} style={tag(sharedSettings.multiAttached === false)}>Not Attached</button>
                            </div>
                            {sharedSettings.multiAttached !== null && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {(sharedSettings.multiAttached ? HOUSING.multiThree.attached : HOUSING.multiThree.notAttached).map((h) => (
                                  <button key={h} onClick={() => updateShared({ housing: h })} style={tag(sharedSettings.housing === h)}>{h}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {col.housing === 'matchy' && (
                          <div>
                            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                              <button onClick={() => updateShared({ housingType: 'bezel', housing: null })} style={tag(sharedSettings.housingType === 'bezel')}>Bezel</button>
                              <button onClick={() => updateShared({ housingType: 'prong', housing: null })} style={tag(sharedSettings.housingType === 'prong')}>Prong</button>
                            </div>
                            {sharedSettings.housingType && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {(sharedSettings.housingType === 'bezel' ? HOUSING.matchyBezel : HOUSING.matchyProng).map((h) => (
                                  <button key={h.id || h} onClick={() => updateShared({ housing: h.label || h })} style={tag(sharedSettings.housing === (h.label || h))}>
                                    {h.label || h}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {col.housing === 'shapyShine' && (
                          <div>
                            {sBezelOnly ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {HOUSING.shapyShineBezel.map((h) => (
                                  <button key={h} onClick={() => updateShared({ housing: `Bezel ${h}`, housingType: 'bezel' })} style={tag(sharedSettings.housing === `Bezel ${h}`)}>
                                    Bezel {h}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                                  <button onClick={() => updateShared({ housingType: 'bezel', housing: null })} style={tag(sharedSettings.housingType === 'bezel')}>Bezel</button>
                                  <button onClick={() => updateShared({ housingType: 'prong', housing: null })} style={tag(sharedSettings.housingType === 'prong')}>Prong</button>
                                </div>
                                {sharedSettings.housingType && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                    {(sharedSettings.housingType === 'bezel' ? HOUSING.shapyShineBezel : HOUSING.shapyShineProng).map((h) => (
                                      <button key={h} onClick={() => updateShared({ housing: sharedSettings.housingType === 'bezel' ? `Bezel ${h}` : `Prong ${h}` })} style={tag(sharedSettings.housing === (sharedSettings.housingType === 'bezel' ? `Bezel ${h}` : `Prong ${h}`))}>
                                        {h}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Shared Shape */}
                  {sharedSettings.caratIdx !== null && (!col.housing || !!sharedSettings.housing) && col.shapes && col.shapes.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...lbl, marginBottom: 4 }}>Shape</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {col.shapes.map((s) => (
                          <button key={s} onClick={() => updateShared({ shape: s })} style={tag(sharedSettings.shape === s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shared Size */}
                  {sharedSettings.caratIdx !== null && (!col.housing || !!sharedSettings.housing) && (!col.shapes || !col.shapes.length || !!sharedSettings.shape) && col.sizes && col.sizes.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ ...lbl, marginBottom: 4 }}>Size</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {col.sizes.map((s) => (
                          <button key={s} onClick={() => updateShared({ size: s })} style={tag(sharedSettings.size === s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Colors & Per-color configs */}
          {col && (
            <AccordionSection
              label="Colors & Configuration"
              value={line.colorConfigs.length > 0 ? `${line.colorConfigs.length} added` : null}
              isOpen={activeSection === 'colors'}
              onToggle={() => setActiveSection(activeSection === 'colors' ? null : 'colors')}
              isCompleted={line.colorConfigs.length > 0 && completeConfigs === line.colorConfigs.length}
            >
              {/* Color Palette Grid */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...lbl, marginBottom: 6 }}>Click a color to add it</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {palette.map((c) => {
                    const count = colorCounts[c.n] || 0
                    return (
                      <div key={c.n} style={{ position: 'relative' }}>
                        <button
                          title={c.n}
                          onClick={() => addColorConfig(c.n)}
                          style={{
                            width: 32, height: 32, borderRadius: '50%', background: c.h, flexShrink: 0, padding: 0,
                            border: count > 0 ? '3px solid #222' : isLight(c.h) ? '1px solid #ddd' : '1px solid transparent',
                            cursor: 'pointer', transition: 'transform .1s',
                            transform: count > 0 ? 'scale(1.1)' : 'scale(1)',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          }}
                        />
                        {count > 0 && (
                          <span style={{
                            position: 'absolute', top: -4, right: -4,
                            width: 16, height: 16, borderRadius: '50%',
                            background: colors.luxeGold, color: '#fff',
                            fontSize: 9, fontWeight: 700,
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

              {/* Apply to all button — only in non-consistent mode */}
              {!consistent && hasAnyComplete && line.colorConfigs.length > 1 && (
                <button
                  onClick={applyToAll}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8, marginBottom: 10,
                    border: `1px solid ${colors.luxeGold}`, background: '#fffaf5',
                    color: colors.luxeGold, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'opacity .15s',
                  }}
                >
                  Apply first completed settings to all colors
                </button>
              )}

              {/* Color Config Cards */}
              {line.colorConfigs.length > 0 && (
                <div>
                  {line.colorConfigs.map((cfg, i) => (
                    <ColorConfigCard
                      key={cfg.id}
                      cfg={cfg}
                      col={col}
                      palette={palette}
                      onUpdate={updateConfig}
                      onRemove={removeConfig}
                      onDuplicate={duplicateConfig}
                      defaultExpanded={!consistent && i === line.colorConfigs.length - 1}
                      simplified={consistent}
                    />
                  ))}
                </div>
              )}

              {line.colorConfigs.length === 0 && (
                <div style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic', textAlign: 'center', padding: 8 }}>
                  Click colors above to start configuring
                </div>
              )}
            </AccordionSection>
          )}
        </div>
      )}
    </div>
  )
})

import { memo, useState, useEffect } from 'react'
import { COLLECTIONS, CORD_COLORS, HOUSING } from '../lib/catalog'
import { isLight } from '../lib/utils'
import { lbl, tag, qBtn, qInp, qtyQuick, colors } from '../lib/styles'

const QTY_PRESETS = [1, 3, 5, 10]

// Helper component for Accordion Sections
const AccordionSection = ({ label, value, isOpen, onToggle, children, isCompleted }) => {
  return (
    <div style={{ borderBottom: '1px solid #f0f0f0' }}>
      <div 
        onClick={onToggle}
        style={{ 
          padding: '12px 14px', 
          cursor: 'pointer', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: isOpen ? '#fafafa' : '#fff',
          transition: 'background 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ 
            fontSize: 11, 
            fontWeight: 600, 
            color: isCompleted ? colors.luxeGold : '#999',
            width: 16, 
            height: 16, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            border: `1px solid ${isCompleted ? colors.luxeGold : '#ddd'}`,
            borderRadius: '50%',
            marginRight: 4
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
}

export default memo(function BuilderLine({ line, index, total, onChange, onRemove, onDuplicate }) {
  const col = line.collectionId ? COLLECTIONS.find((c) => c.id === line.collectionId) : null
  const palette = col ? CORD_COLORS[col.cord] || CORD_COLORS.nylon : []

  // Local state for the active accordion section
  const [activeSection, setActiveSection] = useState('collection')

  const set = (patch) => onChange(line.uid, patch)

  // Logic to determine available options
  const hasHousing = col && col.housing
  const hasShapes = col && col.shapes && col.shapes.length > 0
  const hasSizes = col && col.sizes && col.sizes.length > 0
  const selectedCarat = col && line.caratIdx !== null ? col.carats[line.caratIdx] : null
  const shapyShineBezelOnly = col?.housing === 'shapyShine' && selectedCarat === '0.10'

  // Auto-open next section when a selection is made (if it wasn't already open)
  // We use a small helper to update line AND move to next section
  const updateAndNext = (patch, nextSection) => {
    set(patch)
    if (nextSection) {
      setActiveSection(nextSection)
    }
  }

  const toggleColor = (name) => {
    // If color is already selected, remove it
    if (line.colors.some(c => (typeof c === 'string' ? c : c.name) === name)) {
      set({ 
        colors: line.colors.filter(c => (typeof c === 'string' ? c : c.name) !== name) 
      })
    } else {
      // Add new color with default qty (using line.qty or 1)
      set({ 
        colors: [...line.colors, { name, qty: line.qty || 1 }] 
      })
    }
  }

  // Update qty for a specific color
  const updateColorQty = (name, newQty) => {
    set({
      colors: line.colors.map(c => {
        const cName = typeof c === 'string' ? c : c.name
        if (cName === name) {
          return { name: cName, qty: Math.max(1, newQty) }
        }
        return typeof c === 'string' ? { name: c, qty: line.qty || 1 } : c
      })
    })
  }

  // Helper to get qty for a color (handling legacy string format)
  const getColorQty = (name) => {
    const c = line.colors.find(c => (typeof c === 'string' ? c : c.name) === name)
    if (!c) return 0
    return typeof c === 'string' ? (line.qty || 1) : c.qty
  }

  // Summary string generation
  const totalQty = line.colors.reduce((sum, c) => sum + (typeof c === 'string' ? (line.qty || 1) : c.qty), 0)
  const summaryLine = [
    col ? col.label : '',
    col && line.caratIdx !== null ? `${col.carats[line.caratIdx]}ct` : '',
    line.housing,
    line.shape,
    line.size,
    line.colors.length > 0 ? `${line.colors.length} col` : '',
    line.colors.length > 0 ? `${totalQty} pcs` : ''
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ 
      border: '1px solid #eee', 
      borderRadius: 12, 
      marginBottom: 12, 
      overflow: 'hidden', 
      background: '#fff',
      boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
    }}>
      {/* Header - Always visible, collapses the whole line */}
      <div
        style={{ 
          padding: '14px 16px', 
          background: '#fff', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          cursor: 'pointer',
          borderBottom: line.expanded ? '1px solid #eee' : 'none'
        }}
        onClick={() => set({ expanded: !line.expanded })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', background: '#f5f5f5', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#888'
          }}>
            {index + 1}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>
              {col ? col.label : 'New Line'}
            </span>
            {col && (
              <span style={{ fontSize: 12, color: '#888' }}>
                {summaryLine}
              </span>
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
            >
              ❐
            </button>
          )}
           {total > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(line.uid) }}
              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#ddd', padding: 4 }}
              title="Remove line"
            >
              ×
            </button>
          )}
          <span style={{ fontSize: 10, color: '#ccc', transform: line.expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>
            ▼
          </span>
        </div>
      </div>

      {/* Body - Accordion Steps */}
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
                  onClick={() => updateAndNext(
                    { collectionId: c.id, caratIdx: null, housing: null, housingType: null, multiAttached: null, shape: null, size: null, colors: [], qty: c.minC },
                    'carat'
                  )}
                  style={tag(line.collectionId === c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </AccordionSection>

          {/* 2. Carat */}
          {col && (
            <AccordionSection 
              label="Carat" 
              value={line.caratIdx !== null ? `${col.carats[line.caratIdx]}ct` : null}
              isOpen={activeSection === 'carat'} 
              onToggle={() => setActiveSection(activeSection === 'carat' ? null : 'carat')}
              isCompleted={line.caratIdx !== null}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.carats.map((ct, ci) => (
                  <button 
                    key={ct} 
                    onClick={() => updateAndNext(
                      { caratIdx: ci, housing: null, housingType: null, multiAttached: null, shape: null, size: null },
                      // Determine next step based on availability
                      hasHousing ? 'housing' : (hasShapes ? 'shape' : (hasSizes ? 'size' : 'colors'))
                    )} 
                    style={tag(line.caratIdx === ci)}
                  >
                    {ct}ct <span style={{ opacity: 0.4, margin: '0 4px' }}>|</span> €{col.prices[ci]}
                  </button>
                ))}
              </div>
            </AccordionSection>
          )}

          {/* 3. Housing (Conditional) */}
          {col && line.caratIdx !== null && hasHousing && (
            <AccordionSection 
              label="Housing" 
              value={line.housing}
              isOpen={activeSection === 'housing'} 
              onToggle={() => setActiveSection(activeSection === 'housing' ? null : 'housing')}
              isCompleted={!!line.housing}
            >
              {/* Standard */}
              {col.housing === 'standard' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {HOUSING.standard.map((h) => (
                    <button key={h} onClick={() => updateAndNext({ housing: h }, hasShapes ? 'shape' : (hasSizes ? 'size' : 'colors'))} style={tag(line.housing === h)}>
                      {h}
                    </button>
                  ))}
                </div>
              )}
              {/* Gold Metal */}
              {col.housing === 'goldMetal' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {HOUSING.goldMetal.map((h) => (
                    <button key={h} onClick={() => updateAndNext({ housing: h }, hasShapes ? 'shape' : (hasSizes ? 'size' : 'colors'))} style={tag(line.housing === h)}>
                      {h}
                    </button>
                  ))}
                </div>
              )}
              {/* Multi Three */}
              {col.housing === 'multiThree' && (
                 <div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <button onClick={() => set({ multiAttached: true, housing: null })} style={tag(line.multiAttached === true)}>Attached</button>
                    <button onClick={() => set({ multiAttached: false, housing: null })} style={tag(line.multiAttached === false)}>Not Attached</button>
                  </div>
                  {line.multiAttached !== null && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(line.multiAttached ? HOUSING.multiThree.attached : HOUSING.multiThree.notAttached).map((h) => (
                        <button key={h} onClick={() => updateAndNext({ housing: h }, hasShapes ? 'shape' : (hasSizes ? 'size' : 'colors'))} style={tag(line.housing === h)}>
                          {h}
                        </button>
                      ))}
                    </div>
                  )}
                 </div>
              )}
              {/* Matchy */}
              {col.housing === 'matchy' && (
                 <div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <button onClick={() => set({ housingType: 'bezel', housing: null })} style={tag(line.housingType === 'bezel')}>Bezel</button>
                    <button onClick={() => set({ housingType: 'prong', housing: null })} style={tag(line.housingType === 'prong')}>Prong</button>
                  </div>
                  {line.housingType && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(line.housingType === 'bezel' ? HOUSING.matchyBezel : HOUSING.matchyProng).map((h) => (
                        <button key={h.id} onClick={() => updateAndNext({ housing: h.label }, hasShapes ? 'shape' : (hasSizes ? 'size' : 'colors'))} style={tag(line.housing === h.label)}>
                          {h.label}
                        </button>
                      ))}
                    </div>
                  )}
                 </div>
              )}
              {/* Shapy Shine */}
              {col.housing === 'shapyShine' && (
                 <div>
                   {shapyShineBezelOnly ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {HOUSING.shapyShineBezel.map((h) => (
                          <button key={h} onClick={() => updateAndNext({ housing: `Bezel ${h}`, housingType: 'bezel' }, hasShapes ? 'shape' : (hasSizes ? 'size' : 'colors'))} style={tag(line.housing === `Bezel ${h}`)}>
                            Bezel {h}
                          </button>
                        ))}
                      </div>
                   ) : (
                     <>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <button onClick={() => set({ housingType: 'bezel', housing: null })} style={tag(line.housingType === 'bezel')}>Bezel</button>
                        <button onClick={() => set({ housingType: 'prong', housing: null })} style={tag(line.housingType === 'prong')}>Prong</button>
                      </div>
                      {line.housingType && (
                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                           {(line.housingType === 'bezel' ? HOUSING.shapyShineBezel : HOUSING.shapyShineProng).map((h) => (
                             <button key={h} onClick={() => updateAndNext({ housing: line.housingType === 'bezel' ? `Bezel ${h}` : `Prong ${h}` }, hasShapes ? 'shape' : (hasSizes ? 'size' : 'colors'))} style={tag(line.housing === (line.housingType === 'bezel' ? `Bezel ${h}` : `Prong ${h}`))}>
                               {h}
                             </button>
                           ))}
                         </div>
                      )}
                     </>
                   )}
                 </div>
              )}
            </AccordionSection>
          )}

          {/* 4. Shape (Conditional) */}
          {col && line.caratIdx !== null && hasShapes && (
            <AccordionSection 
              label="Shape" 
              value={line.shape}
              isOpen={activeSection === 'shape'} 
              onToggle={() => setActiveSection(activeSection === 'shape' ? null : 'shape')}
              isCompleted={!!line.shape}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.shapes.map((s) => (
                  <button key={s} onClick={() => updateAndNext({ shape: s }, hasSizes ? 'size' : 'colors')} style={tag(line.shape === s)}>
                    {s}
                  </button>
                ))}
              </div>
            </AccordionSection>
          )}

          {/* 5. Size (Conditional) */}
          {col && line.caratIdx !== null && hasSizes && (
             <AccordionSection 
              label="Size" 
              value={line.size}
              isOpen={activeSection === 'size'} 
              onToggle={() => setActiveSection(activeSection === 'size' ? null : 'size')}
              isCompleted={!!line.size}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {col.sizes.map((s) => (
                  <button key={s} onClick={() => updateAndNext({ size: s }, 'colors')} style={tag(line.size === s)}>
                    {s}
                  </button>
                ))}
              </div>
            </AccordionSection>
          )}

          {/* 6. Colors & Qty - Final Step */}
          {col && line.caratIdx !== null && (
             <AccordionSection 
              label="Colors & Quantity" 
              value={line.colors.length > 0 ? `${line.colors.length} selected` : null}
              isOpen={activeSection === 'colors'} 
              onToggle={() => setActiveSection(activeSection === 'colors' ? null : 'colors')}
              isCompleted={line.colors.length > 0}
            >
              {/* Colors Grid */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {palette.map((c) => {
                    const isSelected = line.colors.some(lc => (typeof lc === 'string' ? lc : lc.name) === c.n)
                    return (
                      <button
                        key={c.n}
                        title={c.n}
                        onClick={() => toggleColor(c.n)}
                        style={{
                          width: 32, height: 32, borderRadius: '50%', background: c.h, flexShrink: 0, padding: 0,
                          border: isSelected ? '3px solid #222' : isLight(c.h) ? '1px solid #ddd' : '1px solid transparent',
                          cursor: 'pointer', transition: 'transform .1s',
                          transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                      />
                    )
                  })}
                </div>
              </div>
              
              {/* Selected Colors List with Individual Quantities */}
              {line.colors.length > 0 && (
                <div style={{ paddingTop: 12, borderTop: '1px solid #f5f5f5' }}>
                  <div style={{ ...lbl, marginBottom: 10 }}>Quantities per color</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {line.colors.map((c, i) => {
                      const cName = typeof c === 'string' ? c : c.name
                      const cQty = typeof c === 'string' ? (line.qty || 1) : c.qty
                      const colorDef = palette.find(p => p.n === cName) || { h: '#ccc' }
                      
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9f9f9', padding: '6px 10px', borderRadius: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: colorDef.h, border: '1px solid rgba(0,0,0,0.1)' }} />
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{cName}</span>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #eee', background: '#fff' }}>
                              <button style={{ ...qBtn, width: 24, height: 24, fontSize: 14 }} onClick={() => updateColorQty(cName, cQty - 1)}>−</button>
                              <input
                                type="number"
                                value={cQty}
                                onChange={(e) => updateColorQty(cName, parseInt(e.target.value) || 1)}
                                style={{ ...qInp, width: 32, height: 24, fontSize: 12 }}
                              />
                              <button style={{ ...qBtn, width: 24, height: 24, fontSize: 14 }} onClick={() => updateColorQty(cName, cQty + 1)}>+</button>
                            </div>
                            <button 
                              onClick={() => toggleColor(cName)}
                              style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Min Quantity Warning */}
                  {line.colors.some(c => (typeof c === 'string' ? (line.qty || 1) : c.qty) < col.minC) && (
                     <div style={{ fontSize: 11, color: '#e74c3c', marginTop: 10 }}>
                        ⚠ Minimum recommended per color: {col.minC}
                     </div>
                  )}
                </div>
              )}
            </AccordionSection>
          )}
        </div>
      )}
    </div>
  )
})

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

export default memo(function BuilderLine({ line, index, total, onChange, onRemove }) {
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
    const has = line.colors.includes(name)
    set({ colors: has ? line.colors.filter((c) => c !== name) : [...line.colors, name] })
    // For colors (multi-select), we don't auto-close. User must manually close or we just leave it open.
  }

  // Summary string generation
  const summaryLine = [
    col ? col.label : '',
    col && line.caratIdx !== null ? `${col.carats[line.caratIdx]}ct` : '',
    line.housing,
    line.shape,
    line.size,
    line.colors.length > 0 ? `${line.colors.length} col` : '',
    line.colors.length > 0 ? `${line.colors.length * line.qty} pcs` : ''
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
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {palette.map((c) => (
                    <button
                      key={c.n}
                      title={c.n}
                      onClick={() => toggleColor(c.n)}
                      style={{
                        width: 32, height: 32, borderRadius: '50%', background: c.h, flexShrink: 0, padding: 0,
                        border: line.colors.includes(c.n) ? '3px solid #222' : isLight(c.h) ? '1px solid #ddd' : '1px solid transparent',
                        cursor: 'pointer', transition: 'transform .1s',
                        transform: line.colors.includes(c.n) ? 'scale(1.1)' : 'scale(1)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    />
                  ))}
                </div>
                {line.colors.length > 0 && (
                  <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                    Selected: <b>{line.colors.join(', ')}</b>
                  </div>
                )}
              </div>
              
              {/* Qty Section inside Colors */}
              {line.colors.length > 0 && (
                <div style={{ paddingTop: 12, borderTop: '1px solid #f5f5f5' }}>
                  <div style={lbl}>Quantity per color</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #eee' }}>
                      <button style={qBtn} onClick={() => set({ qty: Math.max(1, line.qty - 1) })}>−</button>
                      <input
                        type="number"
                        value={line.qty}
                        onChange={(e) => set({ qty: Math.max(1, parseInt(e.target.value) || 1) })}
                        style={qInp}
                      />
                      <button style={qBtn} onClick={() => set({ qty: line.qty + 1 })}>+</button>
                    </div>
                     <div style={{ display: 'flex', gap: 4 }}>
                      {QTY_PRESETS.map((q) => (
                        <button key={q} onClick={() => set({ qty: q })} style={qtyQuick(line.qty === q)}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                  {line.qty < col.minC && (
                     <div style={{ fontSize: 11, color: '#e74c3c', marginTop: 6 }}>
                        ⚠ Minimum recommended: {col.minC}
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

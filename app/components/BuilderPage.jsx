'use client'

import { useCallback, useState, useRef, useMemo } from 'react'
import { COLLECTIONS, CORD_COLORS, HOUSING, calculateQuote } from '@/lib/catalog'
import { fmt } from '@/lib/utils'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import CollectionConfig from './CollectionConfig'
import { useI18n } from '@/lib/i18n'

// ─── Exported helpers (used by App.jsx) ───
export function mkColorConfig(colorName, minC = 1) {
  return {
    id: Date.now() + Math.random(),
    colorName,
    caratIdx: null,
    housing: null,
    housingType: null,
    multiAttached: null,
    shape: null,
    size: null,
    qty: minC,
  }
}

export function mkLine() {
  return {
    uid: Date.now() + Math.random(),
    collectionId: null,
    colorConfigs: [],
    expanded: true,
  }
}

// ─── Button Styles ───
const btnPrimary = {
  padding: '10px 24px', borderRadius: 10, border: 'none',
  background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity .15s',
}
const btnSecondary = {
  padding: '10px 24px', borderRadius: 10, border: `1.5px solid ${colors.inkPlum}`,
  background: '#fff', color: colors.inkPlum, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
}
const btnGhost = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: 'transparent', color: '#888', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'color .15s',
}

// ─── Quick-fill Presets ───
const PRESETS = [
  { collectionId: 'CUTY', housing: 'White', size: 'M', caratIndices: [0, 1] },
  { collectionId: 'CUBIX', housing: 'White Gold', size: 'S/M', caratIndices: [0, 1] },
]

// ─── Collapsible warnings: shows a compact summary when there are many ───
function WarningsSummary({ warnings }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useI18n()
  const count = warnings.length
  const COLLAPSE_THRESHOLD = 3

  if (count <= COLLAPSE_THRESHOLD) {
    // Few warnings -- show them inline
    return (
      <div style={{ marginBottom: 4 }}>
        {warnings.map((w, i) => (
          <div key={i} style={{ fontSize: 11, color: '#c0392b', marginBottom: 2 }}>! {w}</div>
        ))}
      </div>
    )
  }

  // Many warnings -- show collapsed summary with expand toggle
  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
          padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: '#c0392b', flex: 1, textAlign: 'left' }}>
          {t('builder.colorsBelowMinQty').replace('{count}', count)}
        </span>
        <span style={{ fontSize: 10, color: '#c0392b', transition: 'transform .15s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>
      {expanded && (
        <div style={{ maxHeight: 80, overflowY: 'auto', marginTop: 4, paddingLeft: 4 }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 10, color: '#c0392b', marginBottom: 2 }}>! {w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BuilderPage({ lines, setLines, onGenerateQuote, budget, setBudget, budgetRecommendations, showRecommendations, setShowRecommendations, onRequestRecommendations }) {
  const mobile = useIsMobile()
  const { t } = useI18n()
  const [showSidebar, setShowSidebar] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  // Step: 'select' (collection grid) or 'configure' (config view)
  const [step, setStep] = useState(() => {
    // If lines already have collections selected, go to configure
    return lines.some(l => l.collectionId) ? 'configure' : 'select'
  })
  const [selectedCollections, setSelectedCollections] = useState(() => {
    // Init from existing lines
    return lines.filter(l => l.collectionId).map(l => l.collectionId)
  })
  const [budgetEditing, setBudgetEditing] = useState(false)
  const budgetInputRef = useRef(null)

  // Live quote
  const quote = useMemo(() => calculateQuote(lines), [lines])
  const hasContent = lines.some(l => {
    if (!l.collectionId || l.colorConfigs.length === 0) return false
    const col = COLLECTIONS.find(c => c.id === l.collectionId)
    if (!col) return false
    return l.colorConfigs.some(cfg => cfg.caratIdx !== null)
  })

  // Budget math
  const budgetNum = parseFloat(budget) || 0
  const hasBudget = budgetNum > 0
  const spent = quote.total
  const hasSpending = spent > 0
  const remaining = hasBudget ? budgetNum - spent : 0
  const pct = hasBudget ? Math.min(100, Math.round((spent / budgetNum) * 100)) : 0
  const overBudget = hasBudget && spent > budgetNum

  // Toggle collection selection
  const toggleCollection = (colId) => {
    setSelectedCollections(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    )
  }

  // Move from grid to configure step
  const goToConfigure = () => {
    // Create/update lines for selected collections
    setLines(prev => {
      const existingIds = prev.filter(l => l.collectionId).map(l => l.collectionId)
      const newLines = [...prev.filter(l => selectedCollections.includes(l.collectionId))]
      // Add new lines for newly selected collections
      selectedCollections.forEach(colId => {
        if (!existingIds.includes(colId)) {
          newLines.push({ uid: Date.now() + Math.random(), collectionId: colId, colorConfigs: [], expanded: true })
        }
      })
      return newLines.length > 0 ? newLines : [mkLine()]
    })
    setStep('configure')
  }

  // Go back to grid
  const goToSelect = () => {
    setSelectedCollections(lines.filter(l => l.collectionId).map(l => l.collectionId))
    setStep('select')
  }

  // Update a specific line
  const updateLine = useCallback((uid, patch) => {
    setLines(prev => prev.map(l => l.uid === uid ? { ...l, ...patch } : l))
  }, [setLines])

  // Remove a line
  const removeLine = useCallback((uid) => {
    setLines(prev => {
      const next = prev.filter(l => l.uid !== uid)
      return next.length > 0 ? next : [mkLine()]
    })
  }, [setLines])

  // Apply a quick-fill preset
  const applySuggestion = useCallback((preset) => {
    const col = COLLECTIONS.find(c => c.id === preset.collectionId)
    if (!col) return
    const palette = CORD_COLORS[col.cord] || []

    // Build colorConfigs: for each color, one entry per carat index
    const configs = []
    palette.forEach(color => {
      preset.caratIndices.forEach(caratIdx => {
        configs.push({
          ...mkColorConfig(color.n, col.minC),
          caratIdx,
          housing: preset.housing,
          size: preset.size,
        })
      })
    })

    // Find or create line for this collection
    setLines(prev => {
      const existing = prev.find(l => l.collectionId === preset.collectionId)
      if (existing) {
        return prev.map(l => l.uid === existing.uid ? { ...l, colorConfigs: configs } : l)
      }
      const newLine = { uid: Date.now() + Math.random(), collectionId: preset.collectionId, colorConfigs: configs, expanded: true }
      const cleaned = prev.filter(l => l.collectionId !== null)
      return [...cleaned, newLine]
    })

    // Ensure collection is in selectedCollections
    setSelectedCollections(prev =>
      prev.includes(preset.collectionId) ? prev : [...prev, preset.collectionId]
    )
    setShowSuggestions(false)
    setStep('configure')
  }, [setLines, setSelectedCollections])

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {/* Mobile Summary Toggle Button */}
      {mobile && (
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          style={{
            position: 'fixed', bottom: 16, right: 16, zIndex: 150,
            padding: '12px 20px', borderRadius: 25, border: 'none',
            background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(93,58,94,0.3)',
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
          }}
        >
          <span>{fmt(quote.total)}</span>
          <span style={{ fontSize: 10, opacity: 0.8 }}>{quote.totalPieces} pcs</span>
        </button>
      )}
      
      {/* Mobile Sidebar Overlay */}
      {mobile && showSidebar && (
        <div 
          onClick={() => setShowSidebar(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200,
          }}
        />
      )}
      
      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* ─── Budget Bar ─── */}
        <div style={{ background: '#fff', borderBottom: '1px solid #eaeaea', padding: '10px 16px', flexShrink: 0 }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {!hasBudget && !budgetEditing ? (
              <button
                onClick={() => { setBudgetEditing(true); setTimeout(() => budgetInputRef.current?.focus(), 50) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 12px', borderRadius: 10,
                  border: '1px dashed #ddd', background: '#fafafa',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'all .12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.background = '#fdf7fa' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.background = '#fafafa' }}
              >
                <span style={{ fontSize: 14 }}>$</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Set a budget</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>Optional -- track spending & get AI recommendations</div>
                </div>
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hasBudget && hasSpending ? 8 : 0 }}>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 600, whiteSpace: 'nowrap' }}>Budget</span>
                  <div style={{ position: 'relative', width: 110 }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa', fontWeight: 600 }}>€</span>
                    <input
                      ref={budgetInputRef}
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      onBlur={() => { if (!budget) setBudgetEditing(false) }}
                      placeholder="2000"
                      style={{
                        width: '100%', padding: '6px 8px 6px 22px', borderRadius: 8,
                        border: '1px solid #e3e3e3', fontSize: 13, fontFamily: 'inherit',
                        outline: 'none', background: '#fafaf8', boxSizing: 'border-box', color: '#333',
                      }}
                    />
                  </div>
                  {hasBudget && hasSpending && (
                    <>
                      <div style={{ flex: 1 }} />
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: overBudget ? '#c0392b' : '#27ae60' }}>
                          {overBudget ? `Over by ${fmt(spent - budgetNum)}` : `${fmt(remaining)} left`}
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>
                          {fmt(spent)} / {fmt(budgetNum)} ({pct}%)
                        </div>
                      </div>
                    </>
                  )}
                  {hasBudget && !hasSpending && (
                    <span style={{ fontSize: 10, color: '#aaa' }}>Start building to track spending</span>
                  )}
                  {hasBudget && (
                    <button
                      onClick={() => { setBudget(''); setBudgetEditing(false) }}
                      style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 14, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
                      title="Clear budget"
                    >x</button>
                  )}
                </div>
                {hasBudget && hasSpending && (
                  <div style={{ height: 4, borderRadius: 2, background: '#f0f0f0', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, transition: 'width .3s ease',
                      width: `${Math.min(100, pct)}%`,
                      background: overBudget ? '#c0392b' : pct > 80 ? '#e67e22' : colors.inkPlum,
                    }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Step Content ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {step === 'select' ? (
              /* ═══ STEP 1: Collection Selection Grid ═══ */
              <div>
                <div style={{ marginBottom: 20 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.inkPlum, margin: '0 0 4px', fontFamily: fonts.body }}>
                    Select Collections
                  </h2>
                  <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
                    Choose which collections to include in this order. You'll configure colors and quantities next.
                  </p>
                </div>

                {/* Collection Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 12,
                  marginBottom: 24,
                }}>
                  {COLLECTIONS.map(col => {
                    const isSelected = selectedCollections.includes(col.id)
                    const priceRange = `€${col.prices[0]} - €${col.prices[col.prices.length - 1]}`
                    const caratRange = `${col.carats[0]} - ${col.carats[col.carats.length - 1]} ct`
                    const cordType = col.cord.charAt(0).toUpperCase() + col.cord.slice(1)
                    const colorCount = (CORD_COLORS[col.cord] || []).length

                    return (
                      <button
                        key={col.id}
                        onClick={() => toggleCollection(col.id)}
                        style={{
                          position: 'relative',
                          padding: '16px',
                          borderRadius: 12,
                          border: isSelected ? `2px solid ${colors.inkPlum}` : '1.5px solid #e8e8e8',
                          background: isSelected ? '#fdf7fa' : '#fff',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                          transition: 'all .15s',
                          boxShadow: isSelected ? `0 2px 12px ${colors.inkPlum}15` : '0 1px 4px rgba(0,0,0,0.04)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = colors.inkPlum + '60'
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#e8e8e8'
                            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'
                          }
                        }}
                      >
                        {/* Checkbox indicator */}
                        <div style={{
                          position: 'absolute', top: 10, right: 10,
                          width: 22, height: 22, borderRadius: 6,
                          border: isSelected ? `2px solid ${colors.inkPlum}` : '2px solid #ddd',
                          background: isSelected ? colors.inkPlum : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all .15s',
                        }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>}
                        </div>

                        {/* Collection name */}
                        <div style={{
                          fontSize: 15, fontWeight: 700,
                          color: isSelected ? colors.inkPlum : '#222',
                          marginBottom: 8, paddingRight: 30,
                        }}>
                          {col.label}
                        </div>

                        {/* Details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 12, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#999' }}>Price</span>
                            <span style={{ fontWeight: 600 }}>{priceRange}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#999' }}>Carats</span>
                            <span>{caratRange}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#999' }}>Cord</span>
                            <span>{cordType} ({colorCount} colors)</span>
                          </div>
                          {col.shapes && (
                            <div style={{ fontSize: 12, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#999' }}>Shapes</span>
                              <span>{col.shapes.length} options</span>
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            Min {col.minC} pcs/color
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Bottom action */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 13, color: '#888' }}>
                    {selectedCollections.length === 0 ? (
                      'Select at least one collection to continue'
                    ) : (
                      <span>
                        <strong style={{ color: colors.inkPlum }}>{selectedCollections.length}</strong>
                        {' '}collection{selectedCollections.length !== 1 ? 's' : ''} selected
                      </span>
                    )}
                  </div>
                  <button
                    onClick={goToConfigure}
                    disabled={selectedCollections.length === 0}
                    style={{
                      ...btnPrimary,
                      opacity: selectedCollections.length === 0 ? 0.4 : 1,
                      cursor: selectedCollections.length === 0 ? 'default' : 'pointer',
                    }}
                  >
                    Continue to Configure →
                  </button>
                </div>
              </div>
            ) : (
              /* ═══ STEP 2: Configuration View ═══ */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.inkPlum, margin: '0 0 4px', fontFamily: fonts.body }}>
                      Configure Order
                    </h2>
                    <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
                      Add colors and set options for each collection
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setShowSuggestions(v => !v)}
                        style={{
                          ...btnSecondary,
                          padding: '8px 14px', fontSize: 12,
                          background: showSuggestions ? '#fdf7fa' : '#fff',
                        }}
                      >
                        ★ {t('builder.suggestions')}
                      </button>
                      {showSuggestions && (
                        <div style={{
                          position: 'absolute', top: '100%', right: 0, marginTop: 6,
                          width: mobile ? 260 : 320, background: '#fff', borderRadius: 12,
                          border: '1px solid #e8e8e8', boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                          zIndex: 100, padding: 12,
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum, marginBottom: 10 }}>
                            {t('builder.quickFillPresets')}
                          </div>
                          {PRESETS.map(preset => {
                            const col = COLLECTIONS.find(c => c.id === preset.collectionId)
                            if (!col) return null
                            const colorCount = (CORD_COLORS[col.cord] || []).length
                            const caratLabels = preset.caratIndices.map(i => col.carats[i]).join(' + ')
                            return (
                              <button
                                key={preset.collectionId}
                                onClick={() => applySuggestion(preset)}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left',
                                  padding: '10px 12px', marginBottom: 6, borderRadius: 8,
                                  border: '1px solid #eee', background: '#fafaf8',
                                  cursor: 'pointer', fontFamily: 'inherit',
                                  transition: 'all .12s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.background = '#fdf7fa' }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#eee'; e.currentTarget.style.background = '#fafaf8' }}
                              >
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 3 }}>
                                  {col.label}
                                </div>
                                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
                                  {t('builder.suggestionDesc').replace('{count}', colorCount).replace('{carats}', caratLabels)}
                                </div>
                                <div style={{ fontSize: 10, color: '#aaa' }}>
                                  {t('builder.whiteHousingSize').replace('{housing}', preset.housing).replace('{size}', preset.size)}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <button onClick={goToSelect} style={btnGhost}>
                      ← Edit Collections
                    </button>
                  </div>
                </div>

                {/* Collection config panels */}
                {lines.filter(l => l.collectionId).map(line => {
                  const col = COLLECTIONS.find(c => c.id === line.collectionId)
                  if (!col) return null
                  return (
                    <CollectionConfig
                      key={line.uid}
                      line={line}
                      col={col}
                      onChange={updateLine}
                      onRemove={removeLine}
                    />
                  )
                })}

                {/* Add another collection quick action */}
                <button
                  onClick={goToSelect}
                  style={{
                    width: '100%', padding: 12, borderRadius: 10,
                    border: '1.5px dashed #d0d0d0', background: 'transparent',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    color: '#888', fontFamily: 'inherit', marginBottom: 16,
                    transition: 'all .12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.color = colors.inkPlum }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d0d0d0'; e.currentTarget.style.color = '#888' }}
                >
                  + Add more collections
                </button>

                {/* AI Recommendations Panel */}
                {showRecommendations && budgetRecommendations && (
                  <div style={{
                    marginBottom: 14, borderRadius: 12, overflow: 'hidden',
                    border: `1px solid ${colors.inkPlum}22`, background: '#fdf7fa',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderBottom: `1px solid ${colors.inkPlum}15`,
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum }}>AI Recommendations</div>
                        <div style={{ fontSize: 10, color: '#999' }}>{fmt(remaining)} remaining budget</div>
                      </div>
                      <button onClick={() => setShowRecommendations(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 16, cursor: 'pointer' }}>x</button>
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      {budgetRecommendations.loading ? (
                        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: '#999' }}>Thinking...</div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{budgetRecommendations.message}</div>
                      )}
                    </div>
                    {!budgetRecommendations.loading && (
                      <div style={{ padding: '8px 14px 10px', borderTop: '1px solid #f0e8ee', display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={onRequestRecommendations} style={{ ...btnSecondary, padding: '6px 14px', fontSize: 11 }}>Regenerate</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Order Summary Sidebar ═══ */}
      <div style={{
        width: mobile ? '85%' : 280,
        maxWidth: mobile ? 320 : 280,
        flexShrink: 0,
        background: '#fff',
        borderLeft: '1px solid #eaeaea',
        display: mobile && !showSidebar ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // Mobile slide-in styles
        ...(mobile ? {
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 210,
          transform: showSidebar ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
        } : {}),
      }}>
        {/* Mobile close button */}
        {mobile && (
          <button
            onClick={() => setShowSidebar(false)}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 1,
              width: 32, height: 32, borderRadius: '50%', border: 'none',
              background: '#f0f0f0', color: '#666', fontSize: 16,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        )}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #eaeaea' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum, marginBottom: 2 }}>Order Summary</div>
          <div style={{ fontSize: 11, color: '#999' }}>
            {quote.totalPieces > 0 ? `${quote.totalPieces} pieces` : 'No items yet'}
          </div>
        </div>

        {/* Per-collection breakdown */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {lines.filter(l => l.collectionId && l.colorConfigs.length > 0).map(line => {
            const col = COLLECTIONS.find(c => c.id === line.collectionId)
            if (!col) return null
            const lineTotal = line.colorConfigs.reduce((sum, cfg) => {
              const price = cfg.caratIdx !== null ? col.prices[cfg.caratIdx] : 0
              return sum + (cfg.qty * price)
            }, 0)
            const pieces = line.colorConfigs.reduce((sum, cfg) => sum + cfg.qty, 0)
            if (pieces === 0 && lineTotal === 0) return null
            return (
              <div key={line.uid} style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{col.label}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{line.colorConfigs.length} colors, {pieces} pcs</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{fmt(lineTotal)}</div>
              </div>
            )
          })}
          {quote.totalPieces === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: '#ccc' }}>
              Add colors to see totals
            </div>
          )}
        </div>

        {/* Totals */}
        <div style={{ borderTop: '1px solid #eaeaea', padding: '12px 16px', maxHeight: '45vh', overflowY: 'auto' }}>
          {quote.discountPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#27ae60', fontWeight: 600 }}>Discount ({quote.discountPercent}%)</span>
              <span style={{ color: '#27ae60', fontWeight: 600 }}>-{fmt(quote.discountAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: colors.inkPlum }}>{fmt(quote.total)}</span>
          </div>
          {quote.totalPieces > 0 && (
            <div style={{ fontSize: 11, color: '#999', textAlign: 'right', marginBottom: 8 }}>
              Retail value: {fmt(quote.totalRetail)}
            </div>
          )}

          {/* Warnings -- collapsed when more than 3 */}
          {quote.warnings.length > 0 && (
            <WarningsSummary warnings={quote.warnings} />
          )}

          {hasBudget && hasSpending && (
            <div style={{
              fontSize: 11, padding: '6px 0', marginBottom: 8,
              color: overBudget ? '#c0392b' : '#27ae60', fontWeight: 600,
            }}>
              {overBudget ? `Over budget by ${fmt(spent - budgetNum)}` : `${fmt(remaining)} remaining`}
            </div>
          )}

          {/* Generate Quote */}
          <button
            onClick={() => hasContent && onGenerateQuote(quote)}
            disabled={!hasContent}
            style={{
              ...btnPrimary, width: '100%', textAlign: 'center',
              opacity: hasContent ? 1 : 0.4,
              cursor: hasContent ? 'pointer' : 'default',
              marginBottom: 6,
            }}
          >
            Generate Quote
          </button>

          {/* Budget recommend */}
          {hasBudget && hasSpending && remaining > 0 && (
            <button
              onClick={onRequestRecommendations}
              disabled={budgetRecommendations?.loading}
              style={{
                ...btnSecondary, width: '100%', textAlign: 'center',
                padding: '8px 16px', fontSize: 11,
                opacity: budgetRecommendations?.loading ? 0.6 : 1,
              }}
            >
              {budgetRecommendations?.loading ? 'Thinking...' : `Suggest for ${fmt(remaining)} left`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

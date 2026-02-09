import { useCallback, useState, useRef } from 'react'
import { COLLECTIONS, calculateQuote } from '../lib/catalog'
import { fmt } from '../lib/utils'
import { lbl, inp, totalBar, totalBarAmount, totalBarMeta, colors } from '../lib/styles'
import BuilderLine from './BuilderLine'

export function mkColorConfig(colorName, minC = 3) {
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
    colorConfigs: [],        // array of mkColorConfig entries
    expanded: true,
  }
}

export default function BuilderPage({ lines, setLines, onGenerateQuote, budget, setBudget, budgetRecommendations, showRecommendations, setShowRecommendations, onRequestRecommendations }) {
  const [budgetEditing, setBudgetEditing] = useState(false)
  const budgetInputRef = useRef(null)
  const updateLine = useCallback((uid, patch) => {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  }, [setLines])

  const removeLine = useCallback((uid) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.uid !== uid)))
  }, [setLines])

  const duplicateLine = useCallback((uid) => {
    setLines((prev) => {
      const original = prev.find((l) => l.uid === uid)
      if (!original) return prev
      // Deep-copy colorConfigs so each config gets a new id
      const copiedConfigs = original.colorConfigs.map((cfg) => ({
        ...cfg,
        id: Date.now() + Math.random(),
      }))
      const copy = { ...original, uid: Date.now() + Math.random(), colorConfigs: copiedConfigs, expanded: true }
      const idx = prev.findIndex((l) => l.uid === uid)
      const newLines = [...prev]
      newLines.splice(idx + 1, 0, copy)
      return newLines
    })
  }, [setLines])

  const addLine = () => setLines((prev) => [...prev, mkLine()])

  // Check if a single color config is complete
  const isConfigComplete = (cfg, col) => {
    if (cfg.caratIdx === null) return false
    if (col.housing && !cfg.housing) return false
    if (col.shapes && col.shapes.length > 0 && !cfg.shape) return false
    if (col.sizes && col.sizes.length > 0 && !cfg.size) return false
    return true
  }

  // Validation: check if a line is complete
  const isLineComplete = (line) => {
    if (!line.collectionId || line.colorConfigs.length === 0) return false
    const col = COLLECTIONS.find((c) => c.id === line.collectionId)
    if (!col) return false
    return line.colorConfigs.every((cfg) => isConfigComplete(cfg, col))
  }

  // Get missing fields for a line
  const getMissingFields = (line) => {
    if (!line.collectionId) return ['collection']
    if (line.colorConfigs.length === 0) return ['colors']
    const col = COLLECTIONS.find((c) => c.id === line.collectionId)
    if (!col) return []

    const incomplete = line.colorConfigs.filter((cfg) => !isConfigComplete(cfg, col))
    if (incomplete.length === 0) return []

    // Summarize what's missing across incomplete configs
    const missing = new Set()
    incomplete.forEach((cfg) => {
      if (cfg.caratIdx === null) missing.add('carat')
      if (col.housing && !cfg.housing) missing.add('housing')
      if (col.shapes && col.shapes.length > 0 && !cfg.shape) missing.add('shape')
      if (col.sizes && col.sizes.length > 0 && !cfg.size) missing.add('size')
    })
    return [...missing].map((f) => `${f} (${incomplete.length} color${incomplete.length > 1 ? 's' : ''})`)
  }

  // Live quote calculation
  const quote = calculateQuote(lines)
  const hasContent = lines.some(isLineComplete)
  const incompleteLines = lines.filter((l) => l.collectionId && !isLineComplete(l))

  // Budget math — use subtotal (before discount) for tracking progress since discount only applies after €1600
  const budgetNum = parseFloat(budget) || 0
  const hasBudget = budgetNum > 0
  const spent = quote.total
  const hasSpending = spent > 0
  const remaining = hasBudget ? budgetNum - spent : 0
  const pct = hasBudget ? Math.min(100, Math.round((spent / budgetNum) * 100)) : 0
  const overBudget = hasBudget && spent > budgetNum

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* ─── Sticky Budget Bar ─── */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #eaeaea',
        padding: '10px 14px',
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {!hasBudget && !budgetEditing ? (
            /* Compact prompt when no budget set */
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
              <span style={{ fontSize: 16 }}>💰</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Set a budget</div>
                <div style={{ fontSize: 10, color: '#aaa' }}>Optional — track spending & get AI recommendations</div>
              </div>
            </button>
          ) : (
            /* Budget bar with tracker */
            <div>
              {/* Input row */}
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
                  >×</button>
                )}
              </div>
              {/* Progress bar */}
              {hasBudget && hasSpending && (
                <div style={{ height: 4, borderRadius: 2, background: '#f0f0f0', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2, transition: 'width .3s ease',
                    width: `${Math.min(100, pct)}%`,
                    background: overBudget
                      ? '#c0392b'
                      : pct > 80
                        ? '#e67e22'
                        : colors.inkPlum,
                  }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {/* Lines */}
          {lines.map((line, i) => (
            <BuilderLine
              key={line.uid}
              line={line}
              index={i}
              total={lines.length}
              onChange={updateLine}
              onRemove={removeLine}
              onDuplicate={duplicateLine}
            />
          ))}

          {/* Add line */}
          <button
            onClick={addLine}
            style={{
              width: '100%', padding: 10, borderRadius: 10, border: '1.5px dashed #d0d0d0',
              background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: '#888', fontFamily: 'inherit', marginBottom: 14, transition: 'all .12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#222' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d0d0d0'; e.currentTarget.style.color = '#888' }}
          >
            + Add another collection
          </button>

          {/* ─── AI Budget Recommendations Panel ─── */}
          {showRecommendations && budgetRecommendations && (
            <div style={{
              marginBottom: 14, borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${colors.inkPlum}22`,
              background: '#fdf7fa',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                background: `linear-gradient(135deg, ${colors.inkPlum}11, ${colors.gradientPink}22)`,
                borderBottom: `1px solid ${colors.inkPlum}15`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>✨</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum }}>AI Recommendations</div>
                    <div style={{ fontSize: 10, color: '#999' }}>
                      {fmt(remaining)} remaining budget
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowRecommendations(false)}
                  style={{
                    background: 'none', border: 'none', color: '#aaa', fontSize: 16,
                    cursor: 'pointer', padding: '2px 6px', lineHeight: 1,
                  }}
                >×</button>
              </div>
              <div style={{ padding: '12px 14px' }}>
                {budgetRecommendations.loading ? (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>Thinking...</div>
                    <div style={{ fontSize: 20, animation: 'pulse 1.5s infinite' }}>🤖</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {budgetRecommendations.message}
                  </div>
                )}
              </div>
              {!budgetRecommendations.loading && (
                <div style={{
                  padding: '8px 14px 10px', borderTop: '1px solid #f0e8ee',
                  display: 'flex', gap: 8, justifyContent: 'flex-end',
                }}>
                  <button
                    onClick={onRequestRecommendations}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: `1px solid ${colors.inkPlum}`,
                      background: 'transparent', color: colors.inkPlum,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Regenerate
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live total bar */}
      <div style={totalBar}>
        <div style={{ maxWidth: 640, margin: '0 auto', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={totalBarAmount}>
              {fmt(quote.total)}
              {quote.discountPercent > 0 && (
                <span style={{ fontSize: 12, color: '#27ae60', marginLeft: 8, fontWeight: 600 }}>
                  −{quote.discountPercent}%
                </span>
              )}
              {hasBudget && hasSpending && (
                <span style={{ fontSize: 11, color: overBudget ? '#c0392b' : '#27ae60', marginLeft: 8, fontWeight: 500 }}>
                  {overBudget ? `(+${fmt(spent - budgetNum)})` : `(${fmt(remaining)} left)`}
                </span>
              )}
            </div>
            <div style={totalBarMeta}>
              {quote.totalPieces > 0
                ? `${quote.totalPieces} pcs · Retail ${fmt(quote.totalRetail)}`
                : 'Select collections, carats & colors to see total'
              }
            </div>
            {quote.warnings.length > 0 && (
              <div style={{ marginTop: 2 }}>
                {quote.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 10, color: '#c0392b' }}>⚠ {w}</div>
                ))}
              </div>
            )}
            {incompleteLines.length > 0 && (
              <div style={{ marginTop: 2 }}>
                {incompleteLines.map((l, i) => {
                  const col = COLLECTIONS.find((c) => c.id === l.collectionId)
                  const missing = getMissingFields(l)
                  return (
                    <div key={i} style={{ fontSize: 10, color: '#e67e22' }}>
                      ⚠ Line {lines.findIndex((ln) => ln.uid === l.uid) + 1} ({col?.label}): missing {missing.join(', ')}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
            <button
              onClick={() => hasContent && onGenerateQuote(quote)}
              disabled={!hasContent}
              style={{
                padding: '10px 20px', borderRadius: 10, border: 'none',
                background: hasContent ? colors.inkPlum : '#e5e5e5',
                color: hasContent ? '#fff' : '#999',
                fontSize: 13, fontWeight: 700, cursor: hasContent ? 'pointer' : 'default',
                fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background .15s',
              }}
            >
              Generate Quote
            </button>
            {/* Recommend button — show when there's budget with remaining money and at least some spending */}
            {hasBudget && hasSpending && remaining > 0 && (
              <button
                onClick={onRequestRecommendations}
                disabled={budgetRecommendations?.loading}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none',
                  background: colors.inkPlum,
                  color: '#fff',
                  fontSize: 10, fontWeight: 700, cursor: budgetRecommendations?.loading ? 'wait' : 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .15s',
                  opacity: budgetRecommendations?.loading ? 0.6 : 1,
                }}
              >
                {budgetRecommendations?.loading ? 'Thinking...' : `✨ Spend ${fmt(remaining)} left`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

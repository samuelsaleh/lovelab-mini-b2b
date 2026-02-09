import { useCallback } from 'react'
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

export default function BuilderPage({ lines, setLines, onGenerateQuote }) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
        </div>
      </div>

      {/* Live total bar */}
      <div style={totalBar}>
        <div style={{ maxWidth: 640, margin: '0 auto', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={totalBarAmount}>
              {hasContent ? fmt(quote.total) : '€0'}
              {quote.discountPercent > 0 && (
                <span style={{ fontSize: 12, color: '#27ae60', marginLeft: 8, fontWeight: 600 }}>
                  −{quote.discountPercent}%
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
          <button
            onClick={() => hasContent && onGenerateQuote(quote)}
            disabled={!hasContent}
            style={{
              padding: '12px 24px', borderRadius: 10, border: 'none',
              background: hasContent ? colors.inkPlum : '#e5e5e5',
              color: hasContent ? '#fff' : '#999',
              fontSize: 14, fontWeight: 700, cursor: hasContent ? 'pointer' : 'default',
              fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background .15s',
            }}
          >
            Generate Quote
          </button>
        </div>
      </div>
    </div>
  )
}

import { useCallback } from 'react'
import { COLLECTIONS, calculateQuote } from '../lib/catalog'
import { fmt } from '../lib/utils'
import { lbl, inp, totalBar, totalBarAmount, totalBarMeta, colors } from '../lib/styles'
import BuilderLine from './BuilderLine'

export function mkLine() {
  return {
    uid: Date.now() + Math.random(),
    collectionId: null,
    caratIdx: null,
    housing: null,           // selected housing value (string or id)
    housingType: null,       // for matchy: 'bezel' | 'prong'
    multiAttached: null,     // for multi three: true | false
    shape: null,             // selected shape (for Holy, Matchy, Shapy collections)
    size: null,              // selected size (XS/S/M/L/XL or S/M/L/XL)
    colors: [],
    qty: 3,
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

  const addLine = () => setLines((prev) => [...prev, mkLine()])

  // Live quote calculation
  const quote = calculateQuote(lines)
  const hasContent = lines.some((l) => l.collectionId && l.colors.length > 0)

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
                ? `${quote.totalPieces} pcs · Retail ${fmt(quote.totalRetail)}${quote.totalRetail > 0 && quote.total > 0 ? ` · Margin ${Math.round(((quote.totalRetail - quote.total) / quote.total) * 100)}%` : ''}`
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

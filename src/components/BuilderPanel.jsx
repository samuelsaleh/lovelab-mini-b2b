import { useState, useCallback } from 'react'
import { COLLECTIONS } from '../lib/catalog'
import { lbl, inp } from '../lib/styles'
import BuilderLine from './BuilderLine'

function mkLine() {
  return {
    uid: Date.now() + Math.random(),
    collectionId: null,
    caratIdx: null,
    colors: [],
    qty: 3,
    expanded: true,
  }
}

export default function BuilderPanel({ onSend, onClose }) {
  const [lines, setLines] = useState([mkLine()])
  const [budget, setBudget] = useState('')
  const [notes, setNotes] = useState('')

  const updateLine = useCallback((uid, patch) => {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  }, [])

  const removeLine = useCallback((uid) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.uid !== uid)))
  }, [])

  const addLine = () => setLines((prev) => [...prev, mkLine()])

  const hasContent = lines.some((l) => l.collectionId) || budget

  const handleSend = () => {
    const parts = []
    if (budget) parts.push(`Total budget: €${budget}`)

    lines
      .filter((l) => l.collectionId)
      .forEach((l, i) => {
        const col = COLLECTIONS.find((c) => c.id === l.collectionId)
        if (!col) return
        const ct = l.caratIdx !== null ? col.carats[l.caratIdx] : col.carats[0]
        let s = `Line ${i + 1}: ${col.label} ${ct}ct`
        if (l.colors.length) s += `, colors: ${l.colors.join(', ')}`
        s += `, ${l.qty} per color`
        parts.push(s)
      })

    if (notes) parts.push(`Notes: ${notes}`)
    if (parts.length) onSend(parts.join('\n'))
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 150, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 640, maxHeight: '82vh', overflowY: 'auto', padding: '18px 18px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Order Builder</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>×</button>
        </div>

        {/* Budget */}
        <div style={{ marginBottom: 14, padding: 12, background: '#fafaf8', borderRadius: 10 }}>
          <div style={lbl}>Budget (optional)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', width: 120 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#aaa', fontWeight: 600 }}>€</span>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="2000"
                style={{ ...inp, paddingLeft: 24, width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes: split 60/40, prefer bestsellers..."
              style={{ ...inp, flex: 1 }}
            />
          </div>
        </div>

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

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={!hasContent}
          style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            background: hasContent ? '#222' : '#e5e5e5', color: hasContent ? '#fff' : '#999',
            fontSize: 14, fontWeight: 700, cursor: hasContent ? 'pointer' : 'default', fontFamily: 'inherit',
          }}
        >
          Send to assistant →
        </button>
      </div>
    </div>
  )
}

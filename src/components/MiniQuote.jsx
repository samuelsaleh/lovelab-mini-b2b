import { fmt } from '../lib/utils'

export default function MiniQuote({ q, onView }) {
  if (!q || !q.lines) return null
  return (
    <div style={{ marginTop: 10, padding: 12, background: '#f7f7f5', borderRadius: 10, border: '1px solid #eee', fontSize: 12 }}>
      {q.lines.map((ln, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: i < q.lines.length - 1 ? '1px solid #eee' : 'none' }}>
          <span style={{ fontWeight: 600 }}>{ln.product} {ln.carat}ct</span>
          <span>{ln.totalQty}pcs × {fmt(ln.unitB2B)} = <strong>{fmt(ln.lineTotal)}</strong></span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1.5px solid #ddd', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>
          {fmt(q.total)}
          {q.discountAmount > 0 && <span style={{ fontSize: 10, color: '#27ae60', marginLeft: 6 }}>−{q.discountPercent}%</span>}
        </span>
        <span style={{ fontSize: 10, color: '#999' }}>{q.totalPieces}pcs · Retail {fmt(q.totalRetail)}</span>
      </div>
      {(q.warnings || []).map((w, i) => (
        <div key={i} style={{ fontSize: 10, color: '#c0392b', marginTop: 4 }}>⚠ {w}</div>
      ))}
      <button
        onClick={onView}
        style={{ marginTop: 8, width: '100%', padding: 7, borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#333', fontFamily: 'inherit' }}
      >
        View full quote ↗
      </button>
    </div>
  )
}

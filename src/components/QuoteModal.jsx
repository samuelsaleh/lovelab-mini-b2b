import { fmt, today } from '../lib/utils'

export default function QuoteModal({ quote, client, onClose }) {
  if (!quote) return null
  const q = quote
  const d = today()

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, padding: '26px 22px', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: '1px solid #eee', marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.03em' }}>
            LOVE<span style={{ fontWeight: 300, color: '#999' }}>LAB</span>
          </div>
          <div style={{ fontSize: 8, letterSpacing: '0.25em', color: '#ccc', marginTop: 2 }}>
            ANTWERP · B2B QUOTATION
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
            {[client.name, client.company, d].filter(Boolean).join('  ·  ')}
          </div>
        </div>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #222' }}>
              {['Product', 'ct', 'Colors', 'Qty/C', 'Pcs', 'Unit', 'Total'].map((h) => (
                <th key={h} style={{ padding: '7px 4px', textAlign: 'left', fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(q.lines || []).map((ln, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f2f2f0' }}>
                <td style={{ padding: '7px 4px', fontWeight: 600 }}>{ln.product}</td>
                <td style={{ padding: '7px 4px' }}>{ln.carat}</td>
                <td style={{ padding: '7px 4px', fontSize: 10, maxWidth: 100 }}>{(ln.colors || []).join(', ') || '—'}</td>
                <td style={{ padding: '7px 4px' }}>{ln.qtyPerColor}</td>
                <td style={{ padding: '7px 4px', fontWeight: 600 }}>{ln.totalQty}</td>
                <td style={{ padding: '7px 4px' }}>{fmt(ln.unitB2B)}</td>
                <td style={{ padding: '7px 4px', fontWeight: 700 }}>{fmt(ln.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid #222', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 190 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
              <span>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(q.subtotal)}</span>
            </div>
            {q.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: '#27ae60' }}>
                <span>Discount {q.discountPercent}%</span><span>−{fmt(q.discountAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 3px', fontSize: 20, fontWeight: 800, borderTop: '1px solid #eee', marginTop: 4 }}>
              <span>Total</span><span>{fmt(q.total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aaa' }}>
              <span>{q.totalPieces} pcs</span><span>Retail {fmt(q.totalRetail)}</span>
            </div>
            {q.totalRetail > 0 && q.total > 0 && (
              <div style={{ fontSize: 10, color: '#27ae60', textAlign: 'right', marginTop: 2, fontWeight: 600 }}>
                Margin: {Math.round(((q.totalRetail - q.total) / q.total) * 100)}%
              </div>
            )}
          </div>
        </div>

        {/* Warnings */}
        {(q.warnings || []).length > 0 && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: '#fffaf0', borderRadius: 8, border: '1px solid #f0e0c0' }}>
            {q.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 10, color: '#b57a2e' }}>⚠ {w}</div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid #eee', fontSize: 9, color: '#ccc', textAlign: 'center', lineHeight: 1.7 }}>
          THE LOVE GROUP BV · Schupstraat 20, 2018 Antwerp · hello@love-lab.com · www.lovelab.be<br />
          Delivery 4–6 weeks · 18KT gold on request · Prices excl. VAT
        </div>

        <button
          onClick={onClose}
          style={{ width: '100%', marginTop: 14, padding: 11, borderRadius: 10, border: 'none', background: '#222', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

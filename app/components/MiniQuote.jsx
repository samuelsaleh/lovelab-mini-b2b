'use client'

import { fmt } from '@/lib/utils'
import { colors } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'

export default function MiniQuote({ q, onView }) {
  const { isCompact: mobile } = useResponsive()
  if (!q || !q.lines) return null
  return (
    <div style={{ 
      marginTop: 10, 
      padding: 12, 
      background: colors.lumiereIvory, 
      borderRadius: 10, 
      border: `1px solid ${colors.lineGray}`, 
      fontSize: mobile ? 12 : 12 
    }}>
      {q.lines.map((ln, i) => {
        const details = [ln.housing, ln.shape, ln.size].filter(Boolean).join(' · ')
        return (
          <div key={i} style={{ 
            padding: '4px 0', 
            borderBottom: i < q.lines.length - 1 ? `1px solid ${colors.lineGray}` : 'none',
            color: colors.charcoal
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>{ln.product} {ln.carat}ct{ln.colorName ? ` · ${ln.colorName}` : ''}</span>
              <span style={{ fontSize: mobile ? 11 : 11, flexShrink: 0, marginLeft: 'auto' }}>{ln.qty}pcs × {fmt(ln.unitB2B)} = <strong>{fmt(ln.lineTotal)}</strong></span>
            </div>
            {details && (
              <div style={{ fontSize: mobile ? 11 : 9, color: colors.lovelabMuted, marginTop: 1 }}>{details}</div>
            )}
          </div>
        )
      })}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginTop: 8, 
        paddingTop: 8, 
        borderTop: `1.5px solid ${colors.lineGray}`, 
        alignItems: 'baseline' 
      }}>
        <span style={{ fontWeight: 800, fontSize: mobile ? 14 : 16, color: colors.inkPlum }}>
          {fmt(q.total)}
          {q.discountAmount > 0 && <span style={{ fontSize: 10, color: colors.luxeGold, marginLeft: 6 }}>−{q.discountPercent}%</span>}
        </span>
        <span style={{ fontSize: mobile ? 11 : 10, color: colors.lovelabMuted }}>{q.totalPieces}pcs · Retail {fmt(q.totalRetail)}</span>
      </div>
      {(q.warnings || []).map((w, i) => (
        <div key={i} style={{ fontSize: 10, color: colors.lovelabMuted, marginTop: 4 }}>⚠ {w}</div>
      ))}
      <button
        onClick={onView}
        style={{ 
          marginTop: 8, 
          width: '100%', 
          padding: mobile ? 9 : 7, 
          borderRadius: 8, 
          border: `1px solid ${colors.inkPlum}`, 
          background: colors.porcelain, 
          fontSize: 11, 
          fontWeight: 600, 
          cursor: 'pointer', 
          color: colors.inkPlum, 
          fontFamily: 'inherit',
          transition: 'all .12s',
          minHeight: mobile ? 44 : 'auto'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.inkPlum; e.currentTarget.style.color = colors.porcelain }}
        onMouseLeave={(e) => { e.currentTarget.style.background = colors.porcelain; e.currentTarget.style.color = colors.inkPlum }}
      >
        View full quote ↗
      </button>
    </div>
  )
}

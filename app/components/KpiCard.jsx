'use client'

import { colors, fonts } from '@/lib/styles'

/**
 * Shared KPI stat card used across MyAccountPanel, AdminHomeTab, and AgentDetailPage.
 *
 * Props:
 *   label   — upper-case label text
 *   value   — large displayed value (string or number)
 *   sub     — small sub-text below the value
 *   accent  — optional color override for the value
 *   onClick — optional click handler (adds pointer cursor + hover effect)
 */
export default function KpiCard({ label, value, sub, accent, onClick }) {
  return (
    <div
      data-testid="kpi-card"
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 12,
        border: `1px solid ${colors.lineGray}`,
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow .12s',
        flex: '1 1 160px',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = '0 2px 12px rgba(93,58,94,0.10)' }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: colors.lovelabMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
        fontFamily: fonts.body,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28,
        fontWeight: 800,
        color: accent || colors.inkPlum,
        marginBottom: 2,
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: colors.lovelabMuted, fontFamily: fonts.body }}>
          {sub}
        </div>
      )}
    </div>
  )
}

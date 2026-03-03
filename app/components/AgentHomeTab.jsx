'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useAuth } from './AuthProvider'
import ResourcesCard from './ResourcesCard'

const fmt = (n) => {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n) || 0)
}

const STATUS_COLORS = {
  pending:   { bg: '#fff3cd', color: '#856404' },
  approved:  { bg: '#d1ecf1', color: '#0c5460' },
  paid:      { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}

export default function AgentHomeTab({ onSwitchTab }) {
  const { profile, user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/commissions')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const summary = data?.summary || {}
  const recentOrders = useMemo(() => {
    if (!data?.commissions) return []
    return data.commissions.filter(c => c.type === 'order').slice(0, 5)
  }, [data])

  const agentProfile = data?.agent_profile || {}
  const name = profile?.full_name || user?.email?.split('@')[0] || 'there'

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted, fontSize: 14 }}>Loading your dashboard...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: colors.inkPlum, letterSpacing: '-0.02em' }}>
              Welcome back, {name}!
            </div>
            <div style={{ fontSize: 13, color: colors.lovelabMuted, marginTop: 4 }}>
              Commission rate: <strong style={{ color: colors.inkPlum }}>{agentProfile.commission_rate ?? profile?.commission_rate ?? '—'}%</strong>
              {agentProfile.agent_conditions && (
                <span style={{ marginLeft: 8, color: '#bbb' }}>· {agentProfile.agent_conditions}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onSwitchTab?.('builder')}
              style={{
                padding: '10px 18px', borderRadius: 9,
                border: `1px solid ${colors.lineGray}`, background: '#fff',
                color: colors.charcoal, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: fonts.body,
              }}
            >
              Order Builder
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          {[
            { label: 'Total Earned', value: fmt(summary.total_earned), sub: `${(summary.order_count || 0) + (summary.bonus_count || 0)} entries` },
            { label: 'Pending Balance', value: fmt(summary.true_pending_balance), sub: 'awaiting payment', accent: summary.true_pending_balance > 0 ? '#c5a059' : undefined },
            { label: 'Total Paid Out', value: fmt(summary.total_paid_out), sub: 'received so far', accent: '#27ae60' },
            { label: 'Orders', value: summary.order_count ?? '—', sub: `${summary.bonus_count || 0} bonuses` },
          ].map(card => (
            <div key={card.label} style={{
              background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`,
              padding: '20px 24px', flex: '1 1 180px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: card.accent || colors.inkPlum, lineHeight: 1.1 }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{card.sub}</div>}
            </div>
          ))}
        </div>

        {/* Recent Orders */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Orders</span>
          </div>
          {recentOrders.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>
              No orders yet — start building!
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#faf8fc' }}>
                  {['Date', 'Client', 'Order Total', 'Commission', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: `1px solid ${colors.lineGray}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(c => {
                  const st = STATUS_COLORS[c.status] || STATUS_COLORS.pending
                  return (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${colors.lineGray}` }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: colors.lovelabMuted }}>
                        {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: colors.charcoal }}>
                        {c.document?.client_company || c.document?.client_name || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: colors.charcoal }}>{fmt(c.order_total)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 800, color: colors.inkPlum }}>{fmt(c.commission_amount)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: st.bg, color: st.color }}>{c.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <ResourcesCard />
      </div>
    </div>
  )
}

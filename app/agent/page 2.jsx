'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { useAuth } from '@/app/components/AuthProvider'
import KpiCard from '@/app/components/KpiCard'

const STATUS_COLORS = {
  pending:   { bg: '#fff3cd', color: '#856404' },
  approved:  { bg: '#d1ecf1', color: '#0c5460' },
  paid:      { bg: '#d4edda', color: '#155724' },
  cancelled: { bg: '#f8d7da', color: '#721c24' },
}

const sectionLabel = {
  fontSize: 11, fontWeight: 700, color: colors.lovelabMuted,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

export default function AgentDashboardPage() {
  const { profile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  const load = async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const r = await fetch('/api/commissions')
      const d = await r.json()
      const deduped = Array.isArray(d?.commissions)
        ? Object.values(d.commissions.reduce((acc, row) => {
            if (row?.id) acc[row.id] = row
            return acc
          }, {}))
        : []
      setData({ ...d, commissions: deduped })
    } catch {
      setFetchError('Failed to load your data.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const summary = data?.summary || {}
  const agentProfile = data?.agent_profile || {}

  const orderCommissions = useMemo(() => {
    if (!data?.commissions) return []
    return data.commissions.filter(c => c.type === 'order').slice(0, 8)
  }, [data])

  const b2bCount = useMemo(() =>
    orderCommissions.filter(c => !c.document?.order_channel || c.document?.order_channel === 'b2b').length,
  [orderCommissions])

  const b2cCount = useMemo(() =>
    orderCommissions.filter(c => c.document?.order_channel === 'b2c').length,
  [orderCommissions])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted, fontSize: 14, fontFamily: fonts.body }}>
        Loading your dashboard…
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px', fontFamily: fonts.body }}>
      <h1 style={{ fontSize: 24, color: colors.inkPlum, margin: '0 0 6px', fontWeight: 800 }}>
        Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
      </h1>
      <div style={{ fontSize: 13, color: colors.lovelabMuted, marginBottom: 24 }}>
        Your agent dashboard — commission overview and recent activity.
      </div>

      {fetchError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {fetchError}
          <button onClick={load} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* Commission rate */}
      <div style={{ marginBottom: 20, padding: '10px 14px', background: `${colors.inkPlum}08`, borderRadius: 8, fontSize: 13, color: colors.inkPlum, fontWeight: 600 }}>
        Commission rate: {agentProfile.commission_rate ?? profile?.commission_rate ?? '—'}%
        {agentProfile.agent_conditions && (
          <span style={{ marginLeft: 10, color: colors.lovelabMuted, fontWeight: 400, fontSize: 12 }}>
            {agentProfile.agent_conditions}
          </span>
        )}
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard
          label="Total Earned"
          value={fmt(summary.total_earned)}
          sub={`${(summary.order_count || 0) + (summary.bonus_count || 0)} entries`}
        />
        <KpiCard
          label="Pending Balance"
          value={fmt(summary.true_pending_balance)}
          sub="awaiting payment"
          accent={summary.true_pending_balance > 0 ? colors.luxeGold : undefined}
        />
        <KpiCard
          label="Total Paid Out"
          value={fmt(summary.total_paid_out)}
          sub="received so far"
          accent={colors.success}
        />
      </div>

      {/* B2B / B2C counts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <KpiCard label="B2B Orders" value={b2bCount} sub="from trade fairs" />
        <KpiCard label="B2C Orders" value={b2cCount} sub="from website" accent={colors.luxeGold} />
      </div>

      {/* Recent orders table */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}` }}>
          <span style={sectionLabel}>Recent Orders</span>
        </div>
        {orderCommissions.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>No orders yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf8fc' }}>
                {['Date', 'Client', 'Order Total', 'Commission', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: `1px solid ${colors.lineGray}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderCommissions.map(c => {
                const st = STATUS_COLORS[c.status] || STATUS_COLORS.pending
                return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${colors.lineGray}` }}>
                    <td style={{ padding: '9px 12px', fontSize: 11, color: colors.lovelabMuted }}>
                      {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 12, fontWeight: 600, color: colors.charcoal }}>
                      {c.document?.client_company || c.document?.client_name || '—'}
                      {c.document?.order_channel === 'b2c' && (
                        <span style={{ marginLeft: 5, fontSize: 9, color: colors.luxeGold, fontWeight: 700 }}>B2C</span>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: colors.charcoal }}>{fmt(c.order_total)}</td>
                    <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 800, color: colors.inkPlum }}>{fmt(c.commission_amount)}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: st.bg, color: st.color }}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { colors, fonts } from '@/lib/styles'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const fmt = (n) => {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const STATUS_COLORS = {
  pending: { bg: '#fff3cd', color: '#856404', label: 'Pending' },
  approved: { bg: '#d1ecf1', color: '#0c5460', label: 'Approved' },
  paid: { bg: '#d4edda', color: '#155724', label: 'Paid' },
  cancelled: { bg: '#f8d7da', color: '#721c24', label: 'Cancelled' },
}

const ITEMS_PER_PAGE = 20

export default function AgentCommissions() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (authLoading) return
    if (!profile?.is_agent) {
      router.push('/')
      return
    }
    fetchCommissions()
  }, [authLoading, profile])

  const fetchCommissions = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/commissions')
      if (!res.ok) throw new Error('Failed to load commissions')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const monthlyData = useMemo(() => {
    if (!data?.commissions) return []
    const byMonth = {}
    for (const c of data.commissions) {
      if (c.status === 'cancelled') continue
      const d = new Date(c.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { month: key, orders: 0, bonuses: 0 }
      if (c.type === 'bonus') {
        byMonth[key].bonuses += Number(c.commission_amount) || 0
      } else {
        byMonth[key].orders += Number(c.commission_amount) || 0
      }
    }
    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map(m => ({
        ...m,
        label: new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        orders: Math.round(m.orders),
        bonuses: Math.round(m.bonuses),
      }))
  }, [data])

  const pagedCommissions = useMemo(() => {
    if (!data?.commissions) return []
    const start = page * ITEMS_PER_PAGE
    return data.commissions.slice(start, start + ITEMS_PER_PAGE)
  }, [data, page])

  const totalPages = data?.commissions ? Math.ceil(data.commissions.length / ITEMS_PER_PAGE) : 0

  if (authLoading || loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: 16, color: colors.danger }}>{error}</div>
        <button onClick={fetchCommissions} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  const s = data?.summary || {}
  const ap = data?.agent_profile || {}

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: '0 0 4px' }}>
          My Commissions
        </h1>
        <p style={{ fontSize: 13, color: colors.lovelabMuted, margin: '0 0 24px' }}>
          Track your earnings and commission history
        </p>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <SummaryCard label="Total Earned" value={fmt(s.total_earned)} sub={`${s.order_count + s.bonus_count} entries`} accent={colors.inkPlum} />
          <SummaryCard label="From Orders" value={fmt(s.from_orders)} sub={`${s.order_count} orders`} accent={colors.success} />
          <SummaryCard label="Bonuses" value={fmt(s.from_bonuses)} sub={`${s.bonus_count} bonuses`} accent={colors.luxeGold} />
          <SummaryCard label="Pending Payout" value={fmt(s.pending_amount)} sub="awaiting payment" accent={colors.warning} />
        </div>

        {/* Conditions Card */}
        {(ap.commission_rate != null || ap.agent_conditions) && (
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 20px', marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              My Conditions
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <span style={{ fontSize: 28, fontWeight: 800, color: colors.inkPlum }}>{ap.commission_rate || 0}%</span>
                <span style={{ fontSize: 13, color: colors.lovelabMuted, marginLeft: 6 }}>commission rate</span>
              </div>
              {ap.agent_conditions && (
                <div style={{ fontSize: 13, color: colors.charcoal, lineHeight: 1.5, flex: 1, minWidth: 200 }}>
                  {ap.agent_conditions}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Monthly Chart */}
        {monthlyData.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 20px', marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
              Monthly Earnings
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="orders" name="Orders" fill={colors.inkPlum} radius={[4, 4, 0, 0]} />
                <Bar dataKey="bonuses" name="Bonuses" fill={colors.luxeGold} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Commission History */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.lineGray}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Commission History
            </span>
          </div>

          {(!data?.commissions || data.commissions.length === 0) ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: colors.charcoal, marginBottom: 4 }}>No commissions yet</div>
              <div style={{ fontSize: 13, color: colors.lovelabMuted }}>Start creating orders to earn commissions</div>
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Type', 'Client / Reason', 'Order Total', 'Rate', 'Commission', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', background: '#faf8fc', borderBottom: `1px solid ${colors.lineGray}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedCommissions.map(c => {
                    const st = STATUS_COLORS[c.status] || STATUS_COLORS.pending
                    return (
                      <tr key={c.id}>
                        <td style={tdStyle}>
                          {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                            padding: '2px 6px', borderRadius: 4,
                            background: c.type === 'bonus' ? '#fef3c7' : '#ede9fe',
                            color: c.type === 'bonus' ? '#92400e' : '#5b21b6',
                          }}>
                            {c.type}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>
                          {c.type === 'bonus'
                            ? (c.notes || 'Bonus')
                            : (c.document?.client_company || c.document?.client_name || '—')}
                        </td>
                        <td style={tdStyle}>{c.type === 'order' ? fmt(c.order_total) : '—'}</td>
                        <td style={tdStyle}>{c.type === 'order' ? `${c.commission_rate}%` : '—'}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: colors.inkPlum }}>{fmt(c.commission_amount)}</td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                            background: st.bg, color: st.color,
                          }}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 16px', borderTop: `1px solid ${colors.lineGray}` }}>
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    style={pageBtnStyle(page > 0)}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 12, color: colors.lovelabMuted, alignSelf: 'center' }}>
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    style={pageBtnStyle(page < totalPages - 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent || colors.inkPlum, marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: colors.lovelabMuted }}>{sub}</div>
    </div>
  )
}

const tdStyle = {
  padding: '10px 12px',
  fontSize: 12,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
}

const pageBtnStyle = (active) => ({
  padding: '6px 14px',
  borderRadius: 6,
  border: `1px solid ${active ? colors.inkPlum : colors.lineGray}`,
  background: active ? '#fdf7fa' : '#f9f9f9',
  color: active ? colors.inkPlum : '#ccc',
  fontSize: 12,
  fontWeight: 600,
  cursor: active ? 'pointer' : 'default',
  fontFamily: fonts.body,
})

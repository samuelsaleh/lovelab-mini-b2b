'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const fmt = (n) => {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function AdminDashboard() {
  const router = useRouter()
  const [agents, setAgents] = useState([])
  const [documents, setDocuments] = useState([])
  const [events, setEvents] = useState([])
  const [commissions, setCommissions] = useState({ summary: {} })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/agents').then(r => r.json()).catch(() => ({ agents: [] })),
      fetch('/api/documents').then(r => r.json()).catch(() => ({ documents: [] })),
      fetch('/api/events').then(r => r.json()).catch(() => ({ events: [] })),
      fetch('/api/commissions').then(r => r.json()).catch(() => ({ commissions: [], summary: {} })),
    ]).then(([agentsData, docsData, eventsData, commData]) => {
      setAgents(agentsData.agents || [])
      setDocuments(docsData.documents || [])
      setEvents(eventsData.events || [])
      setCommissions(commData)
      setLoading(false)
    })
  }, [])

  const totalRevenue = useMemo(() =>
    documents.reduce((sum, d) => sum + (Number(d.total_amount) || 0), 0),
  [documents])

  const activeAgents = agents.filter(a => a.agent_status === 'active' || a.agent_status === 'invited')
  const upcomingEvents = events.filter(e => e.end_date && new Date(e.end_date) >= new Date())
  const pendingCommission = commissions.summary?.pending_amount || 0

  const recentDocs = documents.slice(0, 10)

  const topAgents = useMemo(() =>
    [...agents]
      .filter(a => !a.agent_deleted_at)
      .sort((a, b) => (b.stats?.total_revenue || 0) - (a.stats?.total_revenue || 0))
      .slice(0, 5),
  [agents])

  const revenueByEvent = useMemo(() => {
    const byEvent = {}
    for (const d of documents) {
      const eventName = d.events?.name || 'No Event'
      if (!byEvent[eventName]) byEvent[eventName] = 0
      byEvent[eventName] += Number(d.total_amount) || 0
    }
    return Object.entries(byEvent)
      .map(([name, total]) => ({ name: name.length > 20 ? name.slice(0, 18) + '...' : name, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [documents])

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>Loading dashboard...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: '0 0 20px' }}>Dashboard</h1>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
          <Card label="Total Revenue" value={fmt(totalRevenue)} sub={`${documents.length} orders`} accent={colors.inkPlum} />
          <Card label="Active Agents" value={activeAgents.length} sub={`${agents.length} registered`} accent={colors.success} onClick={() => router.push('/admin/agents')} />
          <Card label="Fairs" value={events.length} sub={upcomingEvents.length > 0 ? `${upcomingEvents.length} upcoming` : 'none upcoming'} accent={colors.luxeGold} onClick={() => router.push('/admin/fairs')} />
          <Card label="Commission Owed" value={fmt(pendingCommission)} sub="pending payouts" accent={colors.warning} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, marginBottom: 28 }}>
          {/* Recent Orders */}
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={sectionLabel}>Recent Orders</span>
              <button onClick={() => router.push('/dashboard')} style={linkBtn}>View all</button>
            </div>
            {recentDocs.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>No orders yet</div>
            ) : (
              <div>
                {recentDocs.map(d => (
                  <div key={d.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal }}>{d.client_company || d.client_name || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: colors.lovelabMuted }}>
                        {d.events?.name && <span>{d.events.name} · </span>}
                        {new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {d.profiles?.full_name && <span> · by {d.profiles.full_name}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>{d.total_amount ? fmt(d.total_amount) : '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Agents */}
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={sectionLabel}>Top Agents</span>
              <button onClick={() => router.push('/admin/agents')} style={linkBtn}>Manage</button>
            </div>
            {topAgents.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>No agents yet</div>
            ) : (
              <div>
                {topAgents.map((a, i) => (
                  <div key={a.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: colors.lovelabMuted, width: 20 }}>{i + 1}.</span>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: colors.inkPlum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                      {(a.full_name || a.email || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.full_name || a.email}
                      </div>
                      <div style={{ fontSize: 10, color: colors.lovelabMuted }}>
                        {a.agent_country || ''}{a.agent_country && a.stats?.total_orders ? ' · ' : ''}{a.stats?.total_orders || 0} orders
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>{fmt(a.stats?.total_revenue)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Revenue by Fair */}
        {revenueByEvent.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 20px' }}>
            <div style={{ ...sectionLabel, marginBottom: 16 }}>Revenue by Fair / Event</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueByEvent} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v >= 1000 ? Math.round(v / 1000) + 'k' : v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} width={140} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="total" name="Revenue" fill={colors.inkPlum} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, sub, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default', transition: 'all .12s',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent || colors.inkPlum, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.lovelabMuted }}>{sub}</div>
    </div>
  )
}

const sectionLabel = { fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }
const linkBtn = { background: 'none', border: 'none', color: colors.inkPlum, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }

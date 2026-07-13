'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import ResourcesCard from '../components/ResourcesCard'
import { fetchAllDocuments } from '@/lib/fetchAllDocuments'

const fmt = (n) => {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function AdminDashboard() {
  const router = useRouter()
  const { isCompact } = useResponsive()
  const [agents, setAgents] = useState([])
  const [documents, setDocuments] = useState([])
  const [events, setEvents] = useState([])
  const [commissions, setCommissions] = useState({ summary: {} })
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  const loadDashboard = async () => {
    setLoading(true)
    setFetchError(null)
    try {
      // Fetch EVERY document (not just the first 50-row page) so the KPIs
      // reflect all orders. See lib/fetchAllDocuments.
      const [allDocs, agentsData, eventsData, commData] = await Promise.all([
        fetchAllDocuments(),
        fetch('/api/agents').then(r => r.json()),
        fetch('/api/events').then(r => r.json()),
        fetch('/api/commissions').then(r => r.json()),
      ])
      setAgents(agentsData.agents || [])
      setDocuments(allDocs)
      setEvents(eventsData.events || [])
      setCommissions(commData)
    } catch {
      setFetchError('Failed to load dashboard data.')
    }
    setLoading(false)
  }

  useEffect(() => { loadDashboard() }, [])

  // Revenue = real orders only (quotes aren't revenue) and excludes drafts
  // (parked, uncommitted). Internal/consignment/write-off are already excluded
  // by the API's default document list.
  const orderDocs = useMemo(() =>
    documents.filter(d => d.document_type === 'order' && d.status !== 'draft'),
  [documents])

  const totalRevenue = useMemo(() =>
    orderDocs.reduce((sum, d) => sum + (Number(d.total_amount) || 0), 0),
  [orderDocs])

  const activeAgents = agents.filter(a => a.agent_status === 'active' || a.agent_status === 'invited')
  const upcomingEvents = events.filter(e => e.end_date && new Date(e.end_date) >= new Date())
  const pendingCommission = commissions.summary?.pending_amount || 0

  // Recent activity excludes drafts — they live in the Draft folder, not here.
  const recentDocs = documents.filter(d => d.status !== 'draft').slice(0, 10)

  const topAgents = useMemo(() =>
    [...agents]
      .filter(a => !a.agent_deleted_at)
      .sort((a, b) => {
        const revA = a.stats?.effective_revenue || a.stats?.total_revenue || 0
        const revB = b.stats?.effective_revenue || b.stats?.total_revenue || 0
        return revB - revA
      })
      .slice(0, 5),
  [agents])

  // Revenue grouped by organization (partner-company template) — links to
  // the /admin/organizations pages for the full team dashboards.
  const revenueByOrg = useMemo(() => {
    const byOrg = new Map()
    for (const a of agents) {
      if (!a.organization_id || a.agent_deleted_at) continue
      const rev = a.stats?.effective_revenue || a.stats?.total_revenue || 0
      const entry = byOrg.get(a.organization_id) || {
        id: a.organization_id,
        name: a.organization_name || 'Organization',
        revenue: 0,
        members: 0,
      }
      entry.revenue += rev
      entry.members += 1
      byOrg.set(a.organization_id, entry)
    }
    return [...byOrg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6)
  }, [agents])

  const revenueByEvent = useMemo(() => {
    const byEvent = {}
    for (const d of orderDocs) {
      const eventName = d.events?.name || 'No Event'
      if (!byEvent[eventName]) byEvent[eventName] = 0
      byEvent[eventName] += Number(d.total_amount) || 0
    }
    return Object.entries(byEvent)
      .map(([name, total]) => ({ name: name.length > 20 ? name.slice(0, 18) + '...' : name, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [orderDocs])

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>Loading dashboard...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      {fetchError && (
        <div style={{ padding: 14, marginBottom: 16, background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {fetchError}
          <button onClick={loadDashboard} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Retry</button>
        </div>
      )}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: '0 0 20px' }}>Dashboard</h1>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
          <Card label="Total Revenue" value={fmt(totalRevenue)} sub={`${orderDocs.length} orders`} accent={colors.inkPlum} />
          <Card label="Active Agents" value={activeAgents.length} sub={`${agents.length} registered`} accent={colors.success} onClick={() => router.push('/admin/agents')} />
          <Card label="Fairs" value={events.length} sub={upcomingEvents.length > 0 ? `${upcomingEvents.length} upcoming` : 'none upcoming'} accent={colors.luxeGold} onClick={() => router.push('/admin/fairs')} />
          <Card label="Commission Owed" value={fmt(pendingCommission)} sub="pending payouts" accent={colors.warning} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 320px', gap: 20, marginBottom: 28 }}>
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
                        {d.creator?.full_name && <span> · by {d.creator.full_name}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>{d.total_amount != null ? fmt(d.total_amount) : '—'}</div>
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
                {topAgents.map((a, i) => {
                  const orderCount = a.stats?.effective_orders || a.stats?.total_orders || 0
                  const countLabel = `${orderCount} orders`
                  const revenueLabel = a.stats?.effective_revenue || a.stats?.total_revenue || 0
                  return (
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
                        {a.agent_country || ''}{a.agent_country && countLabel ? ' · ' : ''}{countLabel}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>{fmt(revenueLabel)}</div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Revenue by Organization */}
        {revenueByOrg.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden', marginBottom: 28 }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={sectionLabel}>By Organization</span>
              <button onClick={() => router.push('/admin/organizations')} style={linkBtn}>View all</button>
            </div>
            {revenueByOrg.map(org => (
              <div
                key={org.id}
                onClick={() => router.push(`/admin/organizations/${org.id}`)}
                style={{ padding: '10px 18px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal }}>{org.name}</div>
                  <div style={{ fontSize: 11, color: colors.lovelabMuted }}>{org.members} {org.members === 1 ? 'agent' : 'agents'}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>{fmt(org.revenue)}</div>
              </div>
            ))}
          </div>
        )}

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

        {/* Resources */}
        <ResourcesCard isAdmin={true} />
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

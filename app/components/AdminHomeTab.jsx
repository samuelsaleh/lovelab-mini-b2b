'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { safeFetch } from '@/lib/api'
import ResourcesCard from './ResourcesCard'

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

export default function AdminHomeTab() {
  const router = useRouter()
  const [agents, setAgents] = useState([])
  const [documents, setDocuments] = useState([])
  const [events, setEvents] = useState([])
  const [commissions, setCommissions] = useState({ summary: {} })
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const results = await Promise.allSettled([
        safeFetch('/api/agents').then(r => r.json()),
        safeFetch('/api/documents').then(r => r.json()),
        safeFetch('/api/events').then(r => r.json()),
        safeFetch('/api/commissions').then(r => r.json()),
      ])
      const [agentsResult, docsResult, eventsResult, commResult] = results
      if (agentsResult.status === 'fulfilled') setAgents(agentsResult.value.agents || [])
      if (docsResult.status === 'fulfilled') setDocuments(docsResult.value.documents || [])
      if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value.events || [])
      if (commResult.status === 'fulfilled') setCommissions(commResult.value)
      const failed = results.filter(r => r.status === 'rejected')
      if (failed.length > 0) setFetchError(`Some data failed to load (${failed.length}/${results.length} APIs). Showing partial results.`)
    } catch {
      setFetchError('Failed to load dashboard data.')
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const orderDocs = useMemo(() => documents.filter(d => d.document_type === 'order'), [documents])
  const totalRevenue = useMemo(() =>
    orderDocs.reduce((sum, d) => sum + (Number(d.total_amount) || 0), 0),
  [orderDocs])

  const activeAgents = agents.filter(a => a.agent_status === 'active' || a.agent_status === 'invited')
  const upcomingEvents = events.filter(e => e.end_date && new Date(e.end_date) >= new Date())
  const pendingCommission = commissions.summary?.pending_amount || 0
  const recentDocs = documents.slice(0, 8)

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

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted, fontSize: 14 }}>Loading dashboard...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      {fetchError && (
        <div style={{ padding: 14, marginBottom: 16, background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {fetchError}
          <button onClick={loadData} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Retry</button>
        </div>
      )}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>Dashboard</h1>
          <button
            onClick={() => router.push('/admin')}
            style={{ ...linkBtn, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Full Admin Panel →
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
          <Card label="Total Revenue" value={fmt(totalRevenue)} sub={`${orderDocs.length} order${orderDocs.length !== 1 ? 's' : ''}`} accent={colors.inkPlum} />
          <Card label="Active Agents" value={activeAgents.length} sub={`${agents.length} registered`} accent={colors.success} onClick={() => router.push('/admin/agents')} />
          <Card label="Fairs" value={events.length} sub={upcomingEvents.length > 0 ? `${upcomingEvents.length} upcoming` : 'none upcoming'} accent={colors.luxeGold} onClick={() => router.push('/admin/fairs')} />
          <Card label="Commission Owed" value={fmt(pendingCommission)} sub="pending payouts" accent={colors.warning} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 }}>
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
                    <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>{d.total_amount != null ? fmt(d.total_amount) : '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

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

        <ResourcesCard />
      </div>
    </div>
  )
}

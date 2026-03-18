'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { safeFetch } from '@/lib/api'
import { useAuth } from './AuthProvider'
import { useI18n } from '@/lib/i18n'
import KpiCard from './KpiCard'

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

// ─── Admin Panel Content ────────────────────────────────────────────────────

function AdminContent({ onClose }) {
  const router = useRouter()
  const [agents, setAgents] = useState([])
  const [documents, setDocuments] = useState([])
  const [events, setEvents] = useState([])
  const [commissions, setCommissions] = useState({ summary: {} })
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  const load = async () => {
    setLoading(true)
    setFetchError(null)
    const results = await Promise.allSettled([
      safeFetch('/api/agents').then(r => r.json()),
      safeFetch('/api/documents').then(r => r.json()),
      safeFetch('/api/events').then(r => r.json()),
      safeFetch('/api/commissions').then(r => r.json()),
    ])
    const [agentsRes, docsRes, eventsRes, commRes] = results
    if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value.agents || [])
    if (docsRes.status   === 'fulfilled') setDocuments(docsRes.value.documents || [])
    if (eventsRes.status === 'fulfilled') setEvents(eventsRes.value.events || [])
    if (commRes.status   === 'fulfilled') setCommissions(commRes.value)
    const failed = results.filter(r => r.status === 'rejected')
    if (failed.length > 0) setFetchError(`${failed.length} of ${results.length} data sources failed — showing partial results.`)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Exclude internal (supplier) orders from all revenue analytics
  const billableDocs = useMemo(() => documents.filter(d => d.order_channel !== 'internal'), [documents])
  const orderDocs = useMemo(() => billableDocs.filter(d => d.document_type === 'order'), [billableDocs])
  const b2bDocs   = useMemo(() => orderDocs.filter(d => !d.order_channel || d.order_channel === 'b2b'), [orderDocs])
  const b2cDocs   = useMemo(() => orderDocs.filter(d => d.order_channel === 'b2c'), [orderDocs])

  const totalRevenue   = useMemo(() => orderDocs.reduce((s, d) => s + (Number(d.total_amount) || 0), 0), [orderDocs])
  const activeAgents   = agents.filter(a => a.agent_status === 'active' || a.agent_status === 'invited')
  const upcomingEvents = events.filter(e => e.end_date && new Date(e.end_date) >= new Date())
  const pendingComm    = commissions.summary?.pending_amount || 0

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

  const recentDocs = orderDocs.slice(0, 6)

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted, fontSize: 14 }}>
        Loading your dashboard…
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px' }}>
      {fetchError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {fetchError}
          <button onClick={load} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard label="Total Revenue" value={fmt(totalRevenue)} sub={`${orderDocs.length} orders total`} />
        <KpiCard label="Active Agents" value={activeAgents.length} sub={`${agents.length} registered`} accent={colors.success} onClick={() => { onClose(); router.push('/admin/agents') }} />
        <KpiCard label="Fairs" value={events.length} sub={upcomingEvents.length > 0 ? `${upcomingEvents.length} upcoming` : 'none upcoming'} accent={colors.luxeGold} onClick={() => { onClose(); router.push('/admin/fairs') }} />
        <KpiCard label="Commission Owed" value={fmt(pendingComm)} sub="pending payouts" accent={colors.warning} />
      </div>

      {/* B2B / B2C split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <KpiCard label="B2B Orders" value={b2bDocs.length} sub={`${fmt(b2bDocs.reduce((s, d) => s + (Number(d.total_amount) || 0), 0))} revenue`} />
        <KpiCard label="B2C Orders" value={b2cDocs.length} sub={`${fmt(b2cDocs.reduce((s, d) => s + (Number(d.total_amount) || 0), 0))} revenue`} accent={colors.luxeGold} />
      </div>

      {/* Recent Orders + Top Agents */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
        {/* Recent Orders */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={sectionLabel}>Recent Orders</span>
            <button onClick={() => { onClose(); router.push('/dashboard') }} style={{ background: 'none', border: 'none', color: colors.inkPlum, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>View all</button>
          </div>
          {recentDocs.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: colors.lovelabMuted, fontSize: 12 }}>No orders yet</div>
          ) : (
            <div>
              {recentDocs.map(d => (
                <div key={d.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal }}>{d.client_company || d.client_name || 'Unknown'}</div>
                    <div style={{ fontSize: 10, color: colors.lovelabMuted }}>
                      {new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {d.order_channel === 'b2c' && <span style={{ marginLeft: 6, color: colors.luxeGold, fontWeight: 700 }}>B2C</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>{d.total_amount != null ? fmt(d.total_amount) : '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Agents */}
        <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={sectionLabel}>Top Agents</span>
            <button onClick={() => { onClose(); router.push('/admin/agents') }} style={{ background: 'none', border: 'none', color: colors.inkPlum, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Manage</button>
          </div>
          {topAgents.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: colors.lovelabMuted, fontSize: 12 }}>No agents yet</div>
          ) : (
            <div>
              {topAgents.map((a, i) => {
                const orders = a.stats?.effective_orders || a.stats?.total_orders || 0
                const revenue = a.stats?.effective_revenue || a.stats?.total_revenue || 0
                return (
                  <div key={a.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, width: 18 }}>{i + 1}.</span>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: colors.inkPlum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                      {(a.full_name || a.email || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: colors.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.full_name || a.email}</div>
                      <div style={{ fontSize: 10, color: colors.lovelabMuted }}>{orders} orders</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum }}>{fmt(revenue)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Agent Panel Content ─────────────────────────────────────────────────────

function AgentContent() {
  const { profile, user } = useAuth()
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
        ? Object.values(d.commissions.reduce((acc, row) => { if (row?.id) acc[row.id] = row; return acc }, {}))
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

  const b2bCount = useMemo(() => orderCommissions.filter(c => !c.document?.order_channel || c.document?.order_channel === 'b2b').length, [orderCommissions])
  const b2cCount = useMemo(() => orderCommissions.filter(c => c.document?.order_channel === 'b2c').length, [orderCommissions])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted, fontSize: 14 }}>
        Loading your account…
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px' }}>
      {fetchError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {fetchError}
          <button onClick={load} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* Commission rate */}
      <div style={{ marginBottom: 20, padding: '10px 14px', background: `${colors.inkPlum}08`, borderRadius: 8, fontSize: 13, color: colors.inkPlum, fontWeight: 600 }}>
        Commission rate: {agentProfile.commission_rate ?? profile?.commission_rate ?? '—'}%
        {agentProfile.agent_conditions && <span style={{ marginLeft: 10, color: colors.lovelabMuted, fontWeight: 400, fontSize: 12 }}>{agentProfile.agent_conditions}</span>}
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Earned" value={fmt(summary.total_earned)} sub={`${(summary.order_count || 0) + (summary.bonus_count || 0)} entries`} />
        <KpiCard label="Pending Balance" value={fmt(summary.true_pending_balance)} sub="awaiting payment" accent={summary.true_pending_balance > 0 ? colors.luxeGold : undefined} />
        <KpiCard label="Total Paid Out" value={fmt(summary.total_paid_out)} sub="received so far" accent={colors.success} />
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
                  <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: `1px solid ${colors.lineGray}` }}>{h}</th>
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
                      {c.document?.order_channel === 'b2c' && <span style={{ marginLeft: 5, fontSize: 9, color: colors.luxeGold, fontWeight: 700 }}>B2C</span>}
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: colors.charcoal }}>{fmt(c.order_total)}</td>
                    <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 800, color: colors.inkPlum }}>{fmt(c.commission_amount)}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: st.bg, color: st.color }}>{c.status}</span>
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

// ─── Panel shell ─────────────────────────────────────────────────────────────

/**
 * MyAccountPanel — lazy-loaded slide-in panel from the right.
 * Backdrop is rendered in App.jsx (outside Suspense) so it appears immediately.
 *
 * Props:
 *   onClose — closes the panel
 */
export default function MyAccountPanel({ onClose }) {
  const { profile, user } = useAuth()
  const { t } = useI18n()

  const isAdmin = profile?.role === 'admin'
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Account'

  return (
    <div
      data-testid="my-account-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100%',
        width: 'min(600px, 100vw)',
        background: '#fff',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
        fontFamily: fonts.body,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${colors.lineGray}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum }}>{t('nav.myAccount')}</div>
          <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 2 }}>
            {displayName} · {isAdmin ? 'Admin' : 'Agent'}
          </div>
        </div>
        <button
          data-testid="my-account-close"
          onClick={onClose}
          aria-label="Close account panel"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.lovelabMuted, padding: 6 }}
          onMouseEnter={e => e.currentTarget.style.color = colors.inkPlum}
          onMouseLeave={e => e.currentTarget.style.color = colors.lovelabMuted}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Role-gated content */}
      {isAdmin ? (
        <AdminContent onClose={onClose} />
      ) : (
        <AgentContent />
      )}
    </div>
  )
}

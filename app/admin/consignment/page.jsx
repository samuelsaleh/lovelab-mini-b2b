'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import EditConsignmentDetailsModal from '@/app/components/EditConsignmentDetailsModal'

const BUCKET = 'documents'

// ─── Helpers ──────────────────────────────────────────────────────────────

function isReturned(doc) {
  return !!doc?.metadata?.consignment?.returned_at
}

function isOverdue(doc) {
  const rd = doc?.metadata?.consignment?.return_date
  if (!rd || isReturned(doc)) return false
  return new Date(rd) < new Date()
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatusBadge({ doc }) {
  if (isReturned(doc)) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#555', background: '#f0f0f0', borderRadius: 20, padding: '3px 9px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#aaa', flexShrink: 0 }} />
      Returned
    </span>
  )
  if (isOverdue(doc)) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 20, padding: '3px 9px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />
      Overdue
    </span>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', borderRadius: 20, padding: '3px 9px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
      Active
    </span>
  )
}

function AgentBadge({ name }) {
  if (!name) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
      color: colors.inkPlum, background: `${colors.inkPlum}12`, borderRadius: 20,
      padding: '2px 8px', border: `1px solid ${colors.inkPlum}25`, whiteSpace: 'nowrap',
    }}>
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="3.5" r="2.5" fill={colors.inkPlum} />
        <path d="M1 9.5C1 7.567 2.791 6 5 6s4 1.567 4 3.5" stroke={colors.inkPlum} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </svg>
      {name}
    </span>
  )
}

function TabBtn({ label, count, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
        background: active ? colors.inkPlum : 'transparent',
        color: active ? '#fff' : '#666',
        fontSize: 13, fontWeight: active ? 700 : 500, fontFamily: fonts.body,
        transition: 'all .12s',
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 20, height: 20, borderRadius: 10, fontSize: 10, fontWeight: 800,
          background: active ? 'rgba(255,255,255,0.25)' : (color || '#e8e8e8'),
          color: active ? '#fff' : (color ? '#fff' : '#555'),
          padding: '0 5px',
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────

export default function AdminConsignmentPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('active') // 'active' | 'overdue' | 'returned' | 'all'
  const [search, setSearch] = useState('')
  const [agentFilter, setAgentFilter] = useState(null) // agentId to filter by
  const [markingId, setMarkingId] = useState(null)
  const [expandAgents, setExpandAgents] = useState(true)
  const [editingOrder, setEditingOrder] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/documents?order_channel=consignment&per_page=300')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setOrders(data.documents || [])
    } catch {
      setError('Failed to load consignment orders.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Derived data ──────────────────────────────────────────────────────
  const active = useMemo(() => orders.filter(o => !isReturned(o)), [orders])
  const overdue = useMemo(() => orders.filter(isOverdue), [orders])
  const returned = useMemo(() => orders.filter(isReturned), [orders])

  const totalActiveValue = useMemo(() => active.reduce((s, o) => s + (o.total_amount || 0), 0), [active])
  const totalAllValue = useMemo(() => orders.reduce((s, o) => s + (o.total_amount || 0), 0), [orders])
  const totalReturnedValue = useMemo(() => returned.reduce((s, o) => s + (o.total_amount || 0), 0), [returned])

  // Per-agent breakdown — includes a `docs` array for further drill-down
  const agentBreakdown = useMemo(() => {
    const map = {}
    orders.forEach(o => {
      const agId = o.consignment_agent_id
      if (!agId) return
      if (!map[agId]) {
        const name = o.consignment_agent?.full_name || o.consignment_agent?.email || 'Unknown agent'
        map[agId] = { agentId: agId, name, activeCount: 0, returnedCount: 0, overdueCount: 0, activeValue: 0, nextReturn: null }
      }
      if (isReturned(o)) {
        map[agId].returnedCount++
      } else {
        map[agId].activeCount++
        map[agId].activeValue += o.total_amount || 0
        if (isOverdue(o)) map[agId].overdueCount++
        const rd = o.metadata?.consignment?.return_date
        if (rd && (!map[agId].nextReturn || rd < map[agId].nextReturn)) {
          map[agId].nextReturn = rd
        }
      }
    })
    return Object.values(map).sort((a, b) => b.activeValue - a.activeValue)
  }, [orders])

  // ── Filtered list for current tab ────────────────────────────────────
  const filtered = useMemo(() => {
    let list
    if (tab === 'active') list = active
    else if (tab === 'overdue') list = overdue
    else if (tab === 'returned') list = returned
    else list = orders

    if (agentFilter) list = list.filter(o => o.consignment_agent_id === agentFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(o => {
        const c = o.metadata?.consignment || {}
        const agName = o.consignment_agent?.full_name || o.consignment_agent?.email || ''
        return (
          (c.recipient_name || '').toLowerCase().includes(q) ||
          (c.recipient_company || '').toLowerCase().includes(q) ||
          agName.toLowerCase().includes(q) ||
          (o.client_name || '').toLowerCase().includes(q) ||
          (o.file_name || '').toLowerCase().includes(q)
        )
      })
    }
    return list
  }, [tab, orders, active, overdue, returned, agentFilter, search])

  // ── Actions ──────────────────────────────────────────────────────────
  const openPdf = async (filePath) => {
    if (!filePath) return
    try {
      const supabase = createClient()
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
      if (data?.publicUrl) window.open(data.publicUrl, '_blank')
    } catch { /* non-blocking */ }
  }

  const patchConsignment = async (order, patch) => {
    const newConsignment = { ...(order.metadata?.consignment || {}), ...patch }
    const res = await fetch(`/api/documents/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { consignment: newConsignment } }),
    })
    if (!res.ok) throw new Error('Failed to update')
    const updated = await res.json()
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, metadata: updated.document?.metadata || { ...(o.metadata || {}), consignment: newConsignment } } : o))
  }

  const markReturned = async (order) => {
    setMarkingId(order.id)
    try {
      await patchConsignment(order, { returned_at: new Date().toISOString() })
    } catch { /* non-blocking */ }
    setMarkingId(null)
  }

  const undoReturned = async (order) => {
    setMarkingId(order.id)
    try {
      await patchConsignment(order, { returned_at: null })
    } catch { /* non-blocking */ }
    setMarkingId(null)
  }

  // ── Styles ───────────────────────────────────────────────────────────
  const thStyle = {
    padding: '10px 14px', fontSize: 10, fontWeight: 700,
    color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em',
    textAlign: 'left', borderBottom: `1px solid ${colors.lineGray}`,
    background: '#faf8fc', whiteSpace: 'nowrap',
  }
  const tdStyle = {
    padding: '12px 14px', fontSize: 13, color: '#444',
    borderBottom: `1px solid #f0f0f0`, verticalAlign: 'middle',
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 28px', fontFamily: fonts.body, background: '#f9f7fb', minHeight: '100vh' }}>
      {editingOrder && (
        <EditConsignmentDetailsModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSaved={updated => {
            setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
            setEditingOrder(null)
          }}
        />
      )}
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* ── Page header ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 27, fontWeight: 800, color: colors.inkPlum, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              Consignment Dashboard
            </h1>
            <div style={{ fontSize: 13, color: '#888' }}>
              Track all goods on consignment — who has them, their value, and return deadlines.
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
              border: `1px solid ${colors.lineGray}`, background: '#fff', color: '#666',
              fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', fontFamily: fonts.body,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: loading ? 0.4 : 1 }}>
              <path d="M10.5 6A4.5 4.5 0 1 1 6 1.5" stroke="#666" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              <path d="M6 1.5L7.5 3 6 4.5" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* ── KPI row ──────────────────────────────────────────────── */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              {
                label: 'Active Value', value: fmt(totalActiveValue),
                sub: `${active.length} order${active.length !== 1 ? 's' : ''} out`,
                accent: colors.inkPlum,
                bg: `linear-gradient(135deg, #fdf7fb 0%, #f3ecf8 100%)`,
                border: `${colors.inkPlum}30`,
              },
              {
                label: 'Active Orders', value: active.length,
                sub: 'currently out',
                accent: '#0ea5e9',
                bg: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                border: '#bae6fd',
              },
              {
                label: 'Overdue', value: overdue.length,
                sub: overdue.length > 0 ? 'need chasing' : 'all on time',
                accent: overdue.length > 0 ? '#dc2626' : '#16a34a',
                bg: overdue.length > 0 ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: overdue.length > 0 ? '#fca5a5' : '#86efac',
              },
              {
                label: 'Returned', value: returned.length,
                sub: returned.length > 0 ? `${fmt(totalReturnedValue)} recovered` : 'none yet',
                accent: '#555',
                bg: 'linear-gradient(135deg, #f9f9f9 0%, #f0f0f0 100%)',
                border: '#e0e0e0',
              },
            ].map(card => (
              <div key={card.label} style={{
                background: card.bg, border: `1px solid ${card.border}`,
                borderRadius: 14, padding: '18px 20px',
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: card.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, opacity: 0.75 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 30, fontWeight: 900, color: card.accent, lineHeight: 1, marginBottom: 4 }}>
                  {card.value}
                </div>
                <div style={{ fontSize: 11, color: card.accent, opacity: 0.65 }}>{card.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Value progress bar ────────────────────────────────────── */}
        {!loading && totalAllValue > 0 && (
          <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Value at risk vs total ever consigned
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>
                {fmt(totalActiveValue)} active · {fmt(totalReturnedValue)} returned · {fmt(totalAllValue)} total
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#f0f0f0', overflow: 'hidden' }}>
              <div style={{ display: 'flex', height: '100%' }}>
                <div style={{
                  width: `${totalAllValue > 0 ? (overdue.reduce((s, o) => s + (o.total_amount || 0), 0) / totalAllValue) * 100 : 0}%`,
                  background: '#dc2626', transition: 'width .4s',
                }} />
                <div style={{
                  width: `${totalAllValue > 0 ? ((totalActiveValue - overdue.reduce((s, o) => s + (o.total_amount || 0), 0)) / totalAllValue) * 100 : 0}%`,
                  background: colors.inkPlum, transition: 'width .4s',
                }} />
                <div style={{ flex: 1, background: '#e0e0e0' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              {[
                { color: '#dc2626', label: 'Overdue' },
                { color: colors.inkPlum, label: 'Active (on time)' },
                { color: '#e0e0e0', label: 'Returned' },
              ].map(l => (
                <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#888' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Per-agent breakdown ───────────────────────────────────── */}
        {!loading && agentBreakdown.length > 0 && (
          <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
            <button
              onClick={() => setExpandAgents(x => !x)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: fonts.body,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>
                By Agent ({agentBreakdown.length})
              </span>
              <span style={{ fontSize: 11, color: '#aaa', transform: expandAgents ? 'rotate(180deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▼</span>
            </button>
            {expandAgents && (
              <div style={{ overflowX: 'auto', borderTop: `1px solid ${colors.lineGray}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Agent', 'Active Orders', 'Active Value', 'Overdue', 'Next Return', 'Returned', ''].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agentBreakdown.map(row => {
                      const isSelected = agentFilter === row.agentId
                      const nextDays = daysUntil(row.nextReturn)
                      return (
                        <tr
                          key={row.agentId}
                          style={{ background: isSelected ? `${colors.inkPlum}08` : 'transparent', cursor: 'pointer' }}
                          onClick={() => setAgentFilter(isSelected ? null : row.agentId)}
                        >
                          <td style={{ ...tdStyle, fontWeight: 700, color: colors.inkPlum }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 30, height: 30, borderRadius: '50%',
                                background: `linear-gradient(135deg, ${colors.inkPlum}, ${colors.gradientMedium})`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0,
                              }}>
                                {row.name.charAt(0).toUpperCase()}
                              </div>
                              {row.name}
                            </div>
                          </td>
                          <td style={tdStyle}>{row.activeCount}</td>
                          <td style={{ ...tdStyle, fontWeight: 700 }}>{fmt(row.activeValue)}</td>
                          <td style={{ ...tdStyle, color: row.overdueCount > 0 ? '#dc2626' : '#aaa', fontWeight: row.overdueCount > 0 ? 700 : 400 }}>
                            {row.overdueCount > 0 ? `${row.overdueCount} overdue` : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: nextDays !== null && nextDays < 0 ? '#dc2626' : nextDays !== null && nextDays <= 7 ? '#d97706' : '#444' }}>
                            {row.nextReturn ? (
                              <div>
                                <div>{fmtDate(row.nextReturn)}</div>
                                <div style={{ fontSize: 10, color: nextDays !== null && nextDays < 0 ? '#dc2626' : '#aaa' }}>
                                  {nextDays !== null && nextDays < 0 ? `${Math.abs(nextDays)}d overdue` : nextDays !== null ? `in ${nextDays}d` : ''}
                                </div>
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ ...tdStyle, color: '#888' }}>{row.returnedCount}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <span style={{ fontSize: 10, color: isSelected ? colors.inkPlum : '#ccc', fontWeight: 700 }}>
                              {isSelected ? '✕ Clear filter' : 'Filter ›'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Error banner ──────────────────────────────────────────── */}
        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {error}
            <button onClick={load} style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: fonts.body }}>Retry</button>
          </div>
        )}

        {/* ── Tabs + search ─────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: '12px 12px 0 0', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, background: '#f5f3f7', borderRadius: 10, padding: 4 }}>
            <TabBtn label="Active" count={active.length} active={tab === 'active'} onClick={() => setTab('active')} />
            <TabBtn label="Overdue" count={overdue.length} active={tab === 'overdue'} color={overdue.length > 0 ? '#dc2626' : undefined} onClick={() => setTab('overdue')} />
            <TabBtn label="Returned" count={returned.length} active={tab === 'returned'} color="#888" onClick={() => setTab('returned')} />
            <TabBtn label="All" count={orders.length} active={tab === 'all'} onClick={() => setTab('all')} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {agentFilter && (
              <button
                onClick={() => setAgentFilter(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8,
                  border: `1px solid ${colors.inkPlum}40`, background: `${colors.inkPlum}10`,
                  color: colors.inkPlum, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body,
                }}
              >
                Agent filter ✕
              </button>
            )}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search recipient, agent..."
              style={{
                padding: '8px 12px', fontSize: 13, fontFamily: fonts.body,
                border: `1px solid ${colors.lineGray}`, borderRadius: 8,
                width: 230, outline: 'none', background: '#fafafa',
              }}
            />
          </div>
        </div>

        {/* ── Orders table ─────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Loading orders…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>
                {tab === 'returned' ? '📦' : tab === 'overdue' ? '⏰' : '✨'}
              </div>
              <div style={{ fontSize: 14, color: '#888', fontWeight: 600 }}>
                {tab === 'returned' ? 'No returned orders yet.' :
                  tab === 'overdue' ? 'No overdue orders — great!' :
                    search || agentFilter ? 'No orders match your filters.' :
                      'No consignment orders yet.'}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      'Date Sent', 'Recipient', 'Via', 'Amount',
                      tab === 'returned' ? 'Returned On' : 'Return Date',
                      'Status', 'Actions',
                    ].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o, idx) => {
                    const c = o.metadata?.consignment || {}
                    const agentName = o.consignment_agent_id
                      ? (o.consignment_agent?.full_name || o.consignment_agent?.email || 'Agent')
                      : null
                    const recipientName = c.recipient_name || o.client_name || '—'
                    const recipientCo = c.recipient_company || o.client_company || ''
                    const returnDate = tab === 'returned' ? c.returned_at : c.return_date
                    const days = !isReturned(o) ? daysUntil(c.return_date) : null
                    const rowBg = idx % 2 === 0 ? '#fff' : '#fdfcff'
                    const overdueRow = isOverdue(o)

                    return (
                      <tr
                        key={o.id}
                        style={{
                          background: overdueRow ? '#fff8f8' : rowBg,
                          borderLeft: overdueRow ? '3px solid #fca5a5' : '3px solid transparent',
                          transition: 'background .1s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${colors.inkPlum}05` }}
                        onMouseLeave={e => { e.currentTarget.style.background = overdueRow ? '#fff8f8' : rowBg }}
                      >
                        {/* Date */}
                        <td style={{ ...tdStyle, color: '#888', fontSize: 12 }}>
                          {o.created_at ? fmtDate(o.created_at) : '—'}
                        </td>

                        {/* Recipient */}
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700, color: '#222' }}>{recipientName}</div>
                          {recipientCo && <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{recipientCo}</div>}
                        </td>

                        {/* Via (agent or direct) */}
                        <td style={tdStyle}>
                          {agentName
                            ? <AgentBadge name={agentName} />
                            : <span style={{ fontSize: 11, color: '#ccc' }}>Direct</span>
                          }
                        </td>

                        {/* Amount */}
                        <td style={{ ...tdStyle, fontWeight: 800, color: colors.inkPlum, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {o.total_amount != null ? fmt(o.total_amount) : '—'}
                        </td>

                        {/* Return date / Returned on */}
                        <td style={{ ...tdStyle, minWidth: 120 }}>
                          {returnDate ? (
                            <div>
                              <div style={{ fontWeight: 600, color: !isReturned(o) && overdueRow ? '#dc2626' : '#333' }}>
                                {fmtDate(returnDate)}
                              </div>
                              {days !== null && !isReturned(o) && (
                                <div style={{ fontSize: 10, marginTop: 1, fontWeight: 700, color: days < 0 ? '#dc2626' : days <= 7 ? '#d97706' : '#aaa' }}>
                                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today!' : `${days}d left`}
                                </div>
                              )}
                            </div>
                          ) : '—'}
                        </td>

                        {/* Status */}
                        <td style={tdStyle}><StatusBadge doc={o} /></td>

                        {/* Actions */}
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <button
                              onClick={() => setEditingOrder(o)}
                              style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.inkPlum}50`, background: `${colors.inkPlum}08`, color: colors.inkPlum, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body }}
                            >
                              Edit
                            </button>
                            {o.file_path && (
                              <button
                                onClick={() => openPdf(o.file_path)}
                                style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.lineGray}`, background: '#faf8fc', color: colors.inkPlum, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
                              >
                                PDF
                              </button>
                            )}
                            {!isReturned(o) ? (
                              <button
                                onClick={() => markReturned(o)}
                                disabled={markingId === o.id}
                                title="Mark as returned — moves to history"
                                style={{
                                  padding: '4px 10px', borderRadius: 6, border: '1px solid #d1fae5',
                                  background: '#f0fdf4', color: '#15803d', fontSize: 11, fontWeight: 700,
                                  cursor: markingId === o.id ? 'wait' : 'pointer', fontFamily: fonts.body,
                                  opacity: markingId === o.id ? 0.5 : 1,
                                }}
                              >
                                {markingId === o.id ? '…' : '✓ Returned'}
                              </button>
                            ) : (
                              <button
                                onClick={() => undoReturned(o)}
                                disabled={markingId === o.id}
                                title="Undo return — moves back to active"
                                style={{
                                  padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.lineGray}`,
                                  background: '#fafafa', color: '#888', fontSize: 11, fontWeight: 600,
                                  cursor: markingId === o.id ? 'wait' : 'pointer', fontFamily: fonts.body,
                                  opacity: markingId === o.id ? 0.5 : 1,
                                }}
                              >
                                Undo
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ padding: '10px 18px', borderTop: `1px solid ${colors.lineGray}`, fontSize: 11, color: '#bbb', textAlign: 'right' }}>
                {filtered.length} order{filtered.length !== 1 ? 's' : ''}
                {tab !== 'all' && ` · ${orders.length} total`}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

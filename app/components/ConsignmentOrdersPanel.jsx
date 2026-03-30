'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import EditConsignmentDetailsModal from './EditConsignmentDetailsModal'

const BUCKET = 'documents'

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
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

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

function AgentChip({ name }) {
  if (!name) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
      color: colors.inkPlum, background: `${colors.inkPlum}12`, borderRadius: 20,
      padding: '2px 8px', border: `1px solid ${colors.inkPlum}25`,
    }}>
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="3.5" r="2.5" fill={colors.inkPlum} />
        <path d="M1 9.5C1 7.567 2.791 6 5 6s4 1.567 4 3.5" stroke={colors.inkPlum} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </svg>
      {name}
    </span>
  )
}

export default function ConsignmentOrdersPanel({ onReEdit, onDuplicate }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('active') // 'active' | 'returned'
  const [markingId, setMarkingId] = useState(null)
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

  const active = useMemo(() => orders.filter(o => !isReturned(o)), [orders])
  const overdue = useMemo(() => orders.filter(isOverdue), [orders])
  const returned = useMemo(() => orders.filter(isReturned), [orders])
  const totalActiveValue = useMemo(() => active.reduce((s, o) => s + (o.total_amount || 0), 0), [active])

  const filtered = useMemo(() => {
    const base = tab === 'returned' ? returned : active
    if (!search.trim()) return base
    const q = search.trim().toLowerCase()
    return base.filter(o => {
      const c = o.metadata?.consignment || {}
      return (
        (c.recipient_name || '').toLowerCase().includes(q) ||
        (c.recipient_company || '').toLowerCase().includes(q) ||
        (o.consignment_agent?.full_name || '').toLowerCase().includes(q)
      )
    })
  }, [tab, active, returned, search])

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
    if (!res.ok) throw new Error('Failed')
    setOrders(prev => prev.map(o => o.id === order.id
      ? { ...o, metadata: { ...(o.metadata || {}), consignment: newConsignment } }
      : o
    ))
  }

  const markReturned = async (order) => {
    setMarkingId(order.id)
    try { await patchConsignment(order, { returned_at: new Date().toISOString() }) } catch { /* non-blocking */ }
    setMarkingId(null)
  }

  const undoReturned = async (order) => {
    setMarkingId(order.id)
    try { await patchConsignment(order, { returned_at: null }) } catch { /* non-blocking */ }
    setMarkingId(null)
  }

  const thStyle = {
    padding: '9px 12px', fontSize: 10, fontWeight: 700,
    color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em',
    textAlign: 'left', borderBottom: `1px solid ${colors.lineGray}`, background: '#faf8fc',
    whiteSpace: 'nowrap',
  }
  const tdStyle = {
    padding: '11px 12px', fontSize: 13, color: '#444',
    borderBottom: `1px solid #f0f0f0`, verticalAlign: 'middle',
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', fontFamily: fonts.body }}>
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
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.inkPlum, margin: 0, letterSpacing: '-0.02em' }}>
              Consignment Orders
            </h1>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              Goods sent on consignment — tracked separately, not counted as revenue.
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, background: '#fff', color: '#666', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Summary strip */}
        {!loading && orders.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Active value', value: fmt(totalActiveValue), accent: colors.inkPlum },
              { label: 'Active orders', value: active.length, accent: '#0ea5e9' },
              { label: 'Overdue', value: overdue.length, accent: overdue.length > 0 ? '#dc2626' : '#16a34a' },
              { label: 'Returned', value: returned.length, accent: '#888' },
            ].map(card => (
              <div key={card.label} style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>{card.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: card.accent }}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {error}
            <button onClick={load} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: fonts.body }}>Retry</button>
          </div>
        )}

        {/* Tabs + search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 3, background: '#f5f3f7', borderRadius: 10, padding: 4 }}>
            {[
              { id: 'active', label: 'Active', count: active.length, countBg: overdue.length > 0 ? '#dc2626' : undefined },
              { id: 'returned', label: 'History', count: returned.length, countBg: '#888' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: tab === t.id ? colors.inkPlum : 'transparent',
                  color: tab === t.id ? '#fff' : '#666',
                  fontSize: 13, fontWeight: tab === t.id ? 700 : 500, fontFamily: fonts.body,
                }}
              >
                {t.label}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 18, height: 18, borderRadius: 9, fontSize: 10, fontWeight: 800,
                  background: tab === t.id ? 'rgba(255,255,255,0.25)' : (t.countBg || '#e8e8e8'),
                  color: tab === t.id ? '#fff' : (t.countBg ? '#fff' : '#555'),
                  padding: '0 4px',
                }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipient or agent..."
            style={{ padding: '8px 12px', fontSize: 13, fontFamily: fonts.body, border: `1px solid ${colors.lineGray}`, borderRadius: 8, width: 240, outline: 'none' }}
          />
        </div>

        {/* Table */}
        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: '0 0 12px 12px', overflow: 'hidden', marginTop: 0, borderTop: 'none' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{tab === 'returned' ? '📦' : '✨'}</div>
              <div style={{ fontSize: 13, color: '#888', fontWeight: 600 }}>
                {tab === 'returned' ? 'No returned orders yet.' : search ? 'No orders match your search.' : 'No active consignment orders. Create one via "Create New Order" → Consignment.'}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Recipient', 'Via', 'Amount', tab === 'returned' ? 'Returned On' : 'Return Date', 'Status', 'Actions'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const c = o.metadata?.consignment || {}
                    const agentName = o.consignment_agent_id
                      ? (o.consignment_agent?.full_name || o.consignment_agent?.email || 'Agent')
                      : null
                    const recipientName = c.recipient_name || o.client_name || '—'
                    const recipientCo = c.recipient_company || o.client_company || ''
                    const dateToShow = tab === 'returned' ? c.returned_at : c.return_date
                    const days = !isReturned(o) ? daysUntil(c.return_date) : null
                    const overdueRow = isOverdue(o)

                    return (
                      <tr
                        key={o.id}
                        style={{
                          background: overdueRow ? '#fff8f8' : '#fff',
                          borderLeft: overdueRow ? '3px solid #fca5a5' : '3px solid transparent',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${colors.inkPlum}05` }}
                        onMouseLeave={e => { e.currentTarget.style.background = overdueRow ? '#fff8f8' : '#fff' }}
                      >
                        <td style={{ ...tdStyle, color: '#888', fontSize: 12 }}>
                          {o.created_at ? fmtDate(o.created_at) : '—'}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700, color: '#222' }}>{recipientName}</div>
                          {recipientCo && <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{recipientCo}</div>}
                        </td>
                        <td style={tdStyle}>
                          {agentName ? <AgentChip name={agentName} /> : <span style={{ fontSize: 11, color: '#ccc' }}>Direct</span>}
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 800, color: colors.inkPlum, whiteSpace: 'nowrap' }}>
                          {o.total_amount != null ? fmt(o.total_amount) : '—'}
                        </td>
                        <td style={tdStyle}>
                          {dateToShow ? (
                            <div>
                              <div style={{ fontWeight: 600, color: overdueRow ? '#dc2626' : '#333' }}>
                                {fmtDate(dateToShow)}
                              </div>
                              {days !== null && (
                                <div style={{ fontSize: 10, marginTop: 1, fontWeight: 700, color: days < 0 ? '#dc2626' : days <= 7 ? '#d97706' : '#aaa' }}>
                                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today!' : `${days}d left`}
                                </div>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td style={tdStyle}><StatusBadge doc={o} /></td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setEditingOrder(o)}
                              style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${colors.inkPlum}50`, background: `${colors.inkPlum}08`, color: colors.inkPlum, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body }}
                            >
                              Edit
                            </button>
                            {o.file_path && (
                              <button
                                onClick={() => openPdf(o.file_path)}
                                style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${colors.lineGray}`, background: '#faf8fc', color: colors.inkPlum, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
                              >
                                PDF
                              </button>
                            )}
                            {onReEdit && o.metadata?.formState && (
                              <button
                                onClick={() => onReEdit(o)}
                                style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${colors.inkPlum}`, background: '#fdf7fa', color: colors.inkPlum, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
                              >
                                Edit
                              </button>
                            )}
                            {onDuplicate && o.metadata?.formState && (
                              <button
                                onClick={() => onDuplicate(o)}
                                style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', color: '#555', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
                              >
                                Copy
                              </button>
                            )}
                            {tab === 'active' && (
                              <button
                                onClick={() => markReturned(o)}
                                disabled={markingId === o.id}
                                style={{
                                  padding: '4px 9px', borderRadius: 6, border: '1px solid #d1fae5',
                                  background: '#f0fdf4', color: '#15803d', fontSize: 11, fontWeight: 700,
                                  cursor: markingId === o.id ? 'wait' : 'pointer', fontFamily: fonts.body,
                                  opacity: markingId === o.id ? 0.5 : 1,
                                }}
                              >
                                {markingId === o.id ? '…' : '✓ Returned'}
                              </button>
                            )}
                            {tab === 'returned' && (
                              <button
                                onClick={() => undoReturned(o)}
                                disabled={markingId === o.id}
                                style={{
                                  padding: '4px 9px', borderRadius: 6, border: `1px solid ${colors.lineGray}`,
                                  background: '#fafafa', color: '#888', fontSize: 11, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: fonts.body, opacity: markingId === o.id ? 0.5 : 1,
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
              <div style={{ padding: '8px 16px', borderTop: `1px solid ${colors.lineGray}`, fontSize: 11, color: '#bbb', textAlign: 'right' }}>
                {filtered.length} order{filtered.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { isReturned, isOverdue, daysUntil } from '@/lib/consignment'

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ doc }) {
  if (isReturned(doc)) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#555', background: '#f0f0f0', borderRadius: 20, padding: '3px 10px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#aaa' }} />
      Returned
    </span>
  )
  if (isOverdue(doc)) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 20, padding: '3px 10px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
      Overdue
    </span>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', borderRadius: 20, padding: '3px 10px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
      Active
    </span>
  )
}

function InOutPill({ doc }) {
  return isReturned(doc)
    ? <span style={{ fontSize: 10, fontWeight: 800, color: '#374151', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '2px 7px' }}>IN</span>
    : <span style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '2px 7px' }}>OUT</span>
}

export default function AgentConsignmentPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('active') // 'active' | 'returned'

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/consignment/my')
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        if (!cancelled) setOrders(data.documents || [])
      } catch {
        if (!cancelled) setError('Failed to load your consignment orders.')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const active = useMemo(() => orders.filter(o => !isReturned(o)), [orders])
  const returned = useMemo(() => orders.filter(isReturned), [orders])
  const overdue = useMemo(() => orders.filter(isOverdue), [orders])
  const totalActiveValue = useMemo(() => active.reduce((s, o) => s + (o.total_amount || 0), 0), [active])

  const nextDue = useMemo(() => {
    const dates = active
      .map(o => o.metadata?.consignment?.return_date)
      .filter(Boolean)
      .sort()
    return dates[0] || null
  }, [active])

  const displayed = tab === 'returned' ? returned : active

  const openPdf = async (docId) => {
    if (!docId) return
    try {
      const res = await fetch(`/api/documents/preview?id=${docId}`)
      const data = await res.json()
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    } catch { /* non-blocking */ }
  }

  const thStyle = {
    padding: '10px 14px', fontSize: 10, fontWeight: 700,
    color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em',
    textAlign: 'left', borderBottom: `1px solid ${colors.lineGray}`, background: '#faf8fc',
    whiteSpace: 'nowrap',
  }
  const tdStyle = {
    padding: '12px 14px', fontSize: 13, color: '#444',
    borderBottom: `1px solid #f0f0f0`, verticalAlign: 'middle',
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 28px', fontFamily: fonts.body, background: '#f9f7fb', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: colors.inkPlum, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            My Consignments
          </h1>
          <div style={{ fontSize: 13, color: '#888' }}>
            Goods assigned to you in consignment — contact your admin to return items.
          </div>
        </div>

        {/* ── KPI cards ──────────────────────────────────────────────── */}
        {!loading && orders.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              {
                label: 'Active Value',
                value: fmt(totalActiveValue),
                sub: `${active.length} order${active.length !== 1 ? 's' : ''} currently out`,
                accent: colors.inkPlum,
                bg: 'linear-gradient(135deg, #fdf7fb 0%, #f3ecf8 100%)',
                border: `${colors.inkPlum}30`,
              },
              {
                label: 'Active Orders',
                value: active.length,
                sub: 'being consigned',
                accent: '#0ea5e9',
                bg: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                border: '#bae6fd',
              },
              {
                label: 'Overdue',
                value: overdue.length,
                sub: overdue.length > 0 ? 'past return date' : 'all on time',
                accent: overdue.length > 0 ? '#dc2626' : '#16a34a',
                bg: overdue.length > 0
                  ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'
                  : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: overdue.length > 0 ? '#fca5a5' : '#86efac',
              },
              {
                label: 'Next Return',
                value: nextDue ? fmtDate(nextDue) : '—',
                sub: nextDue ? (() => {
                  const d = Math.ceil((new Date(nextDue) - new Date()) / 86400000)
                  return d < 0 ? `${Math.abs(d)} days overdue` : d === 0 ? 'Due today' : `in ${d} days`
                })() : 'no dates set',
                accent: nextDue && new Date(nextDue) < new Date() ? '#dc2626' : '#444',
                bg: 'linear-gradient(135deg, #fafafa 0%, #f3f3f3 100%)',
                border: '#e0e0e0',
              },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: c.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7, opacity: 0.75 }}>{c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: c.accent, lineHeight: 1, marginBottom: 4 }}>{c.value}</div>
                <div style={{ fontSize: 11, color: c.accent, opacity: 0.65 }}>{c.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────── */}
        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: '12px 12px 0 0', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
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
          <div style={{ fontSize: 12, color: '#aaa' }}>
            {loading ? 'Loading…' : `${orders.length} total order${orders.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* ── Table ──────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#bbb', fontSize: 13 }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
              Loading your consignment orders…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>
                {tab === 'returned' ? '📦' : '✨'}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#888' }}>
                {tab === 'returned'
                  ? 'No returned consignment orders yet.'
                  : 'No active consignment orders assigned to you.'}
              </div>
              {tab === 'active' && (
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
                  Your admin will assign goods to you when they send consignment items.
                </div>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['IN/OUT', 'Date Sent', 'Description', 'Value', tab === 'returned' ? 'Returned On' : 'Return Date', 'Status', 'PDF'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((o, idx) => {
                    const c = o.metadata?.consignment || {}
                    const returnDate = tab === 'returned' ? c.returned_at : c.return_date
                    const days = !isReturned(o) ? daysUntil(o) : null
                    const overdueRow = isOverdue(o)
                    const rowBg = idx % 2 === 0 ? '#fff' : '#fdfcff'

                    return (
                      <tr
                        key={o.id}
                        style={{
                          background: overdueRow ? '#fff8f8' : rowBg,
                          borderLeft: overdueRow ? '3px solid #fca5a5' : '3px solid transparent',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${colors.inkPlum}05` }}
                        onMouseLeave={e => { e.currentTarget.style.background = overdueRow ? '#fff8f8' : rowBg }}
                      >
                        {/* IN/OUT */}
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <InOutPill doc={o} />
                        </td>

                        {/* Date sent */}
                        <td style={{ ...tdStyle, color: '#888', fontSize: 12 }}>
                          {o.created_at ? fmtDate(o.created_at) : '—'}
                        </td>

                        {/* Description */}
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700, color: '#222' }}>
                            {o.file_name || o.client_name || '—'}
                          </div>
                          {o.client_company && (
                            <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{o.client_company}</div>
                          )}
                        </td>

                        {/* Value */}
                        <td style={{ ...tdStyle, fontWeight: 800, color: colors.inkPlum, whiteSpace: 'nowrap' }}>
                          {o.total_amount != null ? fmt(o.total_amount) : '—'}
                        </td>

                        {/* Return date */}
                        <td style={{ ...tdStyle, minWidth: 120 }}>
                          {returnDate ? (
                            <div>
                              <div style={{ fontWeight: 600, color: overdueRow ? '#dc2626' : '#333' }}>
                                {fmtDate(returnDate)}
                              </div>
                              {days !== null && (
                                <div style={{ fontSize: 10, marginTop: 1, fontWeight: 700, color: days < 0 ? '#dc2626' : days <= 7 ? '#d97706' : '#aaa' }}>
                                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today!' : `${days}d left`}
                                </div>
                              )}
                            </div>
                          ) : '—'}
                        </td>

                        {/* Status */}
                        <td style={tdStyle}><StatusBadge doc={o} /></td>

                        {/* PDF */}
                        <td style={tdStyle}>
                          {o.file_path ? (
                            <button
                              onClick={() => openPdf(o.id)}
                              style={{
                                padding: '5px 12px', borderRadius: 7,
                                border: `1px solid ${colors.inkPlum}40`,
                                background: `${colors.inkPlum}08`,
                                color: colors.inkPlum, fontSize: 11, fontWeight: 700,
                                cursor: 'pointer', fontFamily: fonts.body,
                              }}
                            >
                              View PDF
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: '#ddd' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ padding: '10px 18px', borderTop: `1px solid ${colors.lineGray}`, fontSize: 11, color: '#bbb', textAlign: 'right' }}>
                {displayed.length} order{displayed.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>

        {/* ── Informational note ─────────────────────────────────────── */}
        {!loading && orders.length > 0 && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: `${colors.inkPlum}08`, border: `1px solid ${colors.inkPlum}20`, borderRadius: 10, fontSize: 12, color: colors.lovelabMuted }}>
            <strong>How consignment works:</strong> Goods listed here are in your possession. When items are sold or returned, please contact your LoveLab administrator to update the status. Do not return items without notifying admin first.
          </div>
        )}

      </div>
    </div>
  )
}

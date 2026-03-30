'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'documents'

function isOverdue(doc) {
  const returnDate = doc?.metadata?.consignment?.return_date
  if (!returnDate) return false
  if (doc?.metadata?.consignment?.returned_at) return false
  return new Date(returnDate) < new Date()
}

function isReturned(doc) {
  return !!doc?.metadata?.consignment?.returned_at
}

function StatusBadge({ doc }) {
  if (isReturned(doc)) return <span style={{ fontSize: 11, fontWeight: 700, color: '#666', background: '#f0f0f0', borderRadius: 5, padding: '2px 7px' }}>Returned</span>
  if (isOverdue(doc)) return <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 5, padding: '2px 7px' }}>Overdue</span>
  return <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', borderRadius: 5, padding: '2px 7px' }}>Active</span>
}

export default function AgentConsignmentPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
  const totalActive = useMemo(() => active.reduce((s, o) => s + (o.total_amount || 0), 0), [active])
  const nextDue = useMemo(() => {
    const dates = active.map(o => o.metadata?.consignment?.return_date).filter(Boolean).sort()
    return dates[0] || null
  }, [active])

  const openPdf = async (filePath) => {
    try {
      const supabase = createClient()
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
      if (data?.publicUrl) window.open(data.publicUrl, '_blank')
    } catch { /* non-blocking */ }
  }

  const thStyle = {
    padding: '9px 12px', fontSize: 10, fontWeight: 700,
    color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em',
    textAlign: 'left', borderBottom: `1px solid ${colors.lineGray}`, background: '#faf8fc',
  }
  const tdStyle = {
    padding: '10px 12px', fontSize: 13, color: '#444',
    borderBottom: `1px solid ${colors.lineGray}`,
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 28px', fontFamily: fonts.body }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.inkPlum, margin: 0, letterSpacing: '-0.02em' }}>
            My Consignments
          </h1>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            Goods currently in your consignment — read-only view.
          </div>
        </div>

        {/* Summary strip */}
        {!loading && orders.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Active value', value: fmt(totalActive) },
              { label: 'Active orders', value: active.length },
              { label: 'Next due', value: nextDue ? new Date(nextDue).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
            ].map(card => (
              <div key={card.label} style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: colors.inkPlum }}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 18, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Orders table */}
        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 12, color: '#777' }}>
            {loading ? 'Loading…' : `${orders.length} consignment order${orders.length !== 1 ? 's' : ''}`}
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Loading…</div>
          ) : orders.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              No consignment orders assigned to you yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Description', 'Amount', 'Return Date', 'Status', 'PDF'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const c = o.metadata?.consignment || {}
                    return (
                      <tr key={o.id}>
                        <td style={tdStyle}>{o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: '#333' }}>{o.client_name || '—'}</div>
                          {o.client_company && <div style={{ fontSize: 11, color: '#888' }}>{o.client_company}</div>}
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700, textAlign: 'right' }}>{o.total_amount != null ? fmt(o.total_amount) : '—'}</td>
                        <td style={{ ...tdStyle, color: isOverdue(o) ? '#dc2626' : '#444' }}>
                          {c.return_date ? new Date(c.return_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={tdStyle}><StatusBadge doc={o} /></td>
                        <td style={tdStyle}>
                          {o.file_path && (
                            <button onClick={() => openPdf(o.file_path)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.lineGray}`, background: '#faf8fc', color: colors.inkPlum, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>
                              View PDF
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

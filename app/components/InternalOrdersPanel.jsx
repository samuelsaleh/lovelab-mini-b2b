'use client'

import { useState, useEffect, useCallback } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { safeFetch } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'documents'

// ─── Main Panel ────────────────────────────────────────────────────────────

export default function InternalOrdersPanel() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await safeFetch('/api/documents?order_channel=internal&per_page=200')
      const data = await res.json()
      setOrders(data.documents || [])
    } catch {
      setError('Failed to load internal orders.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = orders.filter(o => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      (o.client_name || '').toLowerCase().includes(q) ||
      (o.client_company || '').toLowerCase().includes(q)
    )
  })

  const moveToB2B = async (id) => {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_channel: 'b2b' }),
      })
      if (res.ok) {
        setOrders(prev => prev.filter(o => o.id !== id))
      }
    } catch {
      // non-blocking
    }
  }

  const openPdf = async (filePath, fileName) => {
    try {
      const supabase = createClient()
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
      if (data?.publicUrl) {
        window.open(data.publicUrl, '_blank')
      }
    } catch {
      // fallback: nothing
    }
  }

  const thStyle = {
    padding: '9px 12px',
    fontSize: 10,
    fontWeight: 700,
    color: colors.lovelabMuted || '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    textAlign: 'left',
    borderBottom: `1px solid ${colors.lineGray}`,
    background: '#faf8fc',
  }
  const tdStyle = {
    padding: '10px 12px',
    fontSize: 13,
    color: '#444',
    borderBottom: `1px solid ${colors.lineGray}`,
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', fontFamily: fonts.body }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.inkPlum, margin: 0, letterSpacing: '-0.02em' }}>
            Internal Orders
          </h1>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Supplier &amp; manufacturing orders — not included in revenue or analytics.
            Use the <strong>Builder</strong> to create an order, then tick <em>"Save as Internal Order"</em> when saving.
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {error}
            <button onClick={load} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Retry</button>
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: 14 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by supplier or company..."
            style={{
              padding: '9px 12px', fontSize: 13, fontFamily: fonts.body,
              border: `1px solid ${colors.lineGray}`, borderRadius: 8,
              width: 280, outline: 'none',
            }}
          />
        </div>

        {/* Table */}
        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 12, color: '#777' }}>
            {loading ? 'Loading…' : `${filtered.length} internal order${filtered.length !== 1 ? 's' : ''}`}
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              {search ? 'No orders match your search.' : 'No internal orders yet. Create one in the Builder and tick "Save as Internal Order" when saving.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Supplier / Client', 'Company', 'Notes', 'Amount', 'File', ''].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.id}>
                      <td style={tdStyle}>
                        {o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: colors.inkPlum }}>{o.client_name || '—'}</td>
                      <td style={tdStyle}>{o.client_company || '—'}</td>
                      <td style={{ ...tdStyle, color: '#777', fontSize: 12 }}>{o.metadata?.notes || '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, textAlign: 'right' }}>
                        {o.total_amount != null ? fmt(o.total_amount) : '—'}
                      </td>
                      <td style={tdStyle}>
                          <button
                            onClick={() => openPdf(o.file_path, o.file_name)}
                            style={{
                              padding: '4px 10px', borderRadius: 6,
                              border: `1px solid ${colors.lineGray}`,
                              background: '#faf8fc', color: colors.inkPlum,
                              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                            }}
                            title={o.file_name}
                          >
                            View PDF
                          </button>
                        </td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => moveToB2B(o.id)}
                            style={{
                              padding: '4px 10px', borderRadius: 6,
                              border: '1px solid #e0e0e0',
                              background: '#fff', color: '#666',
                              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                              whiteSpace: 'nowrap',
                            }}
                            title="Move this order out of Internal into B2B"
                          >
                            Move to B2B
                          </button>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

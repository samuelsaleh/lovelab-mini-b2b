'use client'

import { useState, useEffect, useCallback } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { safeFetch } from '@/lib/api'
import ConsignmentRecipientForm from './ConsignmentRecipientForm'

// ─── Move-to-Consignment Modal ──────────────────────────────────────────────

function MoveToConsignmentModal({ order, onClose, onSuccess }) {
  const [consignmentData, setConsignmentData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleMove = async () => {
    setSaving(true)
    setError(null)
    try {
      // Save new contact if requested
      let resolvedContactId = consignmentData?.contact_id || null
      if (consignmentData?.saveAsContact && consignmentData?.recipient_name && !resolvedContactId) {
        try {
          const contactRes = await fetch('/api/consignment-contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              full_name: consignmentData.recipient_name,
              company: consignmentData.recipient_company || null,
              phone: consignmentData.recipient_phone || null,
              email: consignmentData.recipient_email || null,
              address: consignmentData.recipient_address || null,
            }),
          })
          const cData = await contactRes.json()
          if (cData.contact?.id) resolvedContactId = cData.contact.id
        } catch { /* non-blocking */ }
      }

      const consignmentMeta = {
        recipient_type: consignmentData?.recipient_type || 'contact',
        contact_id: resolvedContactId,
        recipient_name: consignmentData?.recipient_name || '',
        recipient_company: consignmentData?.recipient_company || '',
        recipient_phone: consignmentData?.recipient_phone || '',
        recipient_email: consignmentData?.recipient_email || '',
        recipient_address: consignmentData?.recipient_address || '',
        return_date: consignmentData?.return_date || null,
        returned_at: null,
      }

      const res = await fetch(`/api/documents/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_channel: 'consignment',
          metadata: { consignment: consignmentMeta },
          consignment_agent_id: consignmentData?.recipient_type === 'agent'
            ? (consignmentData?.agent_id || null)
            : null,
        }),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || d.error || 'Failed to move order')
      }

      onSuccess(order.id)
    } catch (err) {
      setError(err.message || 'Failed to move order to consignment')
    }
    setSaving(false)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.18)', fontFamily: fonts.body }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: colors.inkPlum }}>
          Move to Consignment
        </h2>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          Add consignment details for: <strong>{order.client_name || order.client_company || 'this order'}</strong>
        </div>

        <ConsignmentRecipientForm
          value={consignmentData}
          onChange={setConsignmentData}
          isOpen={true}
        />

        {error && (
          <div style={{ marginTop: 14, padding: '9px 12px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #e3e3e3', background: '#fff', color: '#666', fontSize: 13, cursor: 'pointer', fontFamily: fonts.body }}
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={saving}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: fonts.body, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Moving…' : 'Move to Consignment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export default function InternalOrdersPanel({ onReEdit, onDuplicate }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [movingToConsignment, setMovingToConsignment] = useState(null) // order being moved

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

  const handleConsignmentMoved = (id) => {
    setMovingToConsignment(null)
    setOrders(prev => prev.filter(o => o.id !== id))
  }

  const openPdf = async (docId) => {
    if (!docId) return
    try {
      const res = await fetch(`/api/documents/preview?id=${docId}`)
      const data = await res.json()
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    } catch { /* non-blocking */ }
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
      {movingToConsignment && (
        <MoveToConsignmentModal
          order={movingToConsignment}
          onClose={() => setMovingToConsignment(null)}
          onSuccess={handleConsignmentMoved}
        />
      )}
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
              padding: '11px 12px', minHeight: 44, fontSize: 13, fontFamily: fonts.body,
              border: `1px solid ${colors.lineGray}`, borderRadius: 8,
              width: '100%', maxWidth: 360, outline: 'none', boxSizing: 'border-box',
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
                    {['Date', 'Supplier / Client', 'Amount', 'File', 'Actions', ''].map(h => (
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
                      <td style={{ ...tdStyle, fontWeight: 600, color: colors.inkPlum }}>{o.client_name || o.client_company || '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, textAlign: 'right' }}>
                        {o.total_amount != null ? fmt(o.total_amount) : '—'}
                      </td>
                      <td style={tdStyle}>
                          <button
                            onClick={() => openPdf(o.id)}
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
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          {onReEdit && o.metadata?.formState && (
                            <button
                              onClick={() => onReEdit(o)}
                              style={{
                                padding: '4px 10px', borderRadius: 6, marginRight: 4,
                                border: `1px solid ${colors.inkPlum}`,
                                background: '#fdf7fa', color: colors.inkPlum,
                                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                              }}
                              title="Re-edit this internal order"
                            >
                              Re-edit
                            </button>
                          )}
                          {onDuplicate && o.metadata?.formState && (
                            <button
                              onClick={() => onDuplicate(o)}
                              style={{
                                padding: '4px 10px', borderRadius: 6,
                                border: '1px solid #e0e0e0',
                                background: '#fff', color: '#555',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                              }}
                              title="Use this order as a base for a new one"
                            >
                              Copy
                            </button>
                          )}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => setMovingToConsignment(o)}
                            style={{
                              padding: '4px 10px', borderRadius: 6, marginRight: 4,
                              border: `1px solid ${colors.inkPlum}40`,
                              background: '#fdf7fa', color: colors.inkPlum,
                              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                              whiteSpace: 'nowrap',
                            }}
                            title="Move this order to Consignment"
                          >
                            → Consignment
                          </button>
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
                            → B2B
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

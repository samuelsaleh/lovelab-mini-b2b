'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { safeFetch } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'documents'

// ─── Upload form for a new internal order ─────────────────────────────────

function UploadForm({ onSaved, onCancel }) {
  const [clientName, setClientName] = useState('')
  const [clientCompany, setClientCompany] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file || !clientName.trim()) {
      setError('Please fill in supplier/client name and select a PDF.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const ext = file.name.split('.').pop()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `internal/${user.id}/${Date.now()}_${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { contentType: file.type || 'application/pdf', upsert: false })
      if (uploadErr) throw new Error(uploadErr.message)

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName.trim(),
          client_company: clientCompany.trim() || null,
          document_type: 'order',
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          total_amount: totalAmount ? Number(totalAmount) : null,
          order_channel: 'internal',
          metadata: { notes: notes.trim() || null },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      onSaved(data.document)
    } catch (err) {
      setError(err.message || 'Upload failed')
    }
    setSaving(false)
  }

  const inputStyle = {
    width: '100%',
    padding: '9px 11px',
    fontSize: 13,
    fontFamily: fonts.body,
    border: `1px solid ${colors.lineGray}`,
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: '#faf8fc', border: `1px solid ${colors.inkPlum}30`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum, marginBottom: 14 }}>New Internal Order</div>

      {error && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 7, color: '#dc2626', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>Supplier / Client name *</label>
          <input value={clientName} onChange={e => setClientName(e.target.value)} required style={inputStyle} placeholder="e.g. Supplier India" />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>Company</label>
          <input value={clientCompany} onChange={e => setClientCompany(e.target.value)} style={inputStyle} placeholder="Company name" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>Order total (€)</label>
          <input type="number" min="0" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0.00" />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>PDF File *</label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            required
            onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ ...inputStyle, padding: '6px 10px', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>Notes</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} placeholder="Optional notes about this order" />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: saving ? '#c4b5c4' : colors.inkPlum,
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: fonts.body,
          }}
        >
          {saving ? 'Saving…' : 'Save Internal Order'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: '9px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
            background: '#fff', color: '#555', fontSize: 13, cursor: 'pointer', fontFamily: fonts.body,
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Main Panel ────────────────────────────────────────────────────────────

export default function InternalOrdersPanel() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
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

  const handleSaved = (doc) => {
    setOrders(prev => [doc, ...prev])
    setShowUpload(false)
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: colors.inkPlum, margin: 0, letterSpacing: '-0.02em' }}>
              Internal Orders
            </h1>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              Supplier &amp; manufacturing orders — not included in revenue or analytics
            </div>
          </div>
          <button
            onClick={() => setShowUpload(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', borderRadius: 9, border: 'none',
              background: colors.inkPlum, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Internal Order
          </button>
        </div>

        {/* Upload form */}
        {showUpload && (
          <UploadForm onSaved={handleSaved} onCancel={() => setShowUpload(false)} />
        )}

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
              {search ? 'No orders match your search.' : 'No internal orders yet. Click "Add Internal Order" to upload one.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Supplier / Client', 'Company', 'Notes', 'Amount', 'File'].map(h => (
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

'use client'

import { useState, useEffect } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'

export default function PromoteSampleModal({ doc, isOpen, onClose, onSuccess }) {
  const mobile = useIsMobile()
  const [events, setEvents] = useState([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    setSelectedEventId('')
    setError(null)
    setLoading(true)
    fetch('/api/events')
      .then((res) => res.json())
      .then((data) => setEvents(data.events || []))
      .catch(() => setError('Failed to load event folders'))
      .finally(() => setLoading(false))
  }, [isOpen])

  if (!isOpen || !doc) return null

  const handleConfirm = async () => {
    if (!selectedEventId) {
      setError('Please select an event folder')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_channel: 'b2b',
          event_id: selectedEventId,
          metadata: { is_sample: false },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        throw new Error(data.error || `Failed (HTTP ${res.status})`)
      }
      onSuccess?.(data.document)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to confirm order')
    }
    setSaving(false)
  }

  const label = doc.client_company || doc.client_name || 'this sample'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, padding: mobile ? 20 : 24,
          width: '100%', maxWidth: 420, fontFamily: fonts.body,
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: colors.inkPlum }}>
          Confirm as B2B Order
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666', lineHeight: 1.5 }}>
          &ldquo;{label}&rdquo; will become a confirmed B2B order, counted in revenue, and eligible for production import. Choose which event folder to file it under.
        </p>

        {loading ? (
          <div style={{ fontSize: 13, color: '#999', padding: '12px 0' }}>Loading folders…</div>
        ) : (
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${colors.lineGray}`, fontSize: 13,
              fontFamily: fonts.body, marginBottom: 12,
            }}
          >
            <option value="">Select event folder…</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>{evt.name}</option>
            ))}
          </select>
        )}

        {error && (
          <div style={{
            fontSize: 12, color: '#dc2626', background: '#fef2f2',
            border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px',
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '10px 18px', borderRadius: 8,
              border: `1px solid ${colors.lineGray}`, background: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || loading || !selectedEventId}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: colors.inkPlum, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
              fontFamily: fonts.body, opacity: saving || !selectedEventId ? 0.6 : 1,
            }}
          >
            {saving ? 'Confirming…' : 'Confirm as B2B'}
          </button>
        </div>
      </div>
    </div>
  )
}

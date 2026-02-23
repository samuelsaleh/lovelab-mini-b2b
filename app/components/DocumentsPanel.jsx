'use client'

import { useState, useEffect } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { useI18n } from '@/lib/i18n'
import { fmt } from '@/lib/utils'
import ConfirmDialog from './ConfirmDialog'

// ─── Vitrine helpers ───────────────────────────────────────────────────────

const VITRINE_REGEX = /(\d+)\s*vitrines?|vitrines?\s*[x×]?\s*(\d+)/i

function parseVitrineFromRemarks(remarks) {
  if (!remarks) return null
  const m = remarks.match(VITRINE_REGEX)
  if (!m) return remarks.toLowerCase().includes('vitrine') ? 1 : null
  return parseInt(m[1] || m[2], 10)
}

function resolveVitrineQty(doc) {
  const fs = doc?.metadata?.formState
  if (!fs) return null
  const { hasVitrine, vitrineQty, remarks } = fs
  const toggleQty = hasVitrine ? (vitrineQty || 1) : null
  const remarksQty = parseVitrineFromRemarks(remarks)
  if (toggleQty !== null && remarksQty !== null) return toggleQty
  if (toggleQty !== null) return toggleQty
  if (remarksQty !== null) return remarksQty
  return null
}

function VitrineSummaryCard({ docs, eventName }) {
  const [open, setOpen] = useState(true)
  const rows = docs
    .map(doc => ({ company: doc.client_company || doc.client_name || 'Unknown', qty: resolveVitrineQty(doc), total: doc.total_amount || 0 }))
    .filter(r => r.qty !== null)
  if (rows.length === 0) return null
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalAmount = rows.reduce((s, r) => s + r.total, 0)
  const thS = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', background: '#faf8fc', borderBottom: `1px solid ${colors.lineGray}` }
  const tdS = { padding: '10px 12px', fontSize: 13, color: colors.charcoal, borderBottom: `1px solid ${colors.lineGray}` }
  const ftS = { padding: '10px 12px', fontSize: 13, fontWeight: 700, color: colors.inkPlum }
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', userSelect: 'none', borderBottom: open ? `1px solid ${colors.lineGray}` : 'none' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>Vitrine Summary</span>
          {eventName && <span style={{ fontSize: 12, color: colors.lovelabMuted }}>— {eventName}</span>}
          <span style={{ fontSize: 11, fontWeight: 700, background: colors.ice, color: colors.inkPlum, borderRadius: 20, padding: '2px 8px' }}>{totalQty} total</span>
        </div>
        <span style={{ fontSize: 11, color: colors.lovelabMuted }}>{open ? '▲ collapse' : '▼ expand'}</span>
      </div>
      {open && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={thS}>Company</th>
            <th style={{ ...thS, textAlign: 'center' }}>Vitrines</th>
            <th style={{ ...thS, textAlign: 'right' }}>Order Total</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={tdS}>{r.company}</td>
                <td style={{ ...tdS, textAlign: 'center', fontWeight: 600, color: colors.inkPlum }}>{r.qty}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>{r.total ? fmt(r.total) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#faf8fc' }}>
              <td style={ftS}>TOTAL</td>
              <td style={{ ...ftS, textAlign: 'center' }}>{totalQty}</td>
              <td style={{ ...ftS, textAlign: 'right' }}>{totalAmount ? fmt(totalAmount) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

export default function DocumentsPanel({ onReEdit }) {
  const mobile = useIsMobile()
  const { t } = useI18n()
  const [showSidebar, setShowSidebar] = useState(false)
  const [events, setEvents] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [newEventName, setNewEventName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null) // doc to delete
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(null) // event to delete
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [eventsRes, docsRes] = await Promise.all([
        fetch('/api/events'),
        fetch('/api/documents'),
      ])
      const eventsData = await eventsRes.json()
      const docsData = await docsRes.json()
      if (eventsData.events) setEvents(eventsData.events)
      if (docsData.documents) setDocuments(docsData.documents)
    } catch (err) {
      setErrorMsg('Failed to load documents')
    }
    setLoading(false)
  }

  const createEvent = async () => {
    if (!newEventName.trim()) return
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEventName.trim() }),
      })
      const data = await res.json()
      if (data.event) {
        setEvents(prev => [data.event, ...prev])
        setNewEventName('')
        setShowNewEvent(false)
      }
    } catch (err) {
      setErrorMsg('Failed to create event')
    }
  }

  const downloadDocument = async (doc) => {
    try {
      const res = await fetch(`/api/documents/preview?id=${encodeURIComponent(doc.id)}`)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to get download URL')
      const pdfRes = await fetch(data.signedUrl)
      const blob = await pdfRes.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = doc.file_name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setErrorMsg(t('docs.downloadFailed') + ': ' + err.message)
    }
  }

  const previewDocument = async (doc) => {
    try {
      const res = await fetch(`/api/documents/preview?id=${encodeURIComponent(doc.id)}`)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to get preview URL')
      window.open(data.signedUrl, '_blank')
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  const requestDelete = (doc) => {
    setConfirmDelete(doc)
  }

  const executeDelete = async () => {
    if (!confirmDelete) return
    const doc = confirmDelete
    setConfirmDelete(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete')
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
    } catch (err) {
      setErrorMsg(t('docs.deleteFailed') + ': ' + err.message)
    }
  }

  const executeDeleteEvent = async () => {
    if (!confirmDeleteEvent) return
    const event = confirmDeleteEvent
    setConfirmDeleteEvent(null)
    try {
      const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete')
      setEvents(prev => prev.filter(e => e.id !== event.id))
      // Move documents from this event to "No event"
      setDocuments(prev => prev.map(d => d.event_id === event.id ? { ...d, event_id: null } : d))
      if (selectedEventId === event.id) setSelectedEventId(null)
    } catch (err) {
      setErrorMsg('Failed to delete event: ' + err.message)
    }
  }

  // Filter
  const filteredDocs = documents.filter(doc => {
    const matchesEvent = selectedEventId === null
      ? true
      : selectedEventId === 'none'
        ? !doc.event_id
        : doc.event_id === selectedEventId
    const matchesSearch = !search ||
      doc.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      doc.client_company?.toLowerCase().includes(search.toLowerCase()) ||
      doc.file_name?.toLowerCase().includes(search.toLowerCase())
    return matchesEvent && matchesSearch
  })

  const getEventDocCount = (eventId) => documents.filter(d => d.event_id === eventId).length
  const noEventDocs = documents.filter(d => !d.event_id).length

  // Analytics calculations
  const getEventTotal = (eventId) => {
    return documents
      .filter(d => d.event_id === eventId)
      .reduce((sum, d) => sum + (d.total_amount || 0), 0)
  }

  const getSalesByDate = (eventId) => {
    const eventDocs = eventId 
      ? documents.filter(d => d.event_id === eventId)
      : filteredDocs
    const byDate = {}
    eventDocs.forEach(doc => {
      const dateKey = new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      if (!byDate[dateKey]) byDate[dateKey] = { count: 0, total: 0 }
      byDate[dateKey].count++
      byDate[dateKey].total += doc.total_amount || 0
    })
    return Object.entries(byDate).sort((a, b) => new Date(b[0]) - new Date(a[0]))
  }

  const currentEventName = selectedEventId 
    ? events.find(e => e.id === selectedEventId)?.name 
    : selectedEventId === 'none' 
      ? 'No Event' 
      : 'All Documents'
  const currentEventTotal = selectedEventId && selectedEventId !== 'none'
    ? getEventTotal(selectedEventId)
    : filteredDocs.reduce((sum, d) => sum + (d.total_amount || 0), 0)
  const currentSalesByDate = getSalesByDate(selectedEventId && selectedEventId !== 'none' ? selectedEventId : null)

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {/* Mobile Filter Toggle */}
      {mobile && (
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          style={{
            position: 'fixed', bottom: 16, left: 16, zIndex: 150,
            padding: '12px 20px', borderRadius: 25, border: 'none',
            background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(93,58,94,0.3)',
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
          }}
        >
          <span>☰ Events</span>
          <span style={{ fontSize: 10, opacity: 0.8 }}>{events.length}</span>
        </button>
      )}
      
      {/* Mobile Sidebar Overlay */}
      {mobile && showSidebar && (
        <div 
          onClick={() => setShowSidebar(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200,
          }}
        />
      )}
      
      {/* Sidebar - Events */}
      <div style={{
        width: mobile ? '85%' : 240,
        maxWidth: mobile ? 300 : 240,
        flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid #eaeaea',
        padding: 16,
        overflowY: 'auto',
        // Mobile slide-in styles
        ...(mobile ? {
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 210,
          display: showSidebar ? 'block' : 'none',
          boxShadow: '4px 0 20px rgba(0,0,0,0.1)',
        } : {}),
      }}>
        {/* Mobile close button */}
        {mobile && (
          <button
            onClick={() => setShowSidebar(false)}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 1,
              width: 32, height: 32, borderRadius: '50%', border: 'none',
              background: '#f0f0f0', color: '#666', fontSize: 16,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#333', margin: 0 }}>Events / Fairs</h2>
          <button
            onClick={() => setShowNewEvent(true)}
            style={{ background: 'none', border: 'none', color: colors.inkPlum, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}
            title="Create new event"
          >+</button>
        </div>

        {showNewEvent && (
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="Event name..."
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                border: '1px solid #e3e3e3', fontSize: 12, fontFamily: fonts.body,
                marginBottom: 6, outline: 'none', boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createEvent()
                if (e.key === 'Escape') { setShowNewEvent(false); setNewEventName('') }
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={createEvent}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 6, border: 'none',
                  background: colors.inkPlum, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >Create</button>
              <button
                onClick={() => { setShowNewEvent(false); setNewEventName('') }}
                style={{
                  padding: '6px 10px', borderRadius: 6, border: '1px solid #e3e3e3',
                  background: '#fff', color: '#666', fontSize: 11, cursor: 'pointer',
                }}
              >Cancel</button>
            </div>
          </div>
        )}

        {/* All documents */}
        <button
          onClick={() => setSelectedEventId(null)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
            background: selectedEventId === null ? '#f3f0f5' : 'transparent',
            color: selectedEventId === null ? colors.inkPlum : '#555',
            fontSize: 13, fontWeight: selectedEventId === null ? 600 : 400,
            cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
            marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <span>All Documents</span>
          <span style={{ fontSize: 11, color: '#999' }}>{documents.length}</span>
        </button>

        {events.map(event => (
          <div
            key={event.id}
            style={{
              display: 'flex', alignItems: 'center', marginBottom: 4, borderRadius: 8,
              background: selectedEventId === event.id ? '#f3f0f5' : 'transparent',
            }}
          >
            <button
              onClick={() => setSelectedEventId(event.id)}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none',
                background: 'transparent',
                color: selectedEventId === event.id ? colors.inkPlum : '#555',
                fontSize: 13, fontWeight: selectedEventId === event.id ? 600 : 400,
                cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                minWidth: 0,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</span>
              <span style={{ fontSize: 11, color: '#999', flexShrink: 0, marginLeft: 8 }}>{getEventDocCount(event.id)}</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteEvent(event) }}
              title="Delete event"
              style={{
                width: 24, height: 24, borderRadius: 6, border: 'none',
                background: 'transparent', color: '#ccc', fontSize: 13,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginRight: 4, transition: 'color .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc' }}
            >×</button>
          </div>
        ))}

        {noEventDocs > 0 && (
          <button
            onClick={() => setSelectedEventId('none')}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
              background: selectedEventId === 'none' ? '#f3f0f5' : 'transparent',
              color: selectedEventId === 'none' ? colors.inkPlum : '#999',
              fontSize: 12, fontWeight: selectedEventId === 'none' ? 600 : 400,
              cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
              marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontStyle: 'italic',
            }}
          >
            <span>No event</span>
            <span style={{ fontSize: 11 }}>{noEventDocs}</span>
          </button>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: mobile ? 12 : 20 }}>
        {/* Search */}
        <div style={{ marginBottom: 16, maxWidth: mobile ? '100%' : 600 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name or company..."
            style={{
              width: '100%', padding: mobile ? '12px 16px' : '10px 16px', borderRadius: 10,
              border: '1px solid #e3e3e3', fontSize: mobile ? 16 : 13, fontFamily: fonts.body,
              background: '#fff', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Analytics Summary */}
        {!loading && filteredDocs.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #f8f5fa 0%, #f3f0f5 100%)',
            borderRadius: 12,
            border: `1px solid ${colors.lineGray}`,
            padding: mobile ? 14 : 16,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: colors.lovelabMuted, fontWeight: 500, marginBottom: 2 }}>
                  {currentEventName}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum }}>
                  {fmt(currentEventTotal)}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {currentSalesByDate.length > 0 && (
              <div style={{
                borderTop: `1px solid ${colors.lineGray}`,
                paddingTop: 10,
                marginTop: 4,
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {t('docs.salesByDate') || 'Sales by Date'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {currentSalesByDate.slice(0, 5).map(([date, data]) => (
                    <div key={date} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', background: '#fff', borderRadius: 6,
                      fontSize: 12,
                    }}>
                      <span style={{ color: '#555' }}>{date}</span>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ color: '#999', fontSize: 11 }}>{data.count} order{data.count !== 1 ? 's' : ''}</span>
                        <span style={{ fontWeight: 600, color: colors.inkPlum }}>{fmt(data.total)}</span>
                      </div>
                    </div>
                  ))}
                  {currentSalesByDate.length > 5 && (
                    <div style={{ fontSize: 10, color: '#999', textAlign: 'center', paddingTop: 4 }}>
                      +{currentSalesByDate.length - 5} more days
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vitrine summary — shown when a specific event is selected */}
        {selectedEventId && selectedEventId !== 'none' && !loading && (() => {
          const eventDocs = documents.filter(d => d.event_id === selectedEventId)
          const eventName = events.find(e => e.id === selectedEventId)?.name
          return <VitrineSummaryCard docs={eventDocs} eventName={eventName} />
        })()}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Loading...</div>
        ) : filteredDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#555', marginBottom: 4 }}>No documents yet</div>
            <div style={{ fontSize: 13, color: '#999' }}>{search ? 'No documents match your search' : 'Save an order to see it here'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredDocs.map(doc => (
              <div
                key={doc.id}
                style={{
                  background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8',
                  padding: mobile ? '12px 12px' : '12px 16px',
                  display: 'flex', flexDirection: mobile ? 'column' : 'row',
                  alignItems: mobile ? 'stretch' : 'center', gap: mobile ? 10 : 16,
                }}
              >
                {/* Top row: icon + info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: doc.document_type === 'order' ? '#f0f5ff' : '#f5f5f5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0, color: colors.inkPlum, fontWeight: 700,
                }}>
                  {doc.document_type === 'order' ? 'PO' : 'Q'}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.client_company || doc.client_name || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '1px 6px', borderRadius: 4,
                      background: doc.document_type === 'order' ? '#e8f4ea' : '#e8f0ff',
                      color: doc.document_type === 'order' ? '#2d6a4f' : '#1e40af',
                      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                    }}>{doc.document_type}</span>
                    {doc.total_amount && <span style={{ fontWeight: 600, color: colors.inkPlum }}>{fmt(doc.total_amount)}</span>}
                    <span>{new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {doc.events?.name && <span style={{ color: colors.luxeGold }}>@ {doc.events.name}</span>}
                  </div>
                </div>

                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                  {onReEdit && doc.metadata?.formState && (
                    <button
                      onClick={() => onReEdit(doc)}
                      title={t('docs.reEdit')}
                      style={{
                        padding: mobile ? '10px 14px' : '7px 12px', borderRadius: 6,
                        border: `1px solid ${colors.inkPlum}`,
                        background: '#fdf7fa', color: colors.inkPlum, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: fonts.body,
                        minHeight: mobile ? 44 : 'auto',
                      }}
                    >{t('docs.reEdit')}</button>
                  )}
                  <button
                    onClick={() => previewDocument(doc)}
                    title="Preview"
                    style={{
                      padding: mobile ? '10px 14px' : '7px 12px', borderRadius: 6, border: '1px solid #e3e3e3',
                      background: '#fff', color: '#555', fontSize: 12, cursor: 'pointer', fontFamily: fonts.body,
                      minHeight: mobile ? 44 : 'auto',
                    }}
                  >View</button>
                  <button
                    onClick={() => downloadDocument(doc)}
                    title="Download"
                    style={{
                      padding: mobile ? '10px 14px' : '7px 12px', borderRadius: 6, border: 'none',
                      background: colors.inkPlum, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                      minHeight: mobile ? 44 : 'auto',
                    }}
                  >Download</button>
                  <button
                    onClick={() => requestDelete(doc)}
                    title={t('docs.delete')}
                    style={{
                      padding: mobile ? '10px 12px' : '7px 10px', borderRadius: 6, border: '1px solid #fecaca',
                      background: '#fef2f2', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontFamily: fonts.body,
                      minHeight: mobile ? 44 : 'auto',
                    }}
                  >Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={t('docs.delete')}
        message={confirmDelete ? t('docs.confirmDelete', { name: confirmDelete.file_name }) : ''}
        confirmLabel={t('docs.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={executeDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Confirm Delete Event Dialog */}
      <ConfirmDialog
        isOpen={!!confirmDeleteEvent}
        title="Delete Event"
        message={confirmDeleteEvent ? `Delete "${confirmDeleteEvent.name}"? Documents in this folder will be moved to "No event".` : ''}
        confirmLabel={t('docs.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={executeDeleteEvent}
        onCancel={() => setConfirmDeleteEvent(null)}
      />

      {/* Error Dialog */}
      <ConfirmDialog
        isOpen={!!errorMsg}
        title={t('common.error')}
        message={errorMsg || ''}
        confirmLabel="OK"
        cancelLabel=""
        variant="info"
        onConfirm={() => setErrorMsg(null)}
        onCancel={() => setErrorMsg(null)}
      />
    </div>
  )
}

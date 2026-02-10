'use client'

import { useState, useEffect } from 'react'
import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'

export default function DocumentsPanel() {
  const [events, setEvents] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [newEventName, setNewEventName] = useState('')

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
      console.error('Error fetching data:', err)
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
      console.error('Error creating event:', err)
    }
  }

  const downloadDocument = async (doc) => {
    try {
      const res = await fetch(`/api/documents/preview?path=${encodeURIComponent(doc.file_path)}`)
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
      console.error('Download error:', err)
      alert('Failed to download document: ' + err.message)
    }
  }

  const previewDocument = async (doc) => {
    try {
      const res = await fetch(`/api/documents/preview?path=${encodeURIComponent(doc.file_path)}`)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to get preview URL')
      window.open(data.signedUrl, '_blank')
    } catch (err) {
      console.error('Preview error:', err)
      alert('Failed to preview document: ' + err.message)
    }
  }

  const deleteDocument = async (doc) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete')
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
    } catch (err) {
      console.error('Delete error:', err)
      alert('Failed to delete document: ' + err.message)
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

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Sidebar - Events */}
      <div style={{
        width: 240, flexShrink: 0, background: '#fff',
        borderRight: '1px solid #eaeaea', padding: 16,
        overflowY: 'auto',
      }}>
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
          <button
            key={event.id}
            onClick={() => setSelectedEventId(event.id)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
              background: selectedEventId === event.id ? '#f3f0f5' : 'transparent',
              color: selectedEventId === event.id ? colors.inkPlum : '#555',
              fontSize: 13, fontWeight: selectedEventId === event.id ? 600 : 400,
              cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
              marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</span>
            <span style={{ fontSize: 11, color: '#999', flexShrink: 0, marginLeft: 8 }}>{getEventDocCount(event.id)}</span>
          </button>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {/* Search */}
        <div style={{ marginBottom: 16, maxWidth: 600 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name or company..."
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 10,
              border: '1px solid #e3e3e3', fontSize: 13, fontFamily: fonts.body,
              background: '#fff', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

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
                  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16,
                }}
              >
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

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => previewDocument(doc)}
                    title="Preview"
                    style={{
                      padding: '7px 12px', borderRadius: 6, border: '1px solid #e3e3e3',
                      background: '#fff', color: '#555', fontSize: 12, cursor: 'pointer', fontFamily: fonts.body,
                    }}
                  >View</button>
                  <button
                    onClick={() => downloadDocument(doc)}
                    title="Download"
                    style={{
                      padding: '7px 12px', borderRadius: 6, border: 'none',
                      background: colors.inkPlum, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                    }}
                  >Download</button>
                  <button
                    onClick={() => deleteDocument(doc)}
                    title="Delete"
                    style={{
                      padding: '7px 10px', borderRadius: 6, border: '1px solid #fecaca',
                      background: '#fef2f2', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontFamily: fonts.body,
                    }}
                  >Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

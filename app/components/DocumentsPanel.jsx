'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { useI18n } from '@/lib/i18n'
import { fmt } from '@/lib/utils'
import ConfirmDialog from './ConfirmDialog'
import { useAuth } from './AuthProvider'

export default function DocumentsPanel({ onReEdit, refreshKey }) {
  const router = useRouter()
  const mobile = useIsMobile()
  const { t } = useI18n()
  const { user, profile, profileMissing, profileError } = useAuth()
  const [showSidebar, setShowSidebar] = useState(false)
  const [events, setEvents] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [newEventName, setNewEventName] = useState('')
  const [newEventType, setNewEventType] = useState('fair')
  const [confirmDelete, setConfirmDelete] = useState(null) // doc to delete
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(null) // event to delete
  const [errorMsg, setErrorMsg] = useState(null)
  const [showTrash, setShowTrash] = useState(false)
  const [trashedDocs, setTrashedDocs] = useState([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(null)
  const [loadIssue, setLoadIssue] = useState(null) // null | unauthorized | api_error
  const [renamingEventId, setRenamingEventId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [refreshKey])

  const fetchData = async () => {
    setLoading(true)
    setLoadIssue(null)
    try {
      const [eventsRes, docsRes] = await Promise.all([
        fetch('/api/events'),
        fetch('/api/documents'),
      ])

      if (!eventsRes.ok || !docsRes.ok) {
        if (eventsRes.status === 401 || docsRes.status === 401) {
          setLoadIssue('unauthorized')
          setErrorMsg('Session expired or unauthorized. Please sign out and sign in again.')
          setEvents([])
          setDocuments([])
          return
        }
        setLoadIssue('api_error')
        setErrorMsg('Failed to load documents (API error).')
        return
      }

      const eventsData = await eventsRes.json().catch(() => ({}))
      const docsData = await docsRes.json().catch(() => ({}))

      if (eventsData.error || docsData.error) {
        if (String(eventsData.error || '').toLowerCase().includes('unauthorized') || String(docsData.error || '').toLowerCase().includes('unauthorized')) {
          setLoadIssue('unauthorized')
          setErrorMsg('Session expired or unauthorized. Please sign out and sign in again.')
          setEvents([])
          setDocuments([])
          return
        }
        setLoadIssue('api_error')
        setErrorMsg(eventsData.error || docsData.error || 'Failed to load documents')
        return
      }

      if (eventsData.events) setEvents(eventsData.events)
      if (docsData.documents) setDocuments(docsData.documents)
    } catch (err) {
      setLoadIssue('api_error')
      setErrorMsg('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const startRename = (event) => {
    setRenamingEventId(event.id)
    setRenameValue(event.name)
  }

  const commitRename = async (eventId) => {
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenamingEventId(null); return }
    setRenameLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, name: trimmed } : e))
      }
    } catch (e) {}
    setRenameLoading(false)
    setRenamingEventId(null)
  }

  const TRASH_DAYS = 7

  const fetchTrash = async () => {
    setTrashLoading(true)
    try {
      const res = await fetch('/api/documents?trashed=true')
      const data = await res.json()
      if (data.documents) {
        const now = Date.now()
        const expired = data.documents.filter(d => {
          const age = (now - new Date(d.deleted_at).getTime()) / (1000 * 60 * 60 * 24)
          return age >= TRASH_DAYS
        })
        // Auto-purge expired items silently
        await Promise.all(expired.map(d =>
          fetch(`/api/documents/${d.id}/purge`, { method: 'DELETE' }).catch(() => {})
        ))
        setTrashedDocs(data.documents.filter(d => {
          const age = (now - new Date(d.deleted_at).getTime()) / (1000 * 60 * 60 * 24)
          return age < TRASH_DAYS
        }))
      }
    } catch (err) {
      setErrorMsg('Failed to load trash')
    }
    setTrashLoading(false)
  }

  const openTrash = () => {
    setShowTrash(true)
    fetchTrash()
  }

  const closeTrash = () => {
    setShowTrash(false)
    setTrashedDocs([])
  }

  const restoreDoc = async (doc) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/restore`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to restore')
      setTrashedDocs(prev => prev.filter(d => d.id !== doc.id))
      fetchData()
    } catch (err) {
      setErrorMsg('Failed to restore: ' + err.message)
    }
  }

  const purgeDoc = async (doc) => {
    setConfirmPurge(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}/purge`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete permanently')
      setTrashedDocs(prev => prev.filter(d => d.id !== doc.id))
    } catch (err) {
      setErrorMsg('Failed to permanently delete: ' + err.message)
    }
  }

  const getDaysInfo = (deletedAt) => {
    const age = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24)
    const daysAgo = Math.floor(age)
    const daysLeft = TRASH_DAYS - Math.floor(age)
    return { daysAgo, daysLeft }
  }

  const createEvent = async () => {
    if (!newEventName.trim()) return
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEventName.trim(), type: newEventType }),
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
  const selectedEventName = selectedEventId && selectedEventId !== 'none'
    ? events.find(e => e.id === selectedEventId)?.name
    : null

  const getEmptyState = () => {
    if (loadIssue === 'unauthorized') {
      return {
        title: 'Session expired or unauthorized',
        subtitle: 'Sign out and sign in again to refresh your access token.',
      }
    }

    if (loadIssue === 'api_error') {
      return {
        title: 'Could not load documents',
        subtitle: 'A temporary API issue occurred. Refresh the page and try again.',
      }
    }

    if (search) {
      return {
        title: 'No documents match your search',
        subtitle: 'Try a different client name, company, or file name.',
      }
    }

    if (selectedEventName) {
      return {
        title: `No documents in ${selectedEventName}`,
        subtitle: 'Switch to All Documents to see files from other events.',
      }
    }

    if (profileMissing) {
      return {
        title: 'Account access not configured',
        subtitle: `Signed in as ${user?.email || 'this account'} but no profile is configured yet. Ask an admin to set up your role.`,
      }
    }

    if (profileError === 'failed_to_load_profile') {
      return {
        title: 'Profile loading issue',
        subtitle: 'Your session is active, but role data did not load. Sign out and sign in again.',
      }
    }

    if (events.length === 0 && documents.length === 0 && profile?.role !== 'admin') {
      return {
        title: 'You don\'t have any folders yet',
        subtitle: 'Tap the + next to "Events / Fairs" to create your first folder, then save documents into it.',
      }
    }

    return {
      title: 'No documents yet',
      subtitle: 'Save an order to see it here.',
    }
  }

  const emptyState = getEmptyState()

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
              placeholder="Folder name..."
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
            <select
              value={newEventType}
              onChange={(e) => setNewEventType(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 6,
                border: '1px solid #e3e3e3', fontSize: 11, fontFamily: fonts.body,
                marginBottom: 6, background: '#fff', boxSizing: 'border-box',
              }}
            >
              <option value="fair">Fair</option>
              <option value="agent">Agent</option>
              <option value="partner">Partner</option>
              <option value="other">Other</option>
            </select>
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

        {[
          { key: 'fair', label: 'Fairs' },
          { key: 'agent', label: 'Agents' },
          { key: 'partner', label: 'Partners' },
          { key: 'other', label: 'Other' },
        ].map(group => {
          const groupEvents = events.filter(e => (e.type || 'other') === group.key);
          if (groupEvents.length === 0) return null;
          return (
            <div key={group.key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 12px 2px', userSelect: 'none' }}>
                {group.label}
              </div>
              {groupEvents.map(event => (
                <div
                  key={event.id}
                  style={{
                    display: 'flex', alignItems: 'center', marginBottom: 2, borderRadius: 8,
                    background: selectedEventId === event.id ? '#f3f0f5' : 'transparent',
                  }}
                >
                  {renamingEventId === event.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(event.id); if (e.key === 'Escape') setRenamingEventId(null); }}
                      onBlur={() => commitRename(event.id)}
                      disabled={renameLoading}
                      style={{ flex: 1, margin: '4px 6px', padding: '5px 8px', fontSize: 13, border: '1.5px solid #5D3A5E', borderRadius: 6, outline: 'none', fontFamily: fonts.body }}
                    />
                  ) : (
                    <button
                      onClick={() => setSelectedEventId(event.id)}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
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
                  )}
                  {renamingEventId !== event.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(event) }}
                      title="Rename"
                      style={{
                        width: 22, height: 22, borderRadius: 5, border: 'none',
                        background: 'transparent', color: '#ccc', fontSize: 11,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'color .15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = colors.inkPlum }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc' }}
                    >✎</button>
                  )}
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
            </div>
          );
        })}

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
        {/* Search + Analytics link + Trash */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', maxWidth: mobile ? '100%' : 700 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name or company..."
            style={{
              flex: 1, padding: mobile ? '12px 16px' : '10px 16px', borderRadius: 10,
              border: '1px solid #e3e3e3', fontSize: mobile ? 16 : 13, fontFamily: fonts.body,
              background: '#fff', outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={openTrash}
            title="Trash — deleted documents (7-day recovery)"
            style={{
              padding: mobile ? '12px 14px' : '10px 14px', borderRadius: 10,
              border: '1px solid #e3e3e3', background: '#fff', color: '#888',
              fontSize: mobile ? 13 : 12, cursor: 'pointer', fontFamily: fonts.body,
              whiteSpace: 'nowrap', flexShrink: 0, minHeight: mobile ? 44 : 'auto',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span style={{ fontSize: 14 }}>🗑</span>
            {!mobile && <span>Trash</span>}
          </button>
          <button
            onClick={() => router.push('/analytics')}
            style={{
              padding: mobile ? '12px 16px' : '10px 18px', borderRadius: 10, border: 'none',
              background: colors.inkPlum, color: '#fff', fontSize: mobile ? 13 : 12,
              fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body,
              whiteSpace: 'nowrap', flexShrink: 0, minHeight: mobile ? 44 : 'auto',
            }}
          >Analytics</button>
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

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Loading...</div>
        ) : filteredDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#555', marginBottom: 4 }}>{emptyState.title}</div>
            <div style={{ fontSize: 13, color: '#999' }}>{emptyState.subtitle}</div>
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

      {/* Trash Panel Modal */}
      {showTrash && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }} onClick={closeTrash}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640,
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              padding: '18px 20px 14px', borderBottom: '1px solid #eee',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#222' }}>Trash</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>Deleted documents are kept for 7 days before being permanently removed.</div>
              </div>
              <button
                onClick={closeTrash}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', padding: '12px 20px 20px', flex: 1 }}>
              {trashLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Loading...</div>
              ) : trashedDocs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🗑</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>Trash is empty</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Deleted documents will appear here for 7 days.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {trashedDocs.map(doc => {
                    const { daysAgo, daysLeft } = getDaysInfo(doc.deleted_at)
                    const urgent = daysLeft <= 1
                    return (
                      <div key={doc.id} style={{
                        background: '#fafafa', borderRadius: 10,
                        border: `1px solid ${urgent ? '#fecaca' : '#ede8f0'}`,
                        padding: '12px 14px',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                        {/* Icon */}
                        <div style={{
                          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                          background: doc.document_type === 'order' ? '#f0f5ff' : '#f5f5f5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: colors.inkPlum,
                        }}>
                          {doc.document_type === 'order' ? 'PO' : 'Q'}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {doc.client_company || doc.client_name || 'Unknown'}
                          </div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            {doc.file_name} · {doc.total_amount ? fmt(doc.total_amount) : ''}
                          </div>
                          <div style={{ fontSize: 11, marginTop: 3, color: urgent ? '#dc2626' : '#888' }}>
                            Deleted {daysAgo === 0 ? 'today' : `${daysAgo}d ago`} — {daysLeft} day{daysLeft !== 1 ? 's' : ''} left to recover
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => restoreDoc(doc)}
                            style={{
                              padding: '6px 12px', borderRadius: 7,
                              border: `1px solid ${colors.inkPlum}`,
                              background: '#fdf7fa', color: colors.inkPlum,
                              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                            }}
                          >Restore</button>
                          <button
                            onClick={() => setConfirmPurge(doc)}
                            style={{
                              padding: '6px 10px', borderRadius: 7,
                              border: '1px solid #fecaca', background: '#fef2f2',
                              color: '#dc2626', fontSize: 12, cursor: 'pointer', fontFamily: fonts.body,
                            }}
                          >Delete forever</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Purge Dialog */}
      <ConfirmDialog
        isOpen={!!confirmPurge}
        title="Delete forever"
        message={confirmPurge ? `Permanently delete "${confirmPurge.file_name}"? This cannot be undone.` : ''}
        confirmLabel="Delete forever"
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={() => purgeDoc(confirmPurge)}
        onCancel={() => setConfirmPurge(null)}
      />

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

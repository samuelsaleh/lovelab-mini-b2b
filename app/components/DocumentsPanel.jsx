'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { useI18n } from '@/lib/i18n'
import { fmt } from '@/lib/utils'
import { safeFetch } from '@/lib/api'
import ConfirmDialog from './ConfirmDialog'
import { useAuth } from './AuthProvider'
import DocumentsSidebar from './DocumentsSidebar'
import DocumentRow from './DocumentRow'
import DocumentsAnalytics from './DocumentsAnalytics'

export default function DocumentsPanel({ onReEdit, refreshKey }) {
  const router = useRouter()
  const mobile = useIsMobile()
  const { t } = useI18n()
  const { user, profile, profileMissing, profileError } = useAuth()

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showSidebar, setShowSidebar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)
  const [loadIssue, setLoadIssue] = useState(null)

  // ── Data state ────────────────────────────────────────────────────────────
  const [events, setEvents] = useState([])
  const [documents, setDocuments] = useState([])
  const [orgFolders, setOrgFolders] = useState([])
  const [orgFoldersError, setOrgFoldersError] = useState(null)
  const orgFoldersCacheRef = useRef(null)

  // ── Pagination ────────────────────────────────────────────────────────────
  const [docsPage, setDocsPage] = useState(1)
  const [docsTotalCount, setDocsTotalCount] = useState(null)
  const [hasMoreDocs, setHasMoreDocs] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // ── Navigation selection ──────────────────────────────────────────────────
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [selectedOrgId, setSelectedOrgId] = useState(null)
  const [showInternal, setShowInternal] = useState(false)
  const [expandedOrgs, setExpandedOrgs] = useState(new Set())

  // ── Internal orders ───────────────────────────────────────────────────────
  const [internalDocs, setInternalDocs] = useState([])
  const [internalLoading, setInternalLoading] = useState(false)
  const [confirmInternal, setConfirmInternal] = useState(null)

  // ── Trash ─────────────────────────────────────────────────────────────────
  const [showTrash, setShowTrash] = useState(false)
  const [trashedDocs, setTrashedDocs] = useState([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(null)

  // ── Confirm dialogs ───────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(null)

  // ── Event management ──────────────────────────────────────────────────────
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [newEventName, setNewEventName] = useState('')
  const [newEventType, setNewEventType] = useState('fair')
  const [renamingEventId, setRenamingEventId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)

  // ── Document rename ───────────────────────────────────────────────────────
  const [renamingDocId, setRenamingDocId] = useState(null)
  const [docRenameValue, setDocRenameValue] = useState('')
  const [docRenameLoading, setDocRenameLoading] = useState(false)

  // ── Share modal ───────────────────────────────────────────────────────────
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareEvent, setShareEvent] = useState(null)
  const [shareAccessList, setShareAccessList] = useState([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareSaving, setShareSaving] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [sharePermission, setSharePermission] = useState('read')

  // ── Auth helpers ──────────────────────────────────────────────────────────
  const isAdmin = profile?.role === 'admin'
  const eventPermissionById = useMemo(
    () => new Map(events.map(evt => [evt.id, evt.permission || 'read'])),
    [events],
  )
  const canManageEvent = (event) => event?.permission === 'manage'
  const canEditDoc = (doc) => {
    if (isAdmin) return true
    if (doc?.created_by && user?.id && doc.created_by === user.id) return true
    const docOwnerEmail = String(doc?.profiles?.email || '').trim().toLowerCase()
    const currentEmail = String(user?.email || '').trim().toLowerCase()
    if (docOwnerEmail && currentEmail && docOwnerEmail === currentEmail) return true
    if (!doc?.event_id) return false
    const perm = eventPermissionById.get(doc.event_id)
    return perm === 'edit' || perm === 'manage'
  }

  // ── Data fetch ────────────────────────────────────────────────────────────
  useEffect(() => { fetchData() }, [refreshKey])

  const fetchData = async () => {
    setLoading(true)
    setLoadIssue(null)
    try {
      const [eventsRes, docsRes, orgFoldersRes] = await Promise.all([
        safeFetch('/api/events'),
        safeFetch('/api/documents?per_page=50'),
        safeFetch('/api/org-folders'),
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
        const msg = String(eventsData.error || docsData.error || '')
        if (msg.toLowerCase().includes('unauthorized')) {
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
      if (docsData.documents) {
        setDocuments(docsData.documents)
        setDocsPage(1)
        setDocsTotalCount(docsData.total_count ?? null)
        setHasMoreDocs(
          docsData.total_count != null && docsData.documents.length < docsData.total_count,
        )
      }

      try {
        if (!orgFoldersRes.ok) {
          setOrgFoldersError('Failed to load company folders')
          if (orgFoldersCacheRef.current) setOrgFolders(orgFoldersCacheRef.current)
        } else {
          const orgData = await orgFoldersRes.json().catch(() => ({}))
          if (orgData.orgFolders) {
            setOrgFolders(orgData.orgFolders)
            orgFoldersCacheRef.current = orgData.orgFolders
            setOrgFoldersError(null)
          }
        }
      } catch {
        setOrgFoldersError('Failed to load company folders')
        if (orgFoldersCacheRef.current) setOrgFolders(orgFoldersCacheRef.current)
      }
    } catch {
      setLoadIssue('api_error')
      setErrorMsg('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const loadMoreDocs = async () => {
    if (loadingMore || !hasMoreDocs) return
    setLoadingMore(true)
    try {
      const nextPage = docsPage + 1
      const res = await safeFetch(`/api/documents?per_page=200&page=${nextPage}`)
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.documents) {
          setDocuments(prev => [...prev, ...data.documents])
          setDocsPage(nextPage)
          setHasMoreDocs(
            data.total_count != null &&
            (documents.length + data.documents.length) < data.total_count,
          )
        }
      }
    } catch (err) {
      setErrorMsg('Failed to load more documents')
    }
    setLoadingMore(false)
  }

  // ── Internal orders ───────────────────────────────────────────────────────
  const fetchInternalDocs = async () => {
    setInternalLoading(true)
    try {
      const res = await safeFetch('/api/documents?order_channel=internal&per_page=200')
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.documents) setInternalDocs(data.documents)
      }
    } catch (err) {
      setErrorMsg('Failed to load internal orders')
    }
    setInternalLoading(false)
  }

  const handleSetShowInternal = (val) => {
    setShowInternal(val)
    if (val && internalDocs.length === 0) fetchInternalDocs()
  }

  const requestMoveToInternal = (doc) => setConfirmInternal(doc)

  const moveToInternal = async () => {
    const doc = confirmInternal
    if (!doc) return
    setConfirmInternal(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_channel: 'internal' }),
      })
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== doc.id))
        if (showInternal) fetchInternalDocs()
      }
    } catch {
      setErrorMsg('Failed to move document to Internal Orders')
    }
  }

  // ── Trash ─────────────────────────────────────────────────────────────────
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
        await Promise.all(
          expired.map(d =>
            fetch(`/api/documents/${d.id}/purge`, { method: 'DELETE' }).catch(() => {}),
          ),
        )
        setTrashedDocs(data.documents.filter(d => {
          const age = (now - new Date(d.deleted_at).getTime()) / (1000 * 60 * 60 * 24)
          return age < TRASH_DAYS
        }))
      }
    } catch {
      setErrorMsg('Failed to load trash')
    }
    setTrashLoading(false)
  }

  const openTrash = () => { setShowTrash(true); fetchTrash() }
  const closeTrash = () => { setShowTrash(false); setTrashedDocs([]) }

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
    return { daysAgo: Math.floor(age), daysLeft: TRASH_DAYS - Math.floor(age) }
  }

  // ── Event management ──────────────────────────────────────────────────────
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
    } catch {
      setErrorMsg('Failed to create event')
    }
  }

  const startRename = (event) => {
    setRenamingEventId(event.id)
    setRenameValue(event.name)
  }

  const commitRename = async (eventId) => {
    if (!eventId) { setRenamingEventId(null); return }
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenamingEventId(null); return }
    setRenameLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) setEvents(prev => prev.map(e => e.id === eventId ? { ...e, name: trimmed } : e))
    } catch {
      setErrorMsg('Failed to rename folder')
    }
    setRenameLoading(false)
    setRenamingEventId(null)
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
      setDocuments(prev => prev.map(d => d.event_id === event.id ? { ...d, event_id: null } : d))
      if (selectedEventId === event.id) setSelectedEventId(null)
    } catch (err) {
      setErrorMsg('Failed to delete event: ' + err.message)
    }
  }

  // ── Document actions ──────────────────────────────────────────────────────
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

  const requestDelete = (doc) => setConfirmDelete(doc)

  const executeDelete = async () => {
    if (!confirmDelete) return
    const doc = confirmDelete
    setConfirmDelete(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete')
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
      setInternalDocs(prev => prev.filter(d => d.id !== doc.id))
    } catch (err) {
      setErrorMsg(t('docs.deleteFailed') + ': ' + err.message)
    }
  }

  const startDocRename = (doc) => {
    setRenamingDocId(doc.id)
    setDocRenameValue(doc.file_name || '')
  }

  const commitDocRename = async (docId) => {
    if (!docId) { setRenamingDocId(null); return }
    const trimmed = docRenameValue.trim()
    if (!trimmed) { setRenamingDocId(null); return }
    setDocRenameLoading(true)
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: trimmed }),
      })
      if (!res.ok) {
        const d = await res.json()
        setErrorMsg(d.error || 'Failed to rename')
      } else {
        setDocuments(prev => prev.map(d => d.id === docId ? { ...d, file_name: trimmed } : d))
      }
    } catch {
      setErrorMsg('Failed to rename document')
    } finally {
      setDocRenameLoading(false)
      setRenamingDocId(null)
    }
  }

  // ── Share modal ───────────────────────────────────────────────────────────
  const openShareModal = async (event) => {
    setShareEvent(event)
    setShowShareModal(true)
    setShareLoading(true)
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(event.id)}/access`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load access')
      setShareAccessList(data.access || [])
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load access')
      setShareAccessList([])
    }
    setShareLoading(false)
  }

  const closeShareModal = () => {
    setShowShareModal(false)
    setShareEvent(null)
    setShareAccessList([])
    setShareEmail('')
    setSharePermission('read')
  }

  const grantShareAccess = async (e) => {
    e.preventDefault()
    if (!shareEvent || !shareEmail.trim()) return
    setShareSaving(true)
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(shareEvent.id)}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: shareEmail.trim(), permission: sharePermission }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to grant access')
      setShareEmail('')
      const refresh = await fetch(`/api/events/${encodeURIComponent(shareEvent.id)}/access`)
      const refreshData = await refresh.json().catch(() => ({}))
      setShareAccessList(refreshData.access || [])
    } catch (err) {
      setErrorMsg(err.message || 'Failed to grant access')
    }
    setShareSaving(false)
  }

  const updateSharePermission = async (targetUserId, permission) => {
    if (!shareEvent) return
    setShareSaving(true)
    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(shareEvent.id)}/access/${encodeURIComponent(targetUserId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permission }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update permission')
      setShareAccessList(prev => prev.map(row => row.user_id === targetUserId ? { ...row, permission } : row))
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update permission')
    }
    setShareSaving(false)
  }

  const revokeShareAccess = async (targetUserId) => {
    if (!shareEvent) return
    setShareSaving(true)
    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(shareEvent.id)}/access/${encodeURIComponent(targetUserId)}`,
        { method: 'DELETE' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to revoke access')
      setShareAccessList(prev => prev.filter(row => row.user_id !== targetUserId))
    } catch (err) {
      setErrorMsg(err.message || 'Failed to revoke access')
    }
    setShareSaving(false)
  }

  // ── Memoized filtering and analytics ─────────────────────────────────────
  const selectedOrgMemberIds = useMemo(() => {
    if (!selectedOrgId) return null
    const org = orgFolders.find(o => o.organization_id === selectedOrgId)
    if (!org) return null
    return new Set(org.members.map(m => m.user_id))
  }, [selectedOrgId, orgFolders])

  const filteredDocs = useMemo(() => {
    if (showInternal) return []
    return documents.filter(doc => {
      if (selectedOrgId) {
        const byMember = selectedOrgMemberIds?.has(doc.created_by)
        const byEvent = doc.events?.organization_id === selectedOrgId
        if (!byMember && !byEvent) return false
      } else {
        const matchesEvent =
          selectedEventId === null
            ? true
            : selectedEventId === 'none'
              ? !doc.event_id
              : doc.event_id === selectedEventId
        if (!matchesEvent) return false
      }
      return (
        !search ||
        doc.client_name?.toLowerCase().includes(search.toLowerCase()) ||
        doc.client_company?.toLowerCase().includes(search.toLowerCase()) ||
        doc.file_name?.toLowerCase().includes(search.toLowerCase())
      )
    })
  }, [documents, selectedOrgId, selectedOrgMemberIds, selectedEventId, search, showInternal])

  const currentEventName = useMemo(() => {
    if (showInternal) return 'Internal Orders'
    if (selectedOrgId)
      return orgFolders.find(o => o.organization_id === selectedOrgId)?.organization_name || 'Company'
    if (selectedEventId && selectedEventId !== 'none')
      return events.find(e => e.id === selectedEventId)?.name || ''
    if (selectedEventId === 'none') return 'No Event'
    return 'All Documents'
  }, [showInternal, selectedOrgId, selectedEventId, orgFolders, events])

  const getEmptyState = () => {
    if (loadIssue === 'unauthorized') return {
      title: 'Session expired or unauthorized',
      subtitle: 'Sign out and sign in again to refresh your access token.',
    }
    if (loadIssue === 'api_error') return {
      title: 'Could not load documents',
      subtitle: 'A temporary API issue occurred. Refresh the page and try again.',
    }
    if (search) return {
      title: 'No documents match your search',
      subtitle: 'Try a different client name, company, or file name.',
    }
    if (selectedEventId && selectedEventId !== 'none') return {
      title: `No documents in ${currentEventName}`,
      subtitle: 'Switch to All Documents to see files from other events.',
    }
    if (profileMissing) return {
      title: 'Account access not configured',
      subtitle: `Signed in as ${user?.email || 'this account'} but no profile is configured yet. Ask an admin to set up your role.`,
    }
    if (profileError === 'failed_to_load_profile') return {
      title: 'Profile loading issue',
      subtitle: 'Your session is active, but role data did not load. Sign out and sign in again.',
    }
    if (events.length === 0 && documents.length === 0 && profile?.role !== 'admin') return {
      title: "You don't have any folders yet",
      subtitle: 'Tap the + next to "Documents" to create your first folder, then save documents into it.',
    }
    return {
      title: 'No documents yet',
      subtitle: 'Save an order to see it here.',
    }
  }
  const emptyState = getEmptyState()

  // ── Display list (normal or internal) ────────────────────────────────────
  const displayDocs = showInternal ? internalDocs : filteredDocs
  const displayLoading = showInternal ? internalLoading : loading

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {/* Mobile toggle button */}
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
          <span>☰ Documents</span>
        </button>
      )}

      {/* Mobile overlay */}
      {mobile && showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200 }}
        />
      )}

      {/* Sidebar */}
      <DocumentsSidebar
        mobile={mobile}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        isAdmin={isAdmin}
        events={events}
        documents={documents}
        orgFolders={orgFolders}
        orgFoldersError={orgFoldersError}
        selectedEventId={selectedEventId}
        setSelectedEventId={setSelectedEventId}
        selectedOrgId={selectedOrgId}
        setSelectedOrgId={setSelectedOrgId}
        showInternal={showInternal}
        setShowInternal={handleSetShowInternal}
        expandedOrgs={expandedOrgs}
        setExpandedOrgs={setExpandedOrgs}
        renamingEventId={renamingEventId}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        startRename={startRename}
        commitRename={commitRename}
        renameLoading={renameLoading}
        showNewEvent={showNewEvent}
        setShowNewEvent={setShowNewEvent}
        newEventName={newEventName}
        setNewEventName={setNewEventName}
        newEventType={newEventType}
        setNewEventType={setNewEventType}
        createEvent={createEvent}
        setConfirmDeleteEvent={setConfirmDeleteEvent}
        openShareModal={openShareModal}
        canManageEvent={canManageEvent}
        fetchData={fetchData}
      />

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: mobile ? 12 : 20 }}>
        {/* Toolbar */}
        <div style={{
          marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center',
          maxWidth: mobile ? '100%' : 700,
        }}>
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

        {/* Analytics widget — hidden in internal view */}
        {!displayLoading && !showInternal && (
          <DocumentsAnalytics
            filteredDocs={filteredDocs}
            currentEventName={currentEventName}
            mobile={mobile}
          />
        )}

        {/* Internal orders header */}
        {showInternal && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 10,
            background: '#f5f0fa', border: `1px solid ${colors.lineGray}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                🔒 Internal Orders
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                Supplier / manufacturing orders — not counted in revenue or analytics.
              </div>
            </div>
            {!internalLoading && (
              <button
                onClick={fetchInternalDocs}
                style={{
                  padding: '6px 12px', borderRadius: 7, border: `1px solid ${colors.inkPlum}`,
                  background: 'transparent', color: colors.inkPlum,
                  fontSize: 11, cursor: 'pointer', fontFamily: fonts.body,
                }}
              >Refresh</button>
            )}
          </div>
        )}

        {/* Document list */}
        {displayLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Loading...</div>
        ) : displayDocs.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60, background: '#fff',
            borderRadius: 12, border: '1px solid #e8e8e8',
          }}>
            {showInternal ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#555', marginBottom: 4 }}>
                  No internal orders
                </div>
                <div style={{ fontSize: 13, color: '#999' }}>
                  Documents marked as Internal will appear here.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#555', marginBottom: 4 }}>
                  {emptyState.title}
                </div>
                <div style={{ fontSize: 13, color: '#999' }}>{emptyState.subtitle}</div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayDocs.map(doc => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                mobile={mobile}
                isAdmin={isAdmin}
                canEdit={canEditDoc(doc)}
                onReEdit={onReEdit}
                onPreview={previewDocument}
                onDownload={downloadDocument}
                onDelete={requestDelete}
                onRequestInternal={requestMoveToInternal}
                renamingDocId={renamingDocId}
                docRenameValue={docRenameValue}
                setDocRenameValue={setDocRenameValue}
                commitDocRename={commitDocRename}
                startDocRename={startDocRename}
                docRenameLoading={docRenameLoading}
              />
            ))}
            {!showInternal && hasMoreDocs && (
              <button
                onClick={loadMoreDocs}
                disabled={loadingMore}
                style={{
                  width: '100%', padding: 12, marginTop: 8, borderRadius: 8,
                  border: '1px solid #e3e3e3', background: '#fafafa', color: colors.inkPlum,
                  fontSize: 13, fontWeight: 600, cursor: loadingMore ? 'wait' : 'pointer',
                  fontFamily: fonts.body,
                }}
              >
                {loadingMore
                  ? 'Loading...'
                  : `Load more (${docsTotalCount != null ? `${documents.length} of ${docsTotalCount}` : '...'})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Confirm: move to internal ─────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!confirmInternal}
        title="Move to Internal Orders?"
        message={confirmInternal ? `"${confirmInternal.client_company || confirmInternal.client_name}" will be removed from All Documents and revenue analytics. This cannot be undone from the UI.` : ''}
        confirmLabel="Move to Internal"
        cancelLabel="Cancel"
        onConfirm={moveToInternal}
        onCancel={() => setConfirmInternal(null)}
      />

      {/* ── Confirm: delete document ──────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={t('docs.confirmDelete') || 'Delete document?'}
        message={confirmDelete ? `"${confirmDelete.file_name}" will be moved to Trash. You have 7 days to recover it.` : ''}
        confirmLabel={t('docs.delete') || 'Delete'}
        cancelLabel="Cancel"
        onConfirm={executeDelete}
        onCancel={() => setConfirmDelete(null)}
        variant="danger"
      />

      {/* ── Confirm: delete event ─────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!confirmDeleteEvent}
        title="Delete folder?"
        message={confirmDeleteEvent ? `"${confirmDeleteEvent.name}" will be deleted. Documents in this folder will move to "No event".` : ''}
        confirmLabel="Delete folder"
        cancelLabel="Cancel"
        onConfirm={executeDeleteEvent}
        onCancel={() => setConfirmDeleteEvent(null)}
        variant="danger"
      />

      {/* ── Confirm: purge from trash ─────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!confirmPurge}
        title="Delete permanently?"
        message={confirmPurge ? `"${confirmPurge.file_name}" will be permanently deleted and cannot be recovered.` : ''}
        confirmLabel="Delete forever"
        cancelLabel="Cancel"
        onConfirm={() => purgeDoc(confirmPurge)}
        onCancel={() => setConfirmPurge(null)}
        variant="danger"
      />

      {/* ── Error message ─────────────────────────────────────────────────── */}
      {errorMsg && (
        <div style={{
          position: 'fixed', bottom: mobile ? 80 : 20, left: '50%', transform: 'translateX(-50%)',
          background: '#222', color: '#fff', padding: '10px 20px', borderRadius: 10,
          fontSize: 13, zIndex: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          maxWidth: 420, textAlign: 'center',
        }}>
          {errorMsg}
          <button
            onClick={() => setErrorMsg(null)}
            style={{
              marginLeft: 12, background: 'none', border: 'none', color: '#aaa',
              fontSize: 16, cursor: 'pointer', lineHeight: 1,
            }}
          >×</button>
        </div>
      )}

      {/* ── Trash modal ───────────────────────────────────────────────────── */}
      {showTrash && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={closeTrash}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640,
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '18px 20px 14px', borderBottom: '1px solid #eee',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#222' }}>Trash</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                  Deleted documents are kept for 7 days before being permanently removed.
                </div>
              </div>
              <button
                onClick={closeTrash}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}
              >×</button>
            </div>

            <div style={{ overflowY: 'auto', padding: '12px 20px 20px', flex: 1 }}>
              {trashLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Loading...</div>
              ) : trashedDocs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🗑</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>Trash is empty</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                    Deleted documents will appear here for 7 days.
                  </div>
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
                        <div style={{
                          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                          background: doc.document_type === 'order' ? '#f0f5ff' : '#f5f5f5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: colors.inkPlum,
                        }}>
                          {doc.document_type === 'order' ? 'PO' : 'Q'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 600, color: '#333',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {doc.client_company || doc.client_name || 'Unknown'}
                          </div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            {doc.file_name} · {doc.total_amount ? fmt(doc.total_amount) : ''}
                          </div>
                          <div style={{ fontSize: 11, marginTop: 3, color: urgent ? '#dc2626' : '#888' }}>
                            Deleted {daysAgo === 0 ? 'today' : `${daysAgo}d ago`} — {daysLeft} day{daysLeft !== 1 ? 's' : ''} left to recover
                          </div>
                        </div>
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

      {/* ── Share modal ───────────────────────────────────────────────────── */}
      {showShareModal && shareEvent && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 320,
            background: 'rgba(0,0,0,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={closeShareModal}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680,
              maxHeight: '82vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '18px 20px 14px', borderBottom: '1px solid #eee',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#222' }}>Share Folder</div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{shareEvent.name}</div>
              </div>
              <button
                onClick={closeShareModal}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}
              >×</button>
            </div>

            <div style={{ padding: '14px 20px 0' }}>
              <form onSubmit={grantShareAccess} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="Email address..."
                  style={{
                    flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 8,
                    border: '1px solid #e3e3e3', fontSize: 13, fontFamily: fonts.body, outline: 'none',
                  }}
                />
                <select
                  value={sharePermission}
                  onChange={(e) => setSharePermission(e.target.value)}
                  style={{
                    padding: '9px 10px', borderRadius: 8, border: '1px solid #e3e3e3',
                    fontSize: 13, fontFamily: fonts.body, background: '#fff',
                  }}
                >
                  <option value="read">Read</option>
                  <option value="edit">Edit</option>
                  <option value="manage">Manage</option>
                </select>
                <button
                  type="submit"
                  disabled={shareSaving || !shareEmail.trim()}
                  style={{
                    padding: '9px 18px', borderRadius: 8, border: 'none',
                    background: colors.inkPlum, color: '#fff',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                    opacity: shareSaving || !shareEmail.trim() ? 0.6 : 1,
                  }}
                >
                  {shareSaving ? 'Saving...' : 'Add'}
                </button>
              </form>
            </div>

            <div style={{ overflowY: 'auto', padding: '14px 20px 20px', flex: 1 }}>
              {shareLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#999' }}>Loading...</div>
              ) : shareAccessList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#aaa', fontSize: 13 }}>
                  No one else has access yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shareAccessList.map(row => (
                    <div key={row.user_id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', background: '#fafafa', borderRadius: 8,
                      border: '1px solid #ede8f0',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: colors.inkPlum,
                        color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {(row.full_name || row.email || '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                          {row.full_name || row.email}
                        </div>
                        {row.full_name && (
                          <div style={{ fontSize: 11, color: '#999' }}>{row.email}</div>
                        )}
                      </div>
                      <select
                        value={row.permission}
                        onChange={(e) => updateSharePermission(row.user_id, e.target.value)}
                        disabled={shareSaving}
                        style={{
                          padding: '5px 8px', borderRadius: 6, border: '1px solid #e3e3e3',
                          fontSize: 12, fontFamily: fonts.body, background: '#fff',
                        }}
                      >
                        <option value="read">Read</option>
                        <option value="edit">Edit</option>
                        <option value="manage">Manage</option>
                      </select>
                      <button
                        onClick={() => revokeShareAccess(row.user_id)}
                        disabled={shareSaving}
                        style={{
                          padding: '5px 10px', borderRadius: 6, border: '1px solid #fecaca',
                          background: '#fef2f2', color: '#dc2626', fontSize: 12,
                          cursor: 'pointer', fontFamily: fonts.body,
                        }}
                      >Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

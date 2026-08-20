'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'

const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase',
    letterSpacing: '0.08em', padding: '12px 12px 4px', userSelect: 'none',
  }}>
    {children}
  </div>
)

export default function DocumentsSidebar({
  mobile,
  showSidebar,
  setShowSidebar,
  isAdmin,
  events,
  documents,
  orgFolders,
  selectedEventId,
  setSelectedEventId,
  selectedOrgId,
  setSelectedOrgId,
  selectedOrgMemberId,
  setSelectedOrgMemberId,
  showInternal,
  setShowInternal,
  showConsignment,
  setShowConsignment,
  showDrafts,
  setShowDrafts,
  draftCount = 0,
  showOffres,
  setShowOffres,
  offreCount = 0,
  renamingEventId,
  renameValue,
  setRenameValue,
  startRename,
  commitRename,
  renameLoading,
  showNewEvent,
  setShowNewEvent,
  newEventName,
  setNewEventName,
  newEventType,
  setNewEventType,
  createEvent,
  setConfirmDeleteEvent,
  openShareModal,
  canManageEvent,
  fetchData,
}) {
  const router = useRouter()
  const [manuallyExpandedOrgIds, setManuallyExpandedOrgIds] = useState(() => new Set())

  // Server-authoritative counts (events.doc_count is computed in /api/events
  // with the same filters as /api/documents — see Phase 12 fix). Falls back to
  // an in-memory filter for backward compatibility while the API rolls out.
  const eventCountById = new Map((events || []).map(e => [e.id, e.doc_count]))
  const getEventDocCount = (eventId) => {
    const fromServer = eventCountById.get(eventId)
    if (typeof fromServer === 'number') return fromServer
    return documents.filter(d => d.event_id === eventId).length
  }
  // Phase 18b: prefer server-authoritative orgFolder.doc_count (computed by
  // /api/org-folders with the same filters as /api/documents). Falls back to
  // event-summing (Phase 12) and finally to in-memory filtering.
  const orgFolderCountById = new Map(
    (orgFolders || []).map(f => [f.organization_id, f.doc_count]),
  )
  const getOrgDocCount = (organizationId) => {
    const fromServer = orgFolderCountById.get(organizationId)
    if (typeof fromServer === 'number' && fromServer > 0) return fromServer
    const orgEvents = (events || []).filter(e => e.organization_id === organizationId)
    if (orgEvents.length > 0 && orgEvents.every(e => typeof e.doc_count === 'number')) {
      const sum = orgEvents.reduce((acc, e) => acc + (e.doc_count || 0), 0)
      if (sum > 0) return sum
    }
    if (typeof fromServer === 'number') return fromServer
    return documents.filter(d => d.events?.organization_id === organizationId).length
  }
  // Per-member counts are keyed on created_by, so a member's order still counts
  // for them when it was auto-filed into a team-mate's folder.
  const getOrgMemberDocCount = (member) => {
    if (typeof member?.doc_count === 'number') return member.doc_count
    return documents.filter(d => d.created_by === member?.user_id).length
  }
  const memberLabel = (member) => member?.full_name || member?.email || 'Unnamed member'
  const sortedOrgMembers = (org) => [...(org?.members || [])].sort((a, b) => {
    const diff = getOrgMemberDocCount(b) - getOrgMemberDocCount(a)
    if (diff !== 0) return diff
    if ((a.role === 'owner') !== (b.role === 'owner')) return a.role === 'owner' ? -1 : 1
    return memberLabel(a).localeCompare(memberLabel(b))
  })
  const toggleOrgExpanded = (organizationId) => {
    setManuallyExpandedOrgIds(prev => {
      const next = new Set(prev)
      if (next.has(organizationId)) next.delete(organizationId)
      else next.add(organizationId)
      return next
    })
  }
  // Parked orders (Draft + Offre) are excluded from the All Documents count —
  // they have their own folders.
  const allDocsCount = documents.filter(d => d.status !== 'draft').length

  const eventFolders = (events || []).filter(e => (e.type || 'other') !== 'agent')
  const isAllSelected = selectedEventId === null && !selectedOrgId && !showInternal && !showConsignment && !showDrafts && !showOffres

  const selectAll = () => {
    setSelectedEventId(null)
    setSelectedOrgId?.(null)
    setSelectedOrgMemberId?.(null)
    setShowDrafts?.(false)
    setShowOffres?.(false)
    if (showInternal) setShowInternal(false)
    if (showConsignment) setShowConsignment?.(false)
  }

  const selectEvent = (eventId) => {
    setSelectedEventId(eventId)
    setSelectedOrgId?.(null)
    setSelectedOrgMemberId?.(null)
    setShowDrafts?.(false)
    setShowOffres?.(false)
    if (showInternal) setShowInternal(false)
    if (showConsignment) setShowConsignment?.(false)
  }

  // memberId narrows the team folder to one person; null shows the whole team.
  const selectOrg = (orgId, memberId = null) => {
    setSelectedOrgId?.(orgId)
    setSelectedOrgMemberId?.(memberId)
    setSelectedEventId(null)
    setShowDrafts?.(false)
    setShowOffres?.(false)
    if (showInternal) setShowInternal(false)
    if (showConsignment) setShowConsignment?.(false)
  }

  const selectInternal = () => {
    setShowInternal(true)
    setSelectedEventId(null)
    setSelectedOrgId?.(null)
    setSelectedOrgMemberId?.(null)
    setShowDrafts?.(false)
    setShowOffres?.(false)
    if (showConsignment) setShowConsignment?.(false)
  }

  const selectConsignment = () => {
    setShowConsignment?.(true)
    setSelectedEventId(null)
    setSelectedOrgId?.(null)
    setSelectedOrgMemberId?.(null)
    setShowDrafts?.(false)
    setShowOffres?.(false)
    if (showInternal) setShowInternal(false)
  }

  const selectDrafts = () => {
    setShowDrafts?.(true)
    setShowOffres?.(false)
    setSelectedEventId(null)
    setSelectedOrgId?.(null)
    setSelectedOrgMemberId?.(null)
    if (showInternal) setShowInternal(false)
    if (showConsignment) setShowConsignment?.(false)
  }

  const selectOffres = () => {
    setShowOffres?.(true)
    setShowDrafts?.(false)
    setSelectedEventId(null)
    setSelectedOrgId?.(null)
    setSelectedOrgMemberId?.(null)
    if (showInternal) setShowInternal(false)
    if (showConsignment) setShowConsignment?.(false)
  }

  return (
    <div style={{
      width: mobile ? '85%' : 240,
      maxWidth: mobile ? 300 : 240,
      flexShrink: 0,
      background: '#fff',
      borderRight: '1px solid #eaeaea',
      padding: '16px 0',
      overflowY: 'auto',
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
      {/* Mobile close */}
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

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 16px', marginBottom: 8,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#333', margin: 0 }}>Documents</h2>
        {isAdmin && (
          <button
            onClick={() => setShowNewEvent(true)}
            style={{
              background: 'none', border: 'none', color: colors.inkPlum,
              fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1,
            }}
            title="Create new event folder"
          >+</button>
        )}
      </div>

      {/* New event form */}
      {showNewEvent && (
        <div style={{ padding: '0 16px', marginBottom: 12 }}>
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
            <option value="fair">Fair / Event</option>
            <option value="partner">Partner</option>
            <option value="other">Other</option>
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={createEvent}
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 6, border: 'none',
                background: colors.inkPlum, color: '#fff',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
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

      {/* All Documents */}
      <div style={{ padding: '0 8px' }}>
        <button
          onClick={selectAll}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
            background: isAllSelected ? '#f3f0f5' : 'transparent',
            color: isAllSelected ? colors.inkPlum : '#555',
            fontSize: 13, fontWeight: isAllSelected ? 600 : 400,
            cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
            marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <span>All Documents</span>
          <span style={{ fontSize: 11, color: '#999' }}>{allDocsCount}</span>
        </button>
      </div>

      {/* Draft — parked orders not yet sent. Available to everyone. */}
      <div style={{ padding: '0 8px' }}>
        <button
          onClick={selectDrafts}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
            background: showDrafts ? '#fff4e5' : 'transparent',
            color: showDrafts ? '#b9770e' : '#555',
            fontSize: 13, fontWeight: showDrafts ? 600 : 400,
            cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
            marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12 }}>📝</span>
            <span>Draft</span>
          </span>
          <span style={{ fontSize: 11, color: '#999' }}>{draftCount}</span>
        </button>
      </div>

      {/* Offre — same parked orders as Draft, on the admin-only page. */}
      {isAdmin && (
        <div style={{ padding: '0 8px' }}>
          <button
            onClick={selectOffres}
            data-testid="sidebar-offre"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
              background: showOffres ? '#faf5e8' : 'transparent',
              color: showOffres ? colors.luxeGold : '#555',
              fontSize: 13, fontWeight: showOffres ? 600 : 400,
              cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
              marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12 }}>🏷️</span>
              <span>Offre</span>
            </span>
            <span style={{ fontSize: 11, color: '#999' }}>{offreCount}</span>
          </button>
        </div>
      )}

      {/* ── EVENTS ── */}
      {eventFolders.length > 0 && (
        <>
          <SectionLabel>Events</SectionLabel>
          <div style={{ padding: '0 8px' }}>
            {eventFolders.map(event => {
              const isSelected = selectedEventId === event.id && !showInternal && !showConsignment && !showDrafts && !showOffres
              return (
                <div
                  key={event.id}
                  style={{
                    display: 'flex', alignItems: 'center', marginBottom: 2,
                    borderRadius: 8, background: isSelected ? '#f3f0f5' : 'transparent',
                  }}
                >
                  {renamingEventId === event.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(event.id)
                        if (e.key === 'Escape') commitRename(null)
                      }}
                      onBlur={() => commitRename(event.id)}
                      disabled={renameLoading}
                      style={{
                        flex: 1, margin: '4px 6px', padding: '5px 8px',
                        fontSize: 13, border: `1.5px solid ${colors.inkPlum}`,
                        borderRadius: 6, outline: 'none', fontFamily: fonts.body,
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => selectEvent(event.id)}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                        background: 'transparent',
                        color: isSelected ? colors.inkPlum : '#555',
                        fontSize: 13, fontWeight: isSelected ? 600 : 400,
                        cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        minWidth: 0,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.name}
                      </span>
                      <span style={{ fontSize: 11, color: '#999', flexShrink: 0, marginLeft: 8 }}>
                        {getEventDocCount(event.id)}
                      </span>
                    </button>
                  )}
                  {renamingEventId !== event.id && canManageEvent(event) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(event) }}
                      title="Rename"
                      style={{
                        width: 22, height: 22, borderRadius: 5, border: 'none',
                        background: 'transparent', color: '#ccc', fontSize: 11,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'color .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = colors.inkPlum }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#ccc' }}
                    >✎</button>
                  )}
                  {canManageEvent(event) && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); openShareModal(event) }}
                        title="Share folder"
                        style={{
                          width: 24, height: 24, borderRadius: 6, border: 'none',
                          background: 'transparent', color: '#ccc', fontSize: 12,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, transition: 'color .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = colors.inkPlum }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#ccc' }}
                      >↗</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteEvent(event) }}
                        title="Delete event"
                        style={{
                          width: 24, height: 24, borderRadius: 6, border: 'none',
                          background: 'transparent', color: '#ccc', fontSize: 13,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginRight: 4, transition: 'color .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#dc2626' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#ccc' }}
                      >×</button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── AGENTS ── */}
      {(orgFolders || []).length > 0 && (
        <>
          <SectionLabel>Agents</SectionLabel>
          <div style={{ padding: '0 8px' }}>
            {(orgFolders || []).map(org => {
              const inThisOrg = selectedOrgId === org.organization_id && !showInternal && !showConsignment && !showDrafts && !showOffres
              const isTeamSelected = inThisOrg && !selectedOrgMemberId
              const docCount = getOrgDocCount(org.organization_id)
              const members = sortedOrgMembers(org)
              // A one-person team has nothing to nest — keep it a single row, and
              // keep labelling it with the person, whose trading name is more
              // recognisable than the auto-generated "X Organization".
              const canExpand = members.length > 1
              const isExpanded = canExpand && (manuallyExpandedOrgIds.has(org.organization_id) || inThisOrg)
              const soloName = members.length === 1 ? memberLabel(members[0]) : ''
              const teamName = canExpand
                ? (org.organization_name || memberLabel(members[0]))
                : (soloName || org.organization_name || 'Agent')
              return (
                <div key={org.organization_id} style={{ marginBottom: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {canExpand && (
                      <button
                        onClick={() => toggleOrgExpanded(org.organization_id)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${teamName}`}
                        style={{
                          border: 'none', background: 'transparent', cursor: 'pointer',
                          color: '#aaa', fontSize: 10, padding: '6px 2px 6px 4px',
                          lineHeight: 1, flexShrink: 0, fontFamily: fonts.body,
                        }}
                      >{isExpanded ? '▾' : '▸'}</button>
                    )}
                    <button
                      onClick={() => selectOrg(org.organization_id)}
                      style={{
                        flex: 1, minWidth: 0,
                        padding: canExpand ? '8px 12px 8px 4px' : '8px 12px',
                        borderRadius: 8, border: 'none',
                        background: isTeamSelected ? '#f3f0f5' : 'transparent',
                        color: isTeamSelected ? colors.inkPlum : '#555',
                        fontSize: 13, fontWeight: isTeamSelected ? 600 : 400,
                        cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {teamName}
                      </span>
                      <span style={{ fontSize: 11, color: '#999', flexShrink: 0, marginLeft: 8 }}>
                        {docCount}
                      </span>
                    </button>
                  </div>

                  {isExpanded && members.map(member => {
                    const isMemberSelected = inThisOrg && selectedOrgMemberId === member.user_id
                    const memberCount = getOrgMemberDocCount(member)
                    return (
                      <button
                        key={member.user_id}
                        onClick={() => selectOrg(org.organization_id, member.user_id)}
                        style={{
                          width: 'calc(100% - 18px)', marginLeft: 18,
                          padding: '6px 12px', borderRadius: 8, border: 'none',
                          background: isMemberSelected ? '#f3f0f5' : 'transparent',
                          color: isMemberSelected ? colors.inkPlum : '#777',
                          fontSize: 12, fontWeight: isMemberSelected ? 600 : 400,
                          cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {memberLabel(member)}
                        </span>
                        <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0, marginLeft: 8 }}>
                          {memberCount}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── ORDERS (admin only) ── */}
      {isAdmin && (
        <>
          <div style={{ margin: '8px 16px 0', borderTop: '1px solid #f0eaf3' }} />
          <SectionLabel>Orders</SectionLabel>
          <div style={{ padding: '4px 8px' }}>
            <button
              onClick={selectInternal}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none',
                background: showInternal ? '#f3ecf5' : 'transparent',
                color: showInternal ? colors.inkPlum : '#888',
                fontSize: 13, fontWeight: showInternal ? 600 : 400,
                cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2,
              }}
            >
              <span style={{ fontSize: 12 }}>🔒</span>
              <span>Internal Orders</span>
            </button>
            <button
              onClick={selectConsignment}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none',
                background: showConsignment ? '#f3ecf5' : 'transparent',
                color: showConsignment ? colors.inkPlum : '#888',
                fontSize: 13, fontWeight: showConsignment ? 600 : 400,
                cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: 12 }}>📦</span>
              <span>Consignment Orders</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

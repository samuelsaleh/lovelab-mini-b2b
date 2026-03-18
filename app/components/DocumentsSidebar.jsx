'use client'

import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'

const EVENT_GROUPS = [
  { key: 'fair', label: 'Fairs' },
  { key: 'agent', label: 'Agents' },
  { key: 'partner', label: 'Partners' },
  { key: 'other', label: 'Other' },
]

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
  orgFoldersError,
  selectedEventId,
  setSelectedEventId,
  selectedOrgId,
  setSelectedOrgId,
  showInternal,
  setShowInternal,
  expandedOrgs,
  setExpandedOrgs,
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

  const getEventDocCount = (eventId) => documents.filter(d => d.event_id === eventId).length
  const allDocsCount = documents.length
  const noEventDocsCount = documents.filter(d => !d.event_id).length

  const selectAll = () => {
    setSelectedEventId(null)
    setSelectedOrgId(null)
    if (showInternal) setShowInternal(false)
  }

  const selectEvent = (eventId) => {
    setSelectedEventId(eventId)
    setSelectedOrgId(null)
    if (showInternal) setShowInternal(false)
  }

  const selectInternal = () => {
    setShowInternal(true)
    setSelectedEventId(null)
    setSelectedOrgId(null)
  }

  const isAllSelected = selectedEventId === null && !selectedOrgId && !showInternal

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
        <button
          onClick={() => setShowNewEvent(true)}
          style={{
            background: 'none', border: 'none', color: colors.inkPlum,
            fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1,
          }}
          title="Create new event folder"
        >+</button>
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

      {/* Events section */}
      <SectionLabel>Events</SectionLabel>
      <div style={{ padding: '0 8px' }}>
        {EVENT_GROUPS.map(group => {
          const groupEvents = events.filter(e => (e.type || 'other') === group.key)
          if (groupEvents.length === 0) return null
          return (
            <div key={group.key} style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 9, fontWeight: 600, color: '#ccc', textTransform: 'uppercase',
                letterSpacing: '0.06em', padding: '6px 12px 2px', userSelect: 'none',
              }}>
                {group.label}
              </div>
              {groupEvents.map(event => {
                const isSelected = selectedEventId === event.id && !showInternal
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
          )
        })}

        {/* No-event bucket */}
        {noEventDocsCount > 0 && (
          <button
            onClick={() => { selectEvent('none') }}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none',
              background: selectedEventId === 'none' && !showInternal ? '#f3f0f5' : 'transparent',
              color: selectedEventId === 'none' && !showInternal ? colors.inkPlum : '#999',
              fontSize: 12,
              fontWeight: selectedEventId === 'none' && !showInternal ? 600 : 400,
              cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
              marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontStyle: 'italic',
            }}
          >
            <span>No event</span>
            <span style={{ fontSize: 11 }}>{noEventDocsCount}</span>
          </button>
        )}
      </div>

      {/* Companies section */}
      {orgFoldersError && orgFolders.length === 0 && (
        <div style={{ padding: '8px 16px', fontSize: 11, color: '#c44' }}>
          {orgFoldersError}{' '}
          <button
            onClick={fetchData}
            style={{
              background: 'none', border: 'none', color: colors.inkPlum,
              cursor: 'pointer', fontSize: 11, textDecoration: 'underline', padding: 0,
            }}
          >Retry</button>
        </div>
      )}

      {orgFolders.length > 0 && (
        <>
          <SectionLabel>Companies</SectionLabel>
          <div style={{ padding: '0 8px', marginBottom: 8 }}>
            {orgFolders.map(org => {
              const isExpanded = expandedOrgs.has(org.organization_id)
              const isOrgSelected = selectedOrgId === org.organization_id && !showInternal

              const handleOrgClick = () => {
                if (isOrgSelected) {
                  setSelectedOrgId(null)
                } else {
                  setSelectedOrgId(org.organization_id)
                  setSelectedEventId(null)
                  if (showInternal) setShowInternal(false)
                }
                setExpandedOrgs(prev => {
                  const next = new Set(prev)
                  if (isOrgSelected) next.delete(org.organization_id)
                  else next.add(org.organization_id)
                  return next
                })
              }

              return (
                <div key={org.organization_id} style={{ marginBottom: 2 }}>
                  <button
                    onClick={handleOrgClick}
                    style={{
                      width: '100%', padding: '7px 12px', borderRadius: 8, border: 'none',
                      background: isOrgSelected ? '#f3ecf5' : isExpanded ? '#f9f6fa' : 'transparent',
                      color: colors.inkPlum, fontSize: 12,
                      fontWeight: isOrgSelected ? 800 : 700,
                      cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderLeft: `2px solid ${colors.inkPlum}`, marginLeft: 2,
                    }}
                  >
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <span style={{ fontSize: 10, color: '#999' }}>{isExpanded ? '▾' : '▸'}</span>
                      {org.organization_name}
                    </span>
                    <span style={{ fontSize: 10, color: '#999', flexShrink: 0, marginLeft: 6 }}>
                      {org.member_count}
                    </span>
                  </button>

                  {isExpanded && (
                    <div style={{ paddingLeft: 14 }}>
                      {org.members.map(member => (
                        <button
                          key={member.user_id}
                          onClick={() => {
                            if (isAdmin) router.push(`/admin/agents/${member.user_id}`)
                          }}
                          style={{
                            width: '100%', padding: '5px 10px', fontSize: 12,
                            color: '#555', fontFamily: fonts.body,
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'none', border: 'none',
                            cursor: isAdmin ? 'pointer' : 'default', textAlign: 'left', borderRadius: 6,
                          }}
                        >
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%', background: colors.inkPlum,
                            color: '#fff', fontSize: 9, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {(member.full_name || member.email || '?')[0].toUpperCase()}
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {member.full_name || member.email}
                          </span>
                          {member.role === 'owner' && (
                            <span style={{ fontSize: 9, color: '#999', flexShrink: 0 }}>owner</span>
                          )}
                          {!!member.subfolder_id && (
                            <span style={{ fontSize: 9, color: colors.inkPlum, flexShrink: 0 }}>📁</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Internal Orders (admin only) */}
      {isAdmin && (
        <>
          <div style={{
            margin: '8px 16px 0',
            borderTop: '1px solid #f0eaf3',
          }} />
          <div style={{ padding: '4px 8px' }}>
            <button
              onClick={selectInternal}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
                background: showInternal ? '#f3ecf5' : 'transparent',
                color: showInternal ? colors.inkPlum : '#888',
                fontSize: 12, fontWeight: showInternal ? 700 : 400,
                cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body,
                display: 'flex', alignItems: 'center', gap: 8,
                borderLeft: `2px solid ${showInternal ? colors.inkPlum : 'transparent'}`,
                marginLeft: 2,
              }}
            >
              <span style={{ fontSize: 11 }}>🔒</span>
              <span>Internal Orders</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

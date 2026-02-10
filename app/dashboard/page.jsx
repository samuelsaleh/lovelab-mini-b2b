'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { colors, fonts } from '@/lib/styles';
import { fmt } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(null); // null = all documents
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch events
      const eventsRes = await fetch('/api/events');
      const eventsData = await eventsRes.json();
      if (eventsData.events) {
        setEvents(eventsData.events);
      }

      // Fetch all documents
      const docsRes = await fetch('/api/documents');
      const docsData = await docsRes.json();
      if (docsData.documents) {
        setDocuments(docsData.documents);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
    setLoading(false);
  };

  const createEvent = async () => {
    if (!newEventName.trim()) return;
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEventName.trim() }),
      });
      const data = await res.json();
      if (data.event) {
        setEvents(prev => [data.event, ...prev]);
        setNewEventName('');
        setShowNewEvent(false);
      }
    } catch (err) {
      console.error('Error creating event:', err);
    }
  };

  const downloadDocument = async (doc) => {
    try {
      // Get signed URL first, then download
      const res = await fetch(`/api/documents/preview?path=${encodeURIComponent(doc.file_path)}`);
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to get download URL');
      }
      
      // Fetch the PDF and trigger download
      const pdfRes = await fetch(data.signedUrl);
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download document: ' + err.message);
    }
  };

  const previewDocument = async (doc) => {
    try {
      // Use server-side API to generate signed URL (avoids client-side permission issues)
      const res = await fetch(`/api/documents/preview?path=${encodeURIComponent(doc.file_path)}`);
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to get preview URL');
      }
      
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error('Preview error:', err);
      alert('Failed to preview document: ' + err.message);
    }
  };

  const deleteDocument = async (doc) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
      });
      
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to delete');
      }
      
      // Update local state
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete document: ' + err.message);
    }
  };

  // Filter documents
  const filteredDocs = documents.filter(doc => {
    const matchesEvent = selectedEventId === null || doc.event_id === selectedEventId;
    const matchesSearch = !search || 
      doc.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      doc.client_company?.toLowerCase().includes(search.toLowerCase()) ||
      doc.file_name?.toLowerCase().includes(search.toLowerCase());
    return matchesEvent && matchesSearch;
  });

  // Count documents per event
  const getEventDocCount = (eventId) => {
    return documents.filter(d => d.event_id === eventId).length;
  };

  const noEventDocs = documents.filter(d => !d.event_id).length;

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.lovelabBg,
      fontFamily: fonts.body,
    }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        borderBottom: `1px solid ${colors.lineGray}`,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/logo.png" alt="LoveLab" style={{ height: 40 }} />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>
            Documents
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${colors.inkPlum}`,
              background: '#fff',
              color: colors.inkPlum,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: fonts.body,
            }}
          >
            ← Back to App
          </button>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: colors.inkPlum,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
          }}>
            {(profile?.full_name || user?.email || '?')[0].toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto', padding: 20, gap: 24 }}>
        {/* Sidebar - Events */}
        <div style={{
          width: 260,
          flexShrink: 0,
          background: '#fff',
          borderRadius: 12,
          border: `1px solid ${colors.lineGray}`,
          padding: 16,
          height: 'fit-content',
          position: 'sticky',
          top: 80,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: colors.charcoal, margin: 0 }}>
              Events / Fairs
            </h2>
            <button
              onClick={() => setShowNewEvent(true)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.inkPlum,
                fontSize: 18,
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
              title="Create new event"
            >
              +
            </button>
          </div>

          {showNewEvent && (
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="Event name..."
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: `1px solid ${colors.lineGray}`,
                  fontSize: 12,
                  fontFamily: fonts.body,
                  marginBottom: 6,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createEvent();
                  if (e.key === 'Escape') { setShowNewEvent(false); setNewEventName(''); }
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={createEvent}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: colors.inkPlum,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowNewEvent(false); setNewEventName(''); }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${colors.lineGray}`,
                    background: '#fff',
                    color: '#666',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* All documents */}
          <button
            onClick={() => setSelectedEventId(null)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: 'none',
              background: selectedEventId === null ? colors.ice : 'transparent',
              color: selectedEventId === null ? colors.inkPlum : colors.charcoal,
              fontSize: 13,
              fontWeight: selectedEventId === null ? 600 : 400,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: fonts.body,
              marginBottom: 4,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>All Documents</span>
            <span style={{ fontSize: 11, color: colors.lovelabMuted }}>{documents.length}</span>
          </button>

          {/* Event list */}
          {events.map(event => (
            <button
              key={event.id}
              onClick={() => setSelectedEventId(event.id)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                background: selectedEventId === event.id ? colors.ice : 'transparent',
                color: selectedEventId === event.id ? colors.inkPlum : colors.charcoal,
                fontSize: 13,
                fontWeight: selectedEventId === event.id ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: fonts.body,
                marginBottom: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {event.name}
              </span>
              <span style={{ fontSize: 11, color: colors.lovelabMuted, flexShrink: 0, marginLeft: 8 }}>
                {getEventDocCount(event.id)}
              </span>
            </button>
          ))}

          {/* No event folder */}
          {noEventDocs > 0 && (
            <button
              onClick={() => setSelectedEventId('none')}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                background: selectedEventId === 'none' ? colors.ice : 'transparent',
                color: selectedEventId === 'none' ? colors.inkPlum : colors.lovelabMuted,
                fontSize: 12,
                fontWeight: selectedEventId === 'none' ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: fonts.body,
                marginTop: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontStyle: 'italic',
              }}
            >
              <span>No event</span>
              <span style={{ fontSize: 11 }}>{noEventDocs}</span>
            </button>
          )}
        </div>

        {/* Main content - Documents */}
        <div style={{ flex: 1 }}>
          {/* Search bar */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client name or company..."
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                border: `1px solid ${colors.lineGray}`,
                fontSize: 14,
                fontFamily: fonts.body,
                background: '#fff',
              }}
            />
          </div>

          {/* Documents list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: colors.lovelabMuted }}>
              Loading...
            </div>
          ) : filteredDocs.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 60,
              background: '#fff',
              borderRadius: 12,
              border: `1px solid ${colors.lineGray}`,
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: colors.charcoal, marginBottom: 4 }}>
                No documents yet
              </div>
              <div style={{ fontSize: 13, color: colors.lovelabMuted }}>
                {search ? 'No documents match your search' : 'Save an order to see it here'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredDocs.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    background: '#fff',
                    borderRadius: 10,
                    border: `1px solid ${colors.lineGray}`,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: doc.document_type === 'order' ? colors.ice : '#f0f9ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}>
                    {doc.document_type === 'order' ? '📋' : '📄'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: colors.charcoal,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {doc.client_company || doc.client_name || 'Unknown'}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: colors.lovelabMuted,
                      marginTop: 2,
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: doc.document_type === 'order' ? '#e8f4ea' : '#e8f0ff',
                        color: doc.document_type === 'order' ? '#2d6a4f' : '#1e40af',
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}>
                        {doc.document_type}
                      </span>
                      {doc.total_amount && (
                        <span style={{ fontWeight: 600, color: colors.inkPlum }}>
                          {fmt(doc.total_amount)}
                        </span>
                      )}
                      <span>
                        {new Date(doc.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      {doc.events?.name && (
                        <span style={{ color: colors.luxeGold }}>
                          📍 {doc.events.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => previewDocument(doc)}
                      title="Preview"
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: `1px solid ${colors.lineGray}`,
                        background: '#fff',
                        color: colors.charcoal,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: fonts.body,
                      }}
                    >
                      👁 View
                    </button>
                    <button
                      onClick={() => downloadDocument(doc)}
                      title="Download"
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: colors.inkPlum,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: fonts.body,
                      }}
                    >
                      ↓ Download
                    </button>
                    <button
                      onClick={() => deleteDocument(doc)}
                      title="Delete"
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: `1px solid #fecaca`,
                        background: '#fef2f2',
                        color: '#dc2626',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: fonts.body,
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

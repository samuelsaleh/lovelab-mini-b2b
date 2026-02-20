'use client';

import { useState, useEffect, useRef } from 'react';
import { generatePDF, formatDocumentFilename } from '@/lib/pdf';
import { colors, fonts } from '@/lib/styles';
import { useIsMobile } from '@/lib/useIsMobile';

export default function SaveDocumentModal({
  isOpen,
  onClose,
  documentType, // 'quote' or 'order'
  elementRef, // ref to the element to capture as PDF
  clientName,
  clientCompany,
  totalAmount,
  eventName: defaultEventName = '',
  onBeforePrint,
  onAfterPrint,
  metadata = {},
}) {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const closeTimerRef = useRef(null);

  // Clean up timeout on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Fetch events on mount
  useEffect(() => {
    if (isOpen) {
      fetchEvents();
      setSuccess(false);
      setError(null);
      // Pre-fill new event name if provided
      if (defaultEventName && !selectedEventId) {
        setNewEventName(defaultEventName);
      }
    }
  }, [isOpen]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('/api/events', { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load events');
      }
      if (data.events) {
        setEvents(data.events);
        // Try to auto-select matching event by name
        if (defaultEventName && !selectedEventId) {
          const matchingEvent = data.events.find(e => 
            e.name.toLowerCase().includes(defaultEventName.toLowerCase()) ||
            defaultEventName.toLowerCase().includes(e.name.toLowerCase())
          );
          if (matchingEvent) {
            setSelectedEventId(matchingEvent.id);
          } else if (data.events.length > 0) {
            setSelectedEventId(data.events[0].id);
          }
        } else if (data.events.length > 0 && !selectedEventId) {
          setSelectedEventId(data.events[0].id);
        }
      }
    } catch (err) {
      setError(err?.message || 'Failed to load events');
    }
    setLoading(false);
  };

  const createEvent = async () => {
    if (!newEventName.trim()) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEventName.trim() }),
      });
      const data = await res.json();
      if (data.event) {
        setEvents(prev => [data.event, ...prev]);
        setSelectedEventId(data.event.id);
        setNewEventName('');
        setShowNewEvent(false);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to create event');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!elementRef?.current) {
      setError('Nothing to save - element not found');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Switch to print layout (hide empty rows, show summary on last page)
      if (onBeforePrint) {
        await onBeforePrint();
      }

      // Extra delay so the browser fully paints the updated DOM before capture
      await new Promise(r => setTimeout(r, 500));

      // Generate PDF (auto-adjust quality if file is too large for upload)
      const baseFilename = formatDocumentFilename(clientCompany, documentType, new Date().toISOString().split('T')[0]);
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filename = `${baseFilename}_${uniqueSuffix}`;
      
      let pdfBlob;
      try {
        const MAX_UPLOAD_BYTES = 24 * 1024 * 1024; // Keep under 25MB request cap
        const profiles = [
          { scale: 1.6, quality: 0.92 }, // best quality
          { scale: 1.35, quality: 0.86 }, // balanced
          { scale: 1.15, quality: 0.8 }, // aggressive fallback
        ];

        for (let i = 0; i < profiles.length; i++) {
          const cfg = profiles[i];
          pdfBlob = await generatePDF(elementRef.current, filename, {
            orientation: 'landscape',
            scale: cfg.scale,
            quality: cfg.quality,
          });

          if (pdfBlob.size <= MAX_UPLOAD_BYTES) break;
        }

        if (!pdfBlob || pdfBlob.size > MAX_UPLOAD_BYTES) {
          const mb = pdfBlob ? (pdfBlob.size / (1024 * 1024)).toFixed(1) : 'unknown';
          throw new Error(`PDF too large to upload (${mb} MB). Please reduce rows or split into multiple orders.`);
        }
      } catch (pdfError) {
        throw new Error('Failed to generate PDF: ' + pdfError.message);
      } finally {
        // Restore interactive layout
        if (onAfterPrint) {
          onAfterPrint();
        }
      }

      // Upload to Supabase Storage via server-side API (with retry)
      const folder = selectedEventId && selectedEventId.trim() !== '' ? selectedEventId : 'no-event';
      const filePath = `${folder}/${filename}.pdf`;
      
      const maxRetries = 3;
      let uploadResult = null;
      let uploadRes = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const formData = new FormData();
          formData.append('file', pdfBlob, `${filename}.pdf`);
          formData.append('filePath', filePath);
          
          uploadRes = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData,
          });
          
          uploadResult = await uploadRes.json();
          
          if (uploadRes.ok && !uploadResult.error) {
            break; // Success
          }
          
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1000));
          }
        } catch (fetchErr) {
          if (attempt === maxRetries) {
            throw new Error('Upload failed after ' + maxRetries + ' attempts: ' + fetchErr.message);
          }
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      if (!uploadRes?.ok || uploadResult?.error) {
        throw new Error('Upload failed: ' + (uploadResult?.error || 'Unknown error'));
      }

      // Save document metadata
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: selectedEventId || null,
          client_name: clientName || 'Unknown',
          client_company: clientCompany || null,
          document_type: documentType,
          file_path: uploadResult.filePath,
          file_name: `${filename}.pdf`,
          file_size: pdfBlob.size,
          total_amount: totalAmount || null,
          metadata,
        }),
      });

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setSuccess(true);
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to save document');
    }
    setSaving(false);
  };

  const mobile = useIsMobile();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={documentType === 'order' ? 'Save order' : 'Save quote'}
      onKeyDown={(e) => { if (e.key === 'Escape' && !saving) onClose() }}
      style={{
      position: 'fixed',
      inset: 0,
      zIndex: 400,
      display: 'flex',
      alignItems: mobile ? 'flex-end' : 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: mobile ? '16px 16px 0 0' : 16,
        padding: mobile ? 16 : 24,
        width: '100%',
        maxWidth: mobile ? '100%' : 400,
        maxHeight: mobile ? '90vh' : 'auto',
        overflowY: 'auto',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{
          fontSize: 18,
          fontWeight: 700,
          color: colors.inkPlum,
          marginBottom: 16,
          fontFamily: fonts.body,
        }}>
          Save {documentType === 'quote' ? 'Quote' : 'Order'}
        </h2>

        {success ? (
          <div style={{
            textAlign: 'center',
            padding: '32px 0',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#27ae60' }}>
              Document saved successfully!
            </div>
          </div>
        ) : (
          <>
            {/* Client info preview */}
            <div style={{
              background: colors.ice,
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              fontSize: 12,
            }}>
              <div style={{ fontWeight: 600, color: colors.charcoal }}>
                {clientCompany || clientName || 'Unknown client'}
              </div>
              {clientName && clientCompany && (
                <div style={{ color: colors.lovelabMuted, marginTop: 2 }}>
                  {clientName}
                </div>
              )}
              {totalAmount && (
                <div style={{ color: colors.inkPlum, fontWeight: 700, marginTop: 4 }}>
                  €{typeof totalAmount === 'number' ? totalAmount.toFixed(2) : totalAmount}
                </div>
              )}
            </div>

            {/* Event selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                color: colors.lovelabMuted,
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Select Event / Folder
              </label>
              
              {loading ? (
                <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>Loading events...</div>
              ) : (
                <>
                  <select
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${colors.lineGray}`,
                      fontSize: 13,
                      fontFamily: fonts.body,
                      color: colors.charcoal,
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">No event (general folder)</option>
                    {events.map(event => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>

                  {!showNewEvent ? (
                    <button
                      onClick={() => setShowNewEvent(true)}
                      style={{
                        marginTop: 8,
                        background: 'none',
                        border: 'none',
                        color: colors.inkPlum,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: fonts.body,
                        padding: 0,
                      }}
                    >
                      + Create new event
                    </button>
                  ) : (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        value={newEventName}
                        onChange={(e) => setNewEventName(e.target.value)}
                        placeholder="Event name (e.g. Munich Feb 2026)"
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: `1px solid ${colors.lineGray}`,
                          fontSize: 12,
                          fontFamily: fonts.body,
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') createEvent();
                          if (e.key === 'Escape') setShowNewEvent(false);
                        }}
                        autoFocus
                      />
                      <button
                        onClick={createEvent}
                        disabled={!newEventName.trim() || loading}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: colors.inkPlum,
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: newEventName.trim() && !loading ? 'pointer' : 'not-allowed',
                          opacity: newEventName.trim() && !loading ? 1 : 0.5,
                        }}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setShowNewEvent(false); setNewEventName(''); }}
                        style={{
                          padding: '8px 10px',
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
                  )}
                </>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div style={{
                background: '#fee2e2',
                color: '#dc2626',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: mobile ? 'column-reverse' : 'row', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                disabled={saving}
                style={{
                  padding: mobile ? '12px 20px' : '10px 20px',
                  borderRadius: 8,
                  border: `1px solid ${colors.lineGray}`,
                  background: '#fff',
                  color: colors.charcoal,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: fonts.body,
                  minHeight: mobile ? 48 : 'auto',
                  width: mobile ? '100%' : 'auto',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: mobile ? '12px 24px' : '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: colors.inkPlum,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: fonts.body,
                  opacity: saving ? 0.7 : 1,
                  minHeight: mobile ? 48 : 'auto',
                  width: mobile ? '100%' : 'auto',
                }}
              >
                {saving ? 'Saving...' : 'Save Document'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

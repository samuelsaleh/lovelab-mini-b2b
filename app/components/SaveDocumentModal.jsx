'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { generatePDF, formatDocumentFilename } from '@/lib/pdf';
import { colors, fonts } from '@/lib/styles';
import { useIsMobile } from '@/lib/useIsMobile';
import { useI18n } from '@/lib/i18n';
import { getClientOrderLocale, clientOrderEmail, stripCompanyPrefix } from '@/lib/email-templates';
import { useAuth } from './AuthProvider';
import ConsignmentRecipientForm from './ConsignmentRecipientForm';

const EMAIL_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Safe JSON parser that gracefully handles non-JSON server responses.
// When the API returns plain text like "Internal Server Error", we surface a
// clean error instead of crashing with "Unexpected token 'I'... is not valid JSON".
async function safeJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const snippet = (text || '').slice(0, 140).trim();
    return { error: snippet || `HTTP ${res.status}` };
  }
}

// Per-channel UI config — drives all conditional rendering in the modal.
// Adding a new channel: add one entry here; no inline ternaries needed elsewhere.
const CHANNEL_CONFIG = {
  b2b: { showEvent: true, showConsignment: false, showComment: false, autoClientName: null },
  internal: { showEvent: false, showConsignment: false, showComment: false, autoClientName: 'Antwerp Office' },
  consignment: { showEvent: false, showConsignment: true, showComment: false, autoClientName: null },
  delete_from_stock: { showEvent: false, showConsignment: false, showComment: true, autoClientName: 'Write-off' },
}

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
  editingDocumentId = null, // ID of document being re-edited (for replacement)
  onSaveSuccess = null, // Callback when save completes successfully
  initialOrderChannel = 'b2b', // 'b2b' | 'internal' | 'consignment' | 'delete_from_stock'
  clientEmail = '', // Pre-filled recipient when emailing the client directly
  // Soft warning: if the parent OrderForm thinks some rows are incomplete,
  // we surface the same summary at the top of the modal so the agent sees
  // exactly what's missing before they hit Save. Saving is NOT blocked —
  // Sam asked for the override in May 2026 because some rows have
  // optional closure / size that the validator over-flags.
  orderIncomplete = false,
  incompleteSummary = '',
}) {
  const { profile } = useAuth();
  const { t, lang: appLang } = useI18n();
  const isAdmin = profile?.role === 'admin';

  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [newEventType, setNewEventType] = useState('fair');
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  // orderChannel: 'b2b' | 'internal' | 'consignment' | 'delete_from_stock'
  const [orderChannel, setOrderChannel] = useState('b2b');
  const [consignmentData, setConsignmentData] = useState(null);
  const [writeOffComment, setWriteOffComment] = useState('');
  const closeTimerRef = useRef(null);

  // ─── Email-to-client state (admin-only) ───
  // Catalogue is always attached on the API side; CC always goes to Alberto's
  // inbox — both are non-toggleable in the UI.
  const initialEmailLang = EMAIL_LANGUAGES.some(l => l.code === appLang) ? appLang : 'en';
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailLang, setEmailLang] = useState(initialEmailLang);
  const [emailStatus, setEmailStatus] = useState(null); // { kind: 'sent'|'failed'|'skipped', message }
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  // Per-field overrides for the email template. Undefined = use the localised
  // default. We keep the shape flat so resetting is just `setEmailOverrides({})`.
  const [emailOverrides, setEmailOverrides] = useState({});

  // Clean up timeout on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Fetch events on mount / initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedEventId('');
      setShowNewEvent(false);
      setSuccess(false);
      setError(null);
      setOrderChannel(initialOrderChannel || 'b2b');
      setWriteOffComment(metadata?.writeOffComment || '');
      // Pre-fill consignment data from existing metadata when re-editing
      const existingConsignment = metadata?.consignment;
      setConsignmentData(existingConsignment
        ? {
          recipient_type: existingConsignment.recipient_type || 'agent',
          agent_id: existingConsignment.agent_id || null,
          contact_id: existingConsignment.contact_id || null,
          saveAsContact: false,
          recipient_name: existingConsignment.recipient_name || '',
          recipient_company: existingConsignment.recipient_company || '',
          recipient_phone: existingConsignment.recipient_phone || '',
          recipient_email: existingConsignment.recipient_email || '',
          recipient_address: existingConsignment.recipient_address || '',
          return_date: existingConsignment.return_date || '',
        }
        : null
      );
      // Pre-fill new event name if provided
      if (defaultEventName) {
        setNewEventName(defaultEventName);
      }
      // Email block — reset every time the modal opens
      setEmailEnabled(false);
      setRecipientEmail((clientEmail || '').trim());
      setEmailLang(initialEmailLang);
      setEmailStatus(null);
      setShowEmailPreview(false);
      setEmailOverrides({});
      // Only fetch events for B2B orders — other channels don't use the event selector
      if ((initialOrderChannel || 'b2b') === 'b2b') {
        fetchEvents();
      }
    }
  }, [isOpen, initialOrderChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEvents = async () => {
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s — generous for slow connections
    try {
      const [eventsRes, agentsRes] = await Promise.all([
        fetch('/api/events', { signal: controller.signal }),
        fetch('/api/agents?summary=true', { signal: controller.signal }).catch(() => null),
      ]);
      const data = await eventsRes.json();
      if (!eventsRes.ok) throw new Error(data?.error || 'Failed to load events');

      let allEvents = data.events || [];

      // Auto-create missing agent folders so new agents always appear in the picker.
      //
      // We dedup by BOTH name AND organization_id so an agent whose folder
      // exists under a different display name (e.g. "CORINNE SECRET CODE
      // PARIS" while profile.full_name is "Corinne Ruimy") isn't re-created
      // every time the modal opens. Pre-Phase 21 we deduped by name only,
      // which produced the "Corinne Ruimy AND CORINNE SECRET CODE PARIS in
      // the dropdown" duplicate.
      //
      // We ALSO pass organization_id when creating, so Tier 2 commission
      // attribution (lib/commissionAttribution.js) finds the agent for any
      // future order saved into this folder.
      if (isAdmin && agentsRes?.ok) {
        const agentsData = await agentsRes.json();
        const activeAgents = (agentsData.agents || []).filter(
          a => a.agent_status === 'active' || a.agent_status === 'invited'
        );
        const agentEvents = allEvents.filter(e => e.type === 'agent');
        const existingAgentNames = new Set(
          agentEvents.map(e => (e.name || '').toLowerCase().trim())
        );
        const existingAgentOrgs = new Set(
          agentEvents.map(e => e.organization_id).filter(Boolean)
        );
        const missing = activeAgents.filter(a => {
          if (!a.full_name) return false;
          const nameKey = a.full_name.toLowerCase().trim();
          if (existingAgentNames.has(nameKey)) return false;
          if (a.organization_id && existingAgentOrgs.has(a.organization_id)) return false;
          return true;
        });
        if (missing.length > 0) {
          const created = await Promise.all(
            missing.map(a =>
              fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: a.full_name,
                  type: 'agent',
                  organization_id: a.organization_id || undefined,
                }),
              })
                .then(r => r.ok ? r.json() : null)
                .then(d => d?.event || null)
                .catch(() => null)
            )
          );
          allEvents = [...allEvents, ...created.filter(Boolean)];
        }
      }

      setEvents(allEvents);
      // Try to auto-select matching event by name
      if (defaultEventName && !selectedEventId) {
        const matchingEvent = allEvents.find(e =>
          e.name.toLowerCase().includes(defaultEventName.toLowerCase()) ||
          defaultEventName.toLowerCase().includes(e.name.toLowerCase())
        );
        if (matchingEvent) {
          setSelectedEventId(matchingEvent.id);
        } else if (allEvents.length > 0) {
          setSelectedEventId(allEvents[0].id);
        }
      } else if (allEvents.length > 0 && !selectedEventId) {
        setSelectedEventId(allEvents[0].id);
      }
    } catch (err) {
      const msg = err?.name === 'AbortError'
        ? 'Loading timed out — check your connection and try again.'
        : (err?.message || 'Failed to load events');
      setError(msg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const createEvent = async () => {
    if (!newEventName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newEventName.trim(), type: newEventType }),
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

      // Upload to Supabase Storage via server-side API (with retry + timeout)
      const folder = selectedEventId && selectedEventId.trim() !== '' ? selectedEventId : 'no-event';
      const filePath = `${folder}/${filename}.pdf`;

      const maxRetries = 2;
      let uploadResult = null;
      let uploadRes = null;
      // open
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s hard timeout
        try {
          const formData = new FormData();
          formData.append('file', pdfBlob, `${filename}.pdf`);
          formData.append('filePath', filePath);

          uploadRes = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });

          uploadResult = await safeJson(uploadRes);

          if (uploadRes.ok && !uploadResult.error) {
            break; // Success
          }

          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1500));
          }
        } catch (fetchErr) {
          const isTimeout = fetchErr.name === 'AbortError';
          if (attempt === maxRetries) {
            throw new Error(isTimeout
              ? 'Upload timed out — check your internet connection and try again.'
              : 'Upload failed: ' + fetchErr.message);
          }
          await new Promise(r => setTimeout(r, 1500));
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (!uploadRes?.ok || uploadResult?.error) {
        throw new Error('Upload failed: ' + (uploadResult?.error || 'Unknown error'));
      }

      // If consignment + saveAsContact: create the contact first to get a contact_id
      let resolvedContactId = consignmentData?.contact_id || null;
      if (orderChannel === 'consignment' && consignmentData?.saveAsContact && consignmentData?.recipient_name) {
        try {
          const contactRes = await fetch('/api/consignment-contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              full_name: consignmentData.recipient_name,
              company: consignmentData.recipient_company || null,
              phone: consignmentData.recipient_phone || null,
              email: consignmentData.recipient_email || null,
              address: consignmentData.recipient_address || null,
            }),
          });
          const contactData = await contactRes.json();
          if (contactData.contact?.id) resolvedContactId = contactData.contact.id;
        } catch { /* non-blocking — contact save failure doesn't block the document save */ }
      }

      // Build consignment metadata block
      const consignmentMeta = orderChannel === 'consignment' ? {
        recipient_type: consignmentData?.recipient_type || 'contact',
        contact_id: resolvedContactId,
        recipient_name: consignmentData?.recipient_name || '',
        recipient_company: consignmentData?.recipient_company || '',
        recipient_phone: consignmentData?.recipient_phone || '',
        recipient_email: consignmentData?.recipient_email || '',
        recipient_address: consignmentData?.recipient_address || '',
        return_date: consignmentData?.return_date || null,
        returned_at: metadata?.consignment?.returned_at || null,
      } : undefined;

      // Resolve client_name for display — use channel auto-name when set
      const channelCfg = CHANNEL_CONFIG[orderChannel] || CHANNEL_CONFIG.b2b
      const resolvedClientName = channelCfg.autoClientName
        ? channelCfg.autoClientName
        : orderChannel === 'consignment'
          ? (consignmentData?.recipient_name || consignmentData?.recipient_company || 'Consignment Order')
          : (clientName || 'Unknown');

      // Save document metadata (update if re-editing, create if new)
      const isUpdate = !!editingDocumentId;
      const apiUrl = isUpdate ? `/api/documents/${editingDocumentId}` : '/api/documents';
      const res = await fetch(apiUrl, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: (CHANNEL_CONFIG[orderChannel] || CHANNEL_CONFIG.b2b).showEvent ? (selectedEventId || null) : null,
          client_name: resolvedClientName,
          client_company: clientCompany || null,
          document_type: documentType,
          // open
          file_path: uploadResult.filePath,
          file_name: `${filename}.pdf`,
          file_size: pdfBlob.size,
          total_amount: totalAmount || null,
          metadata: {
            ...metadata,
            ...(consignmentMeta ? { consignment: consignmentMeta } : {}),
            ...(orderChannel === 'delete_from_stock' ? { writeOffComment: writeOffComment.trim() } : {}),
          },
          order_channel: orderChannel,
          consignment_agent_id: orderChannel === 'consignment' && consignmentData?.recipient_type === 'agent'
            ? (consignmentData?.agent_id || null)
            : null,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || `Save failed (HTTP ${res.status})`);
      }

      // ─── Send email to client (non-blocking, only when user opted in) ───
      // We always show the save as successful even if the email leg fails;
      // the email error surfaces as a small warning under the success message.
      const savedDoc = data.document || null;
      if (emailEnabled) {
        const trimmedTo = (recipientEmail || '').trim();
        if (!savedDoc?.id) {
          setEmailStatus({ kind: 'failed', message: 'Document ID missing — could not send email.' });
        } else if (!trimmedTo || !EMAIL_RE.test(trimmedTo)) {
          setEmailStatus({ kind: 'skipped', message: t('email.invalidRecipient') });
        } else {
          try {
            // Strip company prefix on the way out so the API + the live
            // preview agree on what greeting the client sees. The route
            // applies the same helper as a defense-in-depth backstop.
            const greetingName = stripCompanyPrefix(clientName || '', clientCompany);
            const sendRes = await fetch('/api/documents/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                documentId: savedDoc.id,
                to: trimmedTo,
                lang: emailLang,
                contactName: greetingName,
                // Send the resolved final values (defaults merged with any
                // edits) so the client receives exactly what's in the preview.
                subject: emailFinal.subject,
                greeting: emailFinal.greeting,
                bodyText: emailFinal.body,
                questions: emailFinal.questions,
                signoff: emailFinal.signoff,
                driveIntro: emailFinal.driveIntro,
                driveLabel: emailFinal.driveLabel,
              }),
            });
            const sendData = await safeJson(sendRes);
            if (!sendRes.ok || sendData?.error) {
              setEmailStatus({
                kind: 'failed',
                message: t('email.failed', { reason: sendData?.error || `HTTP ${sendRes.status}` }),
              });
            } else {
              setEmailStatus({ kind: 'sent', message: t('email.sent', { to: trimmedTo }) });
            }
          } catch (emailErr) {
            setEmailStatus({
              kind: 'failed',
              message: t('email.failed', { reason: emailErr?.message || 'network error' }),
            });
          }
        }
      }

      setSuccess(true);
      if (onSaveSuccess) onSaveSuccess();
      // Keep the success view open longer when an email was sent so the user
      // sees the confirmation banner before the modal auto-closes.
      const closeDelay = emailEnabled ? 2500 : 1500;
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, closeDelay);
    } catch (err) {
      setError(err.message || 'Failed to save document');
    }
    setSaving(false);
  };

  const mobile = useIsMobile();

  // ─── Localised defaults for every editable email field ───
  // Keep these as plain strings (no JSX) so we can feed them straight back into
  // both the editable inputs and the live HTML preview without any conversion.
  // The greeting name is run through stripCompanyPrefix so the preview shows
  // the same "Cher Marie Schultz," as the email actually sent — never the
  // accidental "Cher Oxygene Marie Schultz," when the contact field has the
  // company name prepended.
  const emailDefaults = useMemo(() => {
    const L = getClientOrderLocale(emailLang);
    const name = stripCompanyPrefix((clientName || '').trim(), clientCompany);
    return {
      subject: L.subject({ name }),
      greeting: L.greeting({ name }),
      body: L.body,
      questions: L.questions,
      driveIntro: L.driveIntro,
      driveLabel: L.driveLabel,
      signoff: L.signoff,
    };
  }, [emailLang, clientName, clientCompany]);

  // Resolve the final value for each field: explicit override wins, else default.
  // Stored as the source of truth for both the form inputs AND the API payload,
  // so what the user sees in the preview is exactly what gets sent.
  const emailFinal = useMemo(() => {
    const out = { ...emailDefaults };
    for (const key of Object.keys(out)) {
      if (typeof emailOverrides[key] === 'string') out[key] = emailOverrides[key];
    }
    return out;
  }, [emailDefaults, emailOverrides]);

  // Render the actual email HTML the same way the API will, so the in-modal
  // preview is byte-for-byte identical to what the client receives. The Alberto
  // signature block is hardcoded inside `clientOrderEmail` — no sender name or
  // company is passed in. contactName is stripped of the company prefix so the
  // greeting matches what the route will compute server-side.
  const livePreviewHtml = useMemo(() => {
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const { html } = clientOrderEmail({
      contactName: stripCompanyPrefix(clientName || '', clientCompany),
      lang: emailLang,
      overrides: emailFinal,
    }, siteUrl);
    return html;
  }, [clientName, clientCompany, emailLang, emailFinal]);

  // When the user switches language, drop their custom edits so they see the
  // fresh localised defaults. They can still re-customise on top of those.
  useEffect(() => {
    setEmailOverrides({});
  }, [emailLang]);

  // Generic input handler for the override map.
  const updateEmailOverride = (key, value) => {
    setEmailOverrides(prev => ({ ...prev, [key]: value }));
  };

  // ─── Validation for the recipient field ───
  const recipientLooksValid =
    !emailEnabled || EMAIL_RE.test((recipientEmail || '').trim());

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
        // The editable email block needs ~640px to comfortably fit the preview
        // pane next to the form. Below that we collapse back to the standard
        // narrow modal so other channels keep their compact UI.
        maxWidth: mobile ? '100%' : (emailEnabled && showEmailPreview ? 720 : 480),
        maxHeight: mobile ? '90vh' : '90vh',
        overflowY: 'auto',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        transition: 'max-width .15s ease',
      }}>
        <h2 style={{
          fontSize: 18,
          fontWeight: 700,
          color: colors.inkPlum,
          marginBottom: 16,
          fontFamily: fonts.body,
        }}>
          {editingDocumentId ? 'Update' : 'Save'} {documentType === 'quote' ? 'Quote' : orderChannel === 'consignment' ? 'Consignment Order' : 'Order'}
        </h2>

        {success ? (
          <div style={{
            textAlign: 'center',
            padding: '32px 0',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#27ae60' }}>
              Document {editingDocumentId ? 'updated' : 'saved'} successfully!
            </div>
            {emailStatus && (
              <div style={{
                marginTop: 16,
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                background: emailStatus.kind === 'sent' ? '#ecfdf5' : emailStatus.kind === 'failed' ? '#fef2f2' : '#fffbeb',
                color: emailStatus.kind === 'sent' ? '#047857' : emailStatus.kind === 'failed' ? '#b91c1c' : '#92400e',
                border: `1px solid ${emailStatus.kind === 'sent' ? '#a7f3d0' : emailStatus.kind === 'failed' ? '#fecaca' : '#fde68a'}`,
                textAlign: 'left',
              }}>
                {emailStatus.message}
              </div>
            )}
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
                {(CHANNEL_CONFIG[orderChannel] || CHANNEL_CONFIG.b2b).autoClientName
                  ? (CHANNEL_CONFIG[orderChannel] || CHANNEL_CONFIG.b2b).autoClientName
                  : orderChannel === 'consignment'
                    ? (consignmentData?.recipient_name || consignmentData?.recipient_company || 'Consignment Order')
                    : (clientCompany || clientName || 'Unknown client')}
              </div>
              {orderChannel === 'b2b' && clientName && clientCompany && (
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

            {/* Order channel selector — admin + order type only */}
            {isAdmin && documentType === 'order' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Order type
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(CHANNEL_CONFIG).map(([id, cfg]) => {
                    const labels = { b2b: 'B2B', internal: 'Internal', consignment: 'Consignment', delete_from_stock: 'Write-off' }
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setOrderChannel(id)
                          if (id === 'b2b' && events.length === 0) fetchEvents()
                        }}
                        style={{
                          flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', fontFamily: fonts.body,
                          border: orderChannel === id ? `1.5px solid ${colors.inkPlum}` : `1px solid ${colors.lineGray}`,
                          background: orderChannel === id ? `${colors.inkPlum}10` : '#fafafa',
                          color: orderChannel === id ? colors.inkPlum : '#666',
                        }}
                      >
                        {labels[id]}
                      </button>
                    )
                  })}
                </div>
                {orderChannel === 'internal' && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 5 }}>Not counted in revenue or analytics. Saved as Antwerp Office order.</div>
                )}
                {orderChannel === 'consignment' && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 5 }}>Goods sent on consignment — tracked separately, not revenue.</div>
                )}
                {orderChannel === 'delete_from_stock' && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 5 }}>Removes items from stock — for gifted or lost goods. No revenue recorded.</div>
                )}
              </div>
            )}

            {/* Consignment recipient form */}
            {(CHANNEL_CONFIG[orderChannel] || CHANNEL_CONFIG.b2b).showConsignment && (
              <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: '#faf8fc', border: `1px solid ${colors.lineGray}` }}>
                <ConsignmentRecipientForm
                  value={consignmentData}
                  onChange={setConsignmentData}
                  isOpen={isOpen && orderChannel === 'consignment'}
                />
              </div>
            )}

            {/* Write-off comment — required for delete_from_stock orders */}
            {(CHANNEL_CONFIG[orderChannel] || CHANNEL_CONFIG.b2b).showComment && (
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block', fontSize: 11, fontWeight: 700,
                  color: colors.lovelabMuted, marginBottom: 6,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Reason for write-off *
                </label>
                <textarea
                  value={writeOffComment}
                  onChange={e => setWriteOffComment(e.target.value)}
                  placeholder="e.g. Gifted to influencer, Lost at fair, Damaged in transit…"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: `1px solid ${writeOffComment.trim() ? colors.lineGray : '#f87171'}`,
                    fontSize: 13, fontFamily: fonts.body, resize: 'vertical',
                    outline: 'none', boxSizing: 'border-box', color: colors.charcoal,
                  }}
                />
                {!writeOffComment.trim() && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>A reason is required to save this write-off.</div>
                )}
              </div>
            )}

            {/* Event selector — shown only for channels where showEvent is true */}
            {(CHANNEL_CONFIG[orderChannel] || CHANNEL_CONFIG.b2b).showEvent && <div style={{ marginBottom: 16 }}>
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
                    {[
                      { key: 'fair', label: 'Fairs' },
                      { key: 'agent', label: 'Agents' },
                      { key: 'partner', label: 'Partners' },
                      { key: 'other', label: 'Other' },
                    ].map(group => {
                      const groupEvents = events.filter(e => (e.type || 'other') === group.key);
                      if (groupEvents.length === 0) return null;
                      return (
                        <optgroup key={group.key} label={group.label}>
                          {groupEvents.map(event => (
                            <option key={event.id} value={event.id}>{event.name}</option>
                          ))}
                        </optgroup>
                      );
                    })}
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
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          value={newEventName}
                          onChange={(e) => setNewEventName(e.target.value)}
                          placeholder="Name (e.g. Munich Feb 2026)"
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
                        <select
                          value={newEventType}
                          onChange={(e) => setNewEventType(e.target.value)}
                          style={{
                            padding: '8px 8px',
                            borderRadius: 6,
                            border: `1px solid ${colors.lineGray}`,
                            fontSize: 11,
                            fontFamily: fonts.body,
                            background: '#fff',
                          }}
                        >
                          <option value="fair">Fair</option>
                          <option value="agent">Agent</option>
                          <option value="partner">Partner</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
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
                    </div>
                  )}
                </>
              )}
            </div>}

            {/* ─── Email to client (B2B orders, admins only) ───
                Agents and other roles never see this block; the API enforces
                the same restriction with a 403 if anyone tries to call it. */}
            {orderChannel === 'b2b' && isAdmin && (
              <div style={{
                marginBottom: 16,
                border: `1px solid ${emailEnabled ? colors.inkPlum : colors.lineGray}`,
                borderRadius: 10,
                padding: '12px 14px',
                background: emailEnabled ? '#fdfaff' : '#fafafa',
                transition: 'background .15s, border-color .15s',
              }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer', userSelect: 'none',
                }}>
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: colors.inkPlum }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, fontFamily: fonts.body }}>
                    {t('email.toggle')}
                  </span>
                </label>

                {emailEnabled && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Recipient */}
                    <div>
                      <label style={{
                        display: 'block', fontSize: 11, fontWeight: 700,
                        color: colors.lovelabMuted, marginBottom: 4,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {t('email.recipient')}
                      </label>
                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder={t('email.recipientPlaceholder')}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 6,
                          border: `1px solid ${recipientLooksValid ? colors.lineGray : '#f87171'}`,
                          fontSize: 13, fontFamily: fonts.body, outline: 'none',
                          boxSizing: 'border-box', color: colors.charcoal, background: '#fff',
                        }}
                      />
                      {!recipientLooksValid && (
                        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>
                          {t('email.invalidRecipient')}
                        </div>
                      )}
                    </div>

                    {/* Language picker */}
                    <div>
                      <label style={{
                        display: 'block', fontSize: 11, fontWeight: 700,
                        color: colors.lovelabMuted, marginBottom: 4,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {t('email.language')}
                      </label>
                      <select
                        value={emailLang}
                        onChange={(e) => setEmailLang(e.target.value)}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 6,
                          border: `1px solid ${colors.lineGray}`,
                          fontSize: 13, fontFamily: fonts.body,
                          color: colors.charcoal, background: '#fff', cursor: 'pointer',
                        }}
                      >
                        {EMAIL_LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>{l.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Static info — what's always sent, no toggles */}
                    <div style={{
                      fontSize: 11, color: colors.lovelabMuted,
                      lineHeight: 1.5, fontFamily: fonts.body,
                      padding: '8px 10px', borderRadius: 6,
                      background: '#f7f5fb', border: `1px solid ${colors.lineGray}`,
                    }}>
                      {t('email.alwaysIncluded')}
                    </div>

                    {/* Preview toggle */}
                    <button
                      type="button"
                      onClick={() => setShowEmailPreview(s => !s)}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        color: colors.inkPlum, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: fonts.body, alignSelf: 'flex-start',
                      }}
                    >
                      {showEmailPreview ? '▾' : '▸'} {t('email.preview')}
                    </button>

                    {showEmailPreview && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
                        gap: 12,
                        marginTop: 4,
                      }}>
                        {/* ── Editable form ── */}
                        <div style={{
                          background: '#fff', borderRadius: 8,
                          border: `1px solid ${colors.lineGray}`,
                          padding: '12px 12px',
                          display: 'flex', flexDirection: 'column', gap: 10,
                          minWidth: 0,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {t('email.editLabel')}
                            </div>
                            {Object.keys(emailOverrides).length > 0 && (
                              <button
                                type="button"
                                onClick={() => setEmailOverrides({})}
                                style={{
                                  background: 'none', border: 'none', padding: 0,
                                  color: colors.inkPlum, fontSize: 11, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: fonts.body,
                                }}
                              >
                                ↺ {t('email.resetDefaults')}
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: colors.lovelabMuted, marginBottom: 2 }}>
                            {t('email.editHint')}
                          </div>

                          {[
                            { key: 'subject', label: t('email.subject'), rows: 1 },
                            { key: 'greeting', label: t('email.greeting'), rows: 1 },
                            { key: 'body', label: t('email.body'), rows: 4 },
                            { key: 'questions', label: t('email.questions'), rows: 2 },
                            { key: 'driveIntro', label: t('email.driveIntro'), rows: 2 },
                            { key: 'driveLabel', label: t('email.driveLabel'), rows: 1 },
                            { key: 'signoff', label: t('email.signoff'), rows: 1 },
                          ].map(({ key, label, rows }) => (
                            <div key={key}>
                              <label style={{
                                display: 'block', fontSize: 10, fontWeight: 700,
                                color: colors.lovelabMuted, marginBottom: 3,
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                              }}>
                                {label}
                              </label>
                              {rows > 1 ? (
                                <textarea
                                  value={emailFinal[key]}
                                  onChange={(e) => updateEmailOverride(key, e.target.value)}
                                  rows={rows}
                                  style={{
                                    width: '100%', padding: '7px 9px', borderRadius: 6,
                                    border: `1px solid ${colors.lineGray}`,
                                    fontSize: 12, fontFamily: fonts.body,
                                    lineHeight: 1.45, resize: 'vertical',
                                    outline: 'none', boxSizing: 'border-box',
                                    color: colors.charcoal, background: '#fff',
                                  }}
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={emailFinal[key]}
                                  onChange={(e) => updateEmailOverride(key, e.target.value)}
                                  style={{
                                    width: '100%', padding: '7px 9px', borderRadius: 6,
                                    border: `1px solid ${colors.lineGray}`,
                                    fontSize: 12, fontFamily: fonts.body,
                                    outline: 'none', boxSizing: 'border-box',
                                    color: colors.charcoal, background: '#fff',
                                  }}
                                />
                              )}
                            </div>
                          ))}
                        </div>

                        {/* ── Rendered live preview ── */}
                        {/* Using an iframe sandboxes the email's inline styles
                            so they can't leak into the modal's layout. */}
                        <div style={{
                          background: '#f7f7fa', borderRadius: 8,
                          border: `1px solid ${colors.lineGray}`,
                          padding: 10,
                          display: 'flex', flexDirection: 'column', minWidth: 0,
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                            {t('email.previewLive')}
                          </div>
                          <div style={{ fontSize: 11, color: colors.lovelabMuted, marginBottom: 8 }}>
                            {t('email.previewSubtitle')}
                          </div>
                          <div style={{
                            background: '#fff', borderRadius: 6,
                            border: `1px solid ${colors.lineGray}`,
                            padding: '8px 10px',
                            fontSize: 12, marginBottom: 8,
                            fontFamily: fonts.body, color: colors.charcoal,
                          }}>
                            <div style={{ fontSize: 10, color: colors.lovelabMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                              {t('email.subject')}
                            </div>
                            <div style={{ fontWeight: 600 }}>{emailFinal.subject}</div>
                          </div>
                          <iframe
                            title="email-live-preview"
                            srcDoc={livePreviewHtml}
                            sandbox=""
                            style={{
                              width: '100%', minHeight: 360, height: 360,
                              border: `1px solid ${colors.lineGray}`,
                              borderRadius: 6, background: '#fff',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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

            {orderIncomplete && (
              <div role="alert" style={{
                background: '#fff7eb',
                color: '#7a4a14',
                border: '1px solid #f0c39c',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 16,
              }}>
                <strong>Some rows are incomplete.</strong>
                {incompleteSummary ? <span> {incompleteSummary}</span> : null} You can still save &mdash; or close this dialog to fill in the highlighted fields first.
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
              {(() => {
                const writeOffMissing = orderChannel === 'delete_from_stock' && !writeOffComment.trim();
                const emailMissing = emailEnabled && !recipientLooksValid;
                // `orderIncomplete` is intentionally NOT a disabling
                // condition — it's a soft warning surfaced in the banner
                // above. The remaining gates are real: a write-off needs
                // a comment, an outgoing email needs a valid recipient.
                const disabled = saving || writeOffMissing || emailMissing;
                return (
                  <button
                    onClick={handleSave}
                    disabled={disabled}
                    style={{
                      padding: mobile ? '12px 24px' : '10px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: colors.inkPlum,
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontFamily: fonts.body,
                      opacity: disabled ? 0.5 : 1,
                      minHeight: mobile ? 48 : 'auto',
                      width: mobile ? '100%' : 'auto',
                    }}
                  >
                    {saving
                      ? (emailEnabled ? t('email.sending') : (editingDocumentId ? 'Updating...' : 'Saving...'))
                      : orderChannel === 'internal'
                        ? 'Save as Internal Order'
                        : orderChannel === 'consignment'
                          ? 'Save Consignment Order'
                          : orderChannel === 'delete_from_stock'
                            ? 'Save Write-off'
                            : (editingDocumentId ? 'Update Document' : 'Save Document')}
                  </button>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

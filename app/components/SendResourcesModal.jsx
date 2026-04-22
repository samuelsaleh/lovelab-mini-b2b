'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'
import { getClientResourcesLocale, clientResourcesEmail } from '@/lib/email-templates'
import { useIsMobile } from '@/lib/useIsMobile'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Email-language picker — separate from the portal language so the admin can
// type their UI in EN but send a Dutch email to a Belgian client.
const EMAIL_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
]

export default function SendResourcesModal({ open, onClose, files, folderLabel }) {
  const { t, lang: appLang } = useI18n()
  const mobile = useIsMobile()
  const initialEmailLang = EMAIL_LANGUAGES.some(l => l.code === appLang) ? appLang : 'en'

  const [recipient, setRecipient] = useState('')
  const [contactName, setContactName] = useState('')
  const [emailLang, setEmailLang] = useState(initialEmailLang)
  // Per-field overrides — undefined means "use the localised default".
  const [overrides, setOverrides] = useState({})
  const [showPreview, setShowPreview] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)

  // Reset all transient state on close so the next open is clean.
  useEffect(() => {
    if (!open) {
      setRecipient('')
      setContactName('')
      setEmailLang(initialEmailLang)
      setOverrides({})
      setShowPreview(false)
      setSuggestions([])
      setShowSuggestions(false)
      setLoading(false)
      setError(null)
      setSuccess(null)
    }
  }, [open, initialEmailLang])

  // Wipe any custom edits when the user switches email language so they see
  // the fresh localised defaults — they can re-customise on top of those.
  useEffect(() => {
    setOverrides({})
  }, [emailLang])

  // Debounced client autocomplete on the recipient field.
  useEffect(() => {
    if (!open) return
    const value = recipient.trim()
    if (value.length < 2 || EMAIL_RE.test(value)) {
      setSuggestions([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(value)}`)
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data?.clients) ? data.clients : []
        setSuggestions(list.filter(c => c.email).slice(0, 6))
      } catch {
        // Silently disable the dropdown on network errors — the user can still
        // type a free-form email.
      }
    }, 250)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [recipient, open])

  const pickSuggestion = (client) => {
    setRecipient(client.email)
    if (!contactName && client.name) setContactName(client.name)
    setShowSuggestions(false)
    inputRef.current?.blur()
  }

  // Localised pre-filled defaults — recomputed when the email language or
  // contact name changes so "Bonjour Sophie," updates live as the admin types.
  const defaults = useMemo(() => {
    const L = getClientResourcesLocale(emailLang)
    const name = (contactName || '').trim()
    return {
      subject: L.subject({ name }),
      greeting: L.greeting({ name }),
      body: L.body,
      signoff: L.signoff,
    }
  }, [emailLang, contactName])

  // Resolve final field values: explicit user override beats default. This is
  // both what the textareas display and what gets shipped to the API, so the
  // preview is byte-identical to what the client receives.
  const finalFields = useMemo(() => {
    const out = { ...defaults }
    for (const key of Object.keys(out)) {
      if (typeof overrides[key] === 'string') out[key] = overrides[key]
    }
    return out
  }, [defaults, overrides])

  // Render the actual email HTML the same way the API will. Iframed in the
  // preview pane so its inline styles can't leak into the modal layout.
  const livePreviewHtml = useMemo(() => {
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const { html } = clientResourcesEmail({
      contactName,
      lang: emailLang,
      fileNames: (files || []).map(f => f.name),
      overrides: finalFields,
    }, siteUrl)
    return html
  }, [contactName, emailLang, files, finalFields])

  const updateOverride = (key, value) => {
    setOverrides(prev => ({ ...prev, [key]: value }))
  }

  const handleSend = async () => {
    setError(null)
    if (!Array.isArray(files) || files.length === 0) {
      setError(t('resources.noFilesSelected'))
      return
    }
    const trimmed = recipient.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setError(t('resources.invalidEmail'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/resources/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map(f => ({ name: f.name, path: f.path })),
          to: trimmed,
          contactName: contactName.trim(),
          lang: emailLang,
          // Send the resolved final values so the client gets exactly what's
          // in the live preview.
          subject: finalFields.subject,
          greeting: finalFields.greeting,
          body: finalFields.body,
          signoff: finalFields.signoff,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      setSuccess(t('resources.sentToast', { to: trimmed }))
      setTimeout(() => onClose?.(), 1500)
    } catch (err) {
      setError(t('resources.sendFailed', { reason: err?.message || 'unknown' }))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  // Expand the modal when the live preview is toggled on so the editor + iframe
  // can sit comfortably side by side.
  const modalMaxWidth = mobile ? '100%' : (showPreview ? 880 : 520)

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: mobile ? 0 : 16, fontFamily: fonts.body,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: mobile ? '14px 14px 0 0' : 14,
        width: '100%', maxWidth: modalMaxWidth,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '92vh', overflow: 'hidden',
        transition: 'max-width .15s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${colors.lineGray}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: colors.inkPlum }}>
              {t('resources.sendModalTitle')}
            </div>
            {folderLabel && (
              <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 2 }}>
                {folderLabel}
              </div>
            )}
          </div>
          <button
            onClick={() => !loading && onClose?.()}
            disabled={loading}
            style={{
              background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 22, color: colors.textLight, padding: 4, lineHeight: 1,
            }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>
          {/* Recipient with autocomplete */}
          <div style={{ marginBottom: 14, position: 'relative' }}>
            <label style={labelStyle}>{t('resources.recipient')}</label>
            <input
              ref={inputRef}
              type="text"
              value={recipient}
              onChange={(e) => { setRecipient(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder={t('resources.recipientPlaceholder')}
              disabled={loading}
              style={inputStyle}
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                marginTop: 2, zIndex: 10,
                background: '#fff', border: `1px solid ${colors.lineGray}`,
                borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                maxHeight: 220, overflowY: 'auto',
              }}>
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(c)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 12px', background: 'transparent',
                      border: 'none', cursor: 'pointer', fontFamily: fonts.body,
                      fontSize: 13, color: colors.text,
                      borderBottom: `1px solid ${colors.borderLight}`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#faf8fc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ fontWeight: 600, color: colors.inkPlum }}>
                      {c.company || c.name || c.email}
                    </div>
                    <div style={{ fontSize: 11, color: colors.textLight, marginTop: 1 }}>
                      {c.email}{c.name && c.company ? ` · ${c.name}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contact name + email language side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>{t('resources.contactName')}</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                disabled={loading}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('email.language')}</label>
              <select
                value={emailLang}
                onChange={(e) => setEmailLang(e.target.value)}
                disabled={loading}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {EMAIL_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Always-included info card — same style as SaveDocumentModal */}
          <div style={{
            fontSize: 11, color: colors.lovelabMuted,
            lineHeight: 1.5, padding: '8px 10px', borderRadius: 6,
            background: '#f7f5fb', border: `1px solid ${colors.lineGray}`,
            marginBottom: 14,
          }}>
            {t('resources.alwaysIncluded')}
          </div>

          {/* Editable email block — defaults + overrides + optional preview */}
          <div style={{
            border: `1px solid ${colors.lineGray}`, borderRadius: 10,
            padding: 14, background: '#fff', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('email.editLabel')}
              </div>
              {Object.keys(overrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => setOverrides({})}
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
            <div style={{ fontSize: 11, color: colors.lovelabMuted, marginBottom: 10 }}>
              {t('email.editHint')}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: showPreview && !mobile ? '1fr 1fr' : '1fr',
              gap: 14,
            }}>
              {/* Editable fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                {[
                  { key: 'subject', label: t('email.subject'), rows: 1 },
                  { key: 'greeting', label: t('email.greeting'), rows: 1 },
                  { key: 'body', label: t('email.body'), rows: 5 },
                  { key: 'signoff', label: t('email.signoff'), rows: 1 },
                ].map(({ key, label, rows }) => (
                  <div key={key}>
                    <label style={{ ...labelStyle, fontSize: 10, marginBottom: 3 }}>{label}</label>
                    {rows > 1 ? (
                      <textarea
                        value={finalFields[key]}
                        onChange={(e) => updateOverride(key, e.target.value)}
                        rows={rows}
                        disabled={loading}
                        style={{
                          ...inputStyle, fontSize: 12, padding: '8px 10px',
                          resize: 'vertical', minHeight: 90, lineHeight: 1.45,
                        }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={finalFields[key]}
                        onChange={(e) => updateOverride(key, e.target.value)}
                        disabled={loading}
                        style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Live preview pane (only when toggled) */}
              {showPreview && (
                <div style={{
                  background: '#f7f7fa', borderRadius: 8,
                  border: `1px solid ${colors.lineGray}`, padding: 10,
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
                    padding: '8px 10px', fontSize: 12, marginBottom: 8,
                    fontFamily: fonts.body, color: colors.charcoal,
                  }}>
                    <div style={{ fontSize: 10, color: colors.lovelabMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                      {t('email.subject')}
                    </div>
                    <div style={{ fontWeight: 600 }}>{finalFields.subject}</div>
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
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowPreview(s => !s)}
              style={{
                marginTop: 10, background: 'none', border: 'none', padding: 0,
                color: colors.inkPlum, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: fonts.body,
              }}
            >
              {showPreview ? '▾' : '▸'} {t('email.preview')}
            </button>
          </div>

          {/* Files list (read-only) */}
          <div>
            <label style={labelStyle}>{t('resources.filesToSend')}</label>
            <div style={{
              border: `1px solid ${colors.lineGray}`, borderRadius: 8,
              background: '#faf8fc', padding: '8px 12px',
            }}>
              {files?.map((f) => (
                <div key={f.path} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12, color: colors.text, padding: '4px 0',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={colors.inkPlum} strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>{f.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status messages */}
          {error && (
            <div style={{
              marginTop: 14, padding: '10px 12px',
              background: '#fee2e2', color: colors.danger,
              borderRadius: 8, fontSize: 13,
            }}>{error}</div>
          )}
          {success && (
            <div style={{
              marginTop: 14, padding: '10px 12px',
              background: '#ecfdf5', color: colors.success,
              borderRadius: 8, fontSize: 13,
            }}>{success}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', borderTop: `1px solid ${colors.lineGray}`,
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button
            onClick={() => !loading && onClose?.()}
            disabled={loading}
            style={{
              padding: '9px 18px', fontSize: 13, fontWeight: 600,
              background: '#fff', color: colors.text,
              border: `1px solid ${colors.lineGray}`, borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: fonts.body,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !!success}
            style={{
              padding: '9px 22px', fontSize: 13, fontWeight: 600,
              background: colors.inkPlum, color: '#fff',
              border: 'none', borderRadius: 8,
              cursor: (loading || success) ? 'not-allowed' : 'pointer',
              fontFamily: fonts.body, opacity: (loading || success) ? 0.7 : 1,
            }}
          >
            {loading ? t('resources.sending') : t('resources.send')}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: colors.lovelabMuted, textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: 6,
}

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13,
  border: `1.5px solid ${colors.lineGray}`, borderRadius: 8,
  outline: 'none', fontFamily: fonts.body, boxSizing: 'border-box',
  color: colors.text, background: '#fff',
}

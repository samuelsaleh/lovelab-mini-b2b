'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'

// Detects "FieldName: value" updates anywhere in Claude's response.
// The lookahead lists every label we care about so multi-field replies parse
// cleanly even when the values themselves contain colons or newlines.
const FIELD_DEFS = [
  { key: 'subject',       chatLabels: ['Subject'],        uiLabel: 'Subject',     batchKey: 'subject' },
  { key: 'headline',      chatLabels: ['Headline'],       uiLabel: 'Headline',    batchKey: 'headline' },
  { key: 'paragraph1',    chatLabels: ['Paragraph1', 'Paragraph 1'], uiLabel: 'Paragraph 1', batchKey: 'paragraph1' },
  { key: 'paragraph2',    chatLabels: ['Paragraph2', 'Paragraph 2'], uiLabel: 'Paragraph 2', batchKey: 'paragraph2' },
  { key: 'signoff',       chatLabels: ['Signoff', 'Sign-off'],       uiLabel: 'Signoff',     batchKey: 'signoff' },
  { key: 'button1_label', chatLabels: ['Button1Label', 'Button 1 Label'], uiLabel: 'Button 1 label', batchKey: 'button1_label' },
  { key: 'button1_url',   chatLabels: ['Button1URL', 'Button 1 URL'],     uiLabel: 'Button 1 URL',   batchKey: 'button1_url' },
  { key: 'button2_label', chatLabels: ['Button2Label', 'Button 2 Label'], uiLabel: 'Button 2 label', batchKey: 'button2_label' },
  { key: 'button2_url',   chatLabels: ['Button2URL', 'Button 2 URL'],     uiLabel: 'Button 2 URL',   batchKey: 'button2_url' },
]
const ALL_CHAT_LABELS = FIELD_DEFS.flatMap((f) => f.chatLabels)

function parseDraftFromAssistant(text) {
  const lookahead = ALL_CHAT_LABELS.map((l) => l.replace(/\s/g, '\\s?')).join('|')
  const out = {}
  for (const def of FIELD_DEFS) {
    for (const label of def.chatLabels) {
      const re = new RegExp(`(?:^|\\n)\\*{0,2}${label.replace(/\s/g, '\\s?')}\\*{0,2}\\s*:\\s*\\*{0,2}\\s*(.+?)(?=\\n\\s*\\*{0,2}(?:${lookahead})\\*{0,2}\\s*:|$)`, 'is')
      const m = text.match(re)
      if (m) {
        // Strip surrounding markdown emphasis and trailing whitespace.
        out[def.key] = m[1].replace(/^\*+|\*+$/g, '').trim()
        break
      }
    }
  }
  return out
}

export default function FairOutreachChatPanel({ isOpen, onClose, batch, leadCount, onApplyDraft, onSaveAsTemplate }) {
  const mobile = useIsMobile()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Load persisted history when the panel opens for this batch. This is the
  // "memory" — closing and reopening the panel keeps the conversation visible,
  // and the next message Claude sees still has the full prior context.
  useEffect(() => {
    if (!isOpen) return
    setInput('')
    if (!batch?.id) {
      setMessages([])
      return
    }
    let cancelled = false
    setLoadingHistory(true)
    fetch(`/api/fair-assistant/chat?batchId=${encodeURIComponent(batch.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const rows = (data.messages || []).map((m) => ({ role: m.role, content: m.content }))
        setMessages(rows)
        setTimeout(() => inputRef.current?.focus(), 300)
      })
      .catch(() => { if (!cancelled) setMessages([]) })
      .finally(() => { if (!cancelled) setLoadingHistory(false) })
    return () => { cancelled = true }
  }, [isOpen, batch?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/fair-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          context: { batch, leadCount },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Chat failed')
      setMessages((prev) => [...prev, { role: 'assistant', content: data.message }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, batch, leadCount])

  const handleClear = useCallback(async () => {
    if (!batch?.id) { setMessages([]); return }
    if (!window.confirm('Clear chat history for this fair? This cannot be undone.')) return
    try {
      await fetch(`/api/fair-assistant/chat?batchId=${encodeURIComponent(batch.id)}`, { method: 'DELETE' })
    } catch {}
    setMessages([])
  }, [batch?.id])

  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.content
  const parsedDraft = latestAssistant ? parseDraftFromAssistant(latestAssistant) : {}
  // Detected fields = the ones Claude actually included in its latest reply.
  // We map them by FIELD_DEFS order so the UI lists them in a sensible order
  // (Subject first, then Headline, paragraphs, signoff, buttons).
  const detectedFields = FIELD_DEFS.filter((def) => parsedDraft[def.key])
  const canApply = detectedFields.length > 0

  // Apply one specific field. We translate from our internal key -> the
  // batch column name that FairAssistantClient expects.
  const applyOne = useCallback((def) => {
    if (!parsedDraft[def.key]) return
    onApplyDraft({ [def.batchKey]: parsedDraft[def.key] })
  }, [parsedDraft, onApplyDraft])

  const applyAll = useCallback(() => {
    const patch = {}
    for (const def of detectedFields) {
      patch[def.batchKey] = parsedDraft[def.key]
    }
    if (Object.keys(patch).length) onApplyDraft(patch)
  }, [detectedFields, parsedDraft, onApplyDraft])

  const applyAllAndSaveAsTemplate = useCallback(async () => {
    applyAll()
    if (onSaveAsTemplate) await onSaveAsTemplate({ silent: true })
  }, [applyAll, onSaveAsTemplate])

  const fairLabel = batch?.fair_name || batch?.name || 'this fair'

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.3)', opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none', transition: 'opacity 0.25s' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: mobile ? '100%' : 420, zIndex: 1000,
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.3s ease',
      }}>
        <div style={{ padding: '16px 20px', background: colors.inkPlum, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontFamily: fonts.body, display: 'block' }}>Outreach Assistant</strong>
            <span style={{ fontSize: 11, opacity: 0.8, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fairLabel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                title="Clear chat history for this fair"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: fonts.body }}
              >Clear</button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {(leadCount === 0) && (
            <div style={{ padding: 12, marginBottom: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
              ⚠️ No leads in this batch yet. Claude can still help draft generic copy, but for best results upload card photos first so Claude knows who you're writing to.
            </div>
          )}
          {loadingHistory && <p style={{ fontSize: 12, color: colors.lovelabMuted }}>Loading conversation history…</p>}
          {!loadingHistory && !messages.length && (
            <p style={{ color: colors.lovelabMuted, fontSize: 13 }}>Ask Claude to draft or refine your fair follow-up email. Conversation is remembered between sessions for this fair.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12, textAlign: m.role === 'user' ? 'right' : 'left' }}>
              <div style={{
                display: 'inline-block', maxWidth: '90%', padding: '10px 12px', borderRadius: 12,
                background: m.role === 'user' ? colors.inkPlum : '#f5f5f5', color: m.role === 'user' ? '#fff' : colors.text,
                fontSize: 13, whiteSpace: 'pre-wrap', textAlign: 'left',
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && <p style={{ fontSize: 12, color: colors.lovelabMuted }}>Claude is thinking...</p>}
          <div ref={bottomRef} />
        </div>
        {canApply && (
          <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
              Claude proposed {detectedFields.length} field{detectedFields.length === 1 ? '' : 's'} — tap to apply
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detectedFields.map((def) => (
                <button
                  key={def.key}
                  onClick={() => applyOne(def)}
                  title={`Apply to ${def.uiLabel}`}
                  style={{
                    padding: '6px 10px', borderRadius: 14, border: `1px solid ${colors.inkPlum}`,
                    background: '#fff', color: colors.inkPlum, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', fontFamily: fonts.body,
                  }}
                >
                  ✓ {def.uiLabel}
                </button>
              ))}
            </div>
            <button
              onClick={applyAll}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body, fontSize: 13 }}
            >
              Apply all {detectedFields.length} change{detectedFields.length === 1 ? '' : 's'} to the form
            </button>
            <button
              onClick={applyAllAndSaveAsTemplate}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12 }}
            >
              💾 Apply & save as template for {fairLabel}
            </button>
          </div>
        )}
        <div style={{ padding: 16, borderTop: `1px solid ${colors.border}`, display: 'flex', gap: 8 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            rows={2}
            placeholder="Make it warmer, shorter, or draft a Vicenzaoro email..."
            style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, resize: 'none' }}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} style={{ padding: '0 16px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: 'pointer' }}>Send</button>
        </div>
      </div>
    </>
  )
}

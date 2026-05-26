'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'

function parseDraftFromAssistant(text) {
  const pick = (label) => {
    const re = new RegExp(`${label}:\\s*(.+?)(?=\\n(?:Subject|Headline|Paragraph1|Paragraph2|Signoff):|$)`, 'is')
    const match = text.match(re)
    return match ? match[1].trim() : null
  }
  return {
    headline: pick('Headline'),
    paragraph1: pick('Paragraph1'),
    paragraph2: pick('Paragraph2'),
    signoff: pick('Signoff'),
  }
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
  const parsedDraft = latestAssistant ? parseDraftFromAssistant(latestAssistant) : null
  const canApply = parsedDraft && (parsedDraft.headline || parsedDraft.paragraph1)

  const applyDraft = useCallback(() => {
    if (!parsedDraft) return
    onApplyDraft(Object.fromEntries(Object.entries(parsedDraft).filter(([, v]) => v)))
  }, [parsedDraft, onApplyDraft])

  const applyAndSave = useCallback(async () => {
    applyDraft()
    if (onSaveAsTemplate) await onSaveAsTemplate({ silent: true })
  }, [applyDraft, onSaveAsTemplate])

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
          <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={applyDraft}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
            >
              Use this draft
            </button>
            <button
              onClick={applyAndSave}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              💾 Use & save as template for {fairLabel}
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

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { sendAnalyticsChat } from '@/lib/api'

export default function AnalyticsChatPanel({ isOpen, onClose, analyticsContext }) {
  const mobile = useIsMobile()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const result = await sendAnalyticsChat(next, analyticsContext)
      setMessages(prev => [...prev, { role: 'assistant', content: result.message }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, analyticsContext])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const panelWidth = mobile ? '100%' : 400

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.3)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: panelWidth, zIndex: 1000,
          background: '#fff',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e8e8e8',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: colors.inkPlum, color: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>AI</span>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: fonts.body }}>
              Analytics Assistant
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              width: 32, height: 32, borderRadius: 8, fontSize: 18,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 16px 8px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {messages.length === 0 && !loading && (
            <div style={{
              textAlign: 'center', padding: '40px 20px', color: '#999',
              fontSize: 13, fontFamily: fonts.body, lineHeight: 1.6,
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>AI</div>
              <div style={{ fontWeight: 600, color: '#666', marginBottom: 8 }}>
                Ask me anything about your analytics
              </div>
              <div>
                Try: "How many vitrines at IHR?" or "Which product sold the most?" or "Top 3 clients by revenue"
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user' ? colors.inkPlum : '#f4f0f5',
                color: msg.role === 'user' ? '#fff' : '#333',
                fontSize: 13, fontFamily: fonts.body, lineHeight: 1.55,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '10px 14px', borderRadius: '14px 14px 14px 4px',
                background: '#f4f0f5', fontSize: 13, fontFamily: fonts.body,
                color: '#999', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>Thinking</span>
                <span style={{ animation: 'pulse 1.2s ease-in-out infinite 0.2s' }}>.</span>
                <span style={{ animation: 'pulse 1.2s ease-in-out infinite 0.4s' }}>.</span>
                <span style={{ animation: 'pulse 1.2s ease-in-out infinite 0.6s' }}>.</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: 12, borderTop: '1px solid #e8e8e8',
          display: 'flex', gap: 8, flexShrink: 0, background: '#fafafa',
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your analytics..."
            disabled={loading}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: '1px solid #e3e3e3', fontSize: 13, fontFamily: fonts.body,
              outline: 'none', background: '#fff',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none',
              background: !input.trim() || loading ? '#ddd' : colors.inkPlum,
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: !input.trim() || loading ? 'default' : 'pointer',
              fontFamily: fonts.body, flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >Send</button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  )
}

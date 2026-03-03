'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { sendContractChat } from '@/lib/api'

/**
 * Chat panel for asking questions about an agent's contract.
 * Fetches contract text + commission config on open, then passes them to Claude.
 *
 * Props:
 *   isOpen    - boolean
 *   onClose   - fn
 *   agentId   - string (agent's profile UUID)
 *   agentName - string (display name for header)
 */
export default function ContractChatPanel({ isOpen, onClose, agentId, agentName }) {
  const mobile = useIsMobile()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [contextLoading, setContextLoading] = useState(false)
  const [contractText, setContractText] = useState(null)
  const [commissionConfig, setCommissionConfig] = useState(null)
  const [commissionRate, setCommissionRate] = useState(0)
  const [contextError, setContextError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Load contract context when panel opens
  useEffect(() => {
    if (!isOpen || !agentId) return
    setMessages([])
    setInput('')
    setContextError(null)
    setContractText(null)
    setCommissionConfig(null)
    setContextLoading(true)

    fetch(`/api/agents/${agentId}/contract-text`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setContextError(d.error)
        } else {
          setContractText(d.text || null)
          setCommissionConfig(d.commissionConfig || null)
          setCommissionRate(d.commissionRate || 0)
        }
      })
      .catch(() => setContextError('Failed to load contract'))
      .finally(() => setContextLoading(false))
  }, [isOpen, agentId])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || contextLoading) return

    const userMsg = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const result = await sendContractChat(next, contractText || '', commissionConfig, commissionRate)
      setMessages(prev => [...prev, { role: 'assistant', content: result.message }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, contractText, commissionConfig, commissionRate, contextLoading])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const panelWidth = mobile ? '100%' : 420

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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: fonts.body }}>
                Contract Assistant
              </div>
              {agentName && (
                <div style={{ fontSize: 11, opacity: 0.75 }}>{agentName}</div>
              )}
            </div>
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
          {contextLoading && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999', fontSize: 13 }}>
              Loading contract…
            </div>
          )}

          {contextError && !contextLoading && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: colors.danger, fontSize: 13 }}>
              {contextError}
            </div>
          )}

          {!contextLoading && !contextError && messages.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '40px 20px', color: '#999',
              fontSize: 13, fontFamily: fonts.body, lineHeight: 1.6,
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.inkPlum} strokeWidth="1.5">
                  <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div style={{ fontWeight: 600, color: '#666', marginBottom: 8 }}>
                {contractText ? 'Contract loaded — ask me anything' : 'No contract on file'}
              </div>
              {contractText ? (
                <div style={{ color: '#aaa' }}>
                  Try: "What is my commission rate?" or "How are bonuses calculated?" or "What are the payment terms?"
                </div>
              ) : (
                <div style={{ color: '#aaa' }}>Upload a contract to enable AI-powered Q&A.</div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
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
                background: '#f4f0f5', display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: colors.inkPlum,
                    animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #e8e8e8',
          display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0,
          background: '#fff',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={contractText ? 'Ask about your contract…' : 'No contract loaded'}
            disabled={loading || contextLoading || !contractText}
            rows={1}
            style={{
              flex: 1, padding: '10px 12px', border: '1.5px solid #e0d6e8',
              borderRadius: 10, fontSize: 13, fontFamily: fonts.body,
              resize: 'none', outline: 'none', lineHeight: 1.5,
              background: (!contractText || contextLoading) ? '#fafafa' : '#fff',
              color: '#333', maxHeight: 120, overflowY: 'auto',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = colors.inkPlum }}
            onBlur={e => { e.target.style.borderColor = '#e0d6e8' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || contextLoading || !contractText}
            style={{
              padding: '10px 16px', background: colors.inkPlum, color: '#fff',
              border: 'none', borderRadius: 10, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: fonts.body,
              opacity: (!input.trim() || loading || contextLoading || !contractText) ? 0.45 : 1,
              transition: 'opacity 0.15s', flexShrink: 0,
            }}
          >
            Send
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { sendChat } from './lib/api'
import { fmt } from './lib/utils'
import LoadingDots from './components/LoadingDots'
import MiniQuote from './components/MiniQuote'
import QuoteModal from './components/QuoteModal'
import BuilderPanel from './components/BuilderPanel'

const STARTERS = [
  '30 CUTY 0.10 in Black, Red, Navy Blue',
  '€2000 split between CUTY and SHAPY SHINE, 2 colors each',
  '€1000 divided by 2 collections, maximize carats',
  'What gives the best margin?',
]

export default function App() {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [curQuote, setCurQuote] = useState(null)
  const [showQuote, setShowQuote] = useState(false)
  const [client, setClient] = useState({ name: '', company: '' })
  const [panel, setPanel] = useState(false)

  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, loading])

  const send = useCallback(
    async (text) => {
      if (!text.trim() || loading) return
      const userMsg = { role: 'user', content: text.trim() }
      setMsgs((prev) => [...prev, userMsg])
      setInput('')
      setLoading(true)

      try {
        const allMsgs = [...msgs, userMsg]
        const parsed = await sendChat(allMsgs)
        if (parsed.quote) setCurQuote(parsed.quote)
        setMsgs((prev) => [
          ...prev,
          { role: 'assistant', content: parsed.message, quote: parsed.quote || null },
        ])
      } catch {
        setMsgs((prev) => [
          ...prev,
          { role: 'assistant', content: 'Something went wrong. Try again.', quote: null },
        ])
      }
      setLoading(false)
      inputRef.current?.focus()
    },
    [msgs, loading]
  )

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const handleBuilderSend = useCallback(
    (text) => {
      setPanel(false)
      send(text)
    },
    [send]
  )

  return (
    <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", background: '#f5f5f3', height: '100vh', display: 'flex', flexDirection: 'column', color: '#222' }}>
      {showQuote && <QuoteModal quote={curQuote} client={client} onClose={() => setShowQuote(false)} />}
      {panel && <BuilderPanel onSend={handleBuilderSend} onClose={() => setPanel(false)} />}

      {/* ─── Header ─── */}
      <div style={{ background: '#fff', padding: '10px 14px', borderBottom: '1px solid #eaeaea', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: 6 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.03em' }}>
            LOVE<span style={{ fontWeight: 300, color: '#999' }}>LAB</span>
          </div>
          <div style={{ fontSize: 7, letterSpacing: '0.15em', color: '#bbb', textTransform: 'uppercase' }}>
            B2B Quote · Munich 2026
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            placeholder="Client"
            value={client.name}
            onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))}
            style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: 10, fontFamily: 'inherit', outline: 'none', background: '#fafafa' }}
          />
          <input
            placeholder="Company"
            value={client.company}
            onChange={(e) => setClient((c) => ({ ...c, company: e.target.value }))}
            style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: 10, fontFamily: 'inherit', outline: 'none', background: '#fafafa' }}
          />
          {curQuote && (
            <button
              onClick={() => setShowQuote(true)}
              style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#222', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              {fmt(curQuote.total)}
            </button>
          )}
        </div>
      </div>

      {/* ─── Chat ─── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {/* Empty state */}
          {msgs.length === 0 && (
            <div style={{ padding: '44px 0 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
                LOVE<span style={{ fontWeight: 300, color: '#bbb' }}>LAB</span>
              </div>
              <div style={{ fontSize: 13, color: '#999', marginBottom: 6 }}>B2B Quote Assistant</div>
              <div style={{ fontSize: 12, color: '#bbb', marginBottom: 24 }}>
                Type your order, use ☰ to build visually, or tap a suggestion.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {STARTERS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    style={{ padding: '8px 14px', borderRadius: 18, border: '1px solid #e0e0e0', background: '#fff', fontSize: 11, color: '#666', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s', textAlign: 'left' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#222' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = '#e0e0e0' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
              <div
                style={{
                  maxWidth: '85%',
                  padding: m.role === 'user' ? '10px 14px' : '12px 14px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? '#222' : '#fff',
                  color: m.role === 'user' ? '#fff' : '#333',
                  fontSize: 13,
                  lineHeight: 1.5,
                  border: m.role === 'user' ? 'none' : '1px solid #eaeaea',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                {m.quote && (
                  <MiniQuote
                    q={m.quote}
                    onView={() => { setCurQuote(m.quote); setShowQuote(true) }}
                  />
                )}
              </div>
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
              <div style={{ padding: '12px 16px', borderRadius: '14px 14px 14px 4px', background: '#fff', border: '1px solid #eaeaea' }}>
                <LoadingDots />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* ─── Input ─── */}
      <div style={{ padding: '10px 14px 14px', background: '#f5f5f3', flexShrink: 0 }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 6, background: '#fff', borderRadius: 14, border: '1px solid #ddd', padding: 4, alignItems: 'flex-end' }}>
            <button
              onClick={() => setPanel(true)}
              title="Order builder"
              style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#f5f5f3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#888', flexShrink: 0, transition: 'all .12s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f5f5f3'; e.currentTarget.style.color = '#888' }}
            >
              ☰
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type or tap ☰ to build visually"
              rows={1}
              style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: 14, fontFamily: 'inherit', padding: '10px 4px', color: '#222', background: 'transparent', lineHeight: 1.4, minHeight: 20, maxHeight: 80, overflowY: 'auto' }}
              onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px' }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: input.trim() ? '#222' : '#e5e5e5', color: '#fff', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, transition: 'background .15s' }}
            >
              ↑
            </button>
          </div>

          {/* Quick actions */}
          {msgs.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {['Add more pieces', 'Change colors', "What's my margin?", 'Clear & start over'].map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (q === 'Clear & start over') { setMsgs([]); setCurQuote(null) }
                    else send(q)
                  }}
                  style={{ padding: '4px 11px', borderRadius: 14, border: '1px solid #e5e5e5', background: '#fff', fontSize: 10, color: '#888', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

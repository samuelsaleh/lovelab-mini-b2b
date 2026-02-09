import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { sendChat, lookupCompany } from './lib/api'
import { COLLECTIONS, CORD_COLORS, calculateQuote } from './lib/catalog'
import { fmt, isLight } from './lib/utils'
import { colors, fonts, modePill, presetCard, tag, lbl } from './lib/styles'
import LoadingDots from './components/LoadingDots'
import MiniQuote from './components/MiniQuote'
import QuoteModal from './components/QuoteModal'
import BuilderPage, { mkLine } from './components/BuilderPage'
import ClientGate from './components/ClientGate'

// ─── Presets that pre-fill the builder ───
const PRESETS = [
  {
    label: 'Bestseller Starter',
    desc: 'CUTY 0.10ct · 3 colors · 3 pcs/color',
    lines: [{ collectionId: 'CUTY', caratIdx: 1, colors: ['Black', 'Red', 'Navy Blue'], qty: 3 }],
  },
  {
    label: 'Duo Collection',
    desc: 'CUTY + SHAPY SHINE · 2 colors each',
    lines: [
      { collectionId: 'CUTY', caratIdx: 1, colors: ['Black', 'Red'], qty: 3 },
      { collectionId: 'SSF', caratIdx: 1, colors: ['Black', 'Navy'], qty: 2 },
    ],
  },
  {
    label: 'Premium Selection',
    desc: 'HOLY + SHAPY SPARKLE FANCY',
    lines: [
      { collectionId: 'HOLY', caratIdx: 1, colors: ['Black', 'Ivory'], qty: 2 },
      { collectionId: 'SSPF', caratIdx: 0, colors: ['Black', 'Red'], qty: 2 },
    ],
  },
]

const STORAGE_KEY = 'lovelab-b2b-state'

function applyPreset(preset) {
  return preset.lines.map((l) => ({
    uid: Date.now() + Math.random(),
    ...l,
    expanded: true,
  }))
}

export default function App() {
  // Mode: 'builder' or 'describe'
  const [mode, setMode] = useState('builder')

  // Builder state (shared — AI results can populate this)
  const [lines, setLines] = useState([mkLine()])

  // Quote state
  const [curQuote, setCurQuote] = useState(null)
  const [showQuote, setShowQuote] = useState(false)

  // Client info (expanded for company lookup)
  const [client, setClient] = useState({ name: '', company: '', country: '', address: '', city: '', zip: '', vat: '', vatValid: null })
  const [clientReady, setClientReady] = useState(false) // Gate passed?
  const [showClientEdit, setShowClientEdit] = useState(false) // Edit mode after gate

  // Describe mode state
  const [descText, setDescText] = useState('')
  const [descLoading, setDescLoading] = useState(false)
  const [aiMsgs, setAiMsgs] = useState([]) // conversation history: [{role, content, quote?}]
  const [followUp, setFollowUp] = useState('') // follow-up input after AI responds

  // AI mode structured filters
  const [aiBudget, setAiBudget] = useState('')
  const [aiCollections, setAiCollections] = useState([])  // array of collection ids
  const [aiColors, setAiColors] = useState([])             // array of color names
  const [aiCarats, setAiCarats] = useState({})             // { collectionId: [carat strings] }
  const [aiQty, setAiQty] = useState({})                   // { collectionId: number } — qty per color

  const descRef = useRef(null)
  const chatEndRef = useRef(null)
  const hasStarted = lines.some((l) => l.collectionId)
  const hasAnything = hasStarted || aiCollections.length > 0 || aiBudget || aiMsgs.length > 0

  // Derive available colors from selected AI collections
  const aiAvailableColors = useMemo(() => {
    if (aiCollections.length === 0) return []
    const colorMap = new Map()
    aiCollections.forEach((colId) => {
      const col = COLLECTIONS.find((c) => c.id === colId)
      if (!col) return
      const palette = CORD_COLORS[col.cord] || CORD_COLORS.nylon
      palette.forEach((c) => {
        if (!colorMap.has(c.n)) colorMap.set(c.n, c.h)
      })
    })
    return Array.from(colorMap.entries()).map(([n, h]) => ({ n, h }))
  }, [aiCollections])

  // Toggle helpers for multi-select
  const toggleAiCollection = (id) => {
    setAiCollections((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      // Clean up carats and qty for removed collections
      if (!next.includes(id)) {
        setAiCarats((prev) => {
          const copy = { ...prev }
          delete copy[id]
          return copy
        })
        setAiQty((prev) => {
          const copy = { ...prev }
          delete copy[id]
          return copy
        })
        // Clean up orphan colors: keep only colors available in remaining collections
        const remainingPalettes = new Set()
        next.forEach((colId) => {
          const col = COLLECTIONS.find((c) => c.id === colId)
          if (!col) return
          const palette = CORD_COLORS[col.cord] || CORD_COLORS.nylon
          palette.forEach((c) => remainingPalettes.add(c.n))
        })
        setAiColors((prev) => prev.filter((name) => remainingPalettes.has(name)))
      }
      return next
    })
  }
  const toggleAiColor = (name) => {
    setAiColors((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name])
  }
  const toggleAiCarat = (colId, ct) => {
    setAiCarats((prev) => {
      const existing = prev[colId] || []
      const has = existing.includes(ct)
      return { ...prev, [colId]: has ? existing.filter((x) => x !== ct) : [...existing, ct] }
    })
  }

  // Check if AI mode has any content to send
  const aiHasContent = aiBudget || aiCollections.length > 0 || descText.trim()
  const totalSelectedCarats = Object.values(aiCarats).flat().length

  // ─── Generate quote from builder ───
  const handleGenerateQuote = useCallback((quote) => {
    setCurQuote(quote)
    setShowQuote(true)
  }, [])

  // ─── Build AI message from filters + text ───
  const buildAiMessage = useCallback(() => {
    const parts = []
    if (aiBudget) parts.push(`Budget: €${aiBudget}`)
    if (aiCollections.length > 0) {
      aiCollections.forEach((id) => {
        const col = COLLECTIONS.find((c) => c.id === id)
        if (!col) return
        const selectedCarats = aiCarats[id] || []
        const qty = aiQty[id]
        let line = col.label
        if (selectedCarats.length > 0) line += `: preferred carats ${selectedCarats.join(', ')}ct`
        if (qty) line += `, ${qty} pcs/color`
        parts.push(line)
      })
    }
    if (aiColors.length > 0) parts.push(`Use ALL these colors in EACH collection: ${aiColors.join(', ')}`)
    if (descText.trim()) parts.push(descText.trim())
    return parts.join('\n')
  }, [aiBudget, aiCollections, aiCarats, aiQty, aiColors, descText])

  // ─── Send initial request or follow-up to AI ───
  const handleAiSend = useCallback(async (overrideMsg) => {
    const message = overrideMsg || buildAiMessage()
    if (!message || descLoading) return
    setDescLoading(true)

    const userMsg = { role: 'user', content: message }
    const newMsgs = [...aiMsgs, userMsg]
    setAiMsgs(newMsgs)
    if (!overrideMsg) setFollowUp('')

    try {
      const parsed = await sendChat(newMsgs)
      const assistantMsg = { role: 'assistant', content: parsed.message, quote: parsed.quote || null }
      setAiMsgs((prev) => [...prev, assistantMsg])

      if (parsed.quote) {
        setCurQuote(parsed.quote)
        if (parsed.quote.lines && parsed.quote.lines.length > 0) {
          const newLines = parsed.quote.lines.map((ql) => ({
            uid: Date.now() + Math.random(),
            collectionId: findCollectionId(ql.product),
            caratIdx: findCaratIdx(ql.product, ql.carat),
            colors: ql.colors || [],
            qty: ql.qtyPerColor || 3,
            expanded: false,
          }))
          setLines(newLines)
        }
      }
    } catch {
      setAiMsgs((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.', quote: null }])
    }
    setDescLoading(false)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [buildAiMessage, descLoading, aiMsgs])

  // ─── Send follow-up message ───
  const handleFollowUp = useCallback(() => {
    if (!followUp.trim() || descLoading) return
    const msg = followUp.trim()
    setFollowUp('')
    handleAiSend(msg)
  }, [followUp, descLoading, handleAiSend])

  // Legacy alias for initial send
  const handleDescribeSend = useCallback(() => {
    handleAiSend()
  }, [handleAiSend])

  // ─── Apply a preset ───
  const handlePreset = (preset) => {
    setLines(applyPreset(preset))
    setMode('builder')
  }

  // ─── Client Gate Complete ───
  const handleClientComplete = useCallback(() => {
    setClientReady(true)
    setShowClientEdit(false)
  }, [])

  // ─── Reset (New Order) ───
  const handleReset = () => {
    setLines([mkLine()])
    setCurQuote(null)
    setDescText('')
    setAiMsgs([])
    setFollowUp('')
    setAiBudget('')
    setAiCollections([])
    setAiColors([])
    setAiCarats({})
    setAiQty({})
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  // ─── New Client (go back to gate) ───
  const handleNewClient = () => {
    setClient({ name: '', company: '', country: '', address: '', city: '', zip: '', vat: '', vatValid: null })
    setClientReady(false)
    handleReset()
  }

  // ─── localStorage persistence ───

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        if (state.lines && state.lines.length > 0) setLines(state.lines)
        if (state.client) setClient(state.client)
        if (state.clientReady !== undefined) setClientReady(state.clientReady)
        if (state.curQuote) setCurQuote(state.curQuote)
        if (state.aiMsgs) setAiMsgs(state.aiMsgs)
        if (state.mode) setMode(state.mode)
        if (state.aiBudget) setAiBudget(state.aiBudget)
        if (state.aiCollections) setAiCollections(state.aiCollections)
        if (state.aiColors) setAiColors(state.aiColors)
        if (state.aiCarats) setAiCarats(state.aiCarats)
        if (state.aiQty) setAiQty(state.aiQty)
      }
    } catch { /* ignore corrupt localStorage */ }
  }, [])

  // Save to localStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lines, client, clientReady, curQuote, aiMsgs, mode, aiBudget, aiCollections, aiColors, aiCarats, aiQty,
      }))
    } catch { /* ignore quota errors */ }
  }, [lines, client, clientReady, curQuote, aiMsgs, mode, aiBudget, aiCollections, aiColors, aiCarats, aiQty])

  // ─── Client Gate (first screen) ───
  if (!clientReady) {
    return (
      <ClientGate
        client={client}
        setClient={setClient}
        onComplete={handleClientComplete}
      />
    )
  }

  return (
    <div style={{ fontFamily: fonts.body, background: colors.lovelabBg, height: '100vh', display: 'flex', flexDirection: 'column', color: colors.charcoal }}>
      {showQuote && <QuoteModal quote={curQuote} client={client} onClose={() => setShowQuote(false)} />}

      {/* ─── Header with compact client badge ─── */}
      <div style={{ background: '#fff', padding: '10px 14px', borderBottom: '1px solid #eaeaea', flexShrink: 0 }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {/* Logo row — logo centered, total button on right */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 8, minHeight: 60 }}>
            <img src="/logo.png" alt="LoveLab" style={{ height: 60, width: 'auto' }} />
            {curQuote && (
              <button
                onClick={() => setShowQuote(true)}
                style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', padding: '5px 12px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
              >
                {fmt(curQuote.total)}
              </button>
            )}
          </div>

          {/* Compact client badge */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            background: colors.ice, 
            borderRadius: 10, 
            padding: '8px 12px',
            gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {client.name && (
                <span style={{ fontSize: 11, color: colors.charcoal }}>{client.name}</span>
              )}
              <span style={{ fontSize: 11, fontWeight: 600, color: colors.inkPlum }}>{client.company}</span>
              {client.country && (
                <span style={{ fontSize: 10, color: colors.lovelabMuted }}>{client.country}</span>
              )}
              {client.vat && (
                <span style={{ 
                  fontSize: 9, 
                  padding: '2px 6px', 
                  borderRadius: 4, 
                  background: client.vatValid === true ? '#d4edda' : client.vatValid === false ? '#f8d7da' : '#fff3cd',
                  color: client.vatValid === true ? '#155724' : client.vatValid === false ? '#721c24' : '#856404',
                  fontWeight: 600,
                }}>
                  {client.vatValid === true ? '✓ ' : client.vatValid === false ? '✗ ' : ''}{client.vat}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setClientReady(false)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: colors.lovelabMuted, 
                  fontSize: 10, 
                  cursor: 'pointer', 
                  fontFamily: 'inherit',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}
                title="Edit client"
              >
                Edit
              </button>
              <button
                onClick={handleNewClient}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: colors.lovelabMuted, 
                  fontSize: 10, 
                  cursor: 'pointer', 
                  fontFamily: 'inherit',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}
                title="New client"
              >
                New
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Mode Toggle ─── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #eaeaea', padding: '8px 14px', flexShrink: 0 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 4, background: '#f5f5f3', borderRadius: 22, padding: 3 }}>
          <button onClick={() => setMode('builder')} style={modePill(mode === 'builder')}>
            Build Manually
          </button>
          <button onClick={() => setMode('describe')} style={modePill(mode === 'describe')}>
            Describe Situation
          </button>
          <div style={{ flex: 1 }} />
          {hasAnything && (
            <button
              onClick={handleReset}
              style={{ padding: '6px 12px', borderRadius: 16, border: 'none', background: 'transparent', color: '#aaa', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ─── Main Content ─── */}
      {mode === 'builder' ? (
        <>
          {/* Presets — shown when builder is empty */}
          {!hasStarted && (
            <div style={{ padding: '18px 14px 0', flexShrink: 0 }}>
              <div style={{ maxWidth: 640, margin: '0 auto' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Quick Start
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PRESETS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => handlePreset(p)}
                      style={presetCard}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.background = '#fdf7fa' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e3e3e3'; e.currentTarget.style.background = '#fff' }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#222', marginBottom: 2 }}>{p.label}</div>
                      <div style={{ fontSize: 10, color: '#999' }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#bbb', marginTop: 12, textAlign: 'center' }}>
                  Or start building below — select a collection, carat, colors & quantity.
                </div>
              </div>
            </div>
          )}

          {/* Builder */}
          <BuilderPage
            lines={lines}
            setLines={setLines}
            onGenerateQuote={handleGenerateQuote}
          />
        </>
      ) : (
        /* ─── Describe Situation / AI Advisor Mode ─── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px' }}>
            <div style={{ maxWidth: 640, margin: '0 auto' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>AI Order Advisor</div>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 16, lineHeight: 1.5 }}>
                Select what you need below and/or describe the situation. The AI will calculate the optimal quote.
              </div>

              {/* Budget */}
              <div style={{ marginBottom: 14, padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                <div style={lbl}>Budget (optional)</div>
                <div style={{ position: 'relative', width: 160 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#aaa', fontWeight: 600 }}>€</span>
                  <input
                    type="number"
                    value={aiBudget}
                    onChange={(e) => setAiBudget(e.target.value)}
                    placeholder="2000"
                    style={{ width: '100%', padding: '8px 11px 8px 24px', borderRadius: 8, border: '1px solid #e3e3e3', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fafaf8', boxSizing: 'border-box', color: '#333' }}
                  />
                </div>
              </div>

              {/* Collections multi-select */}
              <div style={{ marginBottom: 14, padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                <div style={lbl}>Collections {aiCollections.length > 0 && `(${aiCollections.length})`}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {COLLECTIONS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => toggleAiCollection(c.id)}
                      style={tag(aiCollections.includes(c.id))}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Carats & Qty grouped by collection — only if collections selected */}
              {aiCollections.length > 0 && (
                <div style={{ marginBottom: 14, padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                  <div style={lbl}>Carats & quantity by collection</div>
                  {aiCollections.map((colId) => {
                    const col = COLLECTIONS.find((c) => c.id === colId)
                    if (!col) return null
                    const selected = aiCarats[colId] || []
                    const qty = aiQty[colId] || ''
                    return (
                      <div key={colId} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f3f3f3' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{col.label}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 9, color: '#aaa' }}>pcs/color:</span>
                            <input
                              type="number"
                              min="1"
                              value={qty}
                              onChange={(e) => setAiQty((prev) => ({ ...prev, [colId]: e.target.value ? parseInt(e.target.value, 10) : '' }))}
                              placeholder={String(col.minC)}
                              style={{ width: 48, padding: '3px 6px', borderRadius: 6, border: '1px solid #e3e3e3', fontSize: 11, textAlign: 'center', fontFamily: 'inherit', outline: 'none', background: '#fafaf8' }}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {col.carats.map((ct, ci) => (
                            <button
                              key={ct}
                              onClick={() => toggleAiCarat(colId, ct)}
                              style={tag(selected.includes(ct))}
                            >
                              {ct}ct — €{col.prices[ci]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Colors multi-select — only if collections selected */}
              {aiAvailableColors.length > 0 && (
                <div style={{ marginBottom: 14, padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                  <div style={lbl}>Colors {aiColors.length > 0 && `(${aiColors.length})`}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {aiAvailableColors.map((c) => (
                      <button
                        key={c.n}
                        title={c.n}
                        onClick={() => toggleAiColor(c.n)}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', background: c.h, flexShrink: 0, padding: 0,
                          border: aiColors.includes(c.n) ? '2.5px solid #222' : isLight(c.h) ? '1px solid #ddd' : '1px solid transparent',
                          cursor: 'pointer', transition: 'transform .1s',
                          transform: aiColors.includes(c.n) ? 'scale(1.15)' : 'scale(1)',
                          boxShadow: aiColors.includes(c.n) ? '0 0 0 2px rgba(0,0,0,0.08)' : 'none',
                        }}
                      />
                    ))}
                  </div>
                  {aiColors.length > 0 && (
                    <div style={{ fontSize: 9, color: '#aaa', marginTop: 4 }}>{aiColors.join(', ')}</div>
                  )}
                </div>
              )}

              {/* Additional notes / free text */}
              <div style={{ marginBottom: 14, padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #eee' }}>
                <div style={lbl}>Additional notes (optional)</div>
                <textarea
                  ref={descRef}
                  value={descText}
                  onChange={(e) => setDescText(e.target.value)}
                  placeholder="E.g. split budget 60/40, maximize carats, prefer bestsellers, need at least 5 colors per collection..."
                  style={{
                    width: '100%', minHeight: 80, padding: 10, borderRadius: 8,
                    border: '1px solid #e3e3e3', fontSize: 12, fontFamily: 'inherit',
                    outline: 'none', resize: 'vertical', lineHeight: 1.5, color: '#333',
                    background: '#fafaf8', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Send / Re-send button */}
              <button
                onClick={handleDescribeSend}
                disabled={!aiHasContent || descLoading}
                style={{
                  width: '100%', padding: 14, borderRadius: 10, border: 'none',
                  background: aiHasContent && !descLoading ? colors.inkPlum : '#e5e5e5',
                  color: aiHasContent && !descLoading ? '#fff' : '#999',
                  fontSize: 14, fontWeight: 700, cursor: aiHasContent && !descLoading ? 'pointer' : 'default',
                  fontFamily: 'inherit', transition: 'background .15s',
                }}
              >
                {descLoading ? 'Thinking...' : aiMsgs.length > 0 ? 'Re-send with updated filters →' : 'Ask AI for Best Quote →'}
              </button>

              {/* ─── Conversation Thread ─── */}
              {aiMsgs.length > 0 && (
                <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Conversation
                  </div>

                  {aiMsgs.map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                      <div
                        style={{
                          maxWidth: '88%',
                          padding: '10px 14px',
                          borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                          background: m.role === 'user' ? colors.inkPlum : '#fff',
                          color: m.role === 'user' ? '#fff' : '#333',
                          fontSize: 12,
                          lineHeight: 1.5,
                          border: m.role === 'user' ? 'none' : '1px solid #eaeaea',
                        }}
                      >
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                        {m.quote && (
                          <div style={{ marginTop: 8 }}>
                            <MiniQuote
                              q={m.quote}
                              onView={() => { setCurQuote(m.quote); setShowQuote(true) }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {descLoading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
                      <div style={{ padding: '12px 16px', borderRadius: '12px 12px 12px 4px', background: '#fff', border: '1px solid #eaeaea' }}>
                        <LoadingDots />
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />

                  {/* Follow-up input */}
                  {!descLoading && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, background: '#fff', borderRadius: 10, border: '1px solid #ddd', padding: 4, alignItems: 'flex-end' }}>
                      <input
                        value={followUp}
                        onChange={(e) => setFollowUp(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleFollowUp() }}
                        placeholder="Change colors, add pieces, ask about margin..."
                        style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', padding: '8px 8px', color: '#222', background: 'transparent' }}
                      />
                      <button
                        onClick={handleFollowUp}
                        disabled={!followUp.trim()}
                        style={{
                          width: 34, height: 34, borderRadius: 8, border: 'none', flexShrink: 0,
                          background: followUp.trim() ? colors.inkPlum : '#e5e5e5',
                          color: '#fff', cursor: followUp.trim() ? 'pointer' : 'default',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                        }}
                      >
                        ↑
                      </button>
                    </div>
                  )}

                  {/* Switch to builder */}
                  {curQuote && (
                    <button
                      onClick={() => setMode('builder')}
                      style={{
                        width: '100%', padding: 10, borderRadius: 8, marginTop: 10,
                        border: '1px solid #e0e0e0', background: '#fafafa', fontSize: 12,
                        fontWeight: 600, cursor: 'pointer', color: '#555', fontFamily: 'inherit',
                      }}
                    >
                      Switch to Builder to edit this quote manually ↗
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers to map AI response back to builder lines ───
function findCollectionId(productName) {
  if (!productName) return null
  const name = productName.toUpperCase()
  const match = COLLECTIONS.find(
    (c) => c.label.toUpperCase() === name || c.id.toUpperCase() === name
  )
  if (match) return match.id
  // Fuzzy: check if name contains collection label
  const fuzzy = COLLECTIONS.find(
    (c) => name.includes(c.label.toUpperCase()) || name.includes(c.id.toUpperCase())
  )
  return fuzzy ? fuzzy.id : null
}

function findCaratIdx(productName, carat) {
  const colId = findCollectionId(productName)
  if (!colId || !carat) return 0
  const col = COLLECTIONS.find((c) => c.id === colId)
  if (!col) return 0
  const caratStr = String(carat)
  const idx = col.carats.findIndex((ct) => ct === caratStr)
  return idx >= 0 ? idx : 0
}

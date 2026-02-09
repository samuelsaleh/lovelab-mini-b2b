import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { sendChat, sendRecommendationChat } from './lib/api'
import { COLLECTIONS, CORD_COLORS, calculateQuote } from './lib/catalog'
import { fmt } from './lib/utils'
import { colors, fonts, modePill } from './lib/styles'
import { validateVAT } from './lib/vat'
import LoadingDots from './components/LoadingDots'
import MiniQuote from './components/MiniQuote'
import QuoteModal from './components/QuoteModal'
import OptionPicker from './components/OptionPicker'
import BuilderPage, { mkLine, mkColorConfig } from './components/BuilderPage'
import OrderForm from './components/OrderForm'
import ClientGate from './components/ClientGate'

const STORAGE_KEY = 'lovelab-b2b-state'

// Quick-start suggestion chips for the AI chat
const AI_CHIPS = [
  'I have a budget of €2000, suggest a starter order',
  'Show me CUTY + CUBIX options in 3 colors',
  'Build me a bestseller order for a boutique',
  'What can I get for €800?',
]

export default function App() {
  // Mode: 'builder' or 'describe'
  const [mode, setMode] = useState('builder')

  // Builder state (shared — AI results can populate this)
  const [lines, setLines] = useState([mkLine()])

  // Builder budget tracker
  const [builderBudget, setBuilderBudget] = useState('')
  const [budgetRecommendations, setBudgetRecommendations] = useState(null) // { loading, message, suggestions }
  const [showRecommendations, setShowRecommendations] = useState(false)

  // Quote state
  const [curQuote, setCurQuote] = useState(null)
  const [showQuote, setShowQuote] = useState(false)

  // Order form state
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderFormQuote, setOrderFormQuote] = useState(null) // null = blank manual entry

  // Client info (expanded for company lookup)
  const [client, setClient] = useState({ name: '', phone: '', email: '', company: '', country: '', address: '', city: '', zip: '', vat: '', vatValid: null, vatValidating: false })
  const [clientReady, setClientReady] = useState(false) // Gate passed?
  const [showClientEdit, setShowClientEdit] = useState(false) // Edit mode after gate

  // AI chat state
  const [descLoading, setDescLoading] = useState(false)
  const [aiMsgs, setAiMsgs] = useState([]) // conversation history: [{role, content, quote?}]
  const [chatInput, setChatInput] = useState('') // main chat input

  // AI quick-filter toggles (optional context for the chat)
  const [aiFiltersOpen, setAiFiltersOpen] = useState(false)
  const [aiBudget, setAiBudget] = useState('')
  const [aiCollections, setAiCollections] = useState([]) // array of collection ids
  const [aiColors, setAiColors] = useState([]) // array of color names

  const chatEndRef = useRef(null)
  const chatInputRef = useRef(null)
  const hasStarted = lines.some((l) => l.collectionId)
  const hasAnything = hasStarted || aiMsgs.length > 0

  // Derive available colors from selected AI filter collections
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

  const toggleAiCollection = (id) => {
    setAiCollections((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      // Clean orphan colors
      if (!next.includes(id)) {
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

  // Build context prefix from filter toggles
  const buildFilterContext = useCallback(() => {
    const parts = []
    if (aiBudget) parts.push(`Budget: €${aiBudget}.`)
    if (aiCollections.length > 0) {
      const names = aiCollections.map((id) => COLLECTIONS.find((c) => c.id === id)?.label || id).join(', ')
      parts.push(`Collections: ${names}.`)
    }
    if (aiColors.length > 0) parts.push(`Colors: ${aiColors.join(', ')}.`)
    return parts.length > 0 ? `[Context: ${parts.join(' ')}]\n` : ''
  }, [aiBudget, aiCollections, aiColors])

  // ─── VAT banner (shown after quoting starts) ───
  const hasVat = Boolean(client.vat && client.vat.trim().length >= 4)
  const showVatBanner = hasStarted && hasVat && (client.vatValidating || client.vatValid !== true)

  const retryVatValidation = useCallback(() => {
    const vat = client.vat?.trim()
    if (!vat || vat.length < 4) return
    if (client.vatValidating) return

    setClient((prev) => ({ ...prev, vatValidating: true, vatValid: null }))
    validateVAT(vat)
      .then((viesRes) => {
        setClient((prev) => ({
          ...prev,
          vatValid: viesRes.valid,
          vatValidating: false,
        }))
      })
      .catch(() => {
        setClient((prev) => ({ ...prev, vatValid: null, vatValidating: false }))
      })
  }, [client.vat, client.vatValidating, setClient])

  // ─── Generate quote from builder ───
  const handleGenerateQuote = useCallback((quote) => {
    setCurQuote(quote)
    setShowQuote(true)
  }, [])

  // ─── Budget Recommendations (AI suggests what to ADD with remaining budget) ───
  const handleBudgetRecommendations = useCallback(async () => {
    const budgetNum = parseFloat(builderBudget)
    if (!budgetNum || budgetNum <= 0) return
    const quote = calculateQuote(lines)
    const spent = quote.total
    const remaining = budgetNum - spent
    if (remaining <= 0) return

    setBudgetRecommendations({ loading: true, message: null, suggestions: null })
    setShowRecommendations(true)

    // Build a description of what the user already has
    const currentItems = quote.lines.map((ln) =>
      `${ln.product} ${ln.carat}ct ${ln.colorName}${ln.housing ? ` (${ln.housing})` : ''}${ln.shape ? ` ${ln.shape}` : ''} ×${ln.qty}`
    ).join('; ')

    const prompt = `The client has a budget of €${budgetNum}. They have already built an order worth €${spent} (after any discounts). They have €${remaining} remaining.

Current order: ${currentItems || 'empty'}

IMPORTANT: Do NOT change or remove anything from the current order. Only suggest what to ADD on top of it.
Based on what they already like (their chosen collections, colors, carat sizes), suggest 3-5 smart additions they could make with the remaining €${remaining}. Consider:
- Adding more pieces of collections they already chose (safe upsell)
- Trying a new complementary collection
- Upgrading carat size on an existing line
- Adding new colors of something they already have

For each suggestion, give a short one-line description and the approximate cost.
Keep it very concise — this is for a salesperson at a trade fair.`

    try {
      const parsed = await sendRecommendationChat(prompt)
      setBudgetRecommendations({ loading: false, message: parsed.message, suggestions: parsed.quote })
    } catch {
      setBudgetRecommendations({ loading: false, message: 'Could not generate recommendations. Please try again.', suggestions: null })
    }
  }, [builderBudget, lines])

  // ─── Finalize order (from QuoteModal → OrderForm) ───
  const handleFinalize = useCallback(() => {
    setShowQuote(false)
    setOrderFormQuote(curQuote)
    setShowOrderForm(true)
  }, [curQuote])

  // ─── Open blank order form for manual entry ───
  const handleBlankOrderForm = useCallback(() => {
    setOrderFormQuote(null)
    setShowOrderForm(true)
  }, [])

  // ─── Send message to AI ───
  const handleAiSend = useCallback(async (overrideMsg) => {
    const rawMessage = typeof overrideMsg === 'string' ? overrideMsg : chatInput.trim()
    if (!rawMessage || descLoading) return

    // Prepend filter context to the first message or when filters are set
    const context = buildFilterContext()
    const message = context ? `${context}${rawMessage}` : rawMessage

    setChatInput('')
    setDescLoading(true)

    // Show the raw message in the UI, but send full message (with context) to the API
    const displayMsg = { role: 'user', content: rawMessage }
    const apiMsg = { role: 'user', content: message }
    setAiMsgs((prev) => [...prev, displayMsg])
    const apiMsgs = [...aiMsgs, apiMsg]

    try {
      const parsed = await sendChat(apiMsgs)

      let expandedQuote = null
      if (parsed.quote && parsed.quote.lines && parsed.quote.lines.length > 0) {
        // Group AI quote lines by collection to build builder lines with colorConfigs
        const linesByCollection = new Map()
        for (const ql of parsed.quote.lines) {
          const colId = findCollectionId(ql.product)
          if (!colId) continue
          if (!linesByCollection.has(colId)) linesByCollection.set(colId, [])
          linesByCollection.get(colId).push(ql)
        }
        const newLines = Array.from(linesByCollection.entries()).map(([colId, qls]) => {
          const col = COLLECTIONS.find((c) => c.id === colId) || null
          const colorConfigs = []

          for (const ql of qls) {
            const caratIdx = findCaratIdx(ql.product, ql.carat)
            const base = {
              caratIdx,
              housing: ql.housing ?? null,
              housingType: ql.housingType ?? null,
              multiAttached: ql.multiAttached ?? null,
              shape: ql.shape ?? null,
              size: ql.size ?? null,
            }

            // Format A: colors[] + qtyPerColor (preferred)
            if (Array.isArray(ql.colors) && ql.colors.length > 0) {
              const per = Number(ql.qtyPerColor) || Number(ql.qty) || (col ? col.minC : 1) || 1
              for (const cName of ql.colors) {
                const cfg = { ...mkColorConfig(cName, per), ...base, qty: per, colorName: cName }
                colorConfigs.push(cfg)
              }
              continue
            }

            // Format B: per-color line (colorName + qty)
            const colorName = ql.colorName || ql.color || 'Unknown'
            const qty = Number(ql.qty) || Number(ql.totalQty) || (col ? col.minC : 1) || 1
            colorConfigs.push({ ...mkColorConfig(colorName, qty), ...base, qty, colorName })
          }
          return {
            uid: Date.now() + Math.random(),
            collectionId: colId,
            colorConfigs,
            expanded: true,
          }
        })
        setLines(newLines)
        // Use calculateQuote on expanded builder lines so MiniQuote + QuoteModal get proper data
        expandedQuote = calculateQuote(newLines)
        setCurQuote(expandedQuote)
      } else if (parsed.quote) {
        setCurQuote(parsed.quote)
        expandedQuote = parsed.quote
      }

      // Store the expanded quote + options in the message so MiniQuote / OptionPicker display correctly
      const assistantMsg = {
        role: 'assistant',
        content: parsed.message,
        quote: expandedQuote,
        options: Array.isArray(parsed.options) && parsed.options.length > 0 ? parsed.options : null,
      }
      setAiMsgs((prev) => [...prev, assistantMsg])
    } catch {
      setAiMsgs((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.', quote: null }])
    }
    setDescLoading(false)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [chatInput, descLoading, aiMsgs, buildFilterContext])

  // ─── Send suggestion request (doesn't modify order) ───
  const handleSuggestFillOrder = useCallback(() => {
    if (descLoading) return
    const quote = curQuote
    if (!quote) return
    const currentItems = (quote.lines || []).map((ln) =>
      `${ln.product} ${ln.carat}ct ${ln.colorName || ''}${ln.housing ? ` (${ln.housing})` : ''} ×${ln.qty}`
    ).join('; ')
    const gap = 800 - (quote.subtotal || 0)
    const msg = gap > 0
      ? `My current order is: ${currentItems}. Total is €${quote.subtotal}. I need €${gap} more to reach the €800 minimum. Give me 2-3 suggestions to fill the gap. Don't change my existing order.`
      : `My current order is: ${currentItems}. Total is €${quote.subtotal}. Suggest 2-3 additions to complement what I have. Don't change my existing order.`
    handleAiSend(msg)
  }, [curQuote, descLoading, handleAiSend])

  // ─── Client Gate Complete ───
  const handleClientComplete = useCallback(() => {
    setClientReady(true)
    setShowClientEdit(false)
  }, [])

  // ─── Reset (New Order) ───
  const handleReset = () => {
    setLines([mkLine()])
    setCurQuote(null)
    setAiMsgs([])
    setChatInput('')
    setAiBudget('')
    setAiCollections([])
    setAiColors([])
    setAiFiltersOpen(false)
    setBuilderBudget('')
    setBudgetRecommendations(null)
    setShowRecommendations(false)
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  // ─── New Client (go back to gate) ───
  const handleNewClient = () => {
    setClient({ name: '', phone: '', email: '', company: '', country: '', address: '', city: '', zip: '', vat: '', vatValid: null, vatValidating: false })
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
        const ready = state.clientReady === true
        if (ready && state.client) setClient(state.client)
        if (state.clientReady !== undefined) setClientReady(state.clientReady)
        if (state.curQuote) setCurQuote(state.curQuote)
        if (state.aiMsgs) setAiMsgs(state.aiMsgs)
        if (state.mode) setMode(state.mode)
        if (state.builderBudget) setBuilderBudget(state.builderBudget)
        if (state.aiBudget) setAiBudget(state.aiBudget)
        if (state.aiCollections) setAiCollections(state.aiCollections)
        if (state.aiColors) setAiColors(state.aiColors)
      }
    } catch { /* ignore corrupt localStorage */ }
  }, [])

  // Save to localStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lines,
        client: clientReady ? client : null,
        clientReady,
        curQuote,
        aiMsgs,
        mode,
        builderBudget,
        aiBudget,
        aiCollections,
        aiColors,
      }))
    } catch { /* ignore quota errors */ }
  }, [lines, client, clientReady, curQuote, aiMsgs, mode, builderBudget, aiBudget, aiCollections, aiColors])

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
      {showQuote && <QuoteModal quote={curQuote} client={client} onClose={() => setShowQuote(false)} onFinalize={handleFinalize} />}
      {showOrderForm && <OrderForm quote={orderFormQuote} client={client} onClose={() => setShowOrderForm(false)} />}

      {/* ─── Header with compact client badge ─── */}
      <div style={{ background: '#fff', padding: '10px 14px', borderBottom: '1px solid #eaeaea', flexShrink: 0 }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {/* Logo row — logo centered, total button on right */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 8, minHeight: 60 }}>
            <img src="/logo.png" alt="LoveLab" style={{ height: 60, width: 'auto' }} />
            <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 6, alignItems: 'center' }}>
              {curQuote && (
                <button
                  onClick={() => setShowQuote(true)}
                  style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  {fmt(curQuote.total)}
                </button>
              )}
              <button
                onClick={handleBlankOrderForm}
                style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${colors.luxeGold}`, background: 'transparent', color: colors.luxeGold, fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}
                title="Open a blank order form for manual entry"
              >
                Order Form
              </button>
            </div>
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
                  background: client.vatValidating ? '#e8e8e8' : client.vatValid === true ? '#d4edda' : client.vatValid === false ? '#f8d7da' : '#fff3cd',
                  color: client.vatValidating ? '#666' : client.vatValid === true ? '#155724' : client.vatValid === false ? '#721c24' : '#856404',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  {client.vatValidating ? (
                    <>
                      <LoadingDots />
                      <span>{client.vat}</span>
                    </>
                  ) : (
                    <>
                      {client.vatValid === true ? '✓ ' : client.vatValid === false ? '✗ ' : '? '}{client.vat}
                    </>
                  )}
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

      {/* ─── VAT status banner (after quoting starts) ─── */}
      {showVatBanner && (
        <div style={{ background: '#fff', borderBottom: '1px solid #eaeaea', padding: '8px 14px', flexShrink: 0 }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div style={{
              borderRadius: 10,
              padding: '8px 10px',
              border: `1px solid ${client.vatValidating ? '#e0e0e0' : client.vatValid === false ? '#f5c6cb' : '#ffeeba'}`,
              background: client.vatValidating ? '#f7f7f7' : client.vatValid === false ? '#f8d7da' : '#fff3cd',
              color: client.vatValidating ? '#555' : client.vatValid === false ? '#721c24' : '#856404',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              fontSize: 11,
              lineHeight: 1.35,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  flexShrink: 0,
                  background: client.vatValidating ? '#e8e8e8' : client.vatValid === false ? '#f5c6cb' : '#ffeeba',
                  color: client.vatValidating ? '#666' : client.vatValid === false ? '#721c24' : '#856404',
                }}>
                  {client.vatValidating ? '…' : client.vatValid === false ? '✗' : '!'}
                </div>
                <div style={{ minWidth: 0 }}>
                  {client.vatValidating ? (
                    <span style={{ fontWeight: 700 }}>Checking VAT…</span>
                  ) : client.vatValid === false ? (
                    <span style={{ fontWeight: 700 }}>VAT invalid — VAT will be applied unless corrected.</span>
                  ) : (
                    <span style={{ fontWeight: 700 }}>VAT not verified (VIES busy/unavailable). You can retry.</span>
                  )}
                  <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    VAT: {client.vat}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {!client.vatValidating && (
                  <button
                    onClick={retryVatValidation}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: colors.inkPlum,
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={() => setClientReady(false)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid ${colors.inkPlum}`,
                    background: 'transparent',
                    color: colors.inkPlum,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Edit VAT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mode Toggle ─── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #eaeaea', padding: '8px 14px', flexShrink: 0 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 4, background: '#f5f5f3', borderRadius: 22, padding: 3 }}>
          <button onClick={() => setMode('builder')} style={modePill(mode === 'builder')}>
            Build Manually
          </button>
          <button onClick={() => setMode('describe')} style={modePill(mode === 'describe')}>
            AI Advisor
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
          {/* Builder */}
          <BuilderPage
            lines={lines}
            setLines={setLines}
            onGenerateQuote={handleGenerateQuote}
            budget={builderBudget}
            setBudget={setBuilderBudget}
            budgetRecommendations={budgetRecommendations}
            showRecommendations={showRecommendations}
            setShowRecommendations={setShowRecommendations}
            onRequestRecommendations={handleBudgetRecommendations}
          />
        </>
      ) : (
        /* ─── AI Advisor Chat Mode ─── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* Persistent suggestion bar when below minimum */}
          {curQuote && !curQuote.minimumMet && (
            <div style={{
              padding: '10px 14px',
              background: '#fff8f0',
              borderBottom: '1px solid #f0e0d0',
              flexShrink: 0,
            }}>
              <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 12, color: '#856404', fontWeight: 600 }}>
                  Order at {fmt(curQuote.subtotal)} / min {fmt(800)} — need {fmt(800 - curQuote.subtotal)} more
                </div>
                <button
                  onClick={handleSuggestFillOrder}
                  disabled={descLoading}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: colors.luxeGold,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: descLoading ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                    opacity: descLoading ? 0.6 : 1,
                  }}
                >
                  Get suggestions
                </button>
              </div>
            </div>
          )}

          {/* Chat messages area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px' }}>
            <div style={{ maxWidth: 640, margin: '0 auto' }}>

              {/* Welcome message when no conversation yet */}
              {aiMsgs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: colors.inkPlum, marginBottom: 6 }}>AI Order Advisor</div>
                  <div style={{ fontSize: 13, color: '#999', lineHeight: 1.6, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
                    Describe your client's needs in plain language. I'll build the optimal quote, suggest collections, and help you reach the minimum order.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    {AI_CHIPS.map((chip, i) => (
                      <button
                        key={i}
                        onClick={() => { setChatInput(chip); setTimeout(() => chatInputRef.current?.focus(), 50) }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 20,
                          border: `1px solid ${colors.lineGray}`,
                          background: '#fff',
                          color: '#555',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'all .12s',
                          lineHeight: 1.3,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.color = colors.inkPlum }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.lineGray; e.currentTarget.style.color = '#555' }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversation thread */}
              {aiMsgs.map((m, i) => {
                // Options are "answered" if a subsequent user message exists after this one
                const optionsAnswered = m.options && i < aiMsgs.length - 1
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                    <div
                      style={{
                        maxWidth: '88%',
                        padding: '10px 14px',
                        borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: m.role === 'user' ? colors.inkPlum : '#fff',
                        color: m.role === 'user' ? '#fff' : '#333',
                        fontSize: 12,
                        lineHeight: 1.5,
                        border: m.role === 'user' ? 'none' : '1px solid #eaeaea',
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

                      {/* Interactive option picker (when AI asks for missing info) */}
                      {m.options && (
                        <OptionPicker
                          options={m.options}
                          onSend={(msg) => handleAiSend(msg)}
                          disabled={descLoading || optionsAnswered}
                        />
                      )}

                      {m.quote && (
                        <div style={{ marginTop: 8 }}>
                          <MiniQuote
                            q={m.quote}
                            onView={() => { setCurQuote(m.quote); setShowQuote(true) }}
                          />
                          {/* Action buttons after quote */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            <button
                              onClick={handleSuggestFillOrder}
                              disabled={descLoading}
                              style={{
                                width: '100%', padding: 8, borderRadius: 8,
                                border: `1px solid ${colors.luxeGold}`, background: '#fff',
                                fontSize: 11, fontWeight: 600, cursor: descLoading ? 'default' : 'pointer',
                                color: colors.luxeGold, fontFamily: 'inherit',
                                opacity: descLoading ? 0.6 : 1,
                              }}
                            >
                              Suggest how to fill order
                            </button>
                            <button
                              onClick={() => setMode('builder')}
                              style={{
                                width: '100%', padding: 8, borderRadius: 8,
                                border: '1px solid #e0e0e0', background: '#fafafa',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                color: '#555', fontFamily: 'inherit',
                              }}
                            >
                              Switch to Builder to edit manually
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {descLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
                  <div style={{ padding: '12px 16px', borderRadius: '12px 12px 12px 4px', background: '#fff', border: '1px solid #eaeaea' }}>
                    <LoadingDots />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* ─── Chat input bar (always visible at bottom) ─── */}
          <div style={{
            background: '#fff',
            borderTop: '1px solid #eaeaea',
            flexShrink: 0,
          }}>
            <div style={{ maxWidth: 640, margin: '0 auto' }}>

              {/* Collapsible quick-filter panel */}
              {aiFiltersOpen && (
                <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #f0f0f0' }}>
                  {/* Budget row */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Budget</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: '#999' }}>€</span>
                      <input
                        type="number"
                        value={aiBudget}
                        onChange={(e) => setAiBudget(e.target.value)}
                        placeholder="e.g. 2000"
                        style={{
                          flex: 1, border: '1px solid #e0e0e0', borderRadius: 8,
                          padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
                          outline: 'none', color: '#222', maxWidth: 140,
                        }}
                        onFocus={(e) => { e.target.style.borderColor = colors.inkPlum }}
                        onBlur={(e) => { e.target.style.borderColor = '#e0e0e0' }}
                      />
                      {aiBudget && (
                        <button onClick={() => setAiBudget('')} style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 14, padding: 2 }}>×</button>
                      )}
                    </div>
                  </div>

                  {/* Collections row */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Collections</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {COLLECTIONS.map((col) => {
                        const active = aiCollections.includes(col.id)
                        return (
                          <button
                            key={col.id}
                            onClick={() => toggleAiCollection(col.id)}
                            style={{
                              padding: '5px 10px', borderRadius: 16, border: active ? `1.5px solid ${colors.inkPlum}` : '1px solid #ddd',
                              background: active ? `${colors.inkPlum}12` : '#fafafa', color: active ? colors.inkPlum : '#666',
                              fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                              transition: 'all .12s',
                            }}
                          >
                            {col.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Colors row — only show when collections are selected */}
                  {aiAvailableColors.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                        Colors {aiColors.length > 0 && <span style={{ color: colors.inkPlum }}>({aiColors.length})</span>}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {aiAvailableColors.map((c) => {
                          const active = aiColors.includes(c.n)
                          return (
                            <button
                              key={c.n}
                              onClick={() => toggleAiColor(c.n)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 8px', borderRadius: 12,
                                border: active ? `1.5px solid ${colors.inkPlum}` : '1px solid #e0e0e0',
                                background: active ? `${colors.inkPlum}10` : '#fff',
                                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                              }}
                            >
                              <span style={{
                                width: 12, height: 12, borderRadius: '50%',
                                background: c.h, border: '1px solid rgba(0,0,0,.1)',
                                flexShrink: 0,
                              }} />
                              <span style={{
                                fontSize: 10, fontWeight: active ? 700 : 400,
                                color: active ? colors.inkPlum : '#666',
                              }}>
                                {c.n}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Input row */}
              <div style={{ padding: '8px 14px 10px', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                {/* Filter toggle button */}
                <button
                  onClick={() => setAiFiltersOpen((v) => !v)}
                  title="Quick filters"
                  style={{
                    width: 38, height: 38, borderRadius: 10, border: '1px solid #e0e0e0', flexShrink: 0,
                    background: aiFiltersOpen || aiBudget || aiCollections.length > 0 ? `${colors.inkPlum}15` : '#f7f7f5',
                    color: aiFiltersOpen || aiBudget || aiCollections.length > 0 ? colors.inkPlum : '#999',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    transition: 'all .12s',
                  }}
                >
                  {aiFiltersOpen ? '▾' : '▸'}
                </button>

                <div style={{ flex: 1, display: 'flex', gap: 6, background: '#f7f7f5', borderRadius: 12, border: '1px solid #e0e0e0', padding: 4, alignItems: 'flex-end' }}>
                  <input
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend() } }}
                    placeholder={aiBudget || aiCollections.length ? 'Ask about your selections...' : 'Describe your client\'s needs...'}
                    disabled={descLoading}
                    style={{
                      flex: 1, border: 'none', outline: 'none', fontSize: 13,
                      fontFamily: 'inherit', padding: '10px 10px', color: '#222',
                      background: 'transparent', lineHeight: 1.4,
                    }}
                  />
                  <button
                    onClick={() => handleAiSend()}
                    disabled={!chatInput.trim() || descLoading}
                    style={{
                      width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0,
                      background: chatInput.trim() && !descLoading ? colors.inkPlum : '#e5e5e5',
                      color: '#fff', cursor: chatInput.trim() && !descLoading ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                      transition: 'background .15s',
                    }}
                  >
                    ↑
                  </button>
                </div>
              </div>

              {/* Active filters summary (when collapsed but filters are set) */}
              {!aiFiltersOpen && (aiBudget || aiCollections.length > 0 || aiColors.length > 0) && (
                <div style={{ padding: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: '#aaa', marginRight: 2 }}>Context:</span>
                  {aiBudget && (
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: '#f0edf2', color: colors.inkPlum, fontWeight: 600 }}>
                      €{aiBudget}
                    </span>
                  )}
                  {aiCollections.map((id) => {
                    const col = COLLECTIONS.find((c) => c.id === id)
                    return col ? (
                      <span key={id} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: '#f0edf2', color: colors.inkPlum, fontWeight: 600 }}>
                        {col.label}
                      </span>
                    ) : null
                  })}
                  {aiColors.length > 0 && (
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: '#f0edf2', color: colors.inkPlum, fontWeight: 600 }}>
                      {aiColors.length} color{aiColors.length !== 1 ? 's' : ''}
                    </span>
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
const AI_PRODUCT_ALIASES = {
  'SHAPY SPARKLE ROUND(G/H VS)': 'SHAPY SPARKLE RND G/H',
  'SHAPY SPARKLE ROUND(G/H)': 'SHAPY SPARKLE RND G/H',
  'SHAPY SPARKLE ROUND(D VVS)': 'SHAPY SPARKLE RND D VVS',
  'HOLY(D VVS)': 'HOLY (D VVS)',
  'HOLY(DVVS)': 'HOLY (D VVS)',
}

function normalizeProductName(productName) {
  if (!productName) return ''
  const upper = String(productName).trim().toUpperCase()
  return AI_PRODUCT_ALIASES[upper] || upper
}

function findCollectionId(productName) {
  if (!productName) return null
  const name = normalizeProductName(productName)
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

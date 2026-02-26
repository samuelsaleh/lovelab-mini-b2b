'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { sendChat, sendRecommendationChat } from '@/lib/api'
import { COLLECTIONS, CORD_COLORS, CORD_TYPE_LABELS, HOUSING, calculateQuote } from '@/lib/catalog'
import { colors, fonts } from '@/lib/styles'
import { validateVAT } from '@/lib/vat'
import { useI18n } from '@/lib/i18n'
import LoadingDots from './components/LoadingDots'
import MiniQuote from './components/MiniQuote'
import QuoteModal from './components/QuoteModal'
import OptionPicker from './components/OptionPicker'
import BuilderPage, { mkLine, mkColorConfig, uniqueId } from './components/BuilderPage'
import OrderForm from './components/OrderForm'
import ClientGate from './components/ClientGate'
import TopNav from './components/TopNav'
import DocumentsPanel from './components/DocumentsPanel'
import { useAuth } from './components/AuthProvider'
import { useIsMobile } from '@/lib/useIsMobile'

const STORAGE_KEY = 'lovelab-b2b-state'

// Quick-start suggestion chips for the AI chat
const AI_CHIPS = [
  'I have a budget of €2000, suggest a starter order',
  'Show me CUTY + CUBIX options in 3 colors',
  'Build me a bestseller order for a boutique',
  'What can I get for €1200?',
]

export default function App() {
  const { profile } = useAuth()
  const { t } = useI18n()
  const mobile = useIsMobile()
  
  // Active tab: 'builder' | 'ai' | 'orderform' | 'documents'
  const [activeTab, setActiveTab] = useState('builder')

  // Builder state (shared -- AI results can populate this)
  const [lines, setLines] = useState([mkLine()])

  // Builder budget tracker
  const [builderBudget, setBuilderBudget] = useState('')
  const [budgetRecommendations, setBudgetRecommendations] = useState(null)
  const [showRecommendations, setShowRecommendations] = useState(false)

  // Quote state
  const [curQuote, setCurQuote] = useState(null)
  const [showQuote, setShowQuote] = useState(false)

  // Order form state
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderFormQuote, setOrderFormQuote] = useState(null)
  const [savedFormState, setSavedFormState] = useState(null)
  const [editingDocumentId, setEditingDocumentId] = useState(null) // ID of document being re-edited
  const [docsRefreshKey, setDocsRefreshKey] = useState(0)

  // Client info
  const [client, setClient] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    country: '',
    address: '',
    city: '',
    zip: '',
    vat: '',
    vatValid: null,
    vatStatus: null,       // 'VALID' | 'INVALID' | 'UNVERIFIED' | null
    vatErrorCode: null,
    vatMessageKey: null,
    vatValidating: false,
  })
  const [clientReady, setClientReady] = useState(true)

  // AI chat state
  const [descLoading, setDescLoading] = useState(false)
  const [aiMsgs, setAiMsgs] = useState([])
  const [chatInput, setChatInput] = useState('')

  // AI quick-filter toggles
  const [aiFiltersOpen, setAiFiltersOpen] = useState(false)
  const [aiBudget, setAiBudget] = useState('')
  const [aiCollections, setAiCollections] = useState([])
  const [aiColors, setAiColors] = useState([])

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
      palette.forEach((c) => { if (!colorMap.has(c.n)) colorMap.set(c.n, c.h) })
    })
    return Array.from(colorMap.entries()).map(([n, h]) => ({ n, h }))
  }, [aiCollections])

  const toggleAiCollection = (id) => {
    setAiCollections((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
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

  // ─── VAT banner ───
  const hasVat = Boolean(client.vat && client.vat.trim().length >= 4)
  const vatStatus = client.vatStatus || (client.vatValid === true ? 'VALID' : client.vatValid === false ? 'INVALID' : hasVat ? 'UNVERIFIED' : null)
  const showVatBanner = hasStarted && hasVat && (client.vatValidating || vatStatus !== 'VALID')

  const retryVatValidation = useCallback(() => {
    const vat = client.vat?.trim()
    if (!vat || vat.length < 4) return
    if (client.vatValidating) return
    setClient((prev) => ({ ...prev, vatValidating: true, vatValid: null, vatStatus: null, vatErrorCode: null, vatMessageKey: null }))
    validateVAT(vat)
      .then((viesRes) => {
        setClient((prev) => ({
          ...prev,
          vatValid: viesRes.valid,
          vatStatus: viesRes.status || null,
          vatErrorCode: viesRes.errorCode || null,
          vatMessageKey: viesRes.messageKey || null,
          vatValidating: false,
        }))
      })
      .catch(() => { setClient((prev) => ({ ...prev, vatValid: null, vatStatus: 'UNVERIFIED', vatErrorCode: 'NETWORK_ERROR', vatMessageKey: 'vat.unverified.generic', vatValidating: false })) })
  }, [client.vat, client.vatValidating, setClient])

  // ─── Generate quote from builder ───
  const handleGenerateQuote = useCallback((quote) => {
    setCurQuote(quote)
    setShowQuote(true)
  }, [])

  // ─── Budget Recommendations ───
  const handleBudgetRecommendations = useCallback(async () => {
    const budgetNum = parseFloat(builderBudget)
    if (!budgetNum || budgetNum <= 0) return
    const quote = calculateQuote(lines)
    const spent = quote.total
    const remaining = budgetNum - spent
    if (remaining <= 0) return
    setBudgetRecommendations({ loading: true, message: null, suggestions: null })
    setShowRecommendations(true)
    const currentItems = quote.lines.map((ln) =>
      `${ln.product} ${ln.carat}ct ${ln.colorName}${ln.housing ? ` (${ln.housing})` : ''}${ln.shape ? ` ${ln.shape}` : ''} ×${ln.qty}`
    ).join('; ')
    const prompt = `The client has a budget of €${budgetNum}. They have already built an order worth €${spent} (after any discounts). They have €${remaining} remaining.\n\nCurrent order: ${currentItems || 'empty'}\n\nIMPORTANT: Do NOT change or remove anything from the current order. Only suggest what to ADD on top of it.\nBased on what they already like (their chosen collections, colors, carat sizes), suggest 3-5 smart additions they could make with the remaining €${remaining}. Consider:\n- Adding more pieces of collections they already chose (safe upsell)\n- Trying a new complementary collection\n- Upgrading carat size on an existing line\n- Adding new colors of something they already have\n\nFor each suggestion, give a short one-line description and the approximate cost.\nKeep it very concise — this is for a salesperson at a trade fair.`
    try {
      const parsed = await sendRecommendationChat(prompt)
      setBudgetRecommendations({ loading: false, message: parsed.message, suggestions: parsed.quote })
    } catch {
      setBudgetRecommendations({ loading: false, message: 'Could not generate recommendations. Please try again.', suggestions: null })
    }
  }, [builderBudget, lines])

  // ─── Finalize order ───
  const handleFinalize = useCallback(() => {
    setShowQuote(false)
    setOrderFormQuote(curQuote)
    setSavedFormState(null)
    setEditingDocumentId(null)
    setShowOrderForm(true)
  }, [curQuote])

  // ─── Open blank order form ───
  const handleBlankOrderForm = useCallback(() => {
    setOrderFormQuote(null)
    setSavedFormState(null)
    setEditingDocumentId(null) // Clear any editing state
    setShowOrderForm(true)
  }, [])

  // ─── Re-edit a saved document ───
  const handleReEdit = useCallback((doc) => {
    const formState = doc?.metadata?.formState
    if (!formState) return
    setOrderFormQuote(null)
    setSavedFormState(formState)
    setEditingDocumentId(doc.id) // Track which document we're editing
    setShowOrderForm(true)
  }, [])

  // ─── Edit in Builder (from OrderForm) ───
  const handleEditInBuilder = useCallback((formRows) => {
    if (!formRows || formRows.length === 0) return
    
    // Convert OrderForm rows back to builder lines
    // Group by collection
    const byCollection = new Map()
    for (const row of formRows) {
      if (!row.collection || !row.quantity) continue
      const col = COLLECTIONS.find(c => c.label === row.collection)
      if (!col) continue
      if (!byCollection.has(col.id)) byCollection.set(col.id, [])
      byCollection.get(col.id).push(row)
    }
    
    // Build lines array
    const newLines = Array.from(byCollection.entries()).map(([colId, rows]) => {
      const col = COLLECTIONS.find(c => c.id === colId)
      const colorConfigs = rows.map(row => {
        const caratIdx = col.carats.findIndex(c => c === row.carat)
        let housing = row.bpColor || null
        let housingType = row.setting ? row.setting.toLowerCase() : null
        // For shapyShine/matchy the builder stores housing as "Bezel Yellow" / "Prong Yellow"
        // In the order form bpColor is stripped (just "Yellow") and setting holds "Bezel"/"Prong"
        // Reconstruct the prefixed value the builder expects
        if (housingType && housing && (col.housing === 'shapyShine' || col.housing === 'matchy')) {
          housing = `${row.setting} ${housing}`
        }
        // Fallback: detect prefix in case bpColor still has it (legacy)
        if (!housingType && housing) {
          if (housing.startsWith('Bezel ')) {
            housingType = 'bezel'
          } else if (housing.startsWith('Prong ')) {
            housingType = 'prong'
          }
        }
        let multiAttached = null
        if (col.housing === 'multiThree') {
          if (row.setting === 'F') multiAttached = true
          else if (row.setting === 'LO') multiAttached = false
          else if (housing) multiAttached = HOUSING.multiThree.attached.includes(housing)
        }
        let cordType = null
        let thickness = null
        if (row.material) {
          const m = row.material.match(/^(.+?)\s*\((\w+)\)\s*$/)
          if (m) {
            const label = m[1].trim()
            cordType = Object.entries(CORD_TYPE_LABELS).find(([, v]) => v === label)?.[0] || label.toLowerCase()
            thickness = m[2]
          } else {
            cordType = Object.entries(CORD_TYPE_LABELS).find(([, v]) => v === row.material)?.[0] || row.material.toLowerCase()
          }
        }
        const priceOverride = row.unitOverride != null ? row.unitOverride : null
        return {
          id: uniqueId(),
          colorName: row.colorCord || '',
          qty: parseInt(row.quantity) || 1,
          caratIdx: caratIdx >= 0 ? caratIdx : null,
          housing,
          housingType,
          shape: row.shape || null,
          size: row.size || null,
          multiAttached,
          cordType,
          thickness,
          priceOverride,
        }
      })
      return { uid: uniqueId(), collectionId: colId, colorConfigs, expanded: true }
    })
    
    if (newLines.length > 0) {
      setLines(newLines)
    }
    setShowOrderForm(false)
    setActiveTab('builder')
  }, [])

  // ─── Tab change handler ───
  const handleTabChange = useCallback((tab) => {
    if (tab === 'orderform') {
      handleBlankOrderForm()
      return
    }
    setActiveTab(tab)
  }, [handleBlankOrderForm])

  // ─── Send message to AI ───
  const handleAiSend = useCallback(async (overrideMsg) => {
    const rawMessage = typeof overrideMsg === 'string' ? overrideMsg : chatInput.trim()
    if (!rawMessage || descLoading) return
    const context = buildFilterContext()
    const message = context ? `${context}${rawMessage}` : rawMessage
    setChatInput('')
    setDescLoading(true)
    const displayMsg = { role: 'user', content: rawMessage }
    const apiMsg = { role: 'user', content: message }
    // Build API messages from current state (descLoading guard prevents concurrent calls)
    const apiMsgs = [...aiMsgs, apiMsg]
    setAiMsgs((prev) => [...prev, displayMsg])
    try {
      const parsed = await sendChat(apiMsgs)
      let expandedQuote = null
      if (parsed.quote && parsed.quote.lines && parsed.quote.lines.length > 0) {
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
            const base = { caratIdx, housing: ql.housing ?? null, housingType: ql.housingType ?? null, multiAttached: ql.multiAttached ?? null, shape: ql.shape ?? null, size: ql.size ?? null }
            if (Array.isArray(ql.colors) && ql.colors.length > 0) {
              const per = Number(ql.qtyPerColor) || Number(ql.qty) || 1
              for (const cName of ql.colors) {
                colorConfigs.push({ ...mkColorConfig(cName, per), ...base, qty: per, colorName: cName })
              }
              continue
            }
            const colorName = ql.colorName || ql.color || 'Unknown'
            const qty = Number(ql.qty) || Number(ql.totalQty) || 1
            colorConfigs.push({ ...mkColorConfig(colorName, qty), ...base, qty, colorName })
          }
          return { uid: uniqueId(), collectionId: colId, colorConfigs, expanded: true }
        })
        setLines(newLines)
        expandedQuote = calculateQuote(newLines)
        setCurQuote(expandedQuote)
      } else if (parsed.quote) {
        setCurQuote(parsed.quote)
        expandedQuote = parsed.quote
      }
      const assistantMsg = {
        role: 'assistant', content: parsed.message, quote: expandedQuote,
        options: Array.isArray(parsed.options) && parsed.options.length > 0 ? parsed.options : null,
      }
      setAiMsgs((prev) => [...prev, assistantMsg])
    } catch (err) {
      const errorDetail = err?.message || 'Unknown error'
      setAiMsgs((prev) => [...prev, { role: 'assistant', content: `${t('ai.error')}\n\n(${errorDetail})`, quote: null }])
    }
    setDescLoading(false)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [chatInput, descLoading, aiMsgs, buildFilterContext])

  const handleSuggestFillOrder = useCallback(() => {
    if (descLoading) return
    const quote = curQuote
    if (!quote) return
    const currentItems = (quote.lines || []).map((ln) =>
      `${ln.product} ${ln.carat}ct ${ln.colorName || ''}${ln.housing ? ` (${ln.housing})` : ''} ×${ln.qty}`
    ).join('; ')
    const msg = `My current order is: ${currentItems}. Total is €${quote.subtotal}. Suggest 2-3 additions to complement what I have. Don't change my existing order.`
    handleAiSend(msg)
  }, [curQuote, descLoading, handleAiSend])

  // ─── Client Gate ───
  const handleClientComplete = useCallback(() => { setClientReady(true) }, [])

  // ─── Reset ───
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

  const handleNewClient = () => {
    setClient({ name: '', phone: '', email: '', company: '', country: '', address: '', city: '', zip: '', vat: '', vatValid: null, vatValidating: false, vatStatus: null, vatErrorCode: null, vatMessageKey: null })
    setClientReady(false)
    handleReset()
  }

  // ─── localStorage persistence ───
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
        if (state.activeTab) setActiveTab(state.activeTab)
        else if (state.mode) setActiveTab(state.mode === 'describe' ? 'ai' : 'builder')
        if (state.builderBudget) setBuilderBudget(state.builderBudget)
        if (state.aiBudget) setAiBudget(state.aiBudget)
        if (state.aiCollections) setAiCollections(state.aiCollections)
        if (state.aiColors) setAiColors(state.aiColors)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      // Limit aiMsgs to last 50 messages to prevent localStorage overflow (5MB limit)
      const trimmedAiMsgs = aiMsgs.length > 50 ? aiMsgs.slice(-50) : aiMsgs
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lines,
        client: clientReady ? client : null,
        clientReady,
        curQuote,
        aiMsgs: trimmedAiMsgs,
        activeTab,
        builderBudget,
        aiBudget,
        aiCollections,
        aiColors,
      }))
    } catch { /* localStorage full or unavailable -- ignore */ }
  }, [lines, client, clientReady, curQuote, aiMsgs, activeTab, builderBudget, aiBudget, aiCollections, aiColors])

  // ─── Pick up re-edit from sessionStorage (dashboard redirect) ───
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('lovelab-reedit')
      if (raw) {
        sessionStorage.removeItem('lovelab-reedit')
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          const formState = parsed.formState ?? parsed
          const documentId = parsed.documentId ?? null
          setSavedFormState(formState)
          setOrderFormQuote(null)
          if (documentId) setEditingDocumentId(documentId)
          setShowOrderForm(true)
        }
      }
    } catch { /* ignore */ }
    try {
      const targetTab = sessionStorage.getItem('lovelab-target-tab')
      if (targetTab) {
        sessionStorage.removeItem('lovelab-target-tab')
        if (targetTab === 'orderform') handleBlankOrderForm()
        else setActiveTab(targetTab)
      }
    } catch { /* ignore */ }
  }, [])

  // ─── Client Gate ───
  if (!clientReady) {
    return (
      <ClientGate client={client} setClient={setClient} onComplete={handleClientComplete} />
    )
  }

  return (
    <div style={{ fontFamily: fonts.body, background: '#f8f8f8', height: '100vh', display: 'flex', flexDirection: 'column', color: '#333' }}>
      {showQuote && <QuoteModal quote={curQuote} client={client} onClose={() => setShowQuote(false)} onFinalize={handleFinalize} />}
      {showOrderForm && <OrderForm quote={orderFormQuote} client={client} onClose={() => { setShowOrderForm(false); setSavedFormState(null); setEditingDocumentId(null); setDocsRefreshKey(k => k + 1) }} currentUser={profile} savedFormState={savedFormState} editingDocumentId={editingDocumentId} onEditInBuilder={handleEditInBuilder} />}

      {/* ─── Top Navigation ─── */}
      <TopNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        client={client}
        onEditClient={() => setClientReady(false)}
        onNewClient={handleNewClient}
      />

      {/* ─── VAT banner ─── */}
      {showVatBanner && (
        <div style={{ background: '#fff', borderBottom: '1px solid #eaeaea', padding: '8px 20px', flexShrink: 0 }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <div style={{
              borderRadius: 8, padding: '8px 12px',
              border: `1px solid ${client.vatValidating ? '#e0e0e0' : vatStatus === 'INVALID' ? '#f5c6cb' : '#ffeeba'}`,
              background: client.vatValidating ? '#f7f7f7' : vatStatus === 'INVALID' ? '#f8d7da' : '#fff3cd',
              color: client.vatValidating ? '#555' : vatStatus === 'INVALID' ? '#721c24' : '#856404',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12,
            }}>
              <span style={{ fontWeight: 600 }}>
                {client.vatValidating
                  ? t('vat.checking')
                  : vatStatus === 'INVALID'
                    ? t('vat.invalid')
                    : t(client.vatMessageKey || 'vat.notVerified')}
                <span style={{ fontWeight: 400, marginLeft: 8 }}>{client.vat}</span>
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {!client.vatValidating && (
                  <button onClick={retryVatValidation} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t('client.retry')}</button>
                )}
                <button onClick={() => setClientReady(false)} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${colors.inkPlum}`, background: 'transparent', color: colors.inkPlum, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t('vat.editVat')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <main role="main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {activeTab === 'builder' && (
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
        )}

        {activeTab === 'ai' && (
          /* ─── AI Advisor Chat Mode ─── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Chat messages */}
            <div aria-live="polite" aria-label="Chat messages" style={{ flex: 1, overflowY: 'auto', padding: mobile ? '14px 12px' : '18px 20px' }}>
              <div style={{ maxWidth: 700, margin: '0 auto' }}>
                {aiMsgs.length === 0 && (
                  <div style={{ textAlign: 'center', padding: mobile ? '30px 16px' : '40px 20px' }}>
                    <div style={{ fontSize: mobile ? 16 : 18, fontWeight: 800, color: colors.inkPlum, marginBottom: 6 }}>{t('ai.title')}</div>
                    <div style={{ fontSize: mobile ? 12 : 13, color: '#999', lineHeight: 1.6, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
                      {t('ai.description')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 6 : 8, justifyContent: 'center' }}>
                      {AI_CHIPS.map((chip, i) => (
                        <button
                          key={i}
                          onClick={() => { setChatInput(chip); setTimeout(() => chatInputRef.current?.focus(), 50) }}
                          style={{
                            padding: mobile ? '10px 14px' : '8px 14px', borderRadius: 20, border: '1px solid #e3e3e3',
                            background: '#fff', color: '#555', fontSize: mobile ? 13 : 12, cursor: 'pointer',
                            fontFamily: 'inherit', transition: 'all .12s', lineHeight: 1.3,
                            minHeight: mobile ? 44 : 'auto',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.color = colors.inkPlum }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e3e3e3'; e.currentTarget.style.color = '#555' }}
                        >{chip}</button>
                      ))}
                    </div>
                  </div>
                )}

                {aiMsgs.map((m, i) => {
                  const optionsAnswered = m.options && i < aiMsgs.length - 1
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                      <div style={{
                        maxWidth: mobile ? '92%' : '88%', padding: mobile ? '12px 14px' : '10px 14px',
                        borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: m.role === 'user' ? colors.inkPlum : '#fff',
                        color: m.role === 'user' ? '#fff' : '#333',
                        fontSize: mobile ? 13 : 12, lineHeight: 1.5,
                        border: m.role === 'user' ? 'none' : '1px solid #eaeaea',
                      }}>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                        {m.options && (
                          <OptionPicker options={m.options} onSend={(msg) => handleAiSend(msg)} disabled={descLoading || optionsAnswered} />
                        )}
                        {m.quote && (
                          <div style={{ marginTop: 8 }}>
                            <MiniQuote q={m.quote} onView={() => { setCurQuote(m.quote); setShowQuote(true) }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                              <button onClick={handleSuggestFillOrder} disabled={descLoading} style={{ width: '100%', padding: mobile ? 12 : 8, borderRadius: 8, border: `1px solid ${colors.luxeGold}`, background: '#fff', fontSize: mobile ? 12 : 11, fontWeight: 600, cursor: descLoading ? 'default' : 'pointer', color: colors.luxeGold, fontFamily: 'inherit', opacity: descLoading ? 0.6 : 1, minHeight: mobile ? 44 : 'auto' }}>
                                {t('ai.suggestFill')}
                              </button>
                              <button onClick={() => setActiveTab('builder')} style={{ width: '100%', padding: mobile ? 12 : 8, borderRadius: 8, border: '1px solid #e0e0e0', background: '#fafafa', fontSize: mobile ? 12 : 11, fontWeight: 600, cursor: 'pointer', color: '#555', fontFamily: 'inherit', minHeight: mobile ? 44 : 'auto' }}>
                                {t('ai.switchBuilder')}
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
                    <div style={{ padding: mobile ? '14px 18px' : '12px 16px', borderRadius: '12px 12px 12px 4px', background: '#fff', border: '1px solid #eaeaea' }}>
                      <LoadingDots />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Chat input */}
            <div style={{ background: '#fff', borderTop: '1px solid #eaeaea', flexShrink: 0 }}>
              <div style={{ maxWidth: 700, margin: '0 auto' }}>
                {aiFiltersOpen && (
                  <div style={{ padding: mobile ? '12px 12px 6px' : '12px 20px 6px', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: mobile ? 11 : 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t('ai.budget')}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: mobile ? 15 : 13, color: '#999' }}>€</span>
                        <input type="number" value={aiBudget} onChange={(e) => setAiBudget(e.target.value)} placeholder="e.g. 2000" style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 8, padding: mobile ? '10px 12px' : '7px 10px', fontSize: mobile ? 16 : 13, fontFamily: 'inherit', outline: 'none', color: '#222', maxWidth: mobile ? 160 : 140, minHeight: mobile ? 44 : 'auto' }} />
                        {aiBudget && <button onClick={() => setAiBudget('')} style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: mobile ? 18 : 14, padding: mobile ? 8 : 2, minWidth: mobile ? 36 : 'auto', minHeight: mobile ? 36 : 'auto' }}>x</button>}
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: mobile ? 11 : 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t('ai.collections')}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 6 : 5 }}>
                        {COLLECTIONS.map((col) => {
                          const active = aiCollections.includes(col.id)
                          return (
                            <button key={col.id} onClick={() => toggleAiCollection(col.id)} style={{ padding: mobile ? '8px 14px' : '5px 10px', borderRadius: 16, border: active ? `1.5px solid ${colors.inkPlum}` : '1px solid #ddd', background: active ? `${colors.inkPlum}12` : '#fafafa', color: active ? colors.inkPlum : '#666', fontSize: mobile ? 12 : 11, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', minHeight: mobile ? 36 : 'auto' }}>
                              {col.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {aiAvailableColors.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: mobile ? 11 : 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t('ai.colors')} {aiColors.length > 0 && <span style={{ color: colors.inkPlum }}>({aiColors.length})</span>}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 6 : 4 }}>
                          {aiAvailableColors.map((c) => {
                            const active = aiColors.includes(c.n)
                            return (
                              <button key={c.n} onClick={() => toggleAiColor(c.n)} style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 4, padding: mobile ? '8px 12px' : '4px 8px', borderRadius: 12, border: active ? `1.5px solid ${colors.inkPlum}` : '1px solid #e0e0e0', background: active ? `${colors.inkPlum}10` : '#fff', cursor: 'pointer', fontFamily: 'inherit', minHeight: mobile ? 36 : 'auto' }}>
                                <span style={{ width: mobile ? 14 : 12, height: mobile ? 14 : 12, borderRadius: '50%', background: c.h, border: '1px solid rgba(0,0,0,.1)', flexShrink: 0 }} />
                                <span style={{ fontSize: mobile ? 12 : 10, fontWeight: active ? 700 : 400, color: active ? colors.inkPlum : '#666' }}>{c.n}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ padding: mobile ? '12px 12px 16px' : '8px 20px 10px', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                  <button
                    onClick={() => setAiFiltersOpen((v) => !v)}
                    title="Quick filters"
                    aria-label={t('ai.filters')}
                    aria-expanded={aiFiltersOpen}
                    style={{
                      width: mobile ? 44 : 38, height: mobile ? 44 : 38, borderRadius: 10, border: '1px solid #e0e0e0', flexShrink: 0,
                      background: aiFiltersOpen || aiBudget || aiCollections.length > 0 ? `${colors.inkPlum}15` : '#f7f7f5',
                      color: aiFiltersOpen || aiBudget || aiCollections.length > 0 ? colors.inkPlum : '#999',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: mobile ? 18 : 16,
                    }}
                  >{aiFiltersOpen ? 'v' : '>'}</button>
                  <div style={{ flex: 1, display: 'flex', gap: 6, background: '#f7f7f5', borderRadius: 12, border: '1px solid #e0e0e0', padding: mobile ? 6 : 4, alignItems: 'flex-end' }}>
                    <input
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend() } }}
                      placeholder={aiBudget || aiCollections.length ? t('ai.placeholderFiltered') : t('ai.placeholder')}
                      aria-label="Chat message input"
                      disabled={descLoading}
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: mobile ? 16 : 13, fontFamily: 'inherit', padding: mobile ? '12px 10px' : '10px 10px', color: '#222', background: 'transparent', lineHeight: 1.4 }}
                    />
                    <button
                      onClick={() => handleAiSend()}
                      disabled={!chatInput.trim() || descLoading}
                      aria-label="Send message"
                      style={{
                        width: mobile ? 44 : 38, height: mobile ? 44 : 38, borderRadius: 10, border: 'none', flexShrink: 0,
                        background: chatInput.trim() && !descLoading ? colors.inkPlum : '#e5e5e5',
                        color: '#fff', cursor: chatInput.trim() && !descLoading ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: mobile ? 20 : 18,
                      }}
                    >^</button>
                  </div>
                </div>
                {!aiFiltersOpen && (aiBudget || aiCollections.length > 0 || aiColors.length > 0) && (
                  <div style={{ padding: mobile ? '0 12px 10px' : '0 20px 8px', display: 'flex', flexWrap: 'wrap', gap: mobile ? 6 : 4, alignItems: 'center' }}>
                    <span style={{ fontSize: mobile ? 10 : 9, color: '#aaa', marginRight: 2 }}>{t('ai.context')}</span>
                    {aiBudget && <span style={{ fontSize: mobile ? 10 : 9, padding: mobile ? '4px 10px' : '2px 7px', borderRadius: 8, background: '#f0edf2', color: colors.inkPlum, fontWeight: 600 }}>€{aiBudget}</span>}
                    {aiCollections.map((id) => { const col = COLLECTIONS.find((c) => c.id === id); return col ? <span key={id} style={{ fontSize: mobile ? 10 : 9, padding: mobile ? '4px 10px' : '2px 7px', borderRadius: 8, background: '#f0edf2', color: colors.inkPlum, fontWeight: 600 }}>{col.label}</span> : null })}
                    {aiColors.length > 0 && <span style={{ fontSize: mobile ? 10 : 9, padding: mobile ? '4px 10px' : '2px 7px', borderRadius: 8, background: '#f0edf2', color: colors.inkPlum, fontWeight: 600 }}>{aiColors.length} color{aiColors.length !== 1 ? 's' : ''}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <DocumentsPanel onReEdit={handleReEdit} refreshKey={docsRefreshKey} />
        )}
      </main>
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
  const match = COLLECTIONS.find((c) => c.label.toUpperCase() === name || c.id.toUpperCase() === name)
  if (match) return match.id
  const fuzzy = COLLECTIONS.find((c) => name.includes(c.label.toUpperCase()) || name.includes(c.id.toUpperCase()))
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

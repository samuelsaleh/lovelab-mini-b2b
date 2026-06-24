'use client'

import { useState, useRef, useCallback, useMemo, useEffect, lazy, Suspense } from 'react'
import { sendChat, sendRecommendationChat } from '@/lib/api'
import { COLLECTIONS, CORD_COLORS, CORD_TYPE_LABELS, HOUSING, calculateQuote, getVisibleCollections, DEFAULT_PRICELIST, resolvePricelist } from '@/lib/catalog'
import { colors, fonts } from '@/lib/styles'
import { validateVAT } from '@/lib/vat'
import { useI18n } from '@/lib/i18n'
import { getMainNavItems } from '@/lib/navItems'
import LoadingDots from './components/LoadingDots'
import MiniQuote from './components/MiniQuote'
import QuoteModal from './components/QuoteModal'
import OptionPicker from './components/OptionPicker'
import BuilderPage, { mkLine, mkColorConfig, uniqueId } from './components/BuilderPage'
import OrderForm from './components/OrderForm'
import ClientGate from './components/ClientGate'
import TopNav from './components/TopNav'
import Sidebar from './components/Sidebar'
import DocumentsPanel from './components/DocumentsPanel'
import HomeTab from './components/HomeTab'
import InternalOrdersPanel from './components/InternalOrdersPanel'
import ConsignmentOrdersPanel from './components/ConsignmentOrdersPanel'
import PackshotGallery from './components/PackshotGallery'
import { findPackshot } from '@/lib/packshot-lookup'

import { useAuth } from './components/AuthProvider'
import { useResponsive } from '@/lib/useIsMobile'

const MyAccountPanel = lazy(() => import('./components/MyAccountPanel'))

const STORAGE_KEY = 'lovelab-b2b-state'

// Quick-start suggestion chips for the AI chat
const AI_CHIPS = [
  'I have a budget of €2000, suggest a starter order',
  'Show me CUTY + CUBIX options in 3 colors',
  'Build me a bestseller order for a boutique',
  'What can I get for €1200?',
]

export default function App() {
  const { user, profile, profileMissing, profileError, loading: authLoading, refreshProfile, signOut } = useAuth()
  // Preview (admin-only) collections are gated on this flag across the builder,
  // order form, AI advisor and packshot gallery.
  const isAdmin = profile?.role === 'admin'
  const { t } = useI18n()
  // Compact = phone OR iPad portrait (< 1024px). The whole app shell (sidebar
  // drawer, stacked layouts, bigger tap targets) treats tablets like phones.
  const { isCompact: mobile } = useResponsive()
  
  // Active tab: 'home' | 'builder' | 'ai' | 'orderform' | 'documents'
  const [activeTab, setActiveTab] = useState('home')

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false) // mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Lazy initializer — safe for SSR (Next.js client component but guard anyway)
    if (typeof window === 'undefined') return false
    return localStorage.getItem('lovelab-sidebar-collapsed') === 'true'
  })

  // MyAccountPanel overlay state
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)

  // Builder state (shared -- AI results can populate this)
  const [lines, setLines] = useState([mkLine()])

  // Builder budget tracker
  const [builderBudget, setBuilderBudget] = useState('')
  const [budgetRecommendations, setBudgetRecommendations] = useState(null)
  const [showRecommendations, setShowRecommendations] = useState(false)

  // Active price list (2025 vs 2026). Defaults to DEFAULT_PRICELIST ('2026').
  // Lives at App-level so the same value flows into Builder, OrderForm,
  // saved metadata, and AI prompt context — single source of truth.
  // Wrapped setter normalizes the input through resolvePricelist so a stray
  // undefined or unknown year never lands in state.
  const [pricelistYear, setPricelistYearRaw] = useState(DEFAULT_PRICELIST)
  const setPricelistYear = useCallback((next) => {
    setPricelistYearRaw(resolvePricelist(next))
  }, [])

  // Quote state
  const [curQuote, setCurQuote] = useState(null)
  const [showQuote, setShowQuote] = useState(false)

  // Order form state
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderFormQuote, setOrderFormQuote] = useState(null)
  const [savedFormState, setSavedFormState] = useState(null)
  const [editingDocumentId, setEditingDocumentId] = useState(null) // ID of document being re-edited
  const [editingDocStatus, setEditingDocStatus] = useState(null) // 'draft' | 'sent' of the doc being re-edited (null = new/unknown)
  const [initialOrderChannel, setInitialOrderChannel] = useState('b2b') // 'b2b' | 'internal' | 'consignment'
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
    const quote = calculateQuote(lines, { pricelistYear })
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
      const parsed = await sendRecommendationChat(prompt, { pricelistYear, isAdmin })
      setBudgetRecommendations({ loading: false, message: parsed.message, suggestions: parsed.quote })
    } catch {
      setBudgetRecommendations({ loading: false, message: 'Could not generate recommendations. Please try again.', suggestions: null })
    }
  }, [builderBudget, lines, pricelistYear])

  // ─── Finalize order ───
  const handleFinalize = useCallback(() => {
    setShowQuote(false)
    setOrderFormQuote(curQuote)
    setSavedFormState(null)
    setEditingDocumentId(null)
    setInitialOrderChannel('b2b')
    setShowOrderForm(true)
  }, [curQuote])

  // Tracks which order channel is being built in the builder (for context banner + save modal pre-selection)
  const pendingOrderChannel = useRef('b2b')

  // ─── Open blank order form (optionally with a specific channel type) ───
  const handleBlankOrderForm = useCallback((channel = 'b2b') => {
    setOrderFormQuote(null)
    setSavedFormState(null)
    setEditingDocumentId(null)
    setInitialOrderChannel(channel)
    setShowOrderForm(true)
  }, [])

  // ─── Create new order of a specific type (from OrderTypePicker) ───
  // Land in the Builder (visual product picker) so the user starts at the
  // beginning of the flow, not on the OrderForm "review" page. The selected
  // channel (b2b/internal/consignment/delete_from_stock) is remembered so
  // the SaveDocumentModal pre-selects it later.
  const handleCreateOrder = useCallback((type = 'b2b') => {
    // Sample orders were merged into Draft — always start a normal B2B order.
    const channel = type === 'sample' ? 'b2b' : (type || 'b2b')
    setOrderFormQuote(null)
    setSavedFormState(null)
    setEditingDocumentId(null)
    setShowOrderForm(false)
    setLines([])
    setInitialOrderChannel(channel)
    pendingOrderChannel.current = channel
    setActiveTab('builder')
  }, [])

  // ─── Re-edit a saved document ───
  // We sync pricelistYear into App-level state BEFORE showing OrderForm so the
  // first paint already has the correct year (avoids the one-frame mismatch
  // where header badge + totals flash 2026 then snap to 2025). Both
  // metadata.formState.pricelistYear and the top-level metadata.pricelistYear
  // are checked because we shipped both during the pricelist rollout.
  const handleReEdit = useCallback((doc) => {
    const formState = doc?.metadata?.formState
    if (!formState) return
    const docYear = formState.pricelistYear ?? doc?.metadata?.pricelistYear
    if (docYear != null) setPricelistYear(docYear)
    setOrderFormQuote(null)
    setSavedFormState(formState)
    setEditingDocumentId(doc.id)
    setEditingDocStatus(doc?.status || 'sent')
    setInitialOrderChannel(doc?.order_channel || 'b2b')
    setShowOrderForm(true)
  }, [setPricelistYear])

  // Clear the re-edited doc's status whenever we stop editing (new/blank order,
  // finalize, close). Positive sets happen at the doc-fetch sites below.
  useEffect(() => {
    if (!editingDocumentId) setEditingDocStatus(null)
  }, [editingDocumentId])

  // ─── Deep-link handler — handles all URL params in one place ────────────
  //
  //  /?reEdit=<id>        → open document in OrderForm for re-editing
  //  /?newConsignment=1   → open blank consignment order in builder
  //  /?editInBuilder=<id> → load document rows into builder and switch to builder tab
  //
  useEffect(() => {
    if (authLoading || !user) return
    const params = new URLSearchParams(window.location.search)
    // Clear all params immediately so a refresh doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname)

    const reEditId = params.get('reEdit')
    const editInBuilderId = params.get('editInBuilder')
    const isNewConsignment = params.has('newConsignment')

    if (reEditId) {
      fetch(`/api/documents/${reEditId}`)
        .then(async r => {
          if (!r.ok) { console.error('[reEdit] fetch failed', r.status); return null }
          return r.json()
        })
        .then(data => {
          if (!data?.document) { console.error('[reEdit] no document', data); return }
          if (!data.document.metadata?.formState) {
            setOrderFormQuote(null)
            setSavedFormState(null)
            setEditingDocumentId(data.document.id)
            setEditingDocStatus(data.document.status || 'sent')
            setInitialOrderChannel(data.document.order_channel || 'b2b')
            setShowOrderForm(true)
            return
          }
          handleReEdit(data.document)
        })
        .catch(err => console.error('[reEdit] error:', err))

    } else if (editInBuilderId) {
      fetch(`/api/documents/${editInBuilderId}`)
        .then(async r => {
          if (!r.ok) { console.error('[editInBuilder] fetch failed', r.status); return null }
          return r.json()
        })
        .then(data => {
          if (!data?.document) { console.error('[editInBuilder] no document', data); return }
          const channel = data.document.order_channel || 'b2b'
          pendingOrderChannel.current = channel
          setInitialOrderChannel(channel)
          setEditingDocumentId(data.document.id)
          setEditingDocStatus(data.document.status || 'sent')
          // Restore the pricelist year before switching tabs so builder + AI
          // immediately quote the document's saved year — previously this was
          // skipped, so a 2025 doc reopened in the builder at 2026 prices.
          const docYear = data.document.metadata?.formState?.pricelistYear
            ?? data.document.metadata?.pricelistYear
          if (docYear != null) setPricelistYear(docYear)
          // Load formState rows into builder if available
          if (data.document.metadata?.formState) {
            setSavedFormState(data.document.metadata.formState)
          }
          setActiveTab('builder')
        })
        .catch(err => console.error('[editInBuilder] error:', err))

    } else if (isNewConsignment) {
      // Go directly to builder for new consignment (not the OrderForm overlay)
      pendingOrderChannel.current = 'consignment'
      setLines([mkLine()])
      setInitialOrderChannel('consignment')
      setActiveTab('builder')
    }
  }, [authLoading, user, handleReEdit, setPricelistYear])

  // ─── Duplicate a saved document as a new order ───
  // Keeps product rows but clears contact info so the user fills in the new client
  const handleDuplicate = useCallback((doc) => {
    const formState = doc?.metadata?.formState
    if (!formState) return
    const { companyName, contactName, addressLine1, addressLine2, country,
      shippingSameAsBilling, shippingAddressLine1, shippingAddressLine2, shippingCountry,
      vatNumber, email, phone, eventName, createdBy, ...rest } = formState
    // Keep the original document's pricelist year on the duplicate so the
    // copy quotes the same numbers as the source order. Same first-paint
    // fix as handleReEdit.
    const docYear = formState.pricelistYear ?? doc?.metadata?.pricelistYear
    if (docYear != null) setPricelistYear(docYear)
    setOrderFormQuote(null)
    setSavedFormState(rest)
    setEditingDocumentId(null)
    setInitialOrderChannel(doc?.order_channel || 'b2b')
    setShowOrderForm(true)
  }, [setPricelistYear])

  // ─── Edit in Builder (from OrderForm) ───
  const handleEditInBuilder = useCallback((formRows) => {
    // Even with no rows we still navigate back to the builder so the user
    // can start adding lines (otherwise the button does nothing on a fresh
    // form, which feels broken).
    if (!formRows || formRows.length === 0) {
      setShowOrderForm(false)
      setActiveTab('builder')
      return
    }

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
        const certType = row.cert === 'In-house' ? 'inhouse' : row.cert === 'IGI' ? 'igi' : null
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
          certType,
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

  // ─── Admin: bypass the client gate on initial load only ───
  // Use a ref so this only fires once when the profile first loads.
  // This prevents the effect from cancelling explicit "Select Client" / "+ New" clicks.
  const adminInitRef = useRef(false)
  useEffect(() => {
    if (profile?.role === 'admin' && !adminInitRef.current) {
      adminInitRef.current = true
      setClientReady(true) // reset in case localStorage had clientReady: false
    }
  }, [profile])

  // ─── Persist sidebar collapse preference ───
  useEffect(() => {
    try { localStorage.setItem('lovelab-sidebar-collapsed', String(sidebarCollapsed)) } catch { /* ignore */ }
  }, [sidebarCollapsed])

  // ─── Tab change handler ───
  const handleTabChange = useCallback((tab) => {
    if (tab === 'orderform') {
      handleBlankOrderForm('b2b')
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
      const parsed = await sendChat(apiMsgs, { pricelistYear, isAdmin })
      let expandedQuote = null
      if (parsed.quote && parsed.quote.lines && parsed.quote.lines.length > 0) {
        const linesByCollection = new Map()
        const unmappedProducts = []
        for (const ql of parsed.quote.lines) {
          const colId = findCollectionId(ql.product)
          if (!colId) {
            unmappedProducts.push(ql.product || 'Unknown')
            continue
          }
          if (!linesByCollection.has(colId)) linesByCollection.set(colId, [])
          linesByCollection.get(colId).push(ql)
        }
        const newLines = Array.from(linesByCollection.entries()).map(([colId, qls]) => {
          const col = COLLECTIONS.find((c) => c.id === colId) || null
          const colorConfigs = []
          for (const ql of qls) {
            const caratIdx = findCaratIdx(ql.product, ql.carat)
            // Forward every field the AI may have set on the line. certType
            // and closureType matter for CUTY/CUBIX — without these the row
            // fails the orderRowValidation gate when the agent tries to save.
            const base = {
              caratIdx,
              housing: ql.housing ?? null,
              housingType: ql.housingType ?? null,
              multiAttached: ql.multiAttached ?? null,
              shape: ql.shape ?? null,
              size: ql.size ?? null,
              certType: ql.certType ?? null,
              closureType: ql.closureType ?? null,
            }
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
        expandedQuote = calculateQuote(newLines, { pricelistYear })
        setCurQuote(expandedQuote)
        if (unmappedProducts.length > 0) {
          parsed.message = (parsed.message || '') + `\n\n⚠️ Could not map ${unmappedProducts.length} product(s) to the catalog: ${unmappedProducts.join(', ')}. These were skipped.`
        }
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
  }, [chatInput, descLoading, aiMsgs, buildFilterContext, pricelistYear])

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
        if (state.pricelistYear) setPricelistYearRaw(resolvePricelist(state.pricelistYear))
      }
    } catch { /* ignore */ }

    const pendingTab = sessionStorage.getItem('pendingTab');
    if (pendingTab) {
      const validTabs = ['home', 'builder', 'ai', 'orderform', 'documents'];
      if (validTabs.includes(pendingTab)) setActiveTab(pendingTab);
      sessionStorage.removeItem('pendingTab');
    }
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
        pricelistYear,
      }))
    } catch { /* localStorage full or unavailable -- ignore */ }
  }, [lines, client, clientReady, curQuote, aiMsgs, activeTab, builderBudget, aiBudget, aiCollections, aiColors, pricelistYear])

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
          setEditingDocStatus(parsed.status ?? null)
          setInitialOrderChannel(parsed.order_channel || 'b2b')
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
  if (user && !authLoading && profileMissing) {
    return (
      <div style={{ fontFamily: fonts.body, background: '#f8f8f8', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 620, width: '100%', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: 24 }}>
          <h2 style={{ margin: 0, marginBottom: 10, fontSize: 20, color: colors.inkPlum }}>Account setup incomplete</h2>
          <p style={{ margin: 0, marginBottom: 8, color: '#555', fontSize: 14, lineHeight: 1.5 }}>
            You are signed in as <strong>{user.email}</strong>, but this account has no profile row in `public.profiles`.
          </p>
          <p style={{ margin: 0, color: '#777', fontSize: 13, lineHeight: 1.5 }}>
            Ask an admin to create your profile and assign your role. Until then, document lists can appear empty even when data exists.
          </p>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.location.href = '/login'}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', color: '#555', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Back to login
            </button>
            <button
              onClick={signOut}
              style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (user && !authLoading && !profile && profileError === 'failed_to_load_profile') {
    return (
      <div style={{ fontFamily: fonts.body, background: '#f8f8f8', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 620, width: '100%', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: 24 }}>
          <h2 style={{ margin: 0, marginBottom: 10, fontSize: 20, color: colors.inkPlum }}>Session sync issue</h2>
          <p style={{ margin: 0, marginBottom: 8, color: '#555', fontSize: 14, lineHeight: 1.5 }}>
            Signed in as <strong>{user.email}</strong>, but your profile could not be loaded right now.
          </p>
          <p style={{ margin: 0, color: '#777', fontSize: 13, lineHeight: 1.5 }}>
            This usually means a temporary auth/session sync problem. Retry profile load or sign out and back in.
          </p>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={refreshProfile}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', color: '#555', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Retry profile load
            </button>
            <button
              onClick={signOut}
              style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Client Gate ───
  if (!clientReady) {
    return (
      <ClientGate
        client={client}
        setClient={setClient}
        onComplete={handleClientComplete}
        onGoHome={() => { setClientReady(true); setActiveTab('home') }}
      />
    )
  }

  const navItems = getMainNavItems(profile)

  return (
    <div className="app-shell" style={{ fontFamily: fonts.body, background: '#f8f8f8', display: 'flex', flexDirection: 'column', color: '#333' }}>
      {showQuote && <QuoteModal quote={curQuote} client={client} onClose={() => setShowQuote(false)} onFinalize={handleFinalize} />}
      {showOrderForm && <OrderForm quote={orderFormQuote} client={client} onClose={() => { setShowOrderForm(false); setSavedFormState(null); setEditingDocumentId(null); setInitialOrderChannel('b2b'); setDocsRefreshKey(k => k + 1) }} currentUser={profile} savedFormState={savedFormState} editingDocumentId={editingDocumentId} editingDocStatus={editingDocStatus} onEditInBuilder={handleEditInBuilder} initialOrderChannel={initialOrderChannel} pricelistYear={pricelistYear} setPricelistYear={setPricelistYear} />}

      {/* MyAccountPanel — backdrop is outside Suspense so it shows immediately */}
      {accountPanelOpen && (
        <div
          onClick={() => setAccountPanelOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 499 }}
        />
      )}
      {accountPanelOpen && (
        <Suspense fallback={null}>
          <MyAccountPanel onClose={() => setAccountPanelOpen(false)} />
        </Suspense>
      )}

      {/* ─── Top Navigation (slim bar — no tabs) ─── */}
      <TopNav
        client={client}
        onEditClient={() => setClientReady(false)}
        onNewClient={handleNewClient}
        onOpenSidebar={() => setSidebarOpen(true)}
        onOpenAccount={() => setAccountPanelOpen(true)}
      />

      {/* ─── VAT banner ─── */}
      {showVatBanner && (
        <div style={{ background: '#fff', borderBottom: '1px solid #eaeaea', padding: '8px 20px', flexShrink: 0 }}>
          <div style={{
            borderRadius: 8, padding: '8px 12px',
            border: `1px solid ${client.vatValidating ? '#e0e0e0' : vatStatus === 'INVALID' ? '#f5c6cb' : '#ffeeba'}`,
            background: client.vatValidating ? '#f7f7f7' : vatStatus === 'INVALID' ? '#f8d7da' : '#fff3cd',
            color: client.vatValidating ? '#555' : vatStatus === 'INVALID' ? '#721c24' : '#856404',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12,
            flexWrap: 'wrap',
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
                <button onClick={retryVatValidation} style={{ padding: mobile ? '10px 14px' : '5px 12px', minHeight: mobile ? 44 : 'auto', borderRadius: 6, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: mobile ? 13 : 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t('client.retry')}</button>
              )}
              <button onClick={() => setClientReady(false)} style={{ padding: mobile ? '10px 14px' : '5px 12px', minHeight: mobile ? 44 : 'auto', borderRadius: 6, border: `1px solid ${colors.inkPlum}`, background: 'transparent', color: colors.inkPlum, fontSize: mobile ? 13 : 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t('vat.editVat')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Body: Sidebar + Main Content ─── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Desktop sidebar */}
        {!mobile && (
          <Sidebar
            items={navItems}
            activeId={activeTab}
            onSelect={handleTabChange}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          />
        )}

        {/* Mobile drawer sidebar */}
        {mobile && (
          <Sidebar
            mobile
            items={navItems}
            activeId={activeTab}
            onSelect={handleTabChange}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        )}

      {/* ─── Main Content ─── */}
      <main role="main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {activeTab === 'home' && (
          <HomeTab onSwitchTab={handleTabChange} onCreateOrder={handleCreateOrder} />
        )}

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
            orderChannel={initialOrderChannel}
            pricelistYear={pricelistYear}
            setPricelistYear={setPricelistYear}
            isAdmin={profile?.role === 'admin'}
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
                            {Array.isArray(m.quote.lines) && m.quote.lines.length > 0 && (
                              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                                {m.quote.lines.slice(0, 6).map((ln, idx) => {
                                  const color = ln.colorName || ln.color || (Array.isArray(ln.colors) ? ln.colors[0] : null)
                                  const colId = findCollectionId(ln.product)
                                  const imageUrl = colId ? findPackshot(colId, { color, housing: ln.housing, shape: ln.shape }) : null
                                  if (!imageUrl) return null
                                  return (
                                    <div key={`${ln.product}-${ln.carat || 'na'}-${color || 'na'}-${idx}`} style={{
                                      border: '1px solid #ece6ef',
                                      background: '#fff',
                                      borderRadius: 8,
                                      padding: 6,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 4,
                                    }}>
                                      <img
                                        src={imageUrl}
                                        alt={`${ln.product || 'Product'} ${color || ''}`.trim()}
                                        style={{
                                          width: '100%',
                                          height: 88,
                                          objectFit: 'contain',
                                          borderRadius: 6,
                                          background: '#faf8fc',
                                        }}
                                      />
                                      <div style={{ fontSize: 10, color: '#666', lineHeight: 1.3 }}>
                                        <strong style={{ color: '#4b3750' }}>{ln.product || 'Item'}</strong>
                                        {ln.carat ? ` · ${ln.carat}ct` : ''}
                                        {color ? ` · ${color}` : ''}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
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
                        {getVisibleCollections(isAdmin).map((col) => {
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
                    {aiColors.map((colorName) => {
                      const colorDef = aiAvailableColors.find((c) => c.n === colorName)
                      return (
                        <span
                          key={colorName}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: mobile ? 10 : 9,
                            padding: mobile ? '4px 10px' : '2px 7px',
                            borderRadius: 8,
                            background: '#f0edf2',
                            color: colors.inkPlum,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: mobile ? 9 : 8,
                              height: mobile ? 9 : 8,
                              borderRadius: '50%',
                              background: colorDef?.h || '#bbb',
                              border: '1px solid rgba(0,0,0,.14)',
                              flexShrink: 0,
                            }}
                          />
                          {colorName}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <DocumentsPanel onReEdit={handleReEdit} onDuplicate={handleDuplicate} refreshKey={docsRefreshKey} />
        )}

        {activeTab === 'internal_orders' && (
          <InternalOrdersPanel onReEdit={handleReEdit} onDuplicate={handleDuplicate} />
        )}

        {activeTab === 'consignment' && (
          <ConsignmentOrdersPanel onReEdit={handleReEdit} onDuplicate={handleDuplicate} />
        )}

        {activeTab === 'photos' && (
          <PackshotGallery inline isAdmin={isAdmin} />
        )}

      </main>
      </div>
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

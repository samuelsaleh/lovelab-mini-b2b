'use client'

import { useCallback, useState, useRef, useMemo, useEffect } from 'react'
import { COLLECTIONS, CORD_COLORS, CORD_TYPE_LABELS, HOUSING, calculateQuote } from '@/lib/catalog'
import { fmt } from '@/lib/utils'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile, useIsTablet } from '@/lib/useIsMobile'
import CollectionConfig from './CollectionConfig'
import { useI18n } from '@/lib/i18n'
import { sendBuilderChat } from '@/lib/api'

let _uidCounter = 0
export function uniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${++_uidCounter}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Exported helpers (used by App.jsx) ───
export function mkColorConfig(colorName, minC = 1) {
  return {
    id: uniqueId(),
    colorName,
    caratIdx: null,
    housing: null,
    housingType: null,
    multiAttached: null,
    shape: null,
    size: null,
    cordType: null,
    thickness: null,
    qty: minC,
  }
}

export function mkLine() {
  return {
    uid: uniqueId(),
    collectionId: null,
    colorConfigs: [],
    expanded: true,
  }
}

// ─── Button Styles ───
const btnPrimary = {
  padding: '10px 24px', borderRadius: 10, border: 'none',
  background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity .15s',
}
const btnSecondary = {
  padding: '10px 24px', borderRadius: 10, border: `1.5px solid ${colors.inkPlum}`,
  background: '#fff', color: colors.inkPlum, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
}
const btnGhost = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: 'transparent', color: '#888', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'color .15s',
}

// ─── Standard Packs ───
// Each pack defines one or more collection lines that get fully prefilled (all palette colors).
const PACKS = [
  {
    id: 'pack-1',
    label: 'Lovelab Pack 1',
    description: ['CUTY — White housing, size M, 0.05 ct'],
    budget: '€20/bracelet',
    lines: [
      { collectionId: 'CUTY', housing: 'White', size: 'M', caratIndices: [0] },
    ],
  },
  {
    id: 'pack-2',
    label: 'Lovelab Pack 2',
    description: [
      'CUTY — White housing, size M, 0.05 & 0.10 ct',
      'CUBIX — White housing, size S/M, 0.05 & 0.10 ct',
    ],
    budget: '€20 – €34/bracelet',
    lines: [
      { collectionId: 'CUTY', housing: 'White', size: 'M', caratIndices: [0, 1] },
      { collectionId: 'CUBIX', housing: 'White', size: 'S/M', caratIndices: [0, 1] },
    ],
  },
  {
    id: 'pack-3',
    label: 'Lovelab Pack 3',
    description: [
      'CUTY — White housing, size M, 0.05 & 0.10 ct',
      'CUBIX — White housing, size S/M, 0.05 & 0.10 ct',
      'MULTI THREE — WWW housing, size M, 0.15 ct',
    ],
    budget: '€20 – €55/bracelet',
    lines: [
      { collectionId: 'CUTY', housing: 'White', size: 'M', caratIndices: [0, 1] },
      { collectionId: 'CUBIX', housing: 'White', size: 'S/M', caratIndices: [0, 1] },
      { collectionId: 'M3', housing: 'WWW', size: 'M', caratIndices: [0] },
    ],
  },
  {
    id: 'pack-cuty',
    label: 'Lovelab Pack Cuty',
    description: ['CUTY — White housing, size M, 0.10 ct'],
    budget: '€30/bracelet',
    lines: [
      { collectionId: 'CUTY', housing: 'White', size: 'M', caratIndices: [1] },
    ],
  },
  {
    id: 'pack-cuty-cubix',
    label: 'Lovelab Cuty-Cubix',
    description: [
      'CUTY — White housing, size M, 0.10 ct',
      'CUBIX — White housing, size S/M, 0.10 ct',
    ],
    budget: '€30 – €34/bracelet',
    lines: [
      { collectionId: 'CUTY', housing: 'White', size: 'M', caratIndices: [1] },
      { collectionId: 'CUBIX', housing: 'White', size: 'S/M', caratIndices: [1] },
    ],
  },
]

// ─── Compute total order estimate for a pack ───
function computePackTotal(pack) {
  return pack.lines.reduce((sum, line) => {
    const col = COLLECTIONS.find(c => c.id === line.collectionId)
    if (!col) return sum
    const colorCount = (CORD_COLORS[col.cord] || []).length
    const lineTotal = line.caratIndices.reduce((s, ci) => s + (col.prices[ci] || 0), 0)
    return sum + lineTotal * colorCount
  }, 0)
}

// ─── Collapsible warnings: shows a compact summary when there are many ───
function WarningsSummary({ warnings }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useI18n()
  const count = warnings.length
  const COLLAPSE_THRESHOLD = 3

  if (count <= COLLAPSE_THRESHOLD) {
    // Few warnings -- show them inline
    return (
      <div style={{ marginBottom: 4 }}>
        {warnings.map((w, i) => (
          <div key={i} style={{ fontSize: 11, color: '#c0392b', marginBottom: 2 }}>! {w}</div>
        ))}
      </div>
    )
  }

  // Many warnings -- show collapsed summary with expand toggle
  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
          padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: '#c0392b', flex: 1, textAlign: 'left' }}>
          {t('builder.warningsCount').replace('{count}', count)}
        </span>
        <span style={{ fontSize: 10, color: '#c0392b', transition: 'transform .15s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>
      {expanded && (
        <div style={{ maxHeight: 80, overflowY: 'auto', marginTop: 4, paddingLeft: 4 }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 10, color: '#c0392b', marginBottom: 2 }}>! {w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BuilderPage({ lines, setLines, onGenerateQuote, budget, setBudget, budgetRecommendations, showRecommendations, setShowRecommendations, onRequestRecommendations }) {
  const mobile = useIsMobile()
  const tablet = useIsTablet()
  const { t } = useI18n()
  const [showSidebar, setShowSidebar] = useState(false)
  
  // Step: 'select' (collection grid) or 'configure' (config view)
  const [step, setStep] = useState(() => {
    // If lines already have collections selected, go to configure
    return lines.some(l => l.collectionId) ? 'configure' : 'select'
  })
  const [selectedCollections, setSelectedCollections] = useState(() => {
    // Init from existing lines
    return lines.filter(l => l.collectionId).map(l => l.collectionId)
  })
  const [budgetEditing, setBudgetEditing] = useState(false)
  const budgetInputRef = useRef(null)
  const [showPacks, setShowPacks] = useState(false)
  
  // Selection state for multi-select feature
  const [selectedConfigs, setSelectedConfigs] = useState(new Set())
  const [showDuplicateVariations, setShowDuplicateVariations] = useState(false)
  const [bulkDuplicateSettings, setBulkDuplicateSettings] = useState({
    carat: { enabled: false, value: null },
    housing: { enabled: false, value: null },
    size: { enabled: false, value: null },
    qty: { enabled: false, value: 1 },
  })
  // Track recently duplicated configs for highlight effect
  const [recentlyDuplicated, setRecentlyDuplicated] = useState(new Set())

  // AI Builder Chat state
  const [showAiChat, setShowAiChat] = useState(false)
  const [aiMessages, setAiMessages] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [pendingActions, setPendingActions] = useState(null) // Actions awaiting confirmation
  const aiChatEndRef = useRef(null)
  const aiInputRef = useRef(null)

  // Live quote
  const quote = useMemo(() => calculateQuote(lines), [lines])
  const hasContent = lines.some(l => {
    if (!l.collectionId || l.colorConfigs.length === 0) return false
    const col = COLLECTIONS.find(c => c.id === l.collectionId)
    if (!col) return false
    return l.colorConfigs.some(cfg => cfg.caratIdx !== null)
  })

  // Budget math
  const budgetNum = parseFloat(budget) || 0
  const hasBudget = budgetNum > 0
  const spent = quote.total
  const hasSpending = spent > 0
  const remaining = hasBudget ? budgetNum - spent : 0
  const pct = hasBudget ? Math.min(100, Math.round((spent / budgetNum) * 100)) : 0
  const overBudget = hasBudget && spent > budgetNum

  // Toggle collection selection
  const toggleCollection = (colId) => {
    setSelectedCollections(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [colId, ...prev]
    )
  }

  // Move from grid to configure step
  const goToConfigure = () => {
    // Create/update lines for selected collections
    setLines(prev => {
      const existingIds = prev.filter(l => l.collectionId).map(l => l.collectionId)
      const newLines = [...prev.filter(l => selectedCollections.includes(l.collectionId))]
      // Add new lines for newly selected collections
      selectedCollections.forEach(colId => {
        if (!existingIds.includes(colId)) {
          newLines.push({ uid: uniqueId(), collectionId: colId, colorConfigs: [], expanded: true })
        }
      })
      return newLines.length > 0 ? newLines : [mkLine()]
    })
    setStep('configure')
  }

  // Go back to grid
  const goToSelect = () => {
    setSelectedCollections(lines.filter(l => l.collectionId).map(l => l.collectionId))
    setStep('select')
  }

  // Update a specific line
  const updateLine = useCallback((uid, patch) => {
    setLines(prev => prev.map(l => l.uid === uid ? { ...l, ...patch } : l))
  }, [setLines])

  // Remove a line
  const removeLine = useCallback((uid) => {
    setLines(prev => {
      const next = prev.filter(l => l.uid !== uid)
      return next.length > 0 ? next : [mkLine()]
    })
    // Clear any selected configs from this line
    setSelectedConfigs(prev => {
      const lineToRemove = lines.find(l => l.uid === uid)
      if (!lineToRemove) return prev
      const configIds = new Set(lineToRemove.colorConfigs.map(c => c.id))
      const next = new Set([...prev].filter(id => !configIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [setLines, lines])

  // Toggle selection of a single config
  const toggleConfigSelection = useCallback((configId) => {
    setSelectedConfigs(prev => {
      const next = new Set(prev)
      if (next.has(configId)) {
        next.delete(configId)
      } else {
        next.add(configId)
      }
      return next
    })
  }, [])

  // Select/deselect all configs in a line
  const toggleLineSelection = useCallback((lineUid) => {
    const line = lines.find(l => l.uid === lineUid)
    if (!line) return
    const configIds = line.colorConfigs.map(c => c.id)
    setSelectedConfigs(prev => {
      const allSelected = configIds.every(id => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        configIds.forEach(id => next.delete(id))
      } else {
        configIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [lines])

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedConfigs(new Set())
  }, [])

  // Duplicate all selected configs (with optional variations)
  const duplicateSelected = useCallback((withVariations = false) => {
    if (selectedConfigs.size === 0) return
    const newIds = new Set()
    setLines(prev => prev.map(line => {
      const selectedInLine = line.colorConfigs.filter(c => selectedConfigs.has(c.id))
      if (selectedInLine.length === 0) return line
      const copies = selectedInLine.map(cfg => {
        const newId = uniqueId()
        newIds.add(newId)
        const copy = { ...cfg, id: newId }
        if (withVariations) {
          if (bulkDuplicateSettings.carat.enabled && bulkDuplicateSettings.carat.value !== null) {
            copy.caratIdx = bulkDuplicateSettings.carat.value
          }
          if (bulkDuplicateSettings.housing.enabled && bulkDuplicateSettings.housing.value) {
            copy.housing = bulkDuplicateSettings.housing.value
          }
          if (bulkDuplicateSettings.size.enabled && bulkDuplicateSettings.size.value) {
            copy.size = bulkDuplicateSettings.size.value
          }
          if (bulkDuplicateSettings.qty.enabled) {
            copy.qty = Math.max(1, bulkDuplicateSettings.qty.value || 1)
          }
        }
        return copy
      })
      return { ...line, colorConfigs: [...line.colorConfigs, ...copies] }
    }))
    // Highlight newly duplicated rows
    setRecentlyDuplicated(newIds)
    setTimeout(() => setRecentlyDuplicated(new Set()), 15000) // Clear after 15 seconds
    
    clearSelection()
    setShowDuplicateVariations(false)
    setBulkDuplicateSettings({
      carat: { enabled: false, value: null },
      housing: { enabled: false, value: null },
      size: { enabled: false, value: null },
      qty: { enabled: false, value: 1 },
    })
  }, [selectedConfigs, setLines, clearSelection, bulkDuplicateSettings])

  // Get count of selected configs
  const selectedCount = selectedConfigs.size

  // Build order context string for AI
  const buildOrderContext = useCallback(() => {
    if (lines.length === 0 || !lines.some(l => l.collectionId)) {
      return 'The order is empty. No collections or items have been added yet.'
    }

    const parts = []
    lines.forEach(line => {
      if (!line.collectionId) return
      const col = COLLECTIONS.find(c => c.id === line.collectionId)
      if (!col) return
      
      parts.push(`\nCollection: ${col.label}`)
      if (line.colorConfigs.length === 0) {
        parts.push('  (no colors added yet)')
      } else {
        line.colorConfigs.forEach((cfg, idx) => {
          const caratLabel = cfg.caratIdx !== null ? col.carats[cfg.caratIdx] + 'ct' : 'no carat'
          const price = cfg.caratIdx !== null ? col.prices[cfg.caratIdx] : 0
          parts.push(`  ${idx + 1}. ${cfg.colorName} | ${caratLabel} | ${cfg.housing || 'no housing'} | ${cfg.size || 'no size'} | qty:${cfg.qty} | €${price * cfg.qty}`)
        })
      }
    })

    parts.push(`\nTotal: ${quote.totalPieces} pieces, ${fmt(quote.total)}`)
    if (hasBudget) {
      parts.push(`Budget: ${fmt(budgetNum)}, Remaining: ${fmt(remaining)}`)
    }

    return parts.join('\n')
  }, [lines, quote, hasBudget, budgetNum, remaining])

  // Execute AI actions
  const executeAiActions = useCallback((actions) => {
    // Pre-generate IDs for new items so we can track them for highlighting
    const newConfigsToAdd = []
    const newCollectionIds = new Set()
    
    actions.forEach(action => {
      if (action.type === 'add') {
        const col = COLLECTIONS.find(c => 
          c.id.toLowerCase() === (action.collection || '').toLowerCase() ||
          c.label.toLowerCase() === (action.collection || '').toLowerCase()
        )
        if (!col) return

        const caratStr = String(action.carat || '').replace('ct', '')
        const caratIdx = col.carats.findIndex(c => String(c) === caratStr)
        const newId = uniqueId()
        
        newConfigsToAdd.push({
          collectionId: col.id,
          config: {
            id: newId,
            colorName: action.color || 'White',
            caratIdx: caratIdx >= 0 ? caratIdx : null,
            housing: action.housing || null,
            housingType: null,
            multiAttached: null,
            shape: null,
            size: action.size || null,
            qty: parseInt(action.qty) || 1,
          }
        })
        newCollectionIds.add(col.id)
      }
    })

    const newIds = new Set(newConfigsToAdd.map(item => item.config.id))
    
    setLines(prev => {
      let updated = [...prev]
      
      // Process ADD actions
      newConfigsToAdd.forEach(({ collectionId, config }) => {
        let line = updated.find(l => l.collectionId === collectionId)
        if (!line) {
          line = { uid: uniqueId(), collectionId, colorConfigs: [], expanded: true }
          updated.push(line)
        }
        updated = updated.map(l => 
          l.collectionId === collectionId 
            ? { ...l, colorConfigs: [...l.colorConfigs, config] }
            : l
        )
      })

      // Process DELETE and MODIFY actions
      actions.forEach(action => {
        if (action.type === 'delete' && action.filter) {
          updated = updated.map(line => {
            const col = COLLECTIONS.find(c => c.id === line.collectionId)
            if (!col) return line

            const matchesCollection = !action.filter.collection || 
              col.id.toLowerCase() === action.filter.collection.toLowerCase() ||
              col.label.toLowerCase() === action.filter.collection.toLowerCase()

            if (!matchesCollection) return line

            const filteredConfigs = line.colorConfigs.filter(cfg => {
              const caratLabel = cfg.caratIdx !== null ? String(col.carats[cfg.caratIdx]) : ''
              
              if (action.filter.color && cfg.colorName.toLowerCase() !== action.filter.color.toLowerCase()) return true
              if (action.filter.carat && caratLabel !== String(action.filter.carat).replace('ct', '')) return true
              if (action.filter.housing && (cfg.housing || '').toLowerCase() !== action.filter.housing.toLowerCase()) return true
              if (action.filter.size && (cfg.size || '').toLowerCase() !== action.filter.size.toLowerCase()) return true
              
              return false // matches filter, delete it
            })

            return { ...line, colorConfigs: filteredConfigs }
          })
        }
        
        else if (action.type === 'modify' && action.filter && action.changes) {
          updated = updated.map(line => {
            const col = COLLECTIONS.find(c => c.id === line.collectionId)
            if (!col) return line

            const matchesCollection = !action.filter.collection || 
              col.id.toLowerCase() === action.filter.collection.toLowerCase() ||
              col.label.toLowerCase() === action.filter.collection.toLowerCase()

            if (!matchesCollection) return line

            const modifiedConfigs = line.colorConfigs.map(cfg => {
              const caratLabel = cfg.caratIdx !== null ? String(col.carats[cfg.caratIdx]) : ''
              
              // Check if this config matches the filter
              let matches = true
              if (action.filter.color && cfg.colorName.toLowerCase() !== action.filter.color.toLowerCase()) matches = false
              if (action.filter.carat && caratLabel !== String(action.filter.carat).replace('ct', '')) matches = false
              if (action.filter.housing && (cfg.housing || '').toLowerCase() !== action.filter.housing.toLowerCase()) matches = false
              if (action.filter.size && (cfg.size || '').toLowerCase() !== action.filter.size.toLowerCase()) matches = false

              if (!matches) return cfg

              // Apply changes
              const modified = { ...cfg }
              if (action.changes.color) modified.colorName = action.changes.color
              if (action.changes.carat) {
                const newCaratIdx = col.carats.findIndex(c => String(c) === String(action.changes.carat).replace('ct', ''))
                if (newCaratIdx >= 0) modified.caratIdx = newCaratIdx
              }
              if (action.changes.housing) modified.housing = action.changes.housing
              if (action.changes.size) modified.size = action.changes.size
              if (action.changes.qty) modified.qty = parseInt(action.changes.qty) || modified.qty

              return modified
            })

            return { ...line, colorConfigs: modifiedConfigs }
          })
        }
      })

      return updated.length > 0 ? updated : [mkLine()]
    })

    // Update selected collections outside of setLines to avoid React warning
    if (newCollectionIds.size > 0) {
      setTimeout(() => {
        setSelectedCollections(prev => {
          const newSet = new Set([...prev, ...newCollectionIds])
          return [...newSet]
        })
      }, 0)
    }

    // Highlight newly added rows (the NEW ones, not the old selected ones)
    if (newIds.size > 0) {
      setRecentlyDuplicated(newIds)
      setTimeout(() => setRecentlyDuplicated(new Set()), 15000)
    }

    setPendingActions(null)
    setAiMessages(prev => [...prev, { role: 'system', content: t('builder.aiActionsApplied') || 'Actions applied successfully!' }])
  }, [setLines, setSelectedCollections, t])

  // Handle AI chat send
  const handleAiSend = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return

    const userMessage = aiInput.trim()
    setAiInput('')
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setAiLoading(true)

    try {
      const orderContext = buildOrderContext()
      const response = await sendBuilderChat(
        [...aiMessages, { role: 'user', content: userMessage }],
        orderContext
      )

      if (response.actions && response.actions.length > 0) {
        // Show confirmation for actions
        setPendingActions(response.actions)
        setAiMessages(prev => [...prev, { 
          role: 'assistant', 
          content: response.message,
          actions: response.actions
        }])
      } else {
        setAiMessages(prev => [...prev, { role: 'assistant', content: response.message }])
      }
    } catch (err) {
      setAiMessages(prev => [...prev, { 
        role: 'assistant', 
        content: t('builder.aiError') || 'Sorry, something went wrong. Please try again.'
      }])
    } finally {
      setAiLoading(false)
    }
  }, [aiInput, aiLoading, aiMessages, buildOrderContext, t])

  // Scroll AI chat to bottom on new messages
  useEffect(() => {
    if (aiChatEndRef.current) {
      aiChatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [aiMessages])

  // Focus AI input when chat opens
  useEffect(() => {
    if (showAiChat && aiInputRef.current) {
      setTimeout(() => aiInputRef.current?.focus(), 100)
    }
  }, [showAiChat])


  // Apply a standard pack (fully replaces current lines with editable prefilled configs)
  const applyPack = useCallback((pack) => {
    const newLines = pack.lines.map(packLine => {
      const col = COLLECTIONS.find(c => c.id === packLine.collectionId)
      if (!col) return null
      const palette = CORD_COLORS[col.cord] || []
      const configs = []
      palette.forEach(color => {
        packLine.caratIndices.forEach(caratIdx => {
          configs.push({
            ...mkColorConfig(color.n, col.minC || 1),
            caratIdx,
            housing: packLine.housing,
            size: packLine.size,
          })
        })
      })
      return { uid: uniqueId(), collectionId: packLine.collectionId, colorConfigs: configs, expanded: true }
    }).filter(Boolean)

    if (newLines.length > 0) {
      setLines(newLines)
      setSelectedCollections(newLines.map(l => l.collectionId))
      setStep('configure')
    }
  }, [setLines, setSelectedCollections])

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {/* Mobile Summary Toggle Button */}
      {mobile && (
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          style={{
            position: 'fixed', bottom: 16, right: 16, zIndex: 150,
            padding: '12px 20px', borderRadius: 25, border: 'none',
            background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(93,58,94,0.3)',
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
          }}
        >
          <span>{fmt(quote.total)}</span>
          <span style={{ fontSize: 10, opacity: 0.8 }}>{quote.totalPieces} pcs</span>
        </button>
      )}
      
      {/* Mobile Sidebar Overlay */}
      {mobile && showSidebar && (
        <div 
          onClick={() => setShowSidebar(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200,
          }}
        />
      )}
      
      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* ─── Budget Bar ─── */}
        <div style={{ background: '#fff', borderBottom: '1px solid #ede8f0', padding: '10px 20px', flexShrink: 0 }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {!hasBudget && !budgetEditing ? (
              <button
                onClick={() => { setBudgetEditing(true); setTimeout(() => budgetInputRef.current?.focus(), 50) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 12px', borderRadius: 10,
                  border: '1px dashed #ddd', background: '#fafafa',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'all .12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.background = '#fdf7fa' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.background = '#fafafa' }}
              >
                <span style={{ fontSize: 14 }}>$</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Set a budget</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>Optional -- track spending & get AI recommendations</div>
                </div>
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hasBudget && hasSpending ? 8 : 0 }}>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 600, whiteSpace: 'nowrap' }}>Budget</span>
                  <div style={{ position: 'relative', width: 110 }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa', fontWeight: 600 }}>€</span>
                    <input
                      ref={budgetInputRef}
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      onBlur={() => { if (!budget) setBudgetEditing(false) }}
                      placeholder="2000"
                      style={{
                        width: '100%', padding: '6px 8px 6px 22px', borderRadius: 8,
                        border: '1px solid #e3e3e3', fontSize: 13, fontFamily: 'inherit',
                        outline: 'none', background: '#fafaf8', boxSizing: 'border-box', color: '#333',
                      }}
                    />
                  </div>
                  {hasBudget && hasSpending && (
                    <>
                      <div style={{ flex: 1 }} />
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: overBudget ? '#c0392b' : '#27ae60' }}>
                          {overBudget ? `Over by ${fmt(spent - budgetNum)}` : `${fmt(remaining)} left`}
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>
                          {fmt(spent)} / {fmt(budgetNum)} ({pct}%)
                        </div>
                      </div>
                    </>
                  )}
                  {hasBudget && !hasSpending && (
                    <span style={{ fontSize: 10, color: '#aaa' }}>Start building to track spending</span>
                  )}
                  {hasBudget && (
                    <button
                      onClick={() => { setBudget(''); setBudgetEditing(false) }}
                      style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 14, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
                      title="Clear budget"
                    >x</button>
                  )}
                </div>
                {hasBudget && hasSpending && (
                  <div style={{ height: 4, borderRadius: 2, background: '#f0f0f0', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, transition: 'width .3s ease',
                      width: `${Math.min(100, pct)}%`,
                      background: overBudget ? '#c0392b' : pct > 80 ? '#e67e22' : colors.inkPlum,
                    }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Step Content ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>

            {/* ─── Packs Collapsible ─── */}
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => setShowPacks(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 12px', borderRadius: 10,
                  border: `1px dashed ${showPacks ? colors.inkPlum : '#ccc'}`,
                  background: showPacks ? '#f5eef7' : '#fafafa',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'all .12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.background = showPacks ? '#f5eef7' : '#fdf7fa' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = showPacks ? colors.inkPlum : '#ccc'; e.currentTarget.style.background = showPacks ? '#f5eef7' : '#fafafa' }}
              >
                <span style={{ fontSize: 14, opacity: 0.7 }}>▤</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.inkPlum }}>Packs</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>Quick-start with a standard collection</div>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999', fontWeight: 600 }}>
                  {showPacks ? '▲ Close' : '▼ Browse'}
                </span>
              </button>

              {showPacks && (
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 2px 4px', scrollbarWidth: 'none' }}>
                  {PACKS.map(pack => (
                    <div key={pack.id} style={{
                      minWidth: 180, maxWidth: 220, flexShrink: 0,
                      border: '1px solid #e4dded', borderRadius: 10,
                      padding: '12px 14px', background: '#fff',
                      boxShadow: '0 2px 8px rgba(93,58,94,0.07)',
                      display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: colors.inkPlum, marginBottom: 6 }}>
                        {pack.label}
                      </div>
                      <div style={{ flex: 1 }}>
                        {pack.description.map((line, i) => (
                          <div key={i} style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>· {line}</div>
                        ))}
                      </div>
                      {pack.budget && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#9a7fa8' }}>
                            {pack.budget}
                          </div>
                          <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>
                            Total order: ~€{computePackTotal(pack).toLocaleString('fr-FR')}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => { applyPack(pack); setShowPacks(false) }}
                        style={{
                          marginTop: 10, width: '100%', padding: '6px 0',
                          borderRadius: 8, border: `1.5px solid ${colors.inkPlum}`,
                          background: colors.inkPlum, color: '#fff', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'opacity .1s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                      >
                        Use this pack
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {step === 'select' ? (
              /* ═══ STEP 1: Collection Selection Grid ═══ */
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.inkPlum, margin: '0 0 3px', fontFamily: fonts.body }}>
                    {t('builder.selectCollections')}
                  </h2>
                  <p style={{ fontSize: 12, color: '#999', margin: 0 }}>
                    {t('builder.selectCollectionsHelp')}
                  </p>
                </div>

                {/* Collection Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(${tablet ? '150px' : '185px'}, 1fr))`,
                  gap: 10,
                  marginBottom: 24,
                }}>
                  {[
                    ...selectedCollections.map(id => COLLECTIONS.find(c => c.id === id)).filter(Boolean),
                    ...COLLECTIONS.filter(c => !selectedCollections.includes(c.id)),
                  ].map(col => {
                    const isSelected = selectedCollections.includes(col.id)
                    const priceMin = `€${col.prices[0]}`
                    const priceMax = col.prices.length > 1 ? ` – €${col.prices[col.prices.length - 1]}` : ''
                    const cordType = CORD_TYPE_LABELS[col.cord] || col.cord

                    return (
                      <button
                        key={col.id}
                        onClick={() => toggleCollection(col.id)}
                        style={{
                          position: 'relative',
                          padding: '14px 14px 12px',
                          borderRadius: 12,
                          border: isSelected ? `2px solid ${colors.inkPlum}` : '1px solid #ede8f0',
                          background: isSelected ? '#fdf7fa' : '#fdfdfd',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                          transition: 'all .15s',
                          boxShadow: isSelected ? `0 2px 12px ${colors.inkPlum}12` : '0 1px 3px rgba(0,0,0,0.03)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = colors.inkPlum + '55'
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(93,58,94,0.08)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#ede8f0'
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'
                          }
                        }}
                      >
                        {/* Selection indicator */}
                        <div style={{
                          position: 'absolute', top: 10, right: 10,
                          width: 20, height: 20, borderRadius: 6,
                          border: isSelected ? `2px solid ${colors.inkPlum}` : '1.5px solid #d8d0e0',
                          background: isSelected ? colors.inkPlum : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all .15s',
                        }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>

                        {/* Collection name */}
                        <div style={{
                          fontSize: 14, fontWeight: 700,
                          color: isSelected ? colors.inkPlum : '#2a2a2a',
                          marginBottom: 6, paddingRight: 28, lineHeight: 1.3,
                        }}>
                          {col.label}
                        </div>

                        {/* Price range — prominent */}
                        <div style={{
                          fontSize: 13, fontWeight: 600,
                          color: isSelected ? colors.inkPlum : '#444',
                          marginBottom: 8,
                        }}>
                          {priceMin}{priceMax}
                          <span style={{ fontWeight: 400, fontSize: 11, color: '#aaa' }}> /pc</span>
                        </div>

                        {/* Cord type pill */}
                        <div style={{
                          display: 'inline-block',
                          fontSize: 10, fontWeight: 500,
                          color: isSelected ? colors.inkPlum : '#888',
                          background: isSelected ? `${colors.inkPlum}12` : '#f0ecf5',
                          borderRadius: 20, padding: '2px 8px',
                        }}>
                          {cordType}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Bottom action */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 13, color: '#888' }}>
                    {selectedCollections.length === 0 ? (
                      t('builder.selectAtLeastOne')
                    ) : (
                      <span>
                        <strong style={{ color: colors.inkPlum }}>{selectedCollections.length}</strong>
                        {' '}{t('builder.collectionsSelected').replace('{count}', selectedCollections.length)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={goToConfigure}
                    disabled={selectedCollections.length === 0}
                    style={{
                      ...btnPrimary,
                      opacity: selectedCollections.length === 0 ? 0.4 : 1,
                      cursor: selectedCollections.length === 0 ? 'default' : 'pointer',
                    }}
                  >
                    {t('builder.continueConfig')} →
                  </button>
                </div>
              </div>
            ) : (
              /* ═══ STEP 2: Configuration View ═══ */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.inkPlum, margin: '0 0 3px', fontFamily: fonts.body }}>
                      {t('builder.configureOrder')}
                    </h2>
                    <p style={{ fontSize: 12, color: '#999', margin: 0 }}>
                      {t('builder.configureOrderHelp')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {/* Collapse / Expand all */}
                    {(() => {
                      const allExpanded = lines.filter(l => l.collectionId).every(l => l.expanded !== false)
                      return (
                        <button
                          onClick={() => setLines(prev => prev.map(l => ({ ...l, expanded: !allExpanded })))}
                          style={{
                            padding: '7px 12px', fontSize: 11, fontWeight: 600,
                            borderRadius: 8, border: '1px solid #ddd',
                            background: '#fafafa', color: '#666',
                            cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'all .12s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum + '80'; e.currentTarget.style.color = colors.inkPlum }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.color = '#666' }}
                        >
                          {allExpanded ? '↑ Collapse all' : '↓ Expand all'}
                        </button>
                      )
                    })()}
                    {/* AI Advisor Button */}
                    <button
                      onClick={() => setShowAiChat(v => !v)}
                      style={{
                        padding: '8px 14px', fontSize: 12, fontWeight: 700,
                        borderRadius: 10,
                        border: 'none',
                        background: showAiChat 
                          ? colors.inkPlum 
                          : `linear-gradient(135deg, ${colors.inkPlum} 0%, #7c3aed 100%)`,
                        color: '#fff',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 2px 8px rgba(93,58,94,0.25)',
                        transition: 'all .15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(93,58,94,0.35)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(93,58,94,0.25)' }}
                    >
                      ✨ {t('builder.aiAdvisor') || 'AI Advisor'}
                    </button>
                    <button onClick={goToSelect} style={btnGhost}>
                      ← {t('builder.editCollections')}
                    </button>
                  </div>
                </div>

                {/* Collection config panels */}
                {lines.filter(l => l.collectionId).map(line => {
                  const col = COLLECTIONS.find(c => c.id === line.collectionId)
                  if (!col) return null
                  return (
                    <CollectionConfig
                      key={line.uid}
                      line={line}
                      col={col}
                      onChange={updateLine}
                      onRemove={removeLine}
                      selectedConfigs={selectedConfigs}
                      onToggleConfigSelect={toggleConfigSelection}
                      onToggleLineSelect={toggleLineSelection}
                      recentlyDuplicated={recentlyDuplicated}
                    />
                  )
                })}

                {/* Add another collection quick action */}
                <button
                  onClick={goToSelect}
                  style={{
                    width: '100%', padding: 12, borderRadius: 10,
                    border: '1.5px dashed #d0d0d0', background: 'transparent',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    color: '#888', fontFamily: 'inherit', marginBottom: 16,
                    transition: 'all .12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.color = colors.inkPlum }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d0d0d0'; e.currentTarget.style.color = '#888' }}
                >
                  + {t('builder.addMoreCollections')}
                </button>

                {/* Floating Selection Action Bar */}
                {selectedCount > 0 && (
                  <div style={{
                    position: 'sticky', bottom: 0, left: 0, right: 0,
                    background: '#fff', borderRadius: 12, marginBottom: 12,
                    boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
                    border: `1px solid ${colors.inkPlum}30`,
                    zIndex: 50, overflow: 'hidden',
                  }}>
                    {/* Main bar */}
                    <div style={{
                      padding: '12px 16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: colors.inkPlum, color: '#fff',
                          fontSize: 11, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {selectedCount}
                        </span>
                        <span style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>
                          {t('builder.itemsSelected').replace('{count}', selectedCount)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={clearSelection}
                          style={{
                            padding: '8px 16px', borderRadius: 8,
                            border: '1px solid #e0e0e0', background: '#fff',
                            color: '#666', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          {t('common.clear')}
                        </button>
                        <button
                          onClick={() => duplicateSelected(false)}
                          style={{
                            padding: '8px 16px', borderRadius: 8,
                            border: `1px solid ${colors.inkPlum}`, background: '#fff',
                            color: colors.inkPlum, fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          {t('builder.duplicateSelected')}
                        </button>
                        <button
                          onClick={() => setShowDuplicateVariations(!showDuplicateVariations)}
                          style={{
                            padding: '8px 16px', borderRadius: 8,
                            border: 'none', background: showDuplicateVariations ? `${colors.inkPlum}15` : colors.inkPlum,
                            color: showDuplicateVariations ? colors.inkPlum : '#fff', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          {t('builder.duplicateWithChanges')} {showDuplicateVariations ? '▲' : '▼'}
                        </button>
                      </div>
                    </div>

                    {/* Variations panel */}
                    {showDuplicateVariations && (
                      <div style={{
                        padding: '12px 16px', borderTop: '1px solid #eee',
                        background: '#fafafa',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 10 }}>
                          {t('builder.changeBeforeDuplicate')}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                          {/* Carat */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={bulkDuplicateSettings.carat.enabled}
                                onChange={(e) => setBulkDuplicateSettings(prev => ({
                                  ...prev, carat: { ...prev.carat, enabled: e.target.checked }
                                }))}
                                style={{ accentColor: colors.inkPlum }}
                              />
                              <span style={{ fontSize: 12, fontWeight: 500 }}>{t('quote.carat')}</span>
                            </label>
                            {bulkDuplicateSettings.carat.enabled && (
                              <select
                                value={bulkDuplicateSettings.carat.value ?? ''}
                                onChange={(e) => setBulkDuplicateSettings(prev => ({
                                  ...prev, carat: { ...prev.carat, value: e.target.value === '' ? null : parseInt(e.target.value) }
                                }))}
                                style={{
                                  padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd',
                                  fontSize: 11, fontFamily: 'inherit',
                                }}
                              >
                                <option value="">--</option>
                                <option value="0">0.05 ct</option>
                                <option value="1">0.10 ct</option>
                                <option value="2">0.20 ct</option>
                                <option value="3">0.30 ct</option>
                              </select>
                            )}
                          </div>

                          {/* Housing */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={bulkDuplicateSettings.housing.enabled}
                                onChange={(e) => setBulkDuplicateSettings(prev => ({
                                  ...prev, housing: { ...prev.housing, enabled: e.target.checked }
                                }))}
                                style={{ accentColor: colors.inkPlum }}
                              />
                              <span style={{ fontSize: 12, fontWeight: 500 }}>{t('quote.housing')}</span>
                            </label>
                            {bulkDuplicateSettings.housing.enabled && (
                              <select
                                value={bulkDuplicateSettings.housing.value ?? ''}
                                onChange={(e) => setBulkDuplicateSettings(prev => ({
                                  ...prev, housing: { ...prev.housing, value: e.target.value || null }
                                }))}
                                style={{
                                  padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd',
                                  fontSize: 11, fontFamily: 'inherit',
                                }}
                              >
                                <option value="">--</option>
                                <option value="White">White</option>
                                <option value="Yellow">Yellow</option>
                                <option value="Pink">Pink</option>
                              </select>
                            )}
                          </div>

                          {/* Size */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={bulkDuplicateSettings.size.enabled}
                                onChange={(e) => setBulkDuplicateSettings(prev => ({
                                  ...prev, size: { ...prev.size, enabled: e.target.checked }
                                }))}
                                style={{ accentColor: colors.inkPlum }}
                              />
                              <span style={{ fontSize: 12, fontWeight: 500 }}>{t('quote.size')}</span>
                            </label>
                            {bulkDuplicateSettings.size.enabled && (
                              <select
                                value={bulkDuplicateSettings.size.value ?? ''}
                                onChange={(e) => setBulkDuplicateSettings(prev => ({
                                  ...prev, size: { ...prev.size, value: e.target.value || null }
                                }))}
                                style={{
                                  padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd',
                                  fontSize: 11, fontFamily: 'inherit',
                                }}
                              >
                                <option value="">--</option>
                                <option value="S">S</option>
                                <option value="M">M</option>
                                <option value="S/M">S/M</option>
                                <option value="M/L">M/L</option>
                                <option value="L">L</option>
                              </select>
                            )}
                          </div>

                          {/* Qty */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={bulkDuplicateSettings.qty.enabled}
                                onChange={(e) => setBulkDuplicateSettings(prev => ({
                                  ...prev, qty: { ...prev.qty, enabled: e.target.checked }
                                }))}
                                style={{ accentColor: colors.inkPlum }}
                              />
                              <span style={{ fontSize: 12, fontWeight: 500 }}>{t('quote.qty')}</span>
                            </label>
                            {bulkDuplicateSettings.qty.enabled && (
                              <input
                                type="number"
                                min="1"
                                value={bulkDuplicateSettings.qty.value}
                                onChange={(e) => setBulkDuplicateSettings(prev => ({
                                  ...prev, qty: { ...prev.qty, value: Math.max(1, parseInt(e.target.value) || 1) }
                                }))}
                                style={{
                                  width: 50, padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd',
                                  fontSize: 11, fontFamily: 'inherit', textAlign: 'center',
                                }}
                              />
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => duplicateSelected(true)}
                          disabled={!bulkDuplicateSettings.carat.enabled && !bulkDuplicateSettings.housing.enabled && !bulkDuplicateSettings.size.enabled && !bulkDuplicateSettings.qty.enabled}
                          style={{
                            width: '100%', padding: '10px 16px', borderRadius: 8,
                            border: 'none', background: colors.inkPlum,
                            color: '#fff', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            opacity: (!bulkDuplicateSettings.carat.enabled && !bulkDuplicateSettings.housing.enabled && !bulkDuplicateSettings.size.enabled && !bulkDuplicateSettings.qty.enabled) ? 0.5 : 1,
                          }}
                        >
                          {t('builder.duplicateWithChangesAction').replace('{count}', selectedCount)}
                        </button>
                      </div>
                    )}

                  </div>
                )}

                {/* AI Recommendations Panel */}
                {showRecommendations && budgetRecommendations && (
                  <div style={{
                    marginBottom: 14, borderRadius: 12, overflow: 'hidden',
                    border: `1px solid ${colors.inkPlum}22`, background: '#fdf7fa',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderBottom: `1px solid ${colors.inkPlum}15`,
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum }}>{t('builder.aiRecommendations')}</div>
                        <div style={{ fontSize: 10, color: '#999' }}>{t('builder.remainingBudget').replace('{amount}', fmt(remaining))}</div>
                      </div>
                      <button onClick={() => setShowRecommendations(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 16, cursor: 'pointer' }}>x</button>
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      {budgetRecommendations.loading ? (
                        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: '#999' }}>{t('builder.thinking')}</div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{budgetRecommendations.message}</div>
                      )}
                    </div>
                    {!budgetRecommendations.loading && (
                      <div style={{ padding: '8px 14px 10px', borderTop: '1px solid #f0e8ee', display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={onRequestRecommendations} style={{ ...btnSecondary, padding: '6px 14px', fontSize: 11 }}>{t('builder.regenerate')}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Order Summary Sidebar ═══ */}
      <div style={{
        width: mobile ? '85%' : tablet ? 240 : 280,
        maxWidth: mobile ? 320 : tablet ? 240 : 280,
        flexShrink: 0,
        background: '#fff',
        borderLeft: '1px solid #eaeaea',
        display: mobile && !showSidebar ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // Mobile slide-in styles
        ...(mobile ? {
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 210,
          transform: showSidebar ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
        } : {}),
      }}>
        {/* Mobile close button */}
        {mobile && (
          <button
            onClick={() => setShowSidebar(false)}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 1,
              width: 32, height: 32, borderRadius: '50%', border: 'none',
              background: '#f0f0f0', color: '#666', fontSize: 16,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        )}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #eaeaea' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum, marginBottom: 2 }}>{t('builder.orderSummary')}</div>
          <div style={{ fontSize: 11, color: '#999' }}>
            {quote.totalPieces > 0 ? t('builder.piecesCount').replace('{count}', quote.totalPieces) : t('builder.noItemsYet')}
          </div>
        </div>

        {/* Per-collection breakdown */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {lines.filter(l => l.collectionId && l.colorConfigs.length > 0).map(line => {
            const col = COLLECTIONS.find(c => c.id === line.collectionId)
            if (!col) return null
            const lineTotal = line.colorConfigs.reduce((sum, cfg) => {
              const price = cfg.caratIdx !== null ? col.prices[cfg.caratIdx] : 0
              return sum + (cfg.qty * price)
            }, 0)
            const pieces = line.colorConfigs.reduce((sum, cfg) => sum + cfg.qty, 0)
            if (pieces === 0 && lineTotal === 0) return null
            return (
              <div key={line.uid} style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{col.label}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{t('builder.colorsPcs').replace('{colors}', line.colorConfigs.length).replace('{pieces}', pieces)}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{fmt(lineTotal)}</div>
              </div>
            )
          })}
          {quote.totalPieces === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: '#ccc' }}>
              {t('builder.addColorsToSeeTotals')}
            </div>
          )}
        </div>

        {/* Totals */}
        <div style={{ borderTop: '1px solid #eaeaea', padding: '12px 16px', maxHeight: '45vh', overflowY: 'auto' }}>
          {quote.discountPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#27ae60', fontWeight: 600 }}>{t('quote.discount')} ({quote.discountPercent}%)</span>
              <span style={{ color: '#27ae60', fontWeight: 600 }}>-{fmt(quote.discountAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{t('quote.total')}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: colors.inkPlum }}>{fmt(quote.total)}</span>
          </div>
          {quote.totalPieces > 0 && (
            <div style={{ fontSize: 11, color: '#999', textAlign: 'right', marginBottom: 8 }}>
              {t('builder.retailValue')}: {fmt(quote.totalRetail)}
            </div>
          )}

          {/* Warnings -- collapsed when more than 3 */}
          {quote.warnings.length > 0 && (
            <WarningsSummary warnings={quote.warnings} />
          )}

          {hasBudget && hasSpending && (
            <div style={{
              fontSize: 11, padding: '6px 0', marginBottom: 8,
              color: overBudget ? '#c0392b' : '#27ae60', fontWeight: 600,
            }}>
              {overBudget ? t('builder.overBudgetBy').replace('{amount}', fmt(spent - budgetNum)) : t('builder.remainingAmount').replace('{amount}', fmt(remaining))}
            </div>
          )}

          {/* Generate Quote */}
          <button
            onClick={() => hasContent && onGenerateQuote(quote)}
            disabled={!hasContent}
            style={{
              ...btnPrimary, width: '100%', textAlign: 'center',
              opacity: hasContent ? 1 : 0.4,
              cursor: hasContent ? 'pointer' : 'default',
              marginBottom: 6,
            }}
          >
            {t('builder.generateQuote')}
          </button>

          {/* Budget recommend */}
          {hasBudget && hasSpending && remaining > 0 && (
            <button
              onClick={onRequestRecommendations}
              disabled={budgetRecommendations?.loading}
              style={{
                ...btnSecondary, width: '100%', textAlign: 'center',
                padding: '8px 16px', fontSize: 11,
                opacity: budgetRecommendations?.loading ? 0.6 : 1,
              }}
            >
              {budgetRecommendations?.loading ? t('builder.thinking') : t('builder.suggestForLeft').replace('{amount}', fmt(remaining))}
            </button>
          )}
        </div>
      </div>

      {/* ═══ AI Builder Chat Panel ═══ */}
      {step === 'configure' && (
        <>
          {/* AI Chat Panel */}
          {showAiChat && (
            <div style={{
              position: 'fixed',
              bottom: mobile ? 70 : 24,
              right: 24,
              width: mobile ? 'calc(100% - 48px)' : 380,
              maxWidth: 420,
              maxHeight: mobile ? 'calc(100vh - 140px)' : '70vh',
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
              border: `1px solid ${colors.lineGray}`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 150,
            }}>
              {/* Header */}
              <div style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${colors.lineGray}`,
                background: `linear-gradient(135deg, ${colors.inkPlum}08 0%, #7c3aed08 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ✨ {t('builder.aiAdvisor') || 'AI Advisor'}
                  </div>
                  <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                    {t('builder.aiAdvisorDesc') || 'Ask questions or request changes to your order'}
                  </div>
                </div>
                <button
                  onClick={() => setShowAiChat(false)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: 'none', background: '#f0f0f0', color: '#666',
                    fontSize: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >×</button>
              </div>

              {/* Messages */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                minHeight: 200,
              }}>
                {aiMessages.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '30px 16px',
                    color: '#999',
                    fontSize: 12,
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                    <div>{t('builder.aiWelcome') || 'Ask me anything about your order!'}</div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#bbb' }}>
                      {t('builder.aiExamples') || 'Examples: "Add 5 CUTY White 0.10ct", "Delete all Black colors", "Change all 0.05ct to 0.10ct"'}
                    </div>
                  </div>
                )}

                {aiMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                    }}
                  >
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: msg.role === 'user' 
                        ? colors.inkPlum 
                        : msg.role === 'system' 
                          ? '#e8f5e9'
                          : '#f5f5f5',
                      color: msg.role === 'user' ? '#fff' : '#333',
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>
                    
                    {/* Action badges */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {msg.actions.map((action, aIdx) => (
                          <span
                            key={aIdx}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 12,
                              fontSize: 10,
                              fontWeight: 600,
                              background: action.type === 'add' ? '#e3f2fd' : 
                                         action.type === 'delete' ? '#ffebee' : '#fff3e0',
                              color: action.type === 'add' ? '#1565c0' :
                                    action.type === 'delete' ? '#c62828' : '#ef6c00',
                            }}
                          >
                            {action.type.toUpperCase()}: {action.collection || action.filter?.collection || '?'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {aiLoading && (
                  <div style={{
                    alignSelf: 'flex-start',
                    padding: '10px 14px',
                    borderRadius: '16px 16px 16px 4px',
                    background: '#f5f5f5',
                    fontSize: 13,
                    color: '#999',
                  }}>
                    <span style={{ display: 'inline-block', animation: 'pulse 1.5s infinite' }}>
                      {t('builder.aiThinking') || 'Thinking...'}
                    </span>
                  </div>
                )}

                <div ref={aiChatEndRef} />
              </div>

              {/* Pending Actions Confirmation */}
              {pendingActions && pendingActions.length > 0 && (
                <div style={{
                  padding: 12,
                  borderTop: `1px solid ${colors.lineGray}`,
                  background: '#fffde7',
                  maxHeight: '50vh',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#f57c00', marginBottom: 8, flexShrink: 0 }}>
                    {t('builder.aiConfirmActions') || 'Confirm actions:'} ({pendingActions.length})
                  </div>
                  <div style={{ 
                    display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10,
                    overflowY: 'auto', maxHeight: '30vh', flexShrink: 1,
                  }}>
                    {pendingActions.map((action, idx) => (
                      <div key={idx} style={{
                        padding: '6px 10px',
                        background: '#fff',
                        borderRadius: 6,
                        fontSize: 11,
                        border: '1px solid #ffe082',
                        flexShrink: 0,
                      }}>
                        <strong>{action.type.toUpperCase()}</strong>
                        {action.type === 'add' && `: ${action.qty || 1}x ${action.collection} ${action.color} ${action.carat || ''}`}
                        {action.type === 'delete' && `: ${action.filter?.collection || 'items'} ${action.filter?.color || ''} ${action.filter?.carat || ''}`}
                        {action.type === 'modify' && `: ${action.filter?.collection || 'items'} → ${Object.entries(action.changes || {}).map(([k, v]) => `${k}=${v}`).join(', ')}`}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => executeAiActions(pendingActions)}
                      style={{
                        flex: 1, padding: '10px 16px', borderRadius: 8,
                        border: 'none', background: '#4caf50', color: '#fff',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {t('builder.aiApply') || 'Apply Changes'}
                    </button>
                    <button
                      onClick={() => {
                        setPendingActions(null)
                        setAiMessages(prev => [...prev, { role: 'system', content: t('builder.aiCancelled') || 'Actions cancelled.' }])
                      }}
                      style={{
                        padding: '10px 16px', borderRadius: 8,
                        border: '1px solid #ddd', background: '#fff', color: '#666',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {t('common.cancel') || 'Cancel'}
                    </button>
                  </div>
                </div>
              )}

              {/* Input */}
              <div style={{
                padding: 12,
                borderTop: `1px solid ${colors.lineGray}`,
                display: 'flex',
                gap: 8,
              }}>
                <input
                  ref={aiInputRef}
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend() } }}
                  placeholder={t('builder.aiPlaceholder') || 'Ask or give a command...'}
                  disabled={aiLoading}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 20,
                    border: '1px solid #e0e0e0',
                    fontSize: 13,
                    fontFamily: fonts.body,
                    outline: 'none',
                    background: aiLoading ? '#f5f5f5' : '#fff',
                  }}
                />
                <button
                  onClick={handleAiSend}
                  disabled={aiLoading || !aiInput.trim()}
                  style={{
                    width: 40, height: 40, borderRadius: '50%',
                    border: 'none',
                    background: aiLoading || !aiInput.trim() ? '#e0e0e0' : colors.inkPlum,
                    color: '#fff',
                    fontSize: 16,
                    cursor: aiLoading || !aiInput.trim() ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ↑
                </button>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}

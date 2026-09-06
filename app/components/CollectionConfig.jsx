'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { CORD_COLORS, CORD_OPTIONS, CORD_TYPE_LABELS, HOUSING, CERT_LABELS, getPrice, getRetail, getDefaultCert, getAvailableCarats, getAvailableCerts, getThicknessOptions, sizeOptionsForClosure, resolvePricelist, getProductType, sizeDisplayLabel, isBezelOnly, getShapesForCarat, getShapesForCaratIdx, getForcedClosure, resolveClosure } from '@/lib/catalog'
import { fmt, isLight } from '@/lib/utils'
import { colors } from '@/lib/styles'
import { mkColorConfig } from './BuilderPage'
import { useI18n } from '@/lib/i18n'
import { useResponsive } from '@/lib/useIsMobile'
import { findPackshot } from '@/lib/packshot-lookup'

const QTY_PRESETS = [1, 3, 5, 10]

// CSS for duplicate highlight animation and fill-down drag handle.
// Injected once per page using a singleton guard to avoid duplicate <style> blocks
// when multiple CollectionConfig instances are mounted at the same time.
let _stylesInjected = false
const duplicateHighlightStyles = `
@keyframes duplicateHighlight {
  0% { background-color: #f8bbd9; }
  30% { background-color: #fce4ec; }
  100% { background-color: transparent; }
}
@keyframes fillFlash {
  0% { background-color: #c8e6c9; }
  100% { background-color: transparent; }
}
.fill-cell { position: relative; }
.fill-handle-dot {
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 10px;
  height: 10px;
  background: #5D3A5E;
  border-radius: 1px;
  cursor: crosshair;
  opacity: 0.25;
  transition: opacity 0.12s;
  z-index: 20;
  user-select: none;
  touch-action: none;
}
.fill-cell:hover .fill-handle-dot {
  opacity: 1;
}
@media (pointer: coarse) {
  .fill-handle-dot {
    opacity: 0.5;
    width: 14px;
    height: 14px;
    bottom: 3px;
    right: 3px;
  }
  .fill-cell:hover .fill-handle-dot {
    opacity: 1;
  }
}
`

// FillHandle removed - fill functionality now via double-click on cells

function createConfigId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function ensureUniqueConfigIds(configs) {
  const seen = new Set()
  let changed = false
  const next = configs.map((cfg) => {
    let nextId = cfg?.id
    if (nextId === undefined || nextId === null || seen.has(nextId)) {
      nextId = createConfigId()
      changed = true
    }
    seen.add(nextId)
    return nextId === cfg?.id ? cfg : { ...cfg, id: nextId }
  })
  return changed ? next : null
}

export default function CollectionConfig({ line, col, onChange, onRemove, selectedConfigs = new Set(), onToggleConfigSelect, onToggleLineSelect, recentlyDuplicated = new Set(), pricelistYear }) {
  // Single normalization point so a missing or invalid year never leaks
  // into a getPrice call inside this huge component.
  const yr = resolvePricelist(pricelistYear)
  // Sizes this collection sells on the active pricelist. Every carat picker
  // renders from this so a size that only exists on another list (or was
  // discontinued) is never offered at €0.
  const caratOptions = useMemo(() => getAvailableCarats(col, yr), [col, yr])
  const { t } = useI18n()
  // Compact = phone OR iPad portrait → use the card layout (not the wide table).
  const { isCompact: mobile } = useResponsive()
  const expanded = line.expanded ?? true
  const sameForAll = line.sameForAll ?? false
  // Shape-locked line: the shape was chosen on the selection grid (shape cards,
  // e.g. SHAPY SHINE NECKLACE — Heart). Every colour row inherits this shape and
  // the per-row shape picker / "Shapes available" strip are hidden.
  const presetShape = line.presetShape || null
  const sharedSettings = line.sharedSettings ?? {
    caratIdx: null, housing: null, housingType: null,
    multiAttached: null, shape: null, size: null, cordType: null, thickness: null,
    // Cert + closure live in shared settings so they can be picked once and
    // applied to every colour. New lines that haven't been touched since
    // these fields existed default both to null.
    certType: null, closureType: null,
    qty: null,
  }
  const [showDuplicatePanel, setShowDuplicatePanel] = useState(false)
  const [duplicateSettings, setDuplicateSettings] = useState({
    carat: { keepSame: true, value: null },
    cert: { keepSame: true, value: null },
    housing: { keepSame: true, value: null },
    housingType: { keepSame: true, value: null },
    size: { keepSame: true, value: null },
    shape: { keepSame: true, value: null },
    // Bracelet thread closure (CUTY/CUBIX): default to keep-same so existing
    // collections without hasClosure are unaffected. Value is 'braided' |
    // 'nonBraided' | null.
    closure: { keepSame: true, value: null },
    qty: { keepSame: true, value: 1 },
  })

  const [hoveredColor, setHoveredColor] = useState(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const longPressTimer = useRef(null)

  const packshotOpts = useCallback((cfg) => {
    const opts = {}
    if (cfg.colorName || cfg.color) opts.color = cfg.colorName || cfg.color
    if (cfg.housing) opts.housing = cfg.housing
    if (cfg.shape) opts.shape = cfg.shape
    if (cfg.housingType) opts.subgroup = cfg.housingType === 'bezel' ? 'Bezel' : 'Prong'
    if (cfg.multiAttached === true) opts.subgroup = 'Attached'
    else if (cfg.multiAttached === false) opts.subgroup = 'Detached'
    return opts
  }, [])

  const hasCordOptions = !!CORD_OPTIONS[col.cord]
  const [selectedCordType, setSelectedCordType] = useState(
    hasCordOptions ? CORD_OPTIONS[col.cord][0] : null
  )
  const [selectedSilkThickness, setSelectedSilkThickness] = useState(null)
  const fullPalette = hasCordOptions
    ? (CORD_COLORS[selectedCordType] || CORD_COLORS.nylon)
    : (CORD_COLORS[col.cord] || CORD_COLORS.nylon)
  const palette = col.allowedColors
    ? fullPalette.filter(c => col.allowedColors.includes(c.n))
    : fullPalette
  const set = (patch) => onChange(line.uid, patch)

  // Defensive guard: guarantee unique ids for React keys and row actions.
  useEffect(() => {
    const deduped = ensureUniqueConfigIds(line.colorConfigs || [])
    if (deduped) {
      set({ colorConfigs: deduped })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.colorConfigs])

  // Shape-locked lines (chosen on the grid): guarantee every colour carries the
  // preset shape — even rows restored from a saved order/draft or added before
  // the shape was locked. Without this, cfg.shape stays null, the size selector
  // is gated off and the row never reaches "complete".
  useEffect(() => {
    const ps = line.presetShape || null
    if (!ps) return
    const configs = line.colorConfigs || []
    if (configs.length === 0 || configs.every(c => c.shape === ps)) return
    set({ colorConfigs: configs.map(c => (c.shape === ps ? c : { ...c, shape: ps })) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.presetShape, line.colorConfigs])

  // Forced-closure collections (Shapy Shine = braided): the picker is hidden, so
  // stamp the value onto every row — including rows restored from an order saved
  // while non-braided was still on offer.
  useEffect(() => {
    const forced = getForcedClosure(col)
    if (!forced) return
    const configs = line.colorConfigs || []
    if (configs.length === 0 || configs.every(c => c.closureType === forced)) return
    set({ colorConfigs: configs.map(c => (c.closureType === forced ? c : { ...c, closureType: forced })) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col.id, line.colorConfigs])

  // Color counts
  const colorCounts = {}
  line.colorConfigs.forEach(c => {
    colorCounts[c.colorName] = (colorCounts[c.colorName] || 0) + 1
  })

  // Completion check
  const isConfigComplete = (cfg) => {
    if (cfg.caratIdx === null) return false
    if (col.housing && col.housing !== 'sparkleProng' && !cfg.housing) return false
    if (col.housing === 'multiThree' && cfg.multiAttached === null) return false
    if (col.shapes && col.shapes.length > 0 && !cfg.shape) return false
    if (col.sizes && col.sizes.length > 0 && !cfg.size) return false
    if (hasCordOptions && !cfg.cordType) return false
    if ((col.cord === 'silk' || cfg.cordType === 'silk') && !cfg.thickness) return false
    // Bracelet thread closure required for hasClosure collections (CUTY, CUBIX).
    // Collections with a forced closure (Shapy Shine = braided) never ask, so
    // the requirement is already satisfied.
    if (col.hasClosure && !cfg.closureType && !getForcedClosure(col)) return false
    return true
  }

  const completionMap = useMemo(
    () => Object.fromEntries(line.colorConfigs.map(c => [c.id, isConfigComplete(c)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [line.colorConfigs, col, hasCordOptions]
  )
  const completeCount = line.colorConfigs.filter(c => completionMap[c.id]).length
  const totalQty = line.colorConfigs.reduce((sum, c) => sum + c.qty, 0)
  const lineTotal = line.colorConfigs.reduce((sum, cfg) => {
    const effectiveCaratIdx = cfg.caratIdx ?? (sameForAll ? sharedSettings.caratIdx : null)
    const catalogP = effectiveCaratIdx !== null ? getPrice(col, effectiveCaratIdx, cfg.certType, yr) : 0
    const unitP = cfg.priceOverride != null ? cfg.priceOverride : catalogP
    return sum + (cfg.qty * unitP)
  }, 0)

  // Selection helpers
  const selectedInThisLine = line.colorConfigs.filter(c => selectedConfigs.has(c.id))
  const selectedCount = selectedInThisLine.length
  const allSelected = line.colorConfigs.length > 0 && selectedCount === line.colorConfigs.length
  const someSelected = selectedCount > 0 && selectedCount < line.colorConfigs.length

  useEffect(() => {
    // Collections restricted to a single silk thickness (e.g. Thin-only Sienna
    // and Iconix) auto-select it so colors can be added without an extra click.
    const opts = getThicknessOptions(col)
    const autoThickness = col.cord === 'silk' && opts.length === 1 ? opts[0] : null
    if (hasCordOptions) {
      const first = CORD_OPTIONS[col.cord][0]
      setSelectedCordType(first)
      setSelectedSilkThickness(null)
    } else {
      setSelectedCordType(null)
      setSelectedSilkThickness(autoThickness)
    }
  }, [hasCordOptions, col.cord, col.id])

  // Shapy Shine only sells five of its shapes at 0.10 ct, and only in a bezel.
  // Drop a shape or setting the row's own carat doesn't sell, instead of leaving
  // an off-list value that the select would render as blank.
  const normalizeToCarat = (cfg) => {
    let next = cfg
    const carat = next.caratIdx != null ? col.carats[next.caratIdx] : null
    if (next.shape && next.shape !== presetShape && col.shapes?.length) {
      if (!getShapesForCarat(col, carat).includes(next.shape)) next = { ...next, shape: null }
    }
    if (isBezelOnly(col, carat)) {
      const bezelValues = HOUSING.shapyShineBezel.map(h => `Bezel ${h}`)
      const housing = bezelValues.includes(next.housing) ? next.housing : null
      if (next.housingType !== 'bezel' || housing !== next.housing) {
        next = { ...next, housingType: 'bezel', housing }
      }
    }
    return next
  }

  const applyCaratRules = (cfg, updates) => (
    'caratIdx' in updates ? normalizeToCarat(cfg) : cfg
  )

  // Build the config a colour gets when it is added right now. Every rule that
  // makes a row valid — cord type, silk thickness, the metal tile, a locked
  // shape, a forced closure — lives here alone, so adding one swatch and adding
  // the whole palette can never drift apart.
  const buildColorConfig = (colorName) => {
    let newCfg = sameForAll
      ? { ...mkColorConfig(colorName, 1), ...sharedSettings }
      : mkColorConfig(colorName, 1)
    if (hasCordOptions && selectedCordType) {
      newCfg = { ...newCfg, cordType: selectedCordType }
    } else if (!hasCordOptions && col.cord === 'silk') {
      // Silk-only collections have no cord-type toggle but still need
      // cordType on the config so packBuild.js can render the material
      // field as "silk (Thin)" / "silk (Thick)" in the order form.
      newCfg = { ...newCfg, cordType: 'silk' }
    }
    if (col.cord === 'silk' || selectedCordType === 'silk') {
      newCfg = { ...newCfg, thickness: selectedSilkThickness || null }
    }
    // New collections use a combined metal+finish tile; default to the first
    // tile (Yellow Gold) per the spec so the housing is pre-filled.
    if ((col.housing === 'metalEight' || col.housing === 'metalThree') && !newCfg.housing) {
      newCfg = { ...newCfg, housing: HOUSING[col.housing][0] }
    }
    // Shape-locked line (chosen on the grid): every new colour inherits the shape.
    if (presetShape) {
      newCfg = { ...newCfg, shape: presetShape }
    }
    // Forced-closure collections (Shapy Shine = braided) never show a picker.
    const forced = getForcedClosure(col)
    if (forced) {
      newCfg = { ...newCfg, closureType: forced }
    }
    return newCfg
  }

  // Add or remove a color (toggle: clicking a selected color removes the last instance)
  const addColor = (colorName) => {
    const existing = line.colorConfigs.filter(c => c.colorName === colorName)
    if (existing.length > 0) {
      // Remove the last added instance of this color
      const lastId = existing[existing.length - 1].id
      set({ colorConfigs: line.colorConfigs.filter(c => c.id !== lastId) })
      return
    }
    set({ colorConfigs: [...line.colorConfigs, buildColorConfig(colorName)] })
  }

  // Silk carries a thickness on every row, so nothing can be added until the
  // agent has picked Thin or Thick. Swatches and the add-all button share it.
  const colorPickerDisabled =
    (col.cord === 'silk' || selectedCordType === 'silk') && !selectedSilkThickness

  // Colours in the active palette that are not on the line yet.
  const missingPaletteColors = palette.filter(
    c => !line.colorConfigs.some(cfg => cfg.colorName === c.n)
  )
  const allPaletteColorsAdded = palette.length > 0 && missingPaletteColors.length === 0

  // One click for the whole palette. On a fair stand the agent wants every
  // colour of a collection on the order; twenty separate taps is the slow part
  // of writing an order, not deciding. Adds only what is missing, so pressing
  // it twice never doubles a colour.
  const addAllColors = () => {
    if (colorPickerDisabled || missingPaletteColors.length === 0) return
    set({
      colorConfigs: [
        ...line.colorConfigs,
        ...missingPaletteColors.map(c => buildColorConfig(c.n)),
      ],
    })
  }

  // The undo for the above: drops every row whose colour belongs to the active
  // palette, duplicates included, and leaves off-palette rows (a colour added
  // under a different cord or thickness) alone.
  const removeAllPaletteColors = () => {
    const names = new Set(palette.map(c => c.n))
    set({ colorConfigs: line.colorConfigs.filter(cfg => !names.has(cfg.colorName)) })
  }

  // Remove a color config
  const removeConfig = (cfgId) => {
    set({ colorConfigs: line.colorConfigs.filter(c => c.id !== cfgId) })
  }

  // Update a color config
  const updateConfig = (cfgId, updates) => {
    set({
      colorConfigs: line.colorConfigs.map(c => {
        if (c.id !== cfgId) return c
        const merged = { ...c, ...updates }
        // Closure drives the available sizes (CUTY/CUBIX). If the change makes
        // the picked size invalid for the new closure, clear it so the agent
        // re-picks from the correct list rather than keeping an off-list value.
        if ('closureType' in updates) {
          const opts = sizeOptionsForClosure(col, merged.closureType)
          if (merged.size && !opts.includes(merged.size)) merged.size = null
        }
        return applyCaratRules(merged, updates)
      }),
    })
  }

  // Duplicate a color config (copy all settings, new id, insert right after)
  const duplicateConfig = (cfgId) => {
    const original = line.colorConfigs.find(c => c.id === cfgId)
    if (!original) return
    const copy = { ...original, id: createConfigId() }
    const idx = line.colorConfigs.findIndex(c => c.id === cfgId)
    const updated = [...line.colorConfigs]
    updated.splice(idx + 1, 0, copy)
    set({ colorConfigs: updated })
  }

  // Toggle same-for-all & update shared settings
  const handleSameForAllToggle = () => {
    const next = !sameForAll
    
    if (!next && sameForAll && line.colorConfigs.length > 0) {
      // Turning OFF: copy sharedSettings into each config so values persist.
      // Cert + closure are carried over so a row that was sharing them
      // doesn't suddenly lose those values when the user splits the line.
      set({
        colorConfigs: line.colorConfigs.map(cfg => ({
          ...cfg,
          caratIdx: cfg.caratIdx ?? sharedSettings.caratIdx,
          housing: cfg.housing ?? sharedSettings.housing,
          housingType: cfg.housingType ?? sharedSettings.housingType,
          multiAttached: cfg.multiAttached ?? sharedSettings.multiAttached,
          shape: cfg.shape ?? sharedSettings.shape,
          size: cfg.size ?? sharedSettings.size,
          certType: cfg.certType ?? sharedSettings.certType,
          closureType: cfg.closureType ?? sharedSettings.closureType,
          qty: sharedSettings.qty ?? cfg.qty,
        })),
      })
    }
    
    set({ sameForAll: next })

    if (next && line.colorConfigs.length > 0) {
      // Turning ON: use first config's settings as shared base
      const first = line.colorConfigs.find(c => c.caratIdx !== null) || line.colorConfigs[0]
      if (first) {
        const s = {
          caratIdx: first.caratIdx,
          housing: first.housing,
          housingType: first.housingType,
          multiAttached: first.multiAttached,
          shape: first.shape,
          size: first.size,
          // Seed shared cert / closure from the first config so picking
          // "same for all" feels like a no-op rather than wiping fields.
          certType: first.certType ?? null,
          closureType: first.closureType ?? null,
          qty: 1,
        }
        set({ sharedSettings: s })
      }
    }
  }

  // Update shared settings and propagate to all configs
  const updateShared = (updates) => {
    const next = { ...sharedSettings, ...updates }
    // Closure drives the available sizes (CUTY/CUBIX). When the shared closure
    // changes and the shared size is no longer valid, clear it across the
    // shared settings and every config so nothing keeps an off-list size.
    if ('closureType' in updates) {
      const opts = sizeOptionsForClosure(col, next.closureType)
      if (next.size && !opts.includes(next.size)) next.size = null
    }
    if ('caratIdx' in updates) {
      const carat = next.caratIdx != null ? col.carats[next.caratIdx] : null
      if (next.shape && col.shapes?.length && !getShapesForCarat(col, carat).includes(next.shape)) {
        next.shape = null
      }
      if (isBezelOnly(col, carat)) {
        next.housingType = 'bezel'
        if (!HOUSING.shapyShineBezel.map(h => `Bezel ${h}`).includes(next.housing)) next.housing = null
      }
    }
    set({ sharedSettings: next })
    if (line.colorConfigs.length > 0) {
      set({
        colorConfigs: line.colorConfigs.map(cfg => {
          const merged = { ...cfg, ...updates }
          if ('closureType' in updates) {
            const opts = sizeOptionsForClosure(col, merged.closureType)
            if (merged.size && !opts.includes(merged.size)) merged.size = null
          }
          return applyCaratRules(merged, updates)
        }),
      })
    }
  }

  // State for tracking recently filled cells (for flash animation)
  const [recentlyFilled, setRecentlyFilled] = useState(new Set())

  // Drag-fill state: { sourceIdx, column, targetIdx } or null
  const [dragFill, setDragFill] = useState(null)
  const dragFillRef = useRef(null)
  const tableRef = useRef(null)

  // Excel-style drag fill: works on both mouse (desktop) and touch (iPad/tablet)
  const startDragFill = useCallback((e, sourceIdx, column, configs, selectedIds) => {
    e.preventDefault()
    e.stopPropagation()

    const state = { sourceIdx, column, targetIdx: sourceIdx }
    dragFillRef.current = state
    setDragFill({ ...state })

    // Snapshot row bounding rects at drag-start — more reliable than elementFromPoint
    // which fails over native <select> dropdowns and outside scroll containers.
    const rowRects = Array.from(
      (tableRef.current || document).querySelectorAll('tr[data-row-idx]')
    ).map(el => ({
      idx: parseInt(el.getAttribute('data-row-idx')),
      top: el.getBoundingClientRect().top,
      bottom: el.getBoundingClientRect().bottom,
    }))

    const getRowIdxFromPoint = (clientY) => {
      const match = rowRects.find(r => clientY >= r.top && clientY <= r.bottom)
      return match ? match.idx : null
    }

    const applyMove = (clientX, clientY) => {
      const rowIdx = getRowIdxFromPoint(clientY)
      if (rowIdx === null || rowIdx <= dragFillRef.current.sourceIdx) return
      if (rowIdx === dragFillRef.current.targetIdx) return
      dragFillRef.current = { ...dragFillRef.current, targetIdx: rowIdx }
      setDragFill({ ...dragFillRef.current })
    }

    const applyFill = () => {
      const { sourceIdx, column, targetIdx } = dragFillRef.current
      if (targetIdx > sourceIdx) {
        const source = configs[sourceIdx]
        const hasSelection = selectedIds.size > 0
        const updated = configs.map((cfg, idx) => {
          if (idx <= sourceIdx || idx > targetIdx) return cfg
          if (hasSelection && !selectedIds.has(cfg.id)) return cfg
          // Filling down can drop a carat, shape or setting onto a row that
          // doesn't sell that combination (Shapy Shine at 0.10 ct), so every
          // filled row is re-checked against its own carat afterwards.
          switch (column) {
            case 'carat': return normalizeToCarat({ ...cfg, caratIdx: source.caratIdx })
            // Carry prerequisite fields so the filled value is immediately visible
            case 'housing': return normalizeToCarat({
              ...cfg,
              caratIdx: cfg.caratIdx ?? source.caratIdx,
              housing: source.housing,
              housingType: source.housingType,
              multiAttached: source.multiAttached,
            })
            case 'shape': return normalizeToCarat({
              ...cfg,
              caratIdx: cfg.caratIdx ?? source.caratIdx,
              housing: cfg.housing ?? source.housing,
              housingType: cfg.housingType ?? source.housingType,
              multiAttached: cfg.multiAttached ?? source.multiAttached,
              shape: source.shape,
            })
            case 'size': return normalizeToCarat({
              ...cfg,
              caratIdx: cfg.caratIdx ?? source.caratIdx,
              housing: cfg.housing ?? source.housing,
              housingType: cfg.housingType ?? source.housingType,
              multiAttached: cfg.multiAttached ?? source.multiAttached,
              shape: cfg.shape ?? source.shape,
              size: source.size,
            })
            case 'thickness': return { ...cfg, cordType: source.cordType, thickness: source.thickness }
            case 'qty': return { ...cfg, qty: source.qty }
            default: return cfg
          }
        })
        set({ colorConfigs: updated })
        const filledIds = configs.slice(sourceIdx + 1, targetIdx + 1)
          .filter(c => !hasSelection || selectedIds.has(c.id))
          .map(c => `${c.id}-${column}`)
        setRecentlyFilled(new Set(filledIds))
        setTimeout(() => setRecentlyFilled(new Set()), 800)
      }
      dragFillRef.current = null
      setDragFill(null)
    }

    // Mouse events (desktop)
    const onMouseMove = (ev) => applyMove(ev.clientX, ev.clientY)
    const onMouseUp = () => {
      applyFill()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    // Touch events (iPad / tablet)
    const onTouchMove = (ev) => {
      ev.preventDefault() // prevent iOS scroll from cancelling the drag
      const touch = ev.touches[0]
      if (touch) applyMove(touch.clientX, touch.clientY)
    }
    const onTouchEnd = () => {
      applyFill()
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }

    const isTouch = e.type === 'touchstart'
    if (isTouch) {
      document.addEventListener('touchmove', onTouchMove, { passive: false })
      document.addEventListener('touchend', onTouchEnd)
    } else {
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'crosshair'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
  }, [set])

  // Duplicate colors with variations (selection-aware)
  const duplicateAllWithVariations = () => {
    if (line.colorConfigs.length === 0) return
    // If some configs are selected in this line, only duplicate those; otherwise duplicate all
    const configsToDuplicate = selectedCount > 0 ? selectedInThisLine : line.colorConfigs
    if (configsToDuplicate.length === 0) return
    
    const newConfigs = configsToDuplicate.map(cfg => {
      const nextCaratIdx = duplicateSettings.carat.keepSame ? cfg.caratIdx : duplicateSettings.carat.value
      const certOptions = getAvailableCerts(col, nextCaratIdx, yr)
      const preferredCert = duplicateSettings.cert.keepSame
        ? (cfg.certType || getDefaultCert(col, nextCaratIdx, yr))
        : duplicateSettings.cert.value
      const nextCert = preferredCert && certOptions.includes(preferredCert)
        ? preferredCert
        : (certOptions[0] || getDefaultCert(col, nextCaratIdx, yr))
      const qtyVal = duplicateSettings.qty.keepSame ? cfg.qty : duplicateSettings.qty.value
      const duplicated = {
        ...cfg,
        id: createConfigId(),
        caratIdx: nextCaratIdx,
        certType: nextCert,
        housing: duplicateSettings.housing.keepSame ? cfg.housing : duplicateSettings.housing.value,
        housingType: duplicateSettings.housingType.keepSame ? cfg.housingType : duplicateSettings.housingType.value,
        size: duplicateSettings.size.keepSame ? cfg.size : duplicateSettings.size.value,
        shape: duplicateSettings.shape.keepSame ? cfg.shape : duplicateSettings.shape.value,
        // Closure: gated by hasClosure so duplicating M3/HOLY/etc. never
        // accidentally writes a closureType where the column doesn't exist,
        // and pinned to the forced value on Shapy Shine.
        closureType: resolveClosure(
          col,
          duplicateSettings.closure.keepSame ? cfg.closureType : duplicateSettings.closure.value,
        ),
        qty: Math.max(1, typeof qtyVal === 'number' && !Number.isNaN(qtyVal) ? qtyVal : 1),
      }
      // Duplicating into another carat can land on a size that doesn't sell the
      // copied shape / setting (Shapy Shine 0.10) — drop those rather than
      // creating rows the order form can't render.
      return applyCaratRules(duplicated, { caratIdx: nextCaratIdx })
    })
    set({ colorConfigs: [...line.colorConfigs, ...newConfigs] })
    setShowDuplicatePanel(false)
  }

  // Update duplicate settings
  const updateDuplicateSetting = (field, updates) => {
    setDuplicateSettings(prev => ({
      ...prev,
      [field]: { ...prev[field], ...updates },
    }))
  }

  // Housing options resolver
  const hasHousing = !!col.housing
  const isImplicitHousing = col.housing === 'sparkleProng'
  const hasShapes = col.shapes && col.shapes.length > 0
  // When the shape is preset from the grid, hide every shape-picking UI element
  // (strip, shared selector, table column, row dropdowns). Gating logic that uses
  // `hasShapes` for the size column still works because each row's shape is
  // pre-filled to the preset value.
  const showShapeSelector = hasShapes && !presetShape
  // A preset shape (chosen on the grid) satisfies the shape requirement for the
  // whole line, so fields gated behind shape (e.g. size) stay selectable even
  // before each row's cfg.shape has been backfilled.
  const shapeReqMet = !hasShapes || !!presetShape
  const hasSizes = col.sizes && col.sizes.length > 0
  const hasThickness = col.cord === 'silk' || col.cord === 'silkBraided'
  // Allowed silk thicknesses for this collection. New silk collections (Sienna,
  // Iconix) only ship in Thin, so they expose a single option.
  const thicknessOpts = getThicknessOptions(col)
  // Bracelet thread closure column: shown for collections that opt-in via
  // hasClosure (currently CUTY, CUBIX). Lets the user pick "Braided" vs
  // "Non-braided" closure per row. Collections with a forced closure (Shapy
  // Shine = braided) still carry the value but never render a picker.
  const forcedClosure = getForcedClosure(col)
  const hasClosure = !!col.hasClosure && !forcedClosure
  // Duplicate panel: when it targets one specific carat, its shape / setting
  // pickers must follow that carat's rules. "Keep same" leaves every row on its
  // own carat, so no restriction can be applied there.
  const duplicateCaratIdx = duplicateSettings.carat.keepSame ? null : duplicateSettings.carat.value
  const duplicateShapeOptions = getShapesForCaratIdx(col, duplicateCaratIdx)
  const duplicateBezelOnly = duplicateCaratIdx != null && isBezelOnly(col, col.carats[duplicateCaratIdx])
  const getCertForCarat = useCallback((currentCert, caratIdx) => {
    const available = getAvailableCerts(col, caratIdx, yr)
    if (currentCert && available.includes(currentCert)) return currentCert
    return available[0] || getDefaultCert(col, caratIdx, yr)
  }, [col, yr])

  const renderHousingSelector = (cfg, patchFn) => {
    const selectedCarat = cfg.caratIdx != null ? col.carats[cfg.caratIdx] : null
    const shapyShineBezelOnly = isBezelOnly(col, selectedCarat)
    // Touch-friendly select sizing on compact screens (44px min height)
    const hSel = mobile ? { ...selectStyle, ...mobileSelectOverride } : selectStyle

    if (col.housing === 'standard') {
      return (
        <select
          value={cfg.housing || ''}
          onChange={(e) => patchFn({ housing: e.target.value || null })}
          style={hSel}
        >
          <option value="">{t('collection.housingPlaceholder')}</option>
          {HOUSING.standard.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      )
    }
    if (col.housing === 'goldMetal' || col.housing === 'goldMetalNoRose') {
      return (
        <select
          value={cfg.housing || ''}
          onChange={(e) => patchFn({ housing: e.target.value || null })}
          style={hSel}
        >
          <option value="">{t('collection.housingPlaceholder')}</option>
          {HOUSING[col.housing].map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      )
    }
    // New collections (Moonlight / Sienna / Iconix): single combined metal+finish
    // tile. metalEight = 3 golds + 5 mattes; metalThree = 3 golds only.
    if (col.housing === 'metalEight' || col.housing === 'metalThree') {
      return (
        <select
          value={cfg.housing || ''}
          onChange={(e) => patchFn({ housing: e.target.value || null })}
          style={hSel}
        >
          <option value="">{t('collection.housingPlaceholder')}</option>
          {HOUSING[col.housing].map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      )
    }
    if (col.housing === 'multiThree') {
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={cfg.multiAttached === true ? 'attached' : cfg.multiAttached === false ? 'notAttached' : ''}
            onChange={(e) => {
              const v = e.target.value
              patchFn({ multiAttached: v === 'attached' ? true : v === 'notAttached' ? false : null, housing: null })
            }}
            style={{ ...hSel, minWidth: 80 }}
          >
            <option value="">{t('collection.typePlaceholder')}</option>
            <option value="attached">{t('collection.attached')}</option>
            <option value="notAttached">{t('collection.notAttached')}</option>
          </select>
          {cfg.multiAttached !== null && (
            <select
              value={cfg.housing || ''}
              onChange={(e) => patchFn({ housing: e.target.value || null })}
              style={hSel}
            >
              <option value="">{t('collection.housingPlaceholder')}</option>
              {(cfg.multiAttached ? HOUSING.multiThree.attached : HOUSING.multiThree.notAttached).map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          )}
        </div>
      )
    }
    if (col.housing === 'matchy') {
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={cfg.housingType || ''}
            onChange={(e) => patchFn({ housingType: e.target.value || null, housing: null })}
            style={{ ...hSel, minWidth: 70 }}
          >
            <option value="">{t('collection.typePlaceholder')}</option>
            <option value="bezel">{t('collection.bezel')}</option>
            <option value="prong">{t('collection.prong')}</option>
          </select>
          {cfg.housingType && (
            <select
              value={cfg.housing || ''}
              onChange={(e) => patchFn({ housing: e.target.value || null })}
              style={hSel}
            >
              <option value="">{t('collection.housingPlaceholder')}</option>
              {(cfg.housingType === 'bezel' ? HOUSING.matchyBezel : HOUSING.matchyProng).map(h => {
                const label = h.label || h
                const fullValue = cfg.housingType === 'bezel' ? `Bezel ${label}` : `Prong ${label}`
                return <option key={h.id || h} value={fullValue}>{label}</option>
              })}
            </select>
          )}
        </div>
      )
    }
    if (col.housing === 'shapyShine') {
      if (shapyShineBezelOnly) {
        return (
          <select
            value={cfg.housing || ''}
            onChange={(e) => patchFn({ housing: e.target.value || null, housingType: 'bezel' })}
            style={hSel}
          >
            <option value="">{t('collection.housingPlaceholder')}</option>
            {HOUSING.shapyShineBezel.map(h => <option key={h} value={`Bezel ${h}`}>Bezel {h}</option>)}
          </select>
        )
      }
      return (
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={cfg.housingType || ''}
            onChange={(e) => patchFn({ housingType: e.target.value || null, housing: null })}
            style={{ ...hSel, minWidth: 70 }}
          >
            <option value="">{t('collection.typePlaceholder')}</option>
            <option value="bezel">{t('collection.bezel')}</option>
            <option value="prong">{t('collection.prong')}</option>
          </select>
          {cfg.housingType && (
            <select
              value={cfg.housing || ''}
              onChange={(e) => patchFn({ housing: e.target.value || null })}
              style={hSel}
            >
              <option value="">{t('collection.housingPlaceholder')}</option>
              {(cfg.housingType === 'bezel' ? HOUSING.shapyShineBezel : HOUSING.shapyShineProng).map(h => (
                <option key={h} value={cfg.housingType === 'bezel' ? `Bezel ${h}` : `Prong ${h}`}>
                  {h}
                </option>
              ))}
            </select>
          )}
        </div>
      )
    }
    if (col.housing === 'sparkleProng') {
      return (
        <div style={{ fontSize: 11, color: '#888', fontWeight: 600, padding: '4px 0' }}>
          Prong
        </div>
      )
    }
    if (col.housing === 'sparkleProngBezel') {
      return (
        <select
          value={cfg.housing || ''}
          onChange={(e) => patchFn({ housing: e.target.value || null })}
          style={hSel}
        >
          <option value="">{t('collection.housingPlaceholder')}</option>
          {HOUSING.sparkleProngBezel.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      )
    }
    return null
  }

  // Inject styles once per page load
  if (!_stylesInjected && typeof document !== 'undefined') {
    const styleEl = document.createElement('style')
    styleEl.textContent = duplicateHighlightStyles
    document.head.appendChild(styleEl)
    _stylesInjected = true
  }

  return (
    <>
      <div style={{
        border: '1px solid #e8e8e8', borderRadius: 12, marginBottom: 12,
        overflow: 'hidden', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
      }}>
      {/* ─── Header ─── */}
      <div
        style={{
          padding: '12px 16px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          background: expanded ? '#fafafa' : '#fff',
          borderBottom: expanded ? '1px solid #eee' : 'none',
          transition: 'background .15s',
          gap: 8, flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
          {/* Line selection checkbox */}
          {line.colorConfigs.length > 0 && onToggleLineSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLineSelect(line.uid) }}
              style={{
                width: 20, height: 20, borderRadius: 4,
                border: allSelected || someSelected ? `2px solid ${colors.inkPlum}` : '2px solid #ccc',
                background: allSelected ? colors.inkPlum : '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all .15s',
              }}
              title={t('builder.selectAll')}
            >
              {allSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
              {someSelected && <span style={{ color: colors.inkPlum, fontSize: 14, fontWeight: 700, lineHeight: 1 }}>−</span>}
            </button>
          )}
          <span 
            onClick={() => set({ expanded: !expanded })}
            style={{
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              color: line.colorConfigs.length > 0 ? colors.inkPlum : '#333',
            }}>
            {presetShape ? `${col.label} — ${presetShape}` : col.label}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
            background: getProductType(col) === 'necklace' ? '#efeaf6' : '#f0ece4',
            color: getProductType(col) === 'necklace' ? colors.inkPlum : '#8a7a5c',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {t(`productType.${getProductType(col)}`)}
          </span>
          <span style={{ fontSize: 12, color: '#999' }}>
            {fmt(getPrice(col, caratOptions[0]?.idx ?? 0, getDefaultCert(col, caratOptions[0]?.idx ?? 0, yr), yr))}-{fmt(getPrice(col, caratOptions[caratOptions.length - 1]?.idx ?? col.carats.length - 1, getDefaultCert(col, caratOptions[caratOptions.length - 1]?.idx ?? col.carats.length - 1, yr), yr))}
          </span>
          {line.colorConfigs.length > 0 && (
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10,
              background: `${colors.inkPlum}10`, color: colors.inkPlum,
              fontWeight: 600,
            }}>
              {line.colorConfigs.length} color{line.colorConfigs.length !== 1 ? 's' : ''} · {totalQty} pcs
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lineTotal > 0 && (
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>{fmt(lineTotal)}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(line.uid) }}
            style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#ccc', padding: mobile ? 10 : 4, minWidth: mobile ? 44 : 'auto', minHeight: mobile ? 44 : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Remove collection"
          >x</button>
          <button
            onClick={() => set({ expanded: !expanded })}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              fontSize: 10, color: '#ccc',
              minWidth: mobile ? 44 : 'auto', minHeight: mobile ? 44 : 'auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><span style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s', display: 'inline-block' }}>▼</span></button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '14px 16px' }}>
          {/* ─── Color Palette ─── */}
          <div style={{ marginBottom: 14 }}>
            {hasCordOptions && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Cord Type
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: selectedCordType === 'silk' ? 8 : 0 }}>
                  {CORD_OPTIONS[col.cord].map((ct) => (
                    <button
                      key={ct}
                      onClick={() => setSelectedCordType(ct)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: selectedCordType === ct ? `1px solid ${colors.inkPlum}` : '1px solid #ddd',
                        background: selectedCordType === ct ? '#f3edf6' : '#fff',
                        color: selectedCordType === ct ? colors.inkPlum : '#666',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {CORD_TYPE_LABELS[ct] || ct}
                    </button>
                  ))}
                </div>
                {selectedCordType === 'silk' && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Thickness
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {thicknessOpts.map((th) => (
                        <button
                          key={th}
                          onClick={() => setSelectedSilkThickness(th)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: selectedSilkThickness === th ? `1px solid ${colors.inkPlum}` : '1px solid #ddd',
                            background: selectedSilkThickness === th ? '#f3edf6' : '#fff',
                            color: selectedSilkThickness === th ? colors.inkPlum : '#666',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {th}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Silk-only collections (cord:'silk', no cord-type choice) still
                need Thin/Thick before colors can be added. */}
            {!hasCordOptions && col.cord === 'silk' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Thickness
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {thicknessOpts.map((th) => (
                    <button
                      key={th}
                      onClick={() => setSelectedSilkThickness(th)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: selectedSilkThickness === th ? `1px solid ${colors.inkPlum}` : '1px solid #ddd',
                        background: selectedSilkThickness === th ? '#f3edf6' : '#fff',
                        color: selectedSilkThickness === th ? colors.inkPlum : '#666',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {th}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Shapes available for this collection — shown upfront so the user
                sees every shape immediately (the per-row Shape dropdown still
                drives the actual selection once a colour + carat are picked).
                Hidden when the shape is already locked from the grid. */}
            {showShapeSelector && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  {t('collection.shapesAvailable') || 'Shapes available'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {col.shapes.map(s => (
                    <span
                      key={s}
                      style={{
                        padding: '4px 10px', borderRadius: 999,
                        border: '1px solid #e0d6ea', background: '#f6f1fa',
                        color: colors.inkPlum, fontSize: 11, fontWeight: 600,
                        fontFamily: 'inherit',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              flexWrap: 'wrap', marginBottom: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('collection.clickColorsToAdd')}
              </div>
              {/* Whole-palette shortcut — the fair-stand path. */}
              {palette.length > 1 && (
                <button
                  type="button"
                  data-testid="add-all-colors"
                  onClick={allPaletteColorsAdded ? removeAllPaletteColors : addAllColors}
                  disabled={colorPickerDisabled}
                  title={colorPickerDisabled ? t('collection.pickThicknessFirst') : undefined}
                  style={{
                    padding: '4px 11px', borderRadius: 999,
                    border: `1px solid ${allPaletteColorsAdded ? '#d9c9d6' : colors.inkPlum}`,
                    background: allPaletteColorsAdded ? '#faf6fb' : '#fff',
                    color: allPaletteColorsAdded ? colors.lovelabMuted : colors.inkPlum,
                    fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                    letterSpacing: '0.01em', whiteSpace: 'nowrap',
                    cursor: colorPickerDisabled ? 'not-allowed' : 'pointer',
                    opacity: colorPickerDisabled ? 0.45 : 1,
                    transition: 'opacity .12s',
                  }}
                >
                  {allPaletteColorsAdded
                    ? t('collection.removeAllColors', { count: palette.length })
                    : t('collection.addAllColors', { count: missingPaletteColors.length })}
                </button>
              )}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: mobile ? 'repeat(auto-fit, minmax(44px, 1fr))' : 'repeat(7, 1fr)',
              gap: mobile ? 8 : 6,
            }}>
              {palette.map(c => {
                const count = colorCounts[c.n] || 0
                // 40px + 8px gap keeps each dot inside a ~44px touch zone
                // (Apple HIG minimum) — 32px dots were easy to mis-tap.
                const btnSize = mobile ? 40 : 30
                const packshotUrl = hoveredColor === c.n ? findPackshot(col.id, { color: c.n }) : null
                return (
                  <div key={c.n} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                    <button
                      title={c.n}
                      onClick={() => addColor(c.n)}
                      disabled={colorPickerDisabled}
                      onMouseEnter={mobile ? undefined : (e) => {
                        const r = e.currentTarget.getBoundingClientRect()
                        setHoverPos({ x: r.left + r.width / 2, y: r.top })
                        setHoveredColor(c.n)
                      }}
                      onMouseLeave={mobile ? undefined : () => setHoveredColor(null)}
                      onTouchStart={mobile ? () => { longPressTimer.current = setTimeout(() => setHoveredColor(c.n), 300) } : undefined}
                      onTouchEnd={mobile ? () => { clearTimeout(longPressTimer.current); setHoveredColor(null) } : undefined}
                      onTouchCancel={mobile ? () => { clearTimeout(longPressTimer.current); setHoveredColor(null) } : undefined}
                      style={{
                        width: btnSize, height: btnSize, borderRadius: '50%', background: c.h, padding: 0,
                        border: count > 0 ? `2.5px solid ${colors.inkPlum}` : isLight(c.h) ? '1px solid #ddd' : '1px solid transparent',
                        cursor: colorPickerDisabled ? 'not-allowed' : 'pointer', transition: 'transform .1s',
                        transform: count > 0 ? 'scale(1.08)' : 'scale(1)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        opacity: colorPickerDisabled ? 0.45 : 1,
                      }}
                    />
                    {count > 0 && (
                      <span style={{
                        position: 'absolute', top: -3, right: -3,
                        width: mobile ? 18 : 14, height: mobile ? 18 : 14, borderRadius: '50%',
                        background: colors.inkPlum, color: '#fff',
                        fontSize: mobile ? 10 : 8, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {count}
                      </span>
                    )}
                    {hoveredColor === c.n && packshotUrl && (
                      <div style={{
                        position: 'fixed',
                        left: hoverPos.x,
                        top: hoverPos.y - 8,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 9999, pointerEvents: 'none',
                        background: '#fff', borderRadius: 10, padding: 10,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.18)', border: '1px solid #e5e5e5',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      }}>
                        <img
                          src={packshotUrl}
                          alt={c.n}
                          style={{ width: 150, height: 150, objectFit: 'contain', borderRadius: 8, background: '#f3eef5', border: '1px solid #e8e0ec' }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 600, color: colors.inkPlum, whiteSpace: 'nowrap' }}>{c.n}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {(col.cord === 'silk' || selectedCordType === 'silk') && !selectedSilkThickness && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#a06f00' }}>
                Select <strong>Thin</strong> or <strong>Thick</strong> before adding colors.
              </div>
            )}
          </div>

          {/* ─── Same for all toggle ─── */}
          {line.colorConfigs.length >= 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
              gap: 8,
              padding: '8px 12px', borderRadius: 8, background: '#f8f8f8',
              marginBottom: 12,
            }}>
              <span style={{ fontSize: 12, color: '#555', fontWeight: 500, flex: '1 1 160px', minWidth: 0 }}>{t('collection.sameSettingsForAllColors')}</span>
              <button
                onClick={handleSameForAllToggle}
                style={{
                  padding: '4px 14px', borderRadius: 14, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                  border: sameForAll ? `1px solid ${colors.inkPlum}` : '1px solid #ddd',
                  background: sameForAll ? colors.inkPlum : '#f5f5f5',
                  color: sameForAll ? '#fff' : '#999',
                }}
              >
                {sameForAll ? t('common.on') : t('common.off')}
              </button>
            </div>
          )}

          {/* ─── Duplicate with variations ─── */}
          {line.colorConfigs.length > 0 && (
            <div style={{
              marginBottom: 12, borderRadius: 8, border: '1px solid #e8e8e8',
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setShowDuplicatePanel(!showDuplicatePanel)}
                style={{
                  width: '100%', padding: '10px 12px', background: '#fafafa',
                  border: 'none', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 12, color: '#555', fontWeight: 500, textAlign: 'left', minWidth: 0 }}>
                  {t('collection.duplicateWithVariations')}
                </span>
                <span style={{
                  fontSize: 10, color: '#999',
                  transform: showDuplicatePanel ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform .2s',
                }}>▼</span>
              </button>

              {showDuplicatePanel && (
                <div style={{ padding: '12px', background: '#fff', borderTop: '1px solid #eee' }}>
                  {/* Duplicate option row helper */}
                  {[
                    { field: 'carat', label: t('quote.carat'), show: true },
                    { field: 'cert', label: t('cert.label'), show: col.certificate === 'both' },
                    { field: 'housing', label: t('quote.housing'), show: hasHousing },
                    { field: 'size', label: t('quote.size'), show: hasSizes },
                    { field: 'shape', label: t('quote.shape'), show: showShapeSelector },
                    { field: 'closure', label: t('quote.closure'), show: hasClosure },
                    { field: 'qty', label: t('quote.qty'), show: true },
                  ].filter(r => r.show).map(({ field, label }) => (
                    <div key={field} data-field={field} style={{
                      display: 'flex', flexDirection: mobile ? 'column' : 'row',
                      alignItems: mobile ? 'flex-start' : 'center',
                      gap: mobile ? 6 : 12, marginBottom: mobile ? 14 : 10,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#666', width: mobile ? 'auto' : 60, textTransform: 'uppercase' }}>
                        {label}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 10 : 8, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', minHeight: mobile ? 36 : 'auto' }}>
                          <input
                            type="radio"
                            name={`dup-${field}-${line.uid}`}
                            checked={duplicateSettings[field].keepSame}
                            onChange={() => updateDuplicateSetting(field, { keepSame: true })}
                            style={{ accentColor: colors.inkPlum, width: mobile ? 18 : 'auto', height: mobile ? 18 : 'auto' }}
                          />
                          <span style={{ fontSize: mobile ? 13 : 11, color: '#666' }}>{t('collection.keepSame')}</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', minHeight: mobile ? 36 : 'auto' }}>
                          <input
                            type="radio"
                            name={`dup-${field}-${line.uid}`}
                            checked={!duplicateSettings[field].keepSame}
                            onChange={() => updateDuplicateSetting(field, { keepSame: false })}
                            style={{ accentColor: colors.inkPlum, width: mobile ? 18 : 'auto', height: mobile ? 18 : 'auto' }}
                          />
                          <span style={{ fontSize: mobile ? 13 : 11, color: '#666' }}>{t('collection.changeTo')}</span>
                        </label>
                        {!duplicateSettings[field].keepSame && field === 'carat' && (
                          <select
                            value={duplicateSettings.carat.value !== null ? duplicateSettings.carat.value : ''}
                            onChange={(e) => updateDuplicateSetting('carat', { value: e.target.value === '' ? null : parseInt(e.target.value) })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.caratPlaceholder')}</option>
                            {caratOptions.map(({ carat, idx }) => (
                              <option key={carat} value={idx}>{carat} ct - €{getPrice(col, idx, getDefaultCert(col, idx, yr), yr)}</option>
                            ))}
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'housing' && col.housing === 'standard' && (
                          <select
                            value={duplicateSettings.housing.value || ''}
                            onChange={(e) => updateDuplicateSetting('housing', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.housingPlaceholder')}</option>
                            {HOUSING.standard.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'cert' && (
                          <select
                            value={duplicateSettings.cert.value || ''}
                            onChange={(e) => updateDuplicateSetting('cert', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.selectPlaceholder')}</option>
                            {['igi', 'inhouse'].map((ct) => (
                              <option key={ct} value={ct}>{CERT_LABELS[ct]}</option>
                            ))}
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'housing' && (col.housing === 'goldMetal' || col.housing === 'goldMetalNoRose') && (
                          <select
                            value={duplicateSettings.housing.value || ''}
                            onChange={(e) => updateDuplicateSetting('housing', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.housingPlaceholder')}</option>
                            {HOUSING[col.housing].map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'housing' && (col.housing === 'metalEight' || col.housing === 'metalThree') && (
                          <select
                            value={duplicateSettings.housing.value || ''}
                            onChange={(e) => updateDuplicateSetting('housing', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.housingPlaceholder')}</option>
                            {HOUSING[col.housing].map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'housing' && (col.housing === 'shapyShine' || col.housing === 'matchy') && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select
                              value={duplicateSettings.housingType.value || ''}
                              onChange={(e) => { updateDuplicateSetting('housingType', { value: e.target.value || null, keepSame: false }); updateDuplicateSetting('housing', { value: null }) }}
                              style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}), minWidth: 70 }}
                            >
                              <option value="">{t('collection.typePlaceholder')}</option>
                              <option value="bezel">{t('collection.bezel')}</option>
                              {!duplicateBezelOnly && <option value="prong">{t('collection.prong')}</option>}
                            </select>
                            {duplicateSettings.housingType.value && col.housing === 'shapyShine' && (
                              <select
                                value={duplicateSettings.housing.value || ''}
                                onChange={(e) => updateDuplicateSetting('housing', { value: e.target.value || null })}
                                style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                              >
                                <option value="">{t('collection.housingPlaceholder')}</option>
                                {(duplicateSettings.housingType.value === 'bezel' ? HOUSING.shapyShineBezel : HOUSING.shapyShineProng).map(h => (
                                  <option key={h} value={`${duplicateSettings.housingType.value === 'bezel' ? 'Bezel' : 'Prong'} ${h}`}>{h}</option>
                                ))}
                              </select>
                            )}
                            {duplicateSettings.housingType.value && col.housing === 'matchy' && (
                              <select
                                value={duplicateSettings.housing.value || ''}
                                onChange={(e) => updateDuplicateSetting('housing', { value: e.target.value || null })}
                                style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                              >
                                <option value="">{t('collection.housingPlaceholder')}</option>
                                {(duplicateSettings.housingType.value === 'bezel' ? HOUSING.matchyBezel : HOUSING.matchyProng).map(h => {
                                  const label = h.label || h
                                  const fullValue = duplicateSettings.housingType.value === 'bezel' ? `Bezel ${label}` : `Prong ${label}`
                                  return <option key={h.id || h} value={fullValue}>{label}</option>
                                })}
                              </select>
                            )}
                          </div>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'housing' && col.housing === 'multiThree' && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select
                              value={duplicateSettings.housingType.value || ''}
                              onChange={(e) => { updateDuplicateSetting('housingType', { value: e.target.value || null, keepSame: false }); updateDuplicateSetting('housing', { value: null }) }}
                              style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}), minWidth: 90 }}
                            >
                              <option value="">{t('collection.typePlaceholder')}</option>
                              <option value="attached">{t('collection.attached')}</option>
                              <option value="notAttached">{t('collection.notAttached')}</option>
                            </select>
                            {duplicateSettings.housingType.value && (
                              <select
                                value={duplicateSettings.housing.value || ''}
                                onChange={(e) => updateDuplicateSetting('housing', { value: e.target.value || null })}
                                style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                              >
                                <option value="">{t('collection.housingPlaceholder')}</option>
                                {(duplicateSettings.housingType.value === 'attached' ? HOUSING.multiThree.attached : HOUSING.multiThree.notAttached).map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'size' && (
                          <select
                            value={duplicateSettings.size.value || ''}
                            onChange={(e) => updateDuplicateSetting('size', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.sizePlaceholder')}</option>
                            {sizeOptionsForClosure(col, duplicateSettings.closure.value).map(s => <option key={s} value={s}>{sizeDisplayLabel(col, s)}</option>)}
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'shape' && (
                          <select
                            value={duplicateSettings.shape.value || ''}
                            onChange={(e) => updateDuplicateSetting('shape', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.shapePlaceholder')}</option>
                            {duplicateShapeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'closure' && (
                          <select
                            value={duplicateSettings.closure.value || ''}
                            onChange={(e) => updateDuplicateSetting('closure', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.closurePlaceholder')}</option>
                            <option value="braided">{t('collection.closureBraided')}</option>
                            <option value="nonBraided">{t('collection.closureNonBraided')}</option>
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'qty' && (
                          <input
                            type="number"
                            min="1"
                            value={duplicateSettings.qty.value}
                            onChange={(e) => updateDuplicateSetting('qty', { value: Math.max(1, parseInt(e.target.value) || 1) })}
                            style={{ ...qtyInputStyle, width: 50, ...(mobile ? { height: 36 } : {}) }}
                          />
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Duplicate button */}
                  <button
                    onClick={duplicateAllWithVariations}
                    style={{
                      width: '100%', padding: '10px 16px', borderRadius: 8,
                      background: colors.inkPlum, color: '#fff', border: 'none',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'inherit', transition: 'opacity .15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                  >
                    + {selectedCount > 0 
                      ? t('builder.duplicateSelectedColors').replace('{count}', selectedCount)
                      : t('collection.duplicateColors').replace('{count}', line.colorConfigs.length)
                    }
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── Shared settings row (when same-for-all is ON) ─── */}
          {sameForAll && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, border: `1px solid ${colors.inkPlum}20`,
              background: '#fdf7fa', marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.inkPlum, marginBottom: 8 }}>{t('collection.sharedSettings')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {/* Carat */}
                <select
                  value={sharedSettings.caratIdx !== null ? sharedSettings.caratIdx : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value)
                    // When carat changes, reconcile the shared cert to one
                    // that's still available for the new carat (e.g. CUTY's
                    // 0.20 ct has no in-house option). Keeps sharedSettings
                    // and the broadcast `certType` patch consistent.
                    const reconciledCert = sharedSettings.certType
                      ? getCertForCarat(sharedSettings.certType, val)
                      : null
                    updateShared({
                      caratIdx: val, housing: null, housingType: null, multiAttached: null,
                      shape: null, size: null,
                      certType: reconciledCert,
                    })
                  }}
                  style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                >
                  <option value="">{t('collection.caratPlaceholder')}</option>
                  {caratOptions.map(({ carat, idx }) => (
                    <option key={carat} value={idx}>{carat} ct - €{getPrice(col, idx, sharedSettings.certType || getDefaultCert(col, idx, yr), yr)}</option>
                  ))}
                </select>

                {/* Certificate (shared) — only when both IGI + In-house are
                    available on the collection. Picks one cert and pushes it
                    to every colour via updateShared. */}
                {col.certificate === 'both' && sharedSettings.caratIdx !== null && (
                  <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                    {['igi', 'inhouse'].map(ct => {
                      const avail = getAvailableCerts(col, sharedSettings.caratIdx, yr)
                      const isAvail = avail.includes(ct)
                      const isActive = (sharedSettings.certType || getDefaultCert(col, sharedSettings.caratIdx, yr)) === ct
                      return (
                        <button
                          key={ct}
                          disabled={!isAvail}
                          onClick={() => isAvail && updateShared({ certType: ct })}
                          style={{
                            padding: mobile ? '10px 14px' : '4px 10px', fontSize: mobile ? 13 : 11, fontWeight: 700, border: 'none',
                            background: isActive ? colors.inkPlum : '#f5f5f5',
                            color: isActive ? '#fff' : isAvail ? '#888' : '#ccc',
                            cursor: isAvail ? 'pointer' : 'not-allowed',
                            fontFamily: 'inherit', transition: 'all .15s',
                            opacity: isAvail ? 1 : 0.5,
                          }}
                        >
                          {CERT_LABELS[ct]}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Housing */}
                {hasHousing && sharedSettings.caratIdx !== null && (
                  renderHousingSelector(sharedSettings, updateShared)
                )}

                {/* Shape */}
                {showShapeSelector && sharedSettings.caratIdx !== null && (!hasHousing || isImplicitHousing || !!sharedSettings.housing) && (
                  <select
                    value={sharedSettings.shape || ''}
                    onChange={(e) => updateShared({ shape: e.target.value || null })}
                    style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                  >
                    <option value="">{t('collection.shapePlaceholder')}</option>
                    {getShapesForCaratIdx(col, sharedSettings.caratIdx).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}

                {/* Size */}
                {hasSizes && sharedSettings.caratIdx !== null && (!hasHousing || isImplicitHousing || !!sharedSettings.housing) && (shapeReqMet || !!sharedSettings.shape) && (
                  <select
                    value={sharedSettings.size || ''}
                    onChange={(e) => updateShared({ size: e.target.value || null })}
                    style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                  >
                    <option value="">{t('collection.sizePlaceholder')}</option>
                    {sizeOptionsForClosure(col, sharedSettings.closureType).map(s => <option key={s} value={s}>{sizeDisplayLabel(col, s)}</option>)}
                  </select>
                )}

                {/* Closure (CUTY/CUBIX) — pushes the picked closureType to
                    every colour so agents don't have to set it row by row. */}
                {hasClosure && sharedSettings.caratIdx !== null && (
                  <select
                    value={sharedSettings.closureType || ''}
                    onChange={(e) => updateShared({ closureType: e.target.value || null })}
                    style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                  >
                    <option value="">{t('collection.closurePlaceholder')}</option>
                    <option value="braided">{t('collection.closureBraided')}</option>
                    <option value="nonBraided">{t('collection.closureNonBraided')}</option>
                  </select>
                )}

                {/* Qty */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => updateShared({ qty: Math.max(1, (sharedSettings.qty ?? 1) - 1) })} style={mobile ? mobileQtyBtnStyle : qtyBtnStyle}>-</button>
                  <input
                    type="number"
                    value={sharedSettings.qty ?? 1}
                    onChange={(e) => updateShared({ qty: Math.max(1, parseInt(e.target.value) || 1) })}
                    style={mobile ? { ...qtyInputStyle, width: 48, height: 44, fontSize: 15 } : qtyInputStyle}
                  />
                  <button onClick={() => updateShared({ qty: (sharedSettings.qty ?? 1) + 1 })} style={mobile ? mobileQtyBtnStyle : qtyBtnStyle}>+</button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Config Table (desktop) / Card list (mobile) ─── */}
          {line.colorConfigs.length > 0 && !mobile && (
            // Wrapper:
            //  - `overflowX: auto` lets the table scroll horizontally on
            //    narrow screens (the table is wider than the parent on
            //    13" laptops once Housing + Shape + Size + Thickness are
            //    all visible).
            //  - The right-edge fade ::after rule + the always-visible
            //    scrollbar ::-webkit-scrollbar rule are added to the
            //    `.cc-table-scroll` class in JSX-level <style>, so non-
            //    technical users get a visible cue that there's more.
            //  - The action column is `position: sticky; right: 0` so the
            //    X button is always reachable, even while mid-scroll.
            <div className="cc-table-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
              <style>{`
                /* Always-visible horizontal scrollbar so mum sees the cue */
                .cc-table-scroll::-webkit-scrollbar { height: 10px; }
                .cc-table-scroll::-webkit-scrollbar-track { background: #f4f0f7; border-radius: 5px; }
                .cc-table-scroll::-webkit-scrollbar-thumb { background: #c8b8d0; border-radius: 5px; }
                .cc-table-scroll::-webkit-scrollbar-thumb:hover { background: #5d3a5e; }
                /* Firefox */
                .cc-table-scroll { scrollbar-color: #c8b8d0 #f4f0f7; scrollbar-width: thin; }
                /* Row separators — needed because borderCollapse:'separate' is required
                   for sticky table cells to render their background correctly. */
                .cc-table-scroll tbody tr td { border-bottom: 1px solid #f5f5f5; }
              `}</style>
              <table ref={tableRef} style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                <thead>
                  <tr>
                    {onToggleConfigSelect && <th style={{ ...thStyle, width: 32, borderBottom: '2px solid #eee' }}></th>}
                    <th style={{ ...thStyle, borderBottom: '2px solid #eee' }}>{t('quote.color')}</th>
                    {col.certificate && <th style={{ ...thStyle, borderBottom: '2px solid #eee' }}>{t('cert.label')}</th>}
                    <th style={{ ...thStyle, borderBottom: '2px solid #eee' }}>{t('quote.carat')}</th>
                    {hasHousing && <th style={{ ...thStyle, borderBottom: '2px solid #eee' }}>{t('quote.housing')}</th>}
                    {showShapeSelector && <th style={{ ...thStyle, borderBottom: '2px solid #eee' }}>{t('quote.shape')}</th>}
                    {hasSizes && <th style={{ ...thStyle, borderBottom: '2px solid #eee' }}>{t('quote.size')}</th>}
                    {hasThickness && <th style={{ ...thStyle, borderBottom: '2px solid #eee' }}>{hasCordOptions ? 'Material' : 'Thickness'}</th>}
                    {hasClosure && <th style={{ ...thStyle, borderBottom: '2px solid #eee' }}>{t('quote.closure')}</th>}
                    <th style={{ ...thStyle, borderBottom: '2px solid #eee' }}>{t('quote.qty')}</th>
                    <th style={{ ...thStyle, textAlign: 'right', borderBottom: '2px solid #eee' }}>{t('quote.total')}</th>
                    <th style={stickyActionHeaderStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {line.colorConfigs.map((cfg, cfgIdx) => {
                    const colorDef = palette.find(p => p.n === cfg.colorName) || { h: '#ccc' }
                    const effectiveCaratIdx = cfg.caratIdx ?? (sameForAll ? sharedSettings.caratIdx : null)
                    const catalogPrice = effectiveCaratIdx !== null ? getPrice(col, effectiveCaratIdx, cfg.certType, yr) : 0
                    const retailPrice = effectiveCaratIdx !== null ? getRetail(col, effectiveCaratIdx, cfg.certType, yr) : 0
                    const unitPrice = cfg.priceOverride != null ? cfg.priceOverride : catalogPrice
                    const price = unitPrice
                    const rowTotal = unitPrice * cfg.qty
                    const isSelected = selectedConfigs.has(cfg.id)
                    const isRecentlyDuplicated = recentlyDuplicated.has(cfg.id)
                    const hasRowsBelow = cfgIdx < line.colorConfigs.length - 1
                    const canFillCarat = cfg.caratIdx !== null && hasRowsBelow && !sameForAll
                    const canFillHousing = cfg.housing !== null && hasRowsBelow && !sameForAll
                    const canFillShape = cfg.shape !== null && hasRowsBelow && !sameForAll
                    const canFillSize = cfg.size !== null && hasRowsBelow && !sameForAll
                    const canFillThickness = cfg.thickness !== null && hasRowsBelow && !sameForAll
                    const canFillClosure = cfg.closureType !== null && hasRowsBelow && !sameForAll
                    const canFillQty = hasRowsBelow && !sameForAll

                    const isDragTarget = dragFill && cfgIdx > dragFill.sourceIdx && cfgIdx <= dragFill.targetIdx

                    // Solid row background — the sticky action cell needs a
                    // non-transparent colour or the scrolled-under content
                    // shows through. We use solid hex equivalents instead
                    // of the original rgba so the sticky cell matches the
                    // rest of the row exactly.
                    const rowBg = isRecentlyDuplicated
                      ? '#fce4ec'
                      : isDragTarget
                        ? '#f3eef5'
                        : isSelected
                          ? '#f3f0f5'
                          : '#ffffff'
                    return (
                      <tr key={cfg.id} data-row-idx={cfgIdx} style={{
                        background: rowBg,
                        transition: 'background 0.15s ease-out',
                        animation: isRecentlyDuplicated ? 'duplicateHighlight 15s ease-out forwards' : 'none',
                        outline: isDragTarget ? '1px solid rgba(93,58,94,0.2)' : 'none',
                      }}>
                        {onToggleConfigSelect && (
                          <td style={{ ...tdStyle, width: 32 }}>
                            <button
                              onClick={() => onToggleConfigSelect(cfg.id)}
                              style={{
                                width: 18, height: 18, borderRadius: 4,
                                border: isSelected ? `2px solid ${colors.inkPlum}` : '2px solid #ccc',
                                background: isSelected ? colors.inkPlum : '#fff',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all .15s',
                              }}
                            >
                              {isSelected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                            </button>
                          </td>
                        )}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 14, height: 14, borderRadius: '50%', background: colorDef.h, border: isLight(colorDef.h) ? '1px solid #ddd' : 'none', flexShrink: 0 }} />
                            {(() => {
                              const url = findPackshot(col.id, packshotOpts(cfg))
                              return url ? <img src={url} alt={cfg.colorName} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4, background: '#faf8fc', flexShrink: 0 }} /> : null
                            })()}
                            <select value={cfg.colorName} onChange={(e) => updateConfig(cfg.id, { colorName: e.target.value })} style={{ ...selectStyle, fontWeight: 500, minWidth: 90 }}>
                              {palette.map(c => <option key={c.n} value={c.n}>{c.n}</option>)}
                            </select>
                          </div>
                        </td>
                        {col.certificate && (
                          <td style={tdStyle}>
                            {col.certificate === 'both' ? (
                              <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                                {['igi', 'inhouse'].map(ct => {
                                  const avail = getAvailableCerts(col, cfg.caratIdx, yr)
                                  const isAvail = avail.includes(ct)
                                  const isActive = (cfg.certType || getDefaultCert(col, cfg.caratIdx, yr)) === ct
                                  return (
                                    <button
                                      key={ct}
                                      disabled={!isAvail}
                                      onClick={() => isAvail && updateConfig(cfg.id, { certType: ct, priceOverride: null })}
                                      style={{
                                        padding: '3px 8px', fontSize: 10, fontWeight: 700, border: 'none',
                                        background: isActive ? colors.inkPlum : '#f5f5f5',
                                        color: isActive ? '#fff' : isAvail ? '#888' : '#ccc',
                                        cursor: isAvail ? 'pointer' : 'not-allowed',
                                        fontFamily: 'inherit', transition: 'all .15s',
                                        opacity: isAvail ? 1 : 0.5,
                                      }}
                                    >
                                      {CERT_LABELS[ct]}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#888', padding: '3px 8px', background: '#f5f5f5', borderRadius: 6 }}>
                                {CERT_LABELS[cfg.certType || getDefaultCert(col, cfg.caratIdx, yr)]}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="fill-cell" style={{ ...tdStyle, position: 'relative' }}>
                          {sameForAll ? (
                            <span style={{ color: '#888', fontSize: 11 }}>
                              {(() => {
                                const idx = cfg.caratIdx ?? sharedSettings.caratIdx
                                if (idx == null || idx < 0 || idx >= (col.carats?.length ?? 0)) return '-'
                                return `${col.carats[idx]} ct`
                              })()}
                            </span>
                          ) : (
                            <select value={cfg.caratIdx !== null ? cfg.caratIdx : ''} onChange={(e) => { const val = e.target.value === '' ? null : parseInt(e.target.value); const certType = getCertForCarat(cfg.certType, val); updateConfig(cfg.id, { caratIdx: val, certType, housing: null, housingType: null, multiAttached: null, shape: null, size: null }) }} style={{ ...selectStyle, background: recentlyFilled.has(`${cfg.id}-carat`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                              <option value="">{t('collection.selectPlaceholder')}</option>
                              {caratOptions.map(({ carat, idx }) => <option key={carat} value={idx}>{carat} ct - €{getPrice(col, idx, cfg?.certType, yr)}</option>)}
                            </select>
                          )}
                          {canFillCarat && <div className="fill-handle-dot" onMouseDown={(e) => startDragFill(e, cfgIdx, 'carat', line.colorConfigs, selectedConfigs)} onTouchStart={(e) => startDragFill(e, cfgIdx, 'carat', line.colorConfigs, selectedConfigs)} />}
                        </td>
                        {hasHousing && (
                          <td className="fill-cell" style={{ ...tdStyle, position: 'relative' }}>
                            {sameForAll ? <span style={{ color: '#888', fontSize: 11 }}>{(cfg.housing ?? sharedSettings.housing) || '-'}</span>
                              : cfg.caratIdx !== null ? (
                                <div style={{ background: recentlyFilled.has(`${cfg.id}-housing`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                                  {renderHousingSelector(cfg, (updates) => updateConfig(cfg.id, updates))}
                                </div>
                              )
                              : <span style={{ color: '#ccc', fontSize: 11 }}>{t('collection.selectPlaceholder')}</span>}
                            {canFillHousing && <div className="fill-handle-dot" onMouseDown={(e) => startDragFill(e, cfgIdx, 'housing', line.colorConfigs, selectedConfigs)} onTouchStart={(e) => startDragFill(e, cfgIdx, 'housing', line.colorConfigs, selectedConfigs)} />}
                          </td>
                        )}
                        {showShapeSelector && (
                          <td className="fill-cell" style={{ ...tdStyle, position: 'relative' }}>
                            {sameForAll ? <span style={{ color: '#888', fontSize: 11 }}>{(cfg.shape ?? sharedSettings.shape) || '-'}</span>
                              : cfg.caratIdx !== null && (!hasHousing || isImplicitHousing || !!cfg.housing) ? (
                                <select value={cfg.shape || ''} onChange={(e) => updateConfig(cfg.id, { shape: e.target.value || null })} style={{ ...selectStyle, background: recentlyFilled.has(`${cfg.id}-shape`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                                  <option value="">{t('collection.selectPlaceholder')}</option>
                                  {getShapesForCaratIdx(col, cfg.caratIdx).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : <span style={{ color: '#ccc', fontSize: 11 }}>{t('collection.selectPlaceholder')}</span>}
                            {canFillShape && <div className="fill-handle-dot" onMouseDown={(e) => startDragFill(e, cfgIdx, 'shape', line.colorConfigs, selectedConfigs)} onTouchStart={(e) => startDragFill(e, cfgIdx, 'shape', line.colorConfigs, selectedConfigs)} />}
                          </td>
                        )}
                        {hasSizes && (
                          <td className="fill-cell" style={{ ...tdStyle, position: 'relative' }}>
                            {sameForAll ? <span style={{ color: '#888', fontSize: 11 }}>{(cfg.size ?? sharedSettings.size) || '-'}</span>
                              : cfg.caratIdx !== null && (!hasHousing || isImplicitHousing || !!cfg.housing) && (shapeReqMet || !!cfg.shape) ? (
                                <select value={cfg.size || ''} onChange={(e) => updateConfig(cfg.id, { size: e.target.value || null })} style={{ ...selectStyle, background: recentlyFilled.has(`${cfg.id}-size`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                                  <option value="">{t('collection.selectPlaceholder')}</option>
                                  {sizeOptionsForClosure(col, cfg.closureType).map(s => <option key={s} value={s}>{sizeDisplayLabel(col, s)}</option>)}
                                </select>
                              ) : <span style={{ color: '#ccc', fontSize: 11 }}>{t('collection.selectPlaceholder')}</span>}
                            {canFillSize && <div className="fill-handle-dot" onMouseDown={(e) => startDragFill(e, cfgIdx, 'size', line.colorConfigs, selectedConfigs)} onTouchStart={(e) => startDragFill(e, cfgIdx, 'size', line.colorConfigs, selectedConfigs)} />}
                          </td>
                        )}
                        {hasThickness && (
                          <td className="fill-cell" style={{ ...tdStyle, position: 'relative' }}>
                            {sameForAll ? (
                              <span style={{ color: '#888', fontSize: 11 }}>
                                {cfg.cordType === 'braidedNylon' ? 'Braided Nylon' : (cfg.thickness ?? sharedSettings.thickness) || '-'}
                              </span>
                            ) : hasCordOptions ? (
                              // silkBraided: single dropdown covering Silk Thin, Silk Thick, Braided Nylon
                              <select
                                value={cfg.cordType === 'braidedNylon' ? 'braidedNylon' : (cfg.thickness || '')}
                                onChange={(e) => {
                                  const val = e.target.value
                                  if (val === 'braidedNylon') {
                                    updateConfig(cfg.id, { cordType: 'braidedNylon', thickness: null })
                                  } else {
                                    updateConfig(cfg.id, { cordType: 'silk', thickness: val || null })
                                  }
                                }}
                                style={{ ...selectStyle, background: recentlyFilled.has(`${cfg.id}-thickness`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}
                              >
                                <option value="">-</option>
                                <option value="Thin">Silk Thin</option>
                                <option value="Thick">Silk Thick</option>
                                <option value="braidedNylon">Braided Nylon</option>
                              </select>
                            ) : (
                              // silk-only: Thin / Thick
                              <select
                                value={cfg.thickness || ''}
                                onChange={(e) => updateConfig(cfg.id, { thickness: e.target.value || null })}
                                style={{ ...selectStyle, background: recentlyFilled.has(`${cfg.id}-thickness`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}
                              >
                                <option value="">-</option>
                                {thicknessOpts.map((th) => (
                                  <option key={th} value={th}>{th}</option>
                                ))}
                              </select>
                            )}
                            {canFillThickness && <div className="fill-handle-dot" onMouseDown={(e) => startDragFill(e, cfgIdx, 'thickness', line.colorConfigs, selectedConfigs)} onTouchStart={(e) => startDragFill(e, cfgIdx, 'thickness', line.colorConfigs, selectedConfigs)} />}
                          </td>
                        )}
                        {hasClosure && (
                          <td className="fill-cell" style={{ ...tdStyle, position: 'relative' }}>
                            {sameForAll ? (
                              <span style={{ color: '#888', fontSize: 11 }}>
                                {(() => {
                                  const v = cfg.closureType ?? sharedSettings.closureType
                                  if (v === 'braided') return t('collection.closureBraided')
                                  if (v === 'nonBraided') return t('collection.closureNonBraided')
                                  return '-'
                                })()}
                              </span>
                            ) : (
                              <select
                                value={cfg.closureType || ''}
                                onChange={(e) => updateConfig(cfg.id, { closureType: e.target.value || null })}
                                style={{ ...selectStyle, background: recentlyFilled.has(`${cfg.id}-closureType`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}
                              >
                                <option value="">{t('collection.closurePlaceholder')}</option>
                                <option value="braided">{t('collection.closureBraided')}</option>
                                <option value="nonBraided">{t('collection.closureNonBraided')}</option>
                              </select>
                            )}
                            {canFillClosure && <div className="fill-handle-dot" onMouseDown={(e) => startDragFill(e, cfgIdx, 'closureType', line.colorConfigs, selectedConfigs)} onTouchStart={(e) => startDragFill(e, cfgIdx, 'closureType', line.colorConfigs, selectedConfigs)} />}
                          </td>
                        )}
                        <td className="fill-cell" style={{ ...tdStyle, position: 'relative' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: recentlyFilled.has(`${cfg.id}-qty`) ? '#c8e6c9' : undefined, transition: 'background 0.3s', borderRadius: 4 }}>
                            <button onClick={() => updateConfig(cfg.id, { qty: Math.max(1, cfg.qty - 1) })} style={qtyBtnStyle}>-</button>
                            <input type="number" value={cfg.qty} onChange={(e) => updateConfig(cfg.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })} style={qtyInputStyle} />
                            <button onClick={() => updateConfig(cfg.id, { qty: cfg.qty + 1 })} style={qtyBtnStyle}>+</button>
                          </div>
                          {canFillQty && <div className="fill-handle-dot" onMouseDown={(e) => startDragFill(e, cfgIdx, 'qty', line.colorConfigs, selectedConfigs)} onTouchStart={(e) => startDragFill(e, cfgIdx, 'qty', line.colorConfigs, selectedConfigs)} />}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', minWidth: 80 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 11, color: '#999' }}>€</span>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={cfg.priceOverride != null ? cfg.priceOverride : (catalogPrice || '')}
                                placeholder={catalogPrice > 0 ? String(catalogPrice) : '—'}
                                onChange={(e) => {
                                  const v = e.target.value
                                  updateConfig(cfg.id, { priceOverride: v === '' ? null : Math.max(0, parseFloat(v) || 0) })
                                }}
                                style={{
                                  width: 52, textAlign: 'right', padding: '2px 4px',
                                  border: cfg.priceOverride != null ? `1px solid ${colors.inkPlum}` : '1px solid #e0e0e0',
                                  borderRadius: 4, fontSize: 12, fontWeight: 600,
                                  color: cfg.priceOverride != null ? colors.inkPlum : '#333',
                                  background: cfg.priceOverride != null ? '#faf8fc' : 'transparent',
                                  outline: 'none', fontFamily: 'inherit',
                                }}
                                title="Unit price per piece — edit to override"
                              />
                              {cfg.priceOverride != null && (
                                <button
                                  onClick={() => updateConfig(cfg.id, { priceOverride: null })}
                                  title="Reset to catalog price"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 10, padding: '0 1px', lineHeight: 1 }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = '#e74c3c' }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb' }}
                                >↺</button>
                              )}
                            </div>
                            {cfg.qty > 1 && (
                              <span style={{ fontSize: 10, color: '#888' }}>= {fmt(rowTotal)}</span>
                            )}
                            {retailPrice > 0 && (
                              <span style={{ fontSize: 9, color: '#aaa', fontStyle: 'italic' }}>B2C: €{retailPrice}</span>
                            )}
                          </div>
                        </td>
                        <td style={{
                          ...tdStyle,
                          textAlign: 'center',
                          position: 'sticky',
                          right: 0,
                          background: rowBg,
                          // Subtle shadow on the left edge tells the eye
                          // there's content scrolling underneath.
                          boxShadow: '-4px 0 8px -4px rgba(0,0,0,0.08)',
                          width: 54,
                          minWidth: 54,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                            <button onClick={() => duplicateConfig(cfg.id)} title="Duplicate row" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, padding: '4px 6px', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = colors.inkPlum }} onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc' }}>+</button>
                            {/* Bigger, plum-tinted X — mum couldn't spot the
                               old grey "x". This one is large, coloured, and
                               keeps the same hover-red treatment. */}
                            <button onClick={() => removeConfig(cfg.id)} title="Remove row" style={{ background: 'none', border: '1px solid #e8d8e8', color: '#5d3a5e', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '2px 8px', borderRadius: 4, transition: 'all .15s', lineHeight: 1 }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = '#e74c3c'; e.currentTarget.style.borderColor = '#e74c3c' }} onMouseLeave={(e) => { e.currentTarget.style.color = '#5d3a5e'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#e8d8e8' }}>×</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ─── Mobile Card Layout ─── */}
          {line.colorConfigs.length > 0 && mobile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {line.colorConfigs.map((cfg, cfgIdx) => {
                const colorDef = palette.find(p => p.n === cfg.colorName) || { h: '#ccc' }
                const effectiveCaratIdx = cfg.caratIdx ?? (sameForAll ? sharedSettings.caratIdx : null)
                const catalogPriceMobile = effectiveCaratIdx !== null ? getPrice(col, effectiveCaratIdx, cfg.certType, yr) : 0
                const retailPriceMobile = effectiveCaratIdx !== null ? getRetail(col, effectiveCaratIdx, cfg.certType, yr) : 0
                const unitPriceMobile = cfg.priceOverride != null ? cfg.priceOverride : catalogPriceMobile
                const price = unitPriceMobile
                const rowTotal = unitPriceMobile * cfg.qty
                const isSelected = selectedConfigs.has(cfg.id)
                const isRecentlyDuplicated = recentlyDuplicated.has(cfg.id)
                const hasRowsBelow = cfgIdx < line.colorConfigs.length - 1
                const canFillCarat = cfg.caratIdx !== null && hasRowsBelow && !sameForAll
                const canFillHousing = cfg.housing !== null && hasRowsBelow && !sameForAll
                const canFillShape = cfg.shape !== null && hasRowsBelow && !sameForAll
                const canFillSize = cfg.size !== null && hasRowsBelow && !sameForAll
                const canFillQty = hasRowsBelow && !sameForAll

                return (
                  <div key={cfg.id} style={{
                    border: isRecentlyDuplicated ? '2px solid #f48fb1' : isSelected ? `2px solid ${colors.inkPlum}` : '1px solid #eee', 
                    borderRadius: 10, padding: 12,
                    background: isRecentlyDuplicated ? '#fce4ec' : isSelected ? '#f3f0f5' : '#fafafa',
                    transition: 'all 0.5s ease-out',
                    animation: isRecentlyDuplicated ? 'duplicateHighlight 15s ease-out forwards' : 'none',
                  }}>
                    {/* Card header: checkbox + color + total + actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {onToggleConfigSelect && (
                          <button
                            onClick={() => onToggleConfigSelect(cfg.id)}
                            style={{
                              width: 22, height: 22, borderRadius: 4,
                              border: isSelected ? `2px solid ${colors.inkPlum}` : '2px solid #ccc',
                              background: isSelected ? colors.inkPlum : '#fff',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, transition: 'all .15s',
                            }}
                          >
                            {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                          </button>
                        )}
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: colorDef.h, border: isLight(colorDef.h) ? '1px solid #ddd' : 'none', flexShrink: 0 }} />
                        {(() => {
                          const url = findPackshot(col.id, packshotOpts(cfg))
                          return url ? <img src={url} alt={cfg.colorName} style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, background: '#faf8fc', flexShrink: 0 }} /> : null
                        })()}
                        <select value={cfg.colorName} onChange={(e) => updateConfig(cfg.id, { colorName: e.target.value })} style={{ ...selectStyle, ...mobileSelectOverride, fontWeight: 600 }}>
                          {palette.map(c => <option key={c.n} value={c.n}>{c.n}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 11, color: '#999' }}>€</span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={cfg.priceOverride != null ? cfg.priceOverride : (catalogPriceMobile || '')}
                              placeholder={catalogPriceMobile > 0 ? String(catalogPriceMobile) : '—'}
                              onChange={(e) => {
                                const v = e.target.value
                                updateConfig(cfg.id, { priceOverride: v === '' ? null : Math.max(0, parseFloat(v) || 0) })
                              }}
                              style={{
                                width: 52, textAlign: 'right', padding: '2px 4px',
                                border: cfg.priceOverride != null ? `1px solid ${colors.inkPlum}` : '1px solid #e0e0e0',
                                borderRadius: 4, fontSize: 13, fontWeight: 700,
                                color: cfg.priceOverride != null ? colors.inkPlum : '#333',
                                background: cfg.priceOverride != null ? '#faf8fc' : 'transparent',
                                outline: 'none', fontFamily: 'inherit',
                              }}
                              title="Unit price per piece — edit to override"
                            />
                            {cfg.priceOverride != null && (
                              <button
                                onClick={() => updateConfig(cfg.id, { priceOverride: null })}
                                title="Reset to catalog price"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 11, padding: '0 2px' }}
                              >↺</button>
                            )}
                          </div>
                          {cfg.qty > 1 && rowTotal > 0 && (
                            <span style={{ fontSize: 11, color: '#999' }}>= {fmt(rowTotal)}</span>
                          )}
                          {retailPriceMobile > 0 && (
                            <span style={{ fontSize: 9, color: '#aaa', fontStyle: 'italic' }}>B2C: €{retailPriceMobile}</span>
                          )}
                        </div>
                        <button onClick={() => duplicateConfig(cfg.id)} aria-label="Duplicate row" style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', color: '#999', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
                        <button onClick={() => removeConfig(cfg.id)} aria-label="Remove row" style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#e74c3c', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>x</button>
                      </div>
                    </div>

                    {/* Card fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Certificate */}
                      {col.certificate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('cert.label')}</span>
                          {col.certificate === 'both' ? (
                            <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                              {['igi', 'inhouse'].map(ct => {
                                const avail = getAvailableCerts(col, cfg.caratIdx, yr)
                                const isAvail = avail.includes(ct)
                                const isActive = (cfg.certType || getDefaultCert(col, cfg.caratIdx, yr)) === ct
                                return (
                                  <button
                                    key={ct}
                                    disabled={!isAvail}
                                    onClick={() => isAvail && updateConfig(cfg.id, { certType: ct, priceOverride: null })}
                                    style={{
                                      padding: '6px 14px', fontSize: 12, fontWeight: 700, border: 'none',
                                      background: isActive ? colors.inkPlum : '#f5f5f5',
                                      color: isActive ? '#fff' : isAvail ? '#888' : '#ccc',
                                      cursor: isAvail ? 'pointer' : 'not-allowed',
                                      fontFamily: 'inherit', transition: 'all .15s',
                                      opacity: isAvail ? 1 : 0.5,
                                    }}
                                  >
                                    {CERT_LABELS[ct]}
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#888', padding: '4px 10px', background: '#f5f5f5', borderRadius: 8 }}>
                              {CERT_LABELS[cfg.certType || getDefaultCert(col, cfg.caratIdx, yr)]}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Carat */}
                      {!sameForAll && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.carat')}</span>
                          <select value={cfg.caratIdx !== null ? cfg.caratIdx : ''} onChange={(e) => { const val = e.target.value === '' ? null : parseInt(e.target.value); const certType = getCertForCarat(cfg.certType, val); updateConfig(cfg.id, { caratIdx: val, certType, housing: null, housingType: null, multiAttached: null, shape: null, size: null }) }} style={{ ...selectStyle, ...mobileSelectOverride, flex: 1, background: recentlyFilled.has(`${cfg.id}-carat`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                            <option value="">{t('collection.selectPlaceholder')}</option>
                            {caratOptions.map(({ carat, idx }) => <option key={carat} value={idx}>{carat} ct - €{getPrice(col, idx, cfg?.certType, yr)}</option>)}
                          </select>
                        </div>
                      )}
                      {/* Housing */}
                      {hasHousing && !sameForAll && cfg.caratIdx !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.housing')}</span>
                          <div style={{ flex: 1, background: recentlyFilled.has(`${cfg.id}-housing`) ? '#c8e6c9' : undefined, transition: 'background 0.3s', borderRadius: 4 }}>{renderHousingSelector(cfg, (updates) => updateConfig(cfg.id, updates))}</div>
                        </div>
                      )}
                      {/* Shape */}
                      {showShapeSelector && !sameForAll && cfg.caratIdx !== null && (!hasHousing || isImplicitHousing || !!cfg.housing) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.shape')}</span>
                          <select value={cfg.shape || ''} onChange={(e) => updateConfig(cfg.id, { shape: e.target.value || null })} style={{ ...selectStyle, ...mobileSelectOverride, flex: 1, background: recentlyFilled.has(`${cfg.id}-shape`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                            <option value="">{t('collection.selectPlaceholder')}</option>
                            {getShapesForCaratIdx(col, cfg.caratIdx).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                      {/* Size */}
                      {hasSizes && !sameForAll && cfg.caratIdx !== null && (!hasHousing || isImplicitHousing || !!cfg.housing) && (shapeReqMet || !!cfg.shape) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.size')}</span>
                          <select value={cfg.size || ''} onChange={(e) => updateConfig(cfg.id, { size: e.target.value || null })} style={{ ...selectStyle, ...mobileSelectOverride, flex: 1, background: recentlyFilled.has(`${cfg.id}-size`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                            <option value="">{t('collection.selectPlaceholder')}</option>
                            {sizeOptionsForClosure(col, cfg.closureType).map(s => <option key={s} value={s}>{sizeDisplayLabel(col, s)}</option>)}
                          </select>
                        </div>
                      )}
                      {/* Material / Thickness (silk + silkBraided) — previously
                          only available in the desktop table, leaving silk
                          collections unconfigurable on touch. */}
                      {hasThickness && !sameForAll && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{hasCordOptions ? 'Material' : 'Thickness'}</span>
                          {hasCordOptions ? (
                            <select
                              value={cfg.cordType === 'braidedNylon' ? 'braidedNylon' : (cfg.thickness || '')}
                              onChange={(e) => {
                                const val = e.target.value
                                if (val === 'braidedNylon') {
                                  updateConfig(cfg.id, { cordType: 'braidedNylon', thickness: null })
                                } else {
                                  updateConfig(cfg.id, { cordType: 'silk', thickness: val || null })
                                }
                              }}
                              style={{ ...selectStyle, ...mobileSelectOverride, flex: 1, background: recentlyFilled.has(`${cfg.id}-thickness`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}
                            >
                              <option value="">-</option>
                              <option value="Thin">Silk Thin</option>
                              <option value="Thick">Silk Thick</option>
                              <option value="braidedNylon">Braided Nylon</option>
                            </select>
                          ) : (
                            <select
                              value={cfg.thickness || ''}
                              onChange={(e) => updateConfig(cfg.id, { thickness: e.target.value || null })}
                              style={{ ...selectStyle, ...mobileSelectOverride, flex: 1, background: recentlyFilled.has(`${cfg.id}-thickness`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}
                            >
                              <option value="">-</option>
                              {thicknessOpts.map((th) => (
                                <option key={th} value={th}>{th}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                      {/* Closure (CUTY/CUBIX) */}
                      {hasClosure && !sameForAll && cfg.caratIdx !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.closure')}</span>
                          <select
                            value={cfg.closureType || ''}
                            onChange={(e) => updateConfig(cfg.id, { closureType: e.target.value || null })}
                            style={{ ...selectStyle, ...mobileSelectOverride, flex: 1, background: recentlyFilled.has(`${cfg.id}-closureType`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}
                          >
                            <option value="">{t('collection.closurePlaceholder')}</option>
                            <option value="braided">{t('collection.closureBraided')}</option>
                            <option value="nonBraided">{t('collection.closureNonBraided')}</option>
                          </select>
                        </div>
                      )}
                      {/* Qty */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.qty')}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: recentlyFilled.has(`${cfg.id}-qty`) ? '#c8e6c9' : undefined, transition: 'background 0.3s', borderRadius: 4 }}>
                          <button onClick={() => updateConfig(cfg.id, { qty: Math.max(1, cfg.qty - 1) })} style={mobileQtyBtnStyle}>-</button>
                          <input type="number" value={cfg.qty} onChange={(e) => updateConfig(cfg.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })} style={{ ...qtyInputStyle, width: 48, height: 44, fontSize: 15 }} />
                          <button onClick={() => updateConfig(cfg.id, { qty: cfg.qty + 1 })} style={mobileQtyBtnStyle}>+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {line.colorConfigs.length === 0 && (
            <div style={{ fontSize: 12, color: '#bbb', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
              {t('collection.clickColorsAboveToStartBuilding')}
            </div>
          )}

          {/* Section subtotal */}
          {lineTotal > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0 0', borderTop: '1px solid #f0f0f0', marginTop: 10,
            }}>
              <span style={{ fontSize: 12, color: '#888' }}>
                {t('collection.completeCount').replace('{complete}', completeCount).replace('{total}', line.colorConfigs.length).replace('{qty}', totalQty)}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum }}>{fmt(lineTotal)}</span>
            </div>
          )}
        </div>
      )}
      </div>
    </>
  )
}

// ─── Table styles ───
const selectStyle = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid #e0e0e0',
  fontSize: 11, fontFamily: 'inherit', outline: 'none', color: '#333',
  background: '#fff', cursor: 'pointer', minWidth: 60,
}

const thStyle = {
  padding: '8px 6px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: '#999', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
}

// Sticky right column — pairs with the rowBg-aware sticky <td>.
// The header sits behind the data cells visually (lower z-index) and
// uses the same plum shadow on the left edge.
const stickyActionHeaderStyle = {
  ...thStyle,
  width: 54,
  minWidth: 54,
  position: 'sticky',
  right: 0,
  background: '#fff',
  zIndex: 2,
  borderBottom: '2px solid #eee',
  boxShadow: '-4px 0 8px -4px rgba(0,0,0,0.08)',
}

const tdStyle = {
  padding: '8px 6px', verticalAlign: 'middle',
}

const qtyBtnStyle = {
  width: 24, height: 24, borderRadius: 4, border: '1px solid #e0e0e0',
  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
  fontFamily: 'inherit',
}

const qtyInputStyle = {
  width: 36, height: 24, border: '1px solid #e0e0e0', borderRadius: 4,
  textAlign: 'center', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
  outline: 'none', color: colors.inkPlum,
}

const mobileSelectOverride = {
  padding: '10px 10px', fontSize: 14, minHeight: 44,
}

const mobileQtyBtnStyle = {
  width: 44, height: 44, borderRadius: 6, border: '1px solid #e0e0e0',
  background: '#fff', cursor: 'pointer', fontSize: 18, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
  fontFamily: 'inherit',
}

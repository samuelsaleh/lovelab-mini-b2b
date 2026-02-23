'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { CORD_COLORS, HOUSING } from '@/lib/catalog'
import { fmt, isLight } from '@/lib/utils'
import { colors } from '@/lib/styles'
import { mkColorConfig } from './BuilderPage'
import { useI18n } from '@/lib/i18n'
import { useIsMobile } from '@/lib/useIsMobile'

const QTY_PRESETS = [1, 3, 5, 10]

// CSS for duplicate highlight animation and fill-down drag handle
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
  opacity: 0;
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

export default function CollectionConfig({ line, col, onChange, onRemove, selectedConfigs = new Set(), onToggleConfigSelect, onToggleLineSelect, recentlyDuplicated = new Set() }) {
  const { t } = useI18n()
  const mobile = useIsMobile()
  const [expanded, setExpanded] = useState(true)
  const [sameForAll, setSameForAll] = useState(false)
  const [sharedSettings, setSharedSettings] = useState({
    caratIdx: null, housing: null, housingType: null,
    multiAttached: null, shape: null, size: null, qty: null,
  })
  const [showDuplicatePanel, setShowDuplicatePanel] = useState(false)
  const [duplicateSettings, setDuplicateSettings] = useState({
    carat: { keepSame: true, value: null },
    housing: { keepSame: true, value: null },
    housingType: { keepSame: true, value: null },
    size: { keepSame: true, value: null },
    shape: { keepSame: true, value: null },
    qty: { keepSame: true, value: 1 },
  })

  const palette = CORD_COLORS[col.cord] || CORD_COLORS.nylon
  const set = (patch) => onChange(line.uid, patch)

  // Defensive guard: guarantee unique ids for React keys and row actions.
  useEffect(() => {
    const deduped = ensureUniqueConfigIds(line.colorConfigs || [])
    if (deduped) {
      set({ colorConfigs: deduped })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.colorConfigs])

  // Color counts
  const colorCounts = {}
  line.colorConfigs.forEach(c => {
    colorCounts[c.colorName] = (colorCounts[c.colorName] || 0) + 1
  })

  // Completion check
  const isConfigComplete = (cfg) => {
    if (cfg.caratIdx === null) return false
    if (col.housing && !cfg.housing) return false
    if (col.shapes && col.shapes.length > 0 && !cfg.shape) return false
    if (col.sizes && col.sizes.length > 0 && !cfg.size) return false
    return true
  }

  const completeCount = line.colorConfigs.filter(c => isConfigComplete(c)).length
  const totalQty = line.colorConfigs.reduce((sum, c) => sum + c.qty, 0)
  const lineTotal = line.colorConfigs.reduce((sum, cfg) => {
    const effectiveCaratIdx = cfg.caratIdx ?? (sameForAll ? sharedSettings.caratIdx : null)
    const price = effectiveCaratIdx !== null ? col.prices[effectiveCaratIdx] : 0
    return sum + (cfg.qty * price)
  }, 0)

  // Selection helpers
  const selectedInThisLine = line.colorConfigs.filter(c => selectedConfigs.has(c.id))
  const selectedCount = selectedInThisLine.length
  const allSelected = line.colorConfigs.length > 0 && selectedCount === line.colorConfigs.length
  const someSelected = selectedCount > 0 && selectedCount < line.colorConfigs.length

  // Add a color
  const addColor = (colorName) => {
    const newCfg = sameForAll
      ? { ...mkColorConfig(colorName, 1), ...sharedSettings }
      : mkColorConfig(colorName, 1)
    set({ colorConfigs: [...line.colorConfigs, newCfg] })
  }

  // Remove a color config
  const removeConfig = (cfgId) => {
    set({ colorConfigs: line.colorConfigs.filter(c => c.id !== cfgId) })
  }

  // Update a color config
  const updateConfig = (cfgId, updates) => {
    set({
      colorConfigs: line.colorConfigs.map(c =>
        c.id === cfgId ? { ...c, ...updates } : c
      ),
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
      // Turning OFF: copy sharedSettings into each config so values persist
      set({
        colorConfigs: line.colorConfigs.map(cfg => ({
          ...cfg,
          caratIdx: cfg.caratIdx ?? sharedSettings.caratIdx,
          housing: cfg.housing ?? sharedSettings.housing,
          housingType: cfg.housingType ?? sharedSettings.housingType,
          multiAttached: cfg.multiAttached ?? sharedSettings.multiAttached,
          shape: cfg.shape ?? sharedSettings.shape,
          size: cfg.size ?? sharedSettings.size,
          qty: sharedSettings.qty ?? cfg.qty,
        })),
      })
    }
    
    setSameForAll(next)
    
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
          qty: 1,
        }
        setSharedSettings(s)
      }
    }
  }

  // Update shared settings and propagate to all configs
  const updateShared = (updates) => {
    const next = { ...sharedSettings, ...updates }
    setSharedSettings(next)
    if (line.colorConfigs.length > 0) {
      set({
        colorConfigs: line.colorConfigs.map(cfg => ({ ...cfg, ...updates })),
      })
    }
  }

  // State for tracking recently filled cells (for flash animation)
  const [recentlyFilled, setRecentlyFilled] = useState(new Set())

  // Drag-fill state: { sourceIdx, column, targetIdx } or null
  const [dragFill, setDragFill] = useState(null)
  const dragFillRef = useRef(null)

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
      document.querySelectorAll('tr[data-row-idx]')
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
          switch (column) {
            case 'carat': return { ...cfg, caratIdx: source.caratIdx }
            case 'housing': return { ...cfg, housing: source.housing, housingType: source.housingType, multiAttached: source.multiAttached }
            case 'shape': return { ...cfg, shape: source.shape }
            case 'size': return { ...cfg, size: source.size }
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
      const qtyVal = duplicateSettings.qty.keepSame ? cfg.qty : duplicateSettings.qty.value
      return {
        ...cfg,
        id: createConfigId(),
        caratIdx: duplicateSettings.carat.keepSame ? cfg.caratIdx : duplicateSettings.carat.value,
        housing: duplicateSettings.housing.keepSame ? cfg.housing : duplicateSettings.housing.value,
        housingType: duplicateSettings.housingType.keepSame ? cfg.housingType : duplicateSettings.housingType.value,
        size: duplicateSettings.size.keepSame ? cfg.size : duplicateSettings.size.value,
        shape: duplicateSettings.shape.keepSame ? cfg.shape : duplicateSettings.shape.value,
        qty: Math.max(1, typeof qtyVal === 'number' && !Number.isNaN(qtyVal) ? qtyVal : 1),
      }
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
  const hasShapes = col.shapes && col.shapes.length > 0
  const hasSizes = col.sizes && col.sizes.length > 0

  const renderHousingSelector = (cfg, patchFn) => {
    const selectedCarat = cfg.caratIdx !== null ? col.carats[cfg.caratIdx] : null
    const shapyShineBezelOnly = col.housing === 'shapyShine' && selectedCarat === '0.10'

    if (col.housing === 'standard') {
      return (
        <select
          value={cfg.housing || ''}
          onChange={(e) => patchFn({ housing: e.target.value || null })}
          style={selectStyle}
        >
          <option value="">{t('collection.housingPlaceholder')}</option>
          {HOUSING.standard.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      )
    }
    if (col.housing === 'goldMetal') {
      return (
        <select
          value={cfg.housing || ''}
          onChange={(e) => patchFn({ housing: e.target.value || null })}
          style={selectStyle}
        >
          <option value="">{t('collection.housingPlaceholder')}</option>
          {HOUSING.goldMetal.map(h => <option key={h} value={h}>{h}</option>)}
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
            style={{ ...selectStyle, minWidth: 80 }}
          >
            <option value="">{t('collection.typePlaceholder')}</option>
            <option value="attached">{t('collection.attached')}</option>
            <option value="notAttached">{t('collection.notAttached')}</option>
          </select>
          {cfg.multiAttached !== null && (
            <select
              value={cfg.housing || ''}
              onChange={(e) => patchFn({ housing: e.target.value || null })}
              style={selectStyle}
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
            style={{ ...selectStyle, minWidth: 70 }}
          >
            <option value="">{t('collection.typePlaceholder')}</option>
            <option value="bezel">{t('collection.bezel')}</option>
            <option value="prong">{t('collection.prong')}</option>
          </select>
          {cfg.housingType && (
            <select
              value={cfg.housing || ''}
              onChange={(e) => patchFn({ housing: e.target.value || null })}
              style={selectStyle}
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
            style={selectStyle}
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
            style={{ ...selectStyle, minWidth: 70 }}
          >
            <option value="">{t('collection.typePlaceholder')}</option>
            <option value="bezel">{t('collection.bezel')}</option>
            <option value="prong">{t('collection.prong')}</option>
          </select>
          {cfg.housingType && (
            <select
              value={cfg.housing || ''}
              onChange={(e) => patchFn({ housing: e.target.value || null })}
              style={selectStyle}
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
    return null
  }

  return (
    <>
      <style>{duplicateHighlightStyles}</style>
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            onClick={() => setExpanded(!expanded)}
            style={{
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              color: line.colorConfigs.length > 0 ? colors.inkPlum : '#333',
            }}>
            {col.label}
          </span>
          <span style={{ fontSize: 12, color: '#999' }}>
            €{col.prices[0]}-€{col.prices[col.prices.length - 1]}
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
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              fontSize: 10, color: '#ccc',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform .2s', display: 'inline-block',
            }}
          >▼</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '14px 16px' }}>
          {/* ─── Color Palette ─── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              {t('collection.clickColorsToAdd')}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${mobile ? 8 : 10}, 1fr)`,
              gap: mobile ? 8 : 6,
            }}>
              {palette.map(c => {
                const count = colorCounts[c.n] || 0
                const btnSize = mobile ? 38 : 30
                return (
                  <div key={c.n} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                    <button
                      title={c.n}
                      onClick={() => addColor(c.n)}
                      style={{
                        width: btnSize, height: btnSize, borderRadius: '50%', background: c.h, padding: 0,
                        border: count > 0 ? `2.5px solid ${colors.inkPlum}` : isLight(c.h) ? '1px solid #ddd' : '1px solid transparent',
                        cursor: 'pointer', transition: 'transform .1s',
                        transform: count > 0 ? 'scale(1.08)' : 'scale(1)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    />
                    {count > 0 && (
                      <span style={{
                        position: 'absolute', top: -3, right: -3,
                        width: mobile ? 16 : 14, height: mobile ? 16 : 14, borderRadius: '50%',
                        background: colors.inkPlum, color: '#fff',
                        fontSize: mobile ? 9 : 8, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {count}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── Same for all toggle ─── */}
          {line.colorConfigs.length >= 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 8, background: '#f8f8f8',
              marginBottom: 12,
            }}>
              <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>{t('collection.sameSettingsForAllColors')}</span>
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
                  alignItems: 'center', justifyContent: 'space-between',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>
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
                    { field: 'housing', label: t('quote.housing'), show: hasHousing },
                    { field: 'size', label: t('quote.size'), show: hasSizes },
                    { field: 'shape', label: t('quote.shape'), show: hasShapes },
                    { field: 'qty', label: t('quote.qty'), show: true },
                  ].filter(r => r.show).map(({ field, label }) => (
                    <div key={field} style={{
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
                            {col.carats.map((ct, ci) => (
                              <option key={ct} value={ci}>{ct} ct - €{col.prices[ci]}</option>
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
                        {!duplicateSettings[field].keepSame && field === 'housing' && col.housing === 'goldMetal' && (
                          <select
                            value={duplicateSettings.housing.value || ''}
                            onChange={(e) => updateDuplicateSetting('housing', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.housingPlaceholder')}</option>
                            {HOUSING.goldMetal.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'size' && (
                          <select
                            value={duplicateSettings.size.value || ''}
                            onChange={(e) => updateDuplicateSetting('size', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.sizePlaceholder')}</option>
                            {col.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                        {!duplicateSettings[field].keepSame && field === 'shape' && (
                          <select
                            value={duplicateSettings.shape.value || ''}
                            onChange={(e) => updateDuplicateSetting('shape', { value: e.target.value || null })}
                            style={{ ...selectStyle, ...(mobile ? mobileSelectOverride : {}) }}
                          >
                            <option value="">{t('collection.shapePlaceholder')}</option>
                            {col.shapes.map(s => <option key={s} value={s}>{s}</option>)}
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
                    updateShared({ caratIdx: val, housing: null, housingType: null, multiAttached: null, shape: null, size: null })
                  }}
                  style={selectStyle}
                >
                  <option value="">{t('collection.caratPlaceholder')}</option>
                  {col.carats.map((ct, ci) => (
                    <option key={ct} value={ci}>{ct} ct - €{col.prices[ci]}</option>
                  ))}
                </select>

                {/* Housing */}
                {hasHousing && sharedSettings.caratIdx !== null && (
                  renderHousingSelector(sharedSettings, updateShared)
                )}

                {/* Shape */}
                {hasShapes && sharedSettings.caratIdx !== null && (!hasHousing || !!sharedSettings.housing) && (
                  <select
                    value={sharedSettings.shape || ''}
                    onChange={(e) => updateShared({ shape: e.target.value || null })}
                    style={selectStyle}
                  >
                    <option value="">{t('collection.shapePlaceholder')}</option>
                    {col.shapes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}

                {/* Size */}
                {hasSizes && sharedSettings.caratIdx !== null && (!hasHousing || !!sharedSettings.housing) && (!hasShapes || !!sharedSettings.shape) && (
                  <select
                    value={sharedSettings.size || ''}
                    onChange={(e) => updateShared({ size: e.target.value || null })}
                    style={selectStyle}
                  >
                    <option value="">{t('collection.sizePlaceholder')}</option>
                    {col.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}

                {/* Qty */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => updateShared({ qty: Math.max(1, (sharedSettings.qty ?? 1) - 1) })} style={qtyBtnStyle}>-</button>
                  <input
                    type="number"
                    value={sharedSettings.qty ?? 1}
                    onChange={(e) => updateShared({ qty: Math.max(1, parseInt(e.target.value) || 1) })}
                    style={qtyInputStyle}
                  />
                  <button onClick={() => updateShared({ qty: (sharedSettings.qty ?? 1) + 1 })} style={qtyBtnStyle}>+</button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Config Table (desktop) / Card list (mobile) ─── */}
          {line.colorConfigs.length > 0 && !mobile && (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eee' }}>
                    {onToggleConfigSelect && <th style={{ ...thStyle, width: 32 }}></th>}
                    <th style={thStyle}>{t('quote.color')}</th>
                    <th style={thStyle}>{t('quote.carat')}</th>
                    {hasHousing && <th style={thStyle}>{t('quote.housing')}</th>}
                    {hasShapes && <th style={thStyle}>{t('quote.shape')}</th>}
                    {hasSizes && <th style={thStyle}>{t('quote.size')}</th>}
                    <th style={thStyle}>{t('quote.qty')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('quote.total')}</th>
                    <th style={{ ...thStyle, width: 54 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {line.colorConfigs.map((cfg, cfgIdx) => {
                    const colorDef = palette.find(p => p.n === cfg.colorName) || { h: '#ccc' }
                    const effectiveCaratIdx = cfg.caratIdx ?? (sameForAll ? sharedSettings.caratIdx : null)
                    const price = effectiveCaratIdx !== null ? col.prices[effectiveCaratIdx] : 0
                    const rowTotal = price * cfg.qty
                    const isSelected = selectedConfigs.has(cfg.id)
                    const isRecentlyDuplicated = recentlyDuplicated.has(cfg.id)
                    const hasRowsBelow = cfgIdx < line.colorConfigs.length - 1
                    const canFillCarat = cfg.caratIdx !== null && hasRowsBelow && !sameForAll
                    const canFillHousing = cfg.housing !== null && hasRowsBelow && !sameForAll
                    const canFillShape = cfg.shape !== null && hasRowsBelow && !sameForAll
                    const canFillSize = cfg.size !== null && hasRowsBelow && !sameForAll
                    const canFillQty = hasRowsBelow && !sameForAll

                    const isDragTarget = dragFill && cfgIdx > dragFill.sourceIdx && cfgIdx <= dragFill.targetIdx

                    return (
                      <tr key={cfg.id} data-row-idx={cfgIdx} style={{ 
                        borderBottom: '1px solid #f5f5f5', 
                        background: isRecentlyDuplicated ? '#fce4ec' : isDragTarget ? 'rgba(93, 58, 94, 0.07)' : isSelected ? '#f3f0f5' : 'transparent', 
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
                            <select value={cfg.colorName} onChange={(e) => updateConfig(cfg.id, { colorName: e.target.value })} style={{ ...selectStyle, fontWeight: 500, minWidth: 90 }}>
                              {palette.map(c => <option key={c.n} value={c.n}>{c.n}</option>)}
                            </select>
                          </div>
                        </td>
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
                            <select value={cfg.caratIdx !== null ? cfg.caratIdx : ''} onChange={(e) => { const val = e.target.value === '' ? null : parseInt(e.target.value); updateConfig(cfg.id, { caratIdx: val, housing: null, housingType: null, multiAttached: null, shape: null, size: null }) }} style={{ ...selectStyle, background: recentlyFilled.has(`${cfg.id}-carat`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                              <option value="">{t('collection.selectPlaceholder')}</option>
                              {col.carats.map((ct, ci) => <option key={ct} value={ci}>{ct} ct - €{col.prices[ci]}</option>)}
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
                        {hasShapes && (
                          <td className="fill-cell" style={{ ...tdStyle, position: 'relative' }}>
                            {sameForAll ? <span style={{ color: '#888', fontSize: 11 }}>{(cfg.shape ?? sharedSettings.shape) || '-'}</span>
                              : cfg.caratIdx !== null && (!hasHousing || !!cfg.housing) ? (
                                <select value={cfg.shape || ''} onChange={(e) => updateConfig(cfg.id, { shape: e.target.value || null })} style={{ ...selectStyle, background: recentlyFilled.has(`${cfg.id}-shape`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                                  <option value="">{t('collection.selectPlaceholder')}</option>
                                  {col.shapes.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : <span style={{ color: '#ccc', fontSize: 11 }}>{t('collection.selectPlaceholder')}</span>}
                            {canFillShape && <div className="fill-handle-dot" onMouseDown={(e) => startDragFill(e, cfgIdx, 'shape', line.colorConfigs, selectedConfigs)} onTouchStart={(e) => startDragFill(e, cfgIdx, 'shape', line.colorConfigs, selectedConfigs)} />}
                          </td>
                        )}
                        {hasSizes && (
                          <td className="fill-cell" style={{ ...tdStyle, position: 'relative' }}>
                            {sameForAll ? <span style={{ color: '#888', fontSize: 11 }}>{(cfg.size ?? sharedSettings.size) || '-'}</span>
                              : cfg.caratIdx !== null && (!hasHousing || !!cfg.housing) && (!hasShapes || !!cfg.shape) ? (
                                <select value={cfg.size || ''} onChange={(e) => updateConfig(cfg.id, { size: e.target.value || null })} style={{ ...selectStyle, background: recentlyFilled.has(`${cfg.id}-size`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                                  <option value="">{t('collection.selectPlaceholder')}</option>
                                  {col.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : <span style={{ color: '#ccc', fontSize: 11 }}>{t('collection.selectPlaceholder')}</span>}
                            {canFillSize && <div className="fill-handle-dot" onMouseDown={(e) => startDragFill(e, cfgIdx, 'size', line.colorConfigs, selectedConfigs)} onTouchStart={(e) => startDragFill(e, cfgIdx, 'size', line.colorConfigs, selectedConfigs)} />}
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
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: rowTotal > 0 ? '#333' : '#ccc' }}>{rowTotal > 0 ? fmt(rowTotal) : '-'}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                            <button onClick={() => duplicateConfig(cfg.id)} title="Duplicate row" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 12, padding: '2px 4px', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = colors.inkPlum }} onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc' }}>+</button>
                            <button onClick={() => removeConfig(cfg.id)} title="Remove row" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, padding: '2px 4px', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#e74c3c' }} onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc' }}>x</button>
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
                const price = effectiveCaratIdx !== null ? col.prices[effectiveCaratIdx] : 0
                const rowTotal = price * cfg.qty
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
                        <select value={cfg.colorName} onChange={(e) => updateConfig(cfg.id, { colorName: e.target.value })} style={{ ...selectStyle, ...mobileSelectOverride, fontWeight: 600 }}>
                          {palette.map(c => <option key={c.n} value={c.n}>{c.n}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: rowTotal > 0 ? colors.inkPlum : '#ccc' }}>{rowTotal > 0 ? fmt(rowTotal) : '-'}</span>
                        <button onClick={() => duplicateConfig(cfg.id)} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', color: '#999', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        <button onClick={() => removeConfig(cfg.id)} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#e74c3c', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
                      </div>
                    </div>

                    {/* Card fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Carat */}
                      {!sameForAll && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.carat')}</span>
                          <select value={cfg.caratIdx !== null ? cfg.caratIdx : ''} onChange={(e) => { const val = e.target.value === '' ? null : parseInt(e.target.value); updateConfig(cfg.id, { caratIdx: val, housing: null, housingType: null, multiAttached: null, shape: null, size: null }) }} style={{ ...selectStyle, ...mobileSelectOverride, flex: 1, background: recentlyFilled.has(`${cfg.id}-carat`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                            <option value="">{t('collection.selectPlaceholder')}</option>
                            {col.carats.map((ct, ci) => <option key={ct} value={ci}>{ct} ct - €{col.prices[ci]}</option>)}
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
                      {hasShapes && !sameForAll && cfg.caratIdx !== null && (!hasHousing || !!cfg.housing) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.shape')}</span>
                          <select value={cfg.shape || ''} onChange={(e) => updateConfig(cfg.id, { shape: e.target.value || null })} style={{ ...selectStyle, ...mobileSelectOverride, flex: 1, background: recentlyFilled.has(`${cfg.id}-shape`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                            <option value="">{t('collection.selectPlaceholder')}</option>
                            {col.shapes.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                      {/* Size */}
                      {hasSizes && !sameForAll && cfg.caratIdx !== null && (!hasHousing || !!cfg.housing) && (!hasShapes || !!cfg.shape) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.size')}</span>
                          <select value={cfg.size || ''} onChange={(e) => updateConfig(cfg.id, { size: e.target.value || null })} style={{ ...selectStyle, ...mobileSelectOverride, flex: 1, background: recentlyFilled.has(`${cfg.id}-size`) ? '#c8e6c9' : undefined, transition: 'background 0.3s' }}>
                            <option value="">{t('collection.selectPlaceholder')}</option>
                            {col.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                      {/* Qty */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} className="fill-cell">
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#999', width: 60, textTransform: 'uppercase' }}>{t('quote.qty')}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: recentlyFilled.has(`${cfg.id}-qty`) ? '#c8e6c9' : undefined, transition: 'background 0.3s', borderRadius: 4 }}>
                          <button onClick={() => updateConfig(cfg.id, { qty: Math.max(1, cfg.qty - 1) })} style={mobileQtyBtnStyle}>-</button>
                          <input type="number" value={cfg.qty} onChange={(e) => updateConfig(cfg.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })} style={{ ...qtyInputStyle, width: 44, height: 36, fontSize: 14 }} />
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
  padding: '8px 10px', fontSize: 13, minHeight: 36,
}

const mobileQtyBtnStyle = {
  width: 36, height: 36, borderRadius: 6, border: '1px solid #e0e0e0',
  background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
  fontFamily: 'inherit',
}

'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { fmt, today } from '@/lib/utils'
import { COLLECTIONS, HOUSING, CORD_COLORS } from '@/lib/catalog'
import { generatePDF, downloadPDF, formatDocumentFilename } from '@/lib/pdf'
import SaveDocumentModal from './SaveDocumentModal'
import { useI18n } from '@/lib/i18n'

const ROWS_PER_PAGE = 10
const PRINT_ROWS_PER_PAGE = 14
const PRINT_ROWS_LAST_PAGE = 9 // Fewer rows on last page to leave room for footer/signatures

const COLUMNS = [
  { key: 'no', labelKey: 'order.columns.no', width: 34 },
  { key: 'quantity', labelKey: 'order.columns.quantity', width: 58 },
  { key: 'collection', labelKey: 'order.columns.collection', width: 130 },
  { key: 'carat', labelKey: 'order.columns.carat', width: 64 },
  { key: 'shape', labelKey: 'order.columns.shape', width: 80 },
  { key: 'bpColor', labelKey: 'order.columns.bpColor', width: 90 },
  { key: 'size', labelKey: 'order.columns.size', width: 50 },
  { key: 'colorCord', labelKey: 'order.columns.colorCord', width: 120 },
  { key: 'unitPrice', labelKey: 'order.columns.unitPrice', width: 90 },
  { key: 'total', labelKey: 'order.columns.total', width: 90 },
]

const FILL_KEYS = ['quantity', 'collection', 'carat', 'shape', 'bpColor', 'size', 'colorCord', 'unitPrice']

function isRowFilled(row) {
  // Show action buttons if any field has content (not just when ALL fields are filled)
  return FILL_KEYS.some(k => String(row[k] || '').trim() !== '')
}

function renumberRows(rows) {
  return rows.map((r, i) => ({ ...r, no: String(i + 1) }))
}

function emptyRow(no) {
  return {
    no: String(no),
    quantity: '',
    collection: '',
    carat: '',
    shape: '',
    bpColor: '',
    size: '',
    colorCord: '',
    unitPrice: '',
    total: '',
  }
}

function findCollection(productName) {
  if (!productName) return null
  const name = productName.toUpperCase()
  return COLLECTIONS.find(
    (c) => c.label.toUpperCase() === name || c.id.toUpperCase() === name
  ) || COLLECTIONS.find(
    (c) => name.includes(c.label.toUpperCase()) || name.includes(c.id.toUpperCase())
  ) || null
}

function getHousingOptions(housingKey) {
  if (!housingKey) return []

  // These types store values with a "Bezel X" / "Prong X" prefix — match that format exactly
  if (housingKey === 'shapyShine') {
    return [
      ...HOUSING.shapyShineBezel.map(h => `Bezel ${h}`),
      ...HOUSING.shapyShineProng.map(h => `Prong ${h}`),
    ]
  }
  if (housingKey === 'matchy') {
    return [
      ...HOUSING.matchyBezel.map(h => `Bezel ${h.label || h}`),
      ...HOUSING.matchyProng.map(h => `Prong ${h.label || h}`),
    ]
  }

  // multiThree splits into attached/notAttached — use notAttached as the full superset
  if (housingKey === 'multiThree') {
    return HOUSING.multiThree.notAttached
  }

  const h = HOUSING[housingKey]
  if (!h) return []
  let labels = []
  if (Array.isArray(h)) {
    labels = h.map(item => (typeof item === 'string' ? item : item.label))
  } else if (typeof h === 'object') {
    labels = Object.values(h).flatMap(arr =>
      Array.isArray(arr) ? arr.map(item => (typeof item === 'string' ? item : item.label)) : []
    )
  }
  return [...new Set(labels)]
}

function prefillRows(quote) {
  if (!quote || !quote.lines || quote.lines.length === 0) {
    return Array.from({ length: ROWS_PER_PAGE }, (_, i) => emptyRow(i + 1))
  }

  // Each quote line is already one color config (1:1 mapping)
  const rows = []
  let rowNum = 1
  for (const ln of quote.lines) {
    const qty = ln.qty || 0
    const unit = ln.unitB2B || 0
    rows.push({
      no: String(rowNum++),
      quantity: qty ? String(qty) : '',
      collection: ln.product || '',
      carat: ln.carat || '',
      shape: ln.shape || '',
      bpColor: ln.housing || '',
      size: ln.size || '',
      colorCord: ln.colorName || '',
      unitPrice: unit ? String(unit) : '',
      total: qty && unit ? String(qty * unit) : '',
    })
  }

  // Add a small buffer of empty rows for convenience (not full page padding)
  const buffer = 3
  const totalNeeded = rows.length + buffer
  while (rows.length < totalNeeded) {
    rows.push(emptyRow(rows.length + 1))
  }
  return rows
}

// ─── Printable input (renders as plain text div when printing to prevent clipping) ───
// Always renders a hidden text fallback that CSS shows in print as a safety net.
function PrintableInput({ value, onChange, style, placeholder, isPrinting, type, ...rest }) {
  if (isPrinting) {
    return (
      <div style={{
        ...style,
        border: 'none',
        outline: 'none',
        overflow: 'visible',
        whiteSpace: 'nowrap',
        minHeight: 16,
      }}>
        {value || ''}
      </div>
    )
  }
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input
        type={type || 'text'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={style}
        {...rest}
      />
      {/* Hidden text fallback shown by @media print CSS in case isPrinting fails */}
      <span className="print-value-fallback" style={{
        ...style,
        position: 'absolute',
        top: 0,
        left: 0,
        display: 'none',
        border: 'none',
        outline: 'none',
        whiteSpace: 'nowrap',
        overflow: 'visible',
        pointerEvents: 'none',
      }}>{value || ''}</span>
    </span>
  )
}

// ─── Printable textarea ───
function PrintableTextarea({ value, onChange, style, isPrinting, ...rest }) {
  if (isPrinting) {
    return (
      <div style={{
        ...style,
        border: 'none',
        overflow: 'visible',
        whiteSpace: 'pre-wrap',
        minHeight: 20,
      }}>
        {value || ''}
      </div>
    )
  }
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <textarea value={value} onChange={onChange} style={style} {...rest} />
      <span className="print-value-fallback" style={{
        ...style,
        position: 'absolute',
        top: 0,
        left: 0,
        display: 'none',
        border: 'none',
        whiteSpace: 'pre-wrap',
        overflow: 'visible',
        pointerEvents: 'none',
      }}>{value || ''}</span>
    </span>
  )
}

// ─── Cell input (renders as plain text when printing to avoid clipping) ───
function CellInput({ value, onChange, width, align, bold, color: clr, isPrinting }) {
  const baseStyle = {
    width: '100%',
    fontFamily: fonts.body,
    fontSize: 11,
    padding: '4px 4px',
    textAlign: align || 'left',
    fontWeight: bold ? 700 : 400,
    color: clr || colors.charcoal,
    boxSizing: 'border-box',
  }

  if (isPrinting) {
    return (
      <div style={{
        ...baseStyle,
        overflow: 'visible',
        whiteSpace: 'nowrap',
        minHeight: 18,
      }}>
        {value || ''}
      </div>
    )
  }

  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...baseStyle,
        border: 'none',
        outline: 'none',
        background: 'transparent',
      }}
    />
  )
}

function CellSelect({ value, onChange, options, isPrinting, align }) {
  const baseStyle = {
    width: '100%',
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: align || 'left',
    padding: '4px',
    boxSizing: 'border-box',
  }
  if (isPrinting) {
    const opt = options.find(o => o.value === value)
    return (
      <div style={{ ...baseStyle, minHeight: 18, overflow: 'visible', whiteSpace: 'nowrap' }}>
        {opt ? opt.label : (value || '')}
      </div>
    )
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...baseStyle, border: 'none', outline: 'none', background: 'transparent', cursor: 'pointer', color: 'rgb(79, 79, 79)' }}
    >
      <option value=""></option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ─── Side Calculator ───
function Calculator({ subtotal, onApplyToForm, mobile }) {
  const { t } = useI18n()
  const [discountPct, setDiscountPct] = useState('')
  const [discountFlat, setDiscountFlat] = useState('')
  const [deliveryCost, setDeliveryCost] = useState('')
  const [extraPercent, setExtraPercent] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [customAmount, setCustomAmount] = useState('')
  const [showTaxInfo, setShowTaxInfo] = useState(false)

  const calc = useMemo(() => {
    const sub = Number(subtotal) || 0
    const pctOff = sub * (Number(discountPct) || 0) / 100
    const flatOff = Number(discountFlat) || 0
    const delivery = Number(deliveryCost) || 0
    const custom = Number(customAmount) || 0
    const extraPct = Math.max(0, Number(extraPercent) || 0)
    const totalDiscount = pctOff + flatOff
    // Shipping/custom adjustments are applied after discount, then extra percentage is added last.
    const baseAfterDiscount = sub - totalDiscount
    const baseWithShipping = baseAfterDiscount + delivery + custom
    const extraAmount = (baseWithShipping * extraPct) / 100
    const final = baseWithShipping + extraAmount
    return { sub, pctOff, flatOff, totalDiscount, delivery, custom, extraPct, baseAfterDiscount, baseWithShipping, extraAmount, final }
  }, [subtotal, discountPct, discountFlat, deliveryCost, customAmount, extraPercent])

  const calcInput = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${colors.lineGray}`,
    fontSize: 12,
    fontFamily: fonts.body,
    outline: 'none',
    background: '#fafaf8',
    boxSizing: 'border-box',
    color: colors.charcoal,
  }

  const calcLabel = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: colors.lovelabMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: 10,
  }

  return (
    <div className="order-form-calculator" style={{
      width: mobile ? '100%' : 240,
      flexShrink: 0,
      background: '#fff',
      borderRadius: 12,
      border: `1px solid ${colors.lineGray}`,
      padding: 16,
      height: 'fit-content',
      position: mobile ? 'relative' : 'sticky',
      top: mobile ? 0 : 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, marginBottom: 12 }}>{t('order.calculator')}</div>
      <button
        onClick={() => setShowTaxInfo((v) => !v)}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${colors.lineGray}`,
          background: '#fafaf8',
          color: colors.inkPlum,
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: fonts.body,
          marginBottom: 8,
        }}
      >
        {t('order.taxInfoButton')}
      </button>
      <a
        href="https://ec.europa.eu/taxation_customs/vies/#/vat-validation"
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 10, color: '#666', textDecoration: 'underline', display: 'block', marginBottom: 8 }}
      >
        {t('client.checkVatManually')}
      </a>
      {showTaxInfo && (
        <div style={{
          border: `1px solid ${colors.lineGray}`,
          borderRadius: 8,
          background: '#fff',
          padding: 10,
          marginBottom: 8,
          fontSize: 10,
          color: colors.charcoal,
          lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, color: colors.inkPlum, marginBottom: 6 }}>{t('order.taxInfoTitle')}</div>
          <div style={{ marginBottom: 6, fontStyle: 'italic' }}>{t('order.taxInfoManualOnly')}</div>
          <div style={{ fontWeight: 700 }}>{t('order.taxBelgiumTitle')}</div>
          <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
            <li>{t('order.taxBelgiumBusiness')}</li>
            <li>{t('order.taxBelgiumPrivate')}</li>
          </ul>
          <div style={{ fontWeight: 700 }}>{t('order.taxEuTitle')}</div>
          <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
            <li>{t('order.taxEuViesOk')}</li>
            <li>{t('order.taxEuViesNotOk')}</li>
            <li>{t('order.taxEuOss')}</li>
          </ul>
          <div style={{ fontWeight: 700 }}>{t('order.taxOutsideEuTitle')}</div>
          <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
            <li>{t('order.taxOutsideEuExport')}</li>
            <li>{t('order.taxOutsideEuNoProof')}</li>
          </ul>
          <div>{t('order.taxShippingAfterDiscount')}</div>
        </div>
      )}

      <div style={{ fontSize: 11, color: colors.charcoal, display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
        <span>{t('quote.subtotal')}</span>
        <span style={{ fontWeight: 600 }}>{fmt(calc.sub)}</span>
      </div>

      <div style={calcLabel}>{t('order.extraDiscountPercent')}</div>
      <input type="number" min="0" max="100" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} placeholder="0" style={calcInput} />
      {calc.pctOff > 0 && (
        <div style={{ fontSize: 10, color: '#c0392b', textAlign: 'right', marginTop: 2 }}>-{fmt(calc.pctOff)}</div>
      )}

      <div style={calcLabel}>{t('order.flatDiscount')}</div>
      <input type="number" min="0" value={discountFlat} onChange={(e) => setDiscountFlat(e.target.value)} placeholder="0" style={calcInput} />

      <div style={calcLabel}>{t('order.deliveryCost')}</div>
      <input type="number" min="0" value={deliveryCost} onChange={(e) => setDeliveryCost(e.target.value)} placeholder="0" style={calcInput} />

      <div style={calcLabel}>{t('order.extraPercentAdd')}</div>
      <input type="number" min="0" value={extraPercent} onChange={(e) => setExtraPercent(e.target.value)} placeholder="0" style={calcInput} />

      <div style={calcLabel}>{t('order.customAdjustment')}</div>
      <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder={t('order.labelOptional')} style={{ ...calcInput, marginBottom: 4 }} />
      <input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder={t('order.amountPlusMinus')} style={calcInput} />

      {/* Summary */}
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${colors.lineGray}` }}>
        {calc.totalDiscount > 0 && (
          <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#c0392b' }}>
            <span>{t('quote.discount')}</span><span>-{fmt(calc.totalDiscount)}</span>
          </div>
        )}
        {calc.delivery > 0 && (
          <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: colors.charcoal }}>
            <span>{t('order.delivery')}</span><span>+{fmt(calc.delivery)}</span>
          </div>
        )}
        {calc.custom !== 0 && (
          <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: colors.charcoal }}>
            <span>{customLabel || t('order.adjustment')}</span><span>{calc.custom > 0 ? '+' : ''}{fmt(calc.custom)}</span>
          </div>
        )}
        {calc.extraAmount > 0 && (
          <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: colors.charcoal }}>
            <span>{t('order.extraPercentLine').replace('{percent}', String(calc.extraPct))}</span><span>+{fmt(calc.extraAmount)}</span>
          </div>
        )}
        <div style={{
          fontSize: 16, fontWeight: 800, display: 'flex', justifyContent: 'space-between',
          padding: '8px 0 4px', borderTop: `1px solid ${colors.lineGray}`, marginTop: 6, color: colors.inkPlum,
        }}>
          <span>{t('order.finalTotal')}</span><span>{fmt(calc.final)}</span>
        </div>
      </div>

      <button
        onClick={() => {
          // Pass subtotal, total discount, and final so the form can show before/after
          onApplyToForm({
            subtotal: calc.sub,
            totalDiscount: calc.totalDiscount,
            finalTotal: calc.final,
          })
        }}
        style={{
          width: '100%', marginTop: 10, padding: 10, borderRadius: 8, border: 'none',
          background: colors.inkPlum, color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: fonts.body, transition: 'opacity .15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
      >
        {t('order.applyToForm')}
      </button>
    </div>
  )
}

// ═══ MAIN ORDER FORM ═══
export default function OrderForm({ quote, client, onClose, currentUser, savedFormState, editingDocumentId, onEditInBuilder }) {
  const { t } = useI18n()
  const mobile = useIsMobile()
  const printRef = useRef(null)
  const scrollAreaRef = useRef(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [mobileCardView, setMobileCardView] = useState(true)

  // Scroll to top when form opens (fixes iOS not showing header)
  useEffect(() => {
    const scrollToTop = () => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = 0
      }
    }
    // Immediate attempt
    scrollToTop()
    // After next paint (iOS needs this to account for layout)
    requestAnimationFrame(() => {
      scrollToTop()
      // One more after the frame paints (belt-and-suspenders for iOS Safari)
      requestAnimationFrame(scrollToTop)
    })
    // Final fallback after a short delay for slow iOS renders
    const timer = setTimeout(scrollToTop, 100)

    // Prevent body from scrolling behind the overlay on iOS
    const scrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
    document.body.style.top = `-${scrollY}px`

    return () => {
      clearTimeout(timer)
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  // Draft recovery state
  const [pendingDraft, setPendingDraft] = useState(null)
  const [showDraftPrompt, setShowDraftPrompt] = useState(false)
  const [draftChecked, setDraftChecked] = useState(false)

  // Client info state (editable)
  const [companyName, setCompanyName] = useState(client?.company || '')
  const [contactName, setContactName] = useState(client?.name || '')
  const [addressLine1, setAddressLine1] = useState(client?.address || '')
  const [addressLine2, setAddressLine2] = useState(
    [client?.zip, client?.city].filter(Boolean).join(' ')
  )
  const [country, setCountry] = useState(client?.country || '')
  const [vatNumber, setVatNumber] = useState(client?.vat || '')
  const vatValid = client?.vatValid
  const [email, setEmail] = useState(client?.email || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [date, setDate] = useState(today())
  const [packaging, setPackaging] = useState('Black')  // Single value: 'Black', 'Pink', or 'Mix'
  const [remarks, setRemarks] = useState('')
  
  // New fields
  const [eventName, setEventName] = useState('') // Fair/event where we met the client
  const [createdBy, setCreatedBy] = useState(currentUser?.full_name || currentUser?.email || '') // LoveLab team member

  // Prepayment & discount state
  const [hasPrepayment, setHasPrepayment] = useState(false)
  const [prepaymentAmount, setPrepaymentAmount] = useState('')
  const [discountDisplay, setDiscountDisplay] = useState('')

  // Prepayment gate: null = not yet confirmed, true = confirmed
  const [prepaymentConfirmed, setPrepaymentConfirmed] = useState(null)
  const [showPrepaymentGate, setShowPrepaymentGate] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  // Local state inside the gate (before committing)
  const [gateHasPrepayment, setGateHasPrepayment] = useState(false)
  const [gatePrepaymentAmount, setGatePrepaymentAmount] = useState('')
  const [prepaymentMethod, setPrepaymentMethod] = useState('')
  const [gatePrepaymentMethod, setGatePrepaymentMethod] = useState('')

  // Vitrine state
  const [hasVitrine, setHasVitrine] = useState(false)
  const [vitrinePrice, setVitrinePrice] = useState(150)
  const [vitrineQty, setVitrineQty] = useState(1)

  // Table rows state with undo/redo support
  const [rows, setRowsInternal] = useState(() => prefillRows(quote))
  const [rowsHistory, setRowsHistory] = useState([prefillRows(quote)])
  const [historyIndex, setHistoryIndex] = useState(0)
  const historyTimeoutRef = useRef(null)
  
  // Debounced history push - saves state after 500ms of no changes
  const pushToHistory = useCallback((newRows) => {
    if (historyTimeoutRef.current) {
      clearTimeout(historyTimeoutRef.current)
    }
    historyTimeoutRef.current = setTimeout(() => {
      setRowsHistory(prev => {
        // Remove any "future" states if we're not at the end
        const newHistory = prev.slice(0, historyIndex + 1)
        // Don't add if same as current
        const current = newHistory[newHistory.length - 1]
        if (JSON.stringify(current) === JSON.stringify(newRows)) {
          return newHistory
        }
        newHistory.push(JSON.parse(JSON.stringify(newRows)))
        // Limit history to 30 states
        if (newHistory.length > 30) newHistory.shift()
        return newHistory
      })
      setHistoryIndex(prev => {
        const newIdx = prev + 1
        return Math.min(newIdx, 29)
      })
    }, 500)
  }, [historyIndex])
  
  // Wrapper for setRows that also tracks history
  const setRows = useCallback((updater) => {
    setRowsInternal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      pushToHistory(next)
      return next
    })
  }, [pushToHistory])
  
  // Undo/Redo functions
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < rowsHistory.length - 1
  
  const handleUndo = useCallback(() => {
    if (!canUndo) return
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    setRowsInternal(JSON.parse(JSON.stringify(rowsHistory[newIndex])))
  }, [canUndo, historyIndex, rowsHistory])
  
  const handleRedo = useCallback(() => {
    if (!canRedo) return
    const newIndex = historyIndex + 1
    setHistoryIndex(newIndex)
    setRowsInternal(JSON.parse(JSON.stringify(rowsHistory[newIndex])))
  }, [canRedo, historyIndex, rowsHistory])

  // Final total override from calculator
  const [finalTotalOverride, setFinalTotalOverride] = useState(null)

  // Restore form state when re-editing a saved document
  useEffect(() => {
    if (!savedFormState) return
    const s = savedFormState
    if (s.companyName != null) setCompanyName(s.companyName)
    if (s.contactName != null) setContactName(s.contactName)
    if (s.addressLine1 != null) setAddressLine1(s.addressLine1)
    if (s.addressLine2 != null) setAddressLine2(s.addressLine2)
    if (s.country != null) setCountry(s.country)
    if (s.vatNumber != null) setVatNumber(s.vatNumber)
    if (s.email != null) setEmail(s.email)
    if (s.phone != null) setPhone(s.phone)
    if (s.date != null) setDate(s.date)
    if (s.packaging != null) {
      // Handle old array format by converting to single value
      if (Array.isArray(s.packaging)) {
        setPackaging(s.packaging.length > 1 ? 'Mix' : (s.packaging[0] || 'Black'))
      } else {
        setPackaging(s.packaging)
      }
    }
    if (s.remarks != null) setRemarks(s.remarks)
    if (s.eventName != null) setEventName(s.eventName)
    if (s.createdBy != null) setCreatedBy(s.createdBy)
    if (s.hasPrepayment != null) setHasPrepayment(s.hasPrepayment)
    if (s.prepaymentAmount != null) setPrepaymentAmount(s.prepaymentAmount)
    if (s.prepaymentMethod != null) setPrepaymentMethod(s.prepaymentMethod)
    if (s.discountDisplay != null) setDiscountDisplay(s.discountDisplay)
    if (s.finalTotalOverride != null) setFinalTotalOverride(s.finalTotalOverride)
    if (s.hasVitrine != null) setHasVitrine(s.hasVitrine)
    if (s.vitrinePrice != null) setVitrinePrice(s.vitrinePrice)
    if (s.vitrineQty != null) setVitrineQty(s.vitrineQty)
    if (s.rows && s.rows.length > 0) {
      // Pad rows to fill at least one page
      const restored = [...s.rows]
      while (restored.length < ROWS_PER_PAGE) {
        restored.push(emptyRow(restored.length + 1))
      }
      setRowsInternal(restored)
      // Reset history with restored state
      setRowsHistory([JSON.parse(JSON.stringify(restored))])
      setHistoryIndex(0)
    }
    setPrepaymentConfirmed(null) // require re-confirmation when re-editing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount

  // Check for existing draft on mount (only if not re-editing a saved document)
  useEffect(() => {
    if (savedFormState || editingDocumentId || draftChecked) return
    if (!client?.company) {
      setDraftChecked(true)
      return
    }
    
    const checkDraft = async () => {
      try {
        const res = await fetch(`/api/drafts?company=${encodeURIComponent(client.company)}`)
        const data = await res.json()
        if (data.draft && data.draft.form_state) {
          setPendingDraft(data.draft)
          setShowDraftPrompt(true)
        }
      } catch (err) {
        console.error('Failed to check for draft:', err)
      }
      setDraftChecked(true)
    }
    checkDraft()
  }, [client?.company, savedFormState, editingDocumentId, draftChecked])

  // Restore draft function
  const restoreDraft = useCallback(() => {
    if (!pendingDraft?.form_state) return
    const s = pendingDraft.form_state
    if (s.companyName != null) setCompanyName(s.companyName)
    if (s.contactName != null) setContactName(s.contactName)
    if (s.addressLine1 != null) setAddressLine1(s.addressLine1)
    if (s.addressLine2 != null) setAddressLine2(s.addressLine2)
    if (s.country != null) setCountry(s.country)
    if (s.vatNumber != null) setVatNumber(s.vatNumber)
    if (s.email != null) setEmail(s.email)
    if (s.phone != null) setPhone(s.phone)
    if (s.date != null) setDate(s.date)
    if (s.packaging != null) {
      if (Array.isArray(s.packaging)) {
        setPackaging(s.packaging.length > 1 ? 'Mix' : (s.packaging[0] || 'Black'))
      } else {
        setPackaging(s.packaging)
      }
    }
    if (s.remarks != null) setRemarks(s.remarks)
    if (s.eventName != null) setEventName(s.eventName)
    if (s.createdBy != null) setCreatedBy(s.createdBy)
    if (s.hasPrepayment != null) setHasPrepayment(s.hasPrepayment)
    if (s.prepaymentAmount != null) setPrepaymentAmount(s.prepaymentAmount)
    if (s.prepaymentMethod != null) setPrepaymentMethod(s.prepaymentMethod)
    if (s.discountDisplay != null) setDiscountDisplay(s.discountDisplay)
    if (s.finalTotalOverride != null) setFinalTotalOverride(s.finalTotalOverride)
    if (s.hasVitrine != null) setHasVitrine(s.hasVitrine)
    if (s.vitrinePrice != null) setVitrinePrice(s.vitrinePrice)
    if (s.vitrineQty != null) setVitrineQty(s.vitrineQty)
    if (s.rows && s.rows.length > 0) {
      const restored = [...s.rows]
      while (restored.length < ROWS_PER_PAGE) {
        restored.push(emptyRow(restored.length + 1))
      }
      setRowsInternal(restored)
      // Reset history with restored state
      setRowsHistory([JSON.parse(JSON.stringify(restored))])
      setHistoryIndex(0)
    }
    setShowDraftPrompt(false)
    setPendingDraft(null)
  }, [pendingDraft])

  // Dismiss draft and start fresh
  const dismissDraft = useCallback(async () => {
    setShowDraftPrompt(false)
    setPendingDraft(null)
    // Delete the old draft so it doesn't show up again
    if (client?.company) {
      try {
        await fetch(`/api/drafts?company=${encodeURIComponent(client.company)}`, {
          method: 'DELETE',
        })
      } catch (err) {
        console.error('Failed to delete draft:', err)
      }
    }
  }, [client?.company])

  // Auto-save draft every 2 minutes
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  
  useEffect(() => {
    // Don't auto-save if company name is empty
    if (!companyName) return
    
    const saveDraft = async () => {
      setIsSavingDraft(true)
      try {
        const formState = {
          rows: rows.filter(r => r.collection || r.quantity),
          companyName, contactName, addressLine1, addressLine2, country,
          vatNumber, email, phone, date, packaging, remarks,
          eventName, createdBy, hasPrepayment, prepaymentAmount, prepaymentMethod,
          discountDisplay, finalTotalOverride,
          hasVitrine, vitrinePrice, vitrineQty,
        }
        
        await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: companyName,
            form_state: formState,
          }),
        })
        setLastSavedAt(new Date())
      } catch (err) {
        console.error('Failed to auto-save draft:', err)
      } finally {
        setIsSavingDraft(false)
      }
    }
    
    // Save every 2 minutes
    const interval = setInterval(saveDraft, 2 * 60 * 1000)
    
    // Also save on first render (after a short delay)
    const initialSave = setTimeout(saveDraft, 5000)
    
    return () => {
      clearInterval(interval)
      clearTimeout(initialSave)
    }
  }, [companyName, contactName, addressLine1, addressLine2, country, vatNumber, email, phone, date, packaging, remarks, eventName, createdBy, hasPrepayment, prepaymentAmount, discountDisplay, finalTotalOverride, hasVitrine, vitrinePrice, vitrineQty, rows])

  // Delete draft when order is successfully saved
  const deleteDraft = useCallback(async () => {
    if (!companyName) return
    try {
      await fetch(`/api/drafts?company=${encodeURIComponent(companyName)}`, {
        method: 'DELETE',
      })
    } catch (err) {
      console.error('Failed to delete draft:', err)
    }
  }, [companyName])

  // Computed subtotal from table
  const subtotal = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0)
  }, [rows])

  const finalTotal = finalTotalOverride != null ? finalTotalOverride : subtotal

  // Compute after-discount amount from discountDisplay (supports "10%" or "€500" or plain "500")
  const afterDiscount = useMemo(() => {
    const base = finalTotal || 0
    const d = (discountDisplay || '').trim()
    if (!d) return null
    if (d.endsWith('%')) {
      const pct = parseFloat(d) || 0
      if (pct <= 0) return null
      return base - base * pct / 100
    }
    const flat = parseFloat(d.replace(/[€,]/g, '')) || 0
    if (flat <= 0) return null
    return base - flat
  }, [finalTotal, discountDisplay])

  // Vitrine total (added after discount)
  const vitrineTotal = hasVitrine ? vitrinePrice * vitrineQty : 0

  // Grand total = (after discount or subtotal) + vitrine
  const grandTotal = useMemo(() => {
    const baseAmount = afterDiscount != null ? afterDiscount : finalTotal
    return baseAmount + vitrineTotal
  }, [afterDiscount, finalTotal, vitrineTotal])

  // Row handlers
  const updateCell = useCallback((rowIdx, key, value) => {
    setRows(prev => {
      const next = [...prev]
      next[rowIdx] = { ...next[rowIdx], [key]: value }
      // Auto-calc total when quantity or unitPrice change
      if (key === 'quantity' || key === 'unitPrice') {
        const qty = Number(key === 'quantity' ? value : next[rowIdx].quantity) || 0
        const price = Number(key === 'unitPrice' ? value : next[rowIdx].unitPrice) || 0
        if (qty && price) {
          next[rowIdx].total = String(qty * price)
        }
      }
      // When collection changes, reset dependent fields
      if (key === 'collection') {
        next[rowIdx].carat = ''
        next[rowIdx].unitPrice = ''
        next[rowIdx].total = ''
        next[rowIdx].shape = ''
        next[rowIdx].bpColor = ''
        next[rowIdx].size = ''
      }
      // Auto-lookup unitPrice from catalog when collection or carat changes
      if (key === 'collection' || key === 'carat') {
        const row = next[rowIdx]
        const col = findCollection(row.collection)
        if (col) {
          const caratIdx = col.carats.findIndex(c => c === row.carat)
          if (caratIdx !== -1) {
            next[rowIdx].unitPrice = String(col.prices[caratIdx])
            const qty = Number(row.quantity) || 0
            if (qty) next[rowIdx].total = String(qty * col.prices[caratIdx])
          }
        }
      }
      return next
    })
    // Clear override when user edits table
    setFinalTotalOverride(null)
  }, [])

  const addPage = useCallback(() => {
    setRows(prev => {
      const startNo = prev.length + 1
      const newRows = Array.from({ length: ROWS_PER_PAGE }, (_, i) => emptyRow(startNo + i))
      return [...prev, ...newRows]
    })
  }, [])

  const insertRowBelow = useCallback((globalIdx) => {
    setRows(prev => {
      const next = [...prev]
      next.splice(globalIdx + 1, 0, emptyRow(0))
      return renumberRows(next)
    })
    setFinalTotalOverride(null)
  }, [])

  const duplicateRow = useCallback((globalIdx) => {
    setRows(prev => {
      const next = [...prev]
      const copy = { ...prev[globalIdx] }
      next.splice(globalIdx + 1, 0, copy)
      return renumberRows(next)
    })
    setFinalTotalOverride(null)
  }, [])

  const deleteRow = useCallback((globalIdx) => {
    setRows(prev => {
      if (prev.length <= 1) return prev
      const next = [...prev]
      next.splice(globalIdx, 1)
      return renumberRows(next)
    })
    setFinalTotalOverride(null)
  }, [])

  // Split rows into pages (for interactive editing - includes empty rows)
  const pages = useMemo(() => {
    const p = []
    for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
      p.push(rows.slice(i, i + ROWS_PER_PAGE))
    }
    return p
  }, [rows])

  // For printing/saving, pack more rows per page to reduce page count and PDF size
  // Last page gets fewer rows to leave room for footer/signatures section
  const printPages = useMemo(() => {
    const filledRows = rows.filter(isRowFilled)
    if (filledRows.length === 0) return [[]] // at least one empty page
    
    const p = []
    let i = 0
    while (i < filledRows.length) {
      const remaining = filledRows.length - i
      // If remaining rows fit in a last-page allocation, make this the last page
      if (remaining <= PRINT_ROWS_LAST_PAGE) {
        p.push(filledRows.slice(i))
        break
      }
      // Check if we need to start thinking about last page
      // If after this page, remaining would fit in last page, use normal rows
      const afterThisPage = remaining - PRINT_ROWS_PER_PAGE
      if (afterThisPage > 0 && afterThisPage <= PRINT_ROWS_LAST_PAGE) {
        // This is NOT the last page, use full rows
        p.push(filledRows.slice(i, i + PRINT_ROWS_PER_PAGE))
        i += PRINT_ROWS_PER_PAGE
      } else if (afterThisPage <= 0) {
        // This will be the last page
        p.push(filledRows.slice(i))
        break
      } else {
        // Normal page
        p.push(filledRows.slice(i, i + PRINT_ROWS_PER_PAGE))
        i += PRINT_ROWS_PER_PAGE
      }
    }
    return p
  }, [rows])

  // Use printPages when printing (filters empty rows), otherwise use pages
  const displayPages = isPrinting ? printPages : pages

  const pdfFilename = useCallback(() => {
    return formatDocumentFilename(companyName || contactName || 'Order', 'order', new Date().toISOString().split('T')[0])
  }, [companyName, contactName])

  const handleDownload = async () => {
    flushSync(() => setIsPrinting(true))
    await new Promise(r => setTimeout(r, 500))
    try {
      if (!printRef.current) return
      await downloadPDF(printRef.current, pdfFilename(), { orientation: 'landscape' })
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setIsPrinting(false)
    }
  }

  const handlePrint = () => {
    flushSync(() => setIsPrinting(true))

    setTimeout(() => {
      const content = printRef.current
      if (!content) { setIsPrinting(false); return }

      const printWindow = window.open('', '_blank')

      // iPad/iOS Safari may block window.open — fall back to download
      if (!printWindow) {
        setIsPrinting(false)
        handleDownload()
        return
      }

      try {
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
          .map(node => node.outerHTML)
          .join('')

        printWindow.document.open()
        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${pdfFilename()} - LoveLab</title>
  ${styles}
  <style>
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #order-form-print {
      display: block !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
    .order-form-page {
      margin: 0 !important;
      box-shadow: none !important;
      border: none !important;
      border-radius: 0 !important;
      width: 100% !important;
      max-width: none !important;
      page-break-after: always;
      break-after: page;
      padding: 10mm !important;
      box-sizing: border-box !important;
      background: #fff !important;
    }
    .order-form-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .no-print, button { display: none !important; }
  </style>
</head>
<body>
  ${content.outerHTML}
  <script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>
</body>
</html>`)
        printWindow.document.close()
      } catch (err) {
        console.error('Print failed:', err)
        printWindow.close()
      } finally {
        setIsPrinting(false)
      }
    }, 500)
  }

  const handleBeforePrint = useCallback(() => {
    // Use flushSync to guarantee React commits the isPrinting state
    // synchronously before html2canvas captures the DOM
    flushSync(() => setIsPrinting(true))
    // Scroll the form container to top so html2canvas captures from the start
    const scrollArea = document.getElementById('order-form-scroll-area')
    if (scrollArea) scrollArea.scrollTop = 0
    // Return a promise - wait longer on mobile for DOM to fully re-render
    const waitMs = typeof window !== 'undefined' && window.innerWidth < 768 ? 600 : 350
    return new Promise(r => setTimeout(r, waitMs))
  }, [])

  const handleAfterPrint = useCallback(() => {
    setIsPrinting(false)
  }, [])

  const handleApplyFromCalc = useCallback(({ subtotal: calcSubtotal, totalDiscount, finalTotal: val }) => {
    // When calculator applies:
    // - If there's a discount, set discountDisplay so before/after shows
    // - Use the row subtotal as "before" (don't override it)
    // - The "after" will be computed from subtotal - discountDisplay
    
    if (totalDiscount > 0) {
      // There's a discount — populate discount field to trigger before/after display
      // Round to avoid floating point issues
      const discountRounded = Math.round(totalDiscount * 100) / 100
      setDiscountDisplay(`€${discountRounded}`)
      // Don't set finalTotalOverride — let the raw subtotal be "before"
      setFinalTotalOverride(null)
    } else if (val !== calcSubtotal) {
      // No discount but there are additions (delivery, custom, etc.)
      // In this case, directly set the final as the override
      setFinalTotalOverride(val)
      setDiscountDisplay('')
    } else {
      // No changes at all
      setFinalTotalOverride(null)
      setDiscountDisplay('')
    }
  }, [])

  // ─── Prepayment gate logic ───
  const runAction = useCallback((action) => {
    if (action === 'save') setShowSaveModal(true)
    else if (action === 'print') handlePrint()
    else if (action === 'download') handleDownload()
  }, [handlePrint, handleDownload])

  const triggerWithPrepaymentCheck = useCallback((action) => {
    if (prepaymentConfirmed === null) {
      setGateHasPrepayment(hasPrepayment)
      setGatePrepaymentAmount(prepaymentAmount)
      setGatePrepaymentMethod(prepaymentMethod)
      setPendingAction(action)
      setShowPrepaymentGate(true)
    } else {
      runAction(action)
    }
  }, [prepaymentConfirmed, hasPrepayment, prepaymentAmount, prepaymentMethod, runAction])

  const confirmPrepaymentGate = useCallback(() => {
    setHasPrepayment(gateHasPrepayment)
    setPrepaymentAmount(gateHasPrepayment ? gatePrepaymentAmount : '')
    setPrepaymentMethod(gateHasPrepayment ? gatePrepaymentMethod : '')
    setPrepaymentConfirmed(true)
    setShowPrepaymentGate(false)
    const action = pendingAction
    setPendingAction(null)
    runAction(action)
  }, [gateHasPrepayment, gatePrepaymentAmount, gatePrepaymentMethod, pendingAction, runAction])

  // ─── Header field style ───
  const hFieldLabel = { fontSize: 9, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 1 }
  const hFieldInput = {
    width: '100%',
    padding: '3px 6px',
    border: 'none',
    borderBottom: `1px solid ${colors.lineGray}`,
    outline: 'none',
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.charcoal,
    background: 'transparent',
    boxSizing: 'border-box',
  }

  // ─── Table header cell style ───
  const thStyle = {
    padding: '6px 4px',
    textAlign: 'left',
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: colors.inkPlum,
    borderBottom: `2px solid ${colors.inkPlum}`,
    whiteSpace: 'nowrap',
  }

  const tdStyle = {
    padding: 0,
    borderBottom: `1px solid ${colors.lineGray}`,
    borderRight: `1px solid ${colors.lineGray}`,
    height: 30,
    verticalAlign: 'middle',
  }

  return (
    <div id="order-form-print-wrapper" style={{
      position: isPrinting ? 'static' : 'fixed',
      top: 0, left: 0, right: 0, bottom: isPrinting ? 'auto' : 0,
      zIndex: 300,
      background: isPrinting ? '#fff' : '#f0eeec',
      display: isPrinting ? 'block' : 'flex', flexDirection: 'column',
      overflow: isPrinting ? 'visible' : undefined,
      height: isPrinting ? 'auto' : undefined,
    }}>
      {/* ─── Prepayment Gate Modal ─── */}
      {showPrepaymentGate && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: '28px 28px 24px',
            maxWidth: 380, width: '100%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum, marginBottom: 6 }}>
              Prepayment confirmation
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
              Was a prepayment made for this order?
            </div>

            {/* No prepayment option */}
            <div
              onClick={() => setGateHasPrepayment(false)}
              style={{
                padding: '12px 16px', borderRadius: 8, marginBottom: 10,
                border: `2px solid ${!gateHasPrepayment ? colors.inkPlum : '#e0e0e0'}`,
                background: !gateHasPrepayment ? 'rgba(93,58,94,0.06)' : '#fafafa',
                cursor: 'pointer', transition: 'all .15s',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                border: `2px solid ${!gateHasPrepayment ? colors.inkPlum : '#ccc'}`,
                background: !gateHasPrepayment ? colors.inkPlum : 'transparent',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal }}>No prepayment</span>
            </div>

            {/* Yes prepayment option */}
            <div
              onClick={() => setGateHasPrepayment(true)}
              style={{
                padding: '12px 16px', borderRadius: 8, marginBottom: 20,
                border: `2px solid ${gateHasPrepayment ? colors.inkPlum : '#e0e0e0'}`,
                background: gateHasPrepayment ? 'rgba(93,58,94,0.06)' : '#fafafa',
                cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: `2px solid ${gateHasPrepayment ? colors.inkPlum : '#ccc'}`,
                  background: gateHasPrepayment ? colors.inkPlum : 'transparent',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal }}>Yes, prepayment made</span>
              </div>
              {gateHasPrepayment && (
                <div style={{ marginTop: 10, paddingLeft: 26 }}>
                  <input
                    type="text"
                    value={gatePrepaymentAmount}
                    onChange={(e) => setGatePrepaymentAmount(e.target.value)}
                    placeholder="€ amount"
                    autoFocus
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 6,
                      border: `1px solid ${colors.inkPlum}`, outline: 'none',
                      fontFamily: fonts.body, fontSize: 13, color: colors.charcoal,
                      background: '#fff', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {['SumUp', 'N26 (transfer)', 'Revolut'].map(m => (
                      <button
                        key={m}
                        onClick={() => setGatePrepaymentMethod(prev => prev === m ? '' : m)}
                        style={{
                          fontSize: 12, padding: '5px 12px', borderRadius: 20,
                          border: `1.5px solid ${gatePrepaymentMethod === m ? colors.inkPlum : '#ddd'}`,
                          background: gatePrepaymentMethod === m ? colors.inkPlum : '#fff',
                          color: gatePrepaymentMethod === m ? '#fff' : colors.charcoal,
                          cursor: 'pointer', fontFamily: fonts.body, fontWeight: 600,
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  {/* N26 bank wire coordinates preview in gate modal */}
                  {gatePrepaymentMethod === 'N26 (transfer)' && (
                    <div style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      borderLeft: `3px solid ${colors.inkPlum}`,
                      background: 'rgba(93,58,94,0.04)',
                      borderRadius: 4,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: colors.charcoal, marginBottom: 3 }}>
                        Beneficiary: Elie Schonfeld
                      </div>
                      <div style={{ fontSize: 11, color: colors.charcoal, lineHeight: 1.7 }}>
                        BANK: N26 &nbsp;|&nbsp; BIC: NTSBDEB1XXX
                      </div>
                      <div style={{ fontSize: 11, color: colors.charcoal, lineHeight: 1.7 }}>
                        IBAN: DE11 1001 1001 2301 0675 66
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowPrepaymentGate(false); setPendingAction(null) }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: '1px solid #ddd', background: '#fff',
                  color: '#888', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: fonts.body,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmPrepaymentGate}
                style={{
                  flex: 2, padding: '10px 0', borderRadius: 8,
                  border: 'none', background: colors.inkPlum,
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  fontFamily: fonts.body,
                }}
              >
                Confirm &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <SaveDocumentModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        documentType="order"
        elementRef={printRef}
        clientName={contactName || client?.name}
        clientCompany={companyName}
        totalAmount={grandTotal}
        eventName={eventName}
        onBeforePrint={handleBeforePrint}
        onAfterPrint={handleAfterPrint}
        editingDocumentId={editingDocumentId}
        onSaveSuccess={deleteDraft}
        metadata={{
          formState: {
            rows: rows.filter(r => isRowFilled(r)),
            companyName, contactName, addressLine1, addressLine2, country,
            vatNumber, email, phone, date, packaging, remarks,
            eventName, createdBy, hasPrepayment, prepaymentAmount, prepaymentMethod,
            discountDisplay, finalTotalOverride,
            hasVitrine, vitrinePrice, vitrineQty,
          },
          rowCount: rows.filter(r => isRowFilled(r)).length,
          hasPrepayment,
          prepaymentAmount,
          createdBy,
          eventName,
          contactName,
          address: [addressLine1, addressLine2, country].filter(Boolean).join(', '),
        }}
      />

      {/* Draft Recovery Prompt */}
      {showDraftPrompt && pendingDraft && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            width: '90%',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: colors.inkPlum }}>
              {t('order.draftFound') || 'Draft Found'}
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: colors.charcoal }}>
              {t('order.draftFoundDesc') || `You have an unsaved draft for "${client?.company || 'this company'}". Would you like to restore it?`}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: '#888' }}>
              {t('order.draftSavedAt') || 'Last saved:'} {new Date(pendingDraft.updated_at).toLocaleString()}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={dismissDraft}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: `1px solid ${colors.lineGray}`,
                  background: '#fff',
                  color: colors.charcoal,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                }}
              >
                {t('order.startFresh') || 'Start Fresh'}
              </button>
              <button
                onClick={restoreDraft}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: colors.inkPlum,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                }}
              >
                {t('order.restoreDraft') || 'Restore Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print-only styles */}
      <style>{`
        @media print {
          /* Reset all containers to normal document flow */
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            width: auto !important;
          }
          
          body * { 
            visibility: hidden !important; 
          }
          
          #order-form-print-wrapper {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            display: block !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
            flex: none !important;
          }
          
          #order-form-scroll-area {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            display: block !important;
            padding: 0 !important;
            flex: none !important;
          }
          
          #order-form-print, 
          #order-form-print * { 
            visibility: visible !important; 
          }
          
          #order-form-print {
            position: static !important;
            width: 100% !important;
            background: #fff !important;
            display: block !important;
            overflow: visible !important;
            gap: 0 !important;
            flex: none !important;
          }
          
          /* Hide non-printable elements */
          .order-form-calculator, 
          .order-form-toolbar, 
          .order-form-add-page, 
          .order-form-dup-col {
            display: none !important;
            visibility: hidden !important;
          }
          
          /* Each page = one printed page */
          .order-form-page {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
            width: 100% !important;
            max-width: none !important;
            padding: 8mm !important;
            box-sizing: border-box !important;
            background: #fff !important;
            display: block !important;
            overflow: visible !important;
            flex: none !important;
          }
          
          .order-form-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          
          table {
            page-break-inside: avoid !important;
          }
          
          #order-form-print input,
          #order-form-print textarea {
            color: transparent !important;
          }
          #order-form-print .print-value-fallback {
            display: block !important;
          }
          
          @page {
            size: A4 landscape;
            margin: 6mm;
          }
        }
      `}</style>

      {/* Toolbar (hidden in print) */}
      <div className="order-form-toolbar" style={{
        background: '#fff', borderBottom: `1px solid ${colors.lineGray}`,
        padding: mobile ? '10px 12px' : '10px 20px', display: 'flex', alignItems: 'center', gap: mobile ? 8 : 12, flexShrink: 0,
        flexWrap: mobile ? 'wrap' : 'nowrap',
      }}>
        <button
          onClick={onClose}
          style={{
            padding: mobile ? '8px 12px' : '6px 16px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
            background: '#fff', color: colors.charcoal, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: fonts.body, minHeight: mobile ? 44 : 'auto',
          }}
        >
          &larr; {t('common.back')}
        </button>
        {/* Undo/Redo buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title={t('common.undo') || 'Undo'}
            style={{
              padding: mobile ? '8px 10px' : '6px 10px', borderRadius: 6,
              border: `1px solid ${canUndo ? colors.lineGray : '#eee'}`,
              background: canUndo ? '#fff' : '#f8f8f8',
              color: canUndo ? colors.charcoal : '#ccc',
              fontSize: 14, fontWeight: 600,
              cursor: canUndo ? 'pointer' : 'not-allowed',
              fontFamily: fonts.body, minHeight: mobile ? 44 : 'auto',
              opacity: canUndo ? 1 : 0.5,
              transition: 'all .15s',
            }}
          >
            ↩
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            title={t('common.redo') || 'Redo'}
            style={{
              padding: mobile ? '8px 10px' : '6px 10px', borderRadius: 6,
              border: `1px solid ${canRedo ? colors.lineGray : '#eee'}`,
              background: canRedo ? '#fff' : '#f8f8f8',
              color: canRedo ? colors.charcoal : '#ccc',
              fontSize: 14, fontWeight: 600,
              cursor: canRedo ? 'pointer' : 'not-allowed',
              fontFamily: fonts.body, minHeight: mobile ? 44 : 'auto',
              opacity: canRedo ? 1 : 0.5,
              transition: 'all .15s',
            }}
          >
            ↪
          </button>
        </div>
        {onEditInBuilder && (
          <button
            onClick={() => onEditInBuilder(rows.filter(r => r.collection && r.quantity))}
            style={{
              padding: mobile ? '8px 12px' : '6px 16px', borderRadius: 8, border: `1px solid ${colors.inkPlum}`,
              background: colors.ice, color: colors.inkPlum, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: fonts.body, minHeight: mobile ? 44 : 'auto',
            }}
          >
            {t('order.editInBuilder') || 'Edit in Builder'}
          </button>
        )}
        {mobile && (
          <button
            onClick={() => setMobileCardView(!mobileCardView)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
              background: mobileCardView ? colors.ice : '#fff', color: colors.charcoal, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: fonts.body, minHeight: 44,
            }}
          >
            {mobileCardView ? t('order.tableView') : t('order.cardView')}
          </button>
        )}
        <div style={{ flex: 1, textAlign: 'center', fontSize: mobile ? 13 : 14, fontWeight: 700, color: colors.inkPlum }}>
          {t('nav.orderform')}
        </div>
        <button
          onClick={() => triggerWithPrepaymentCheck('save')}
          style={{
            padding: mobile ? '10px 16px' : '8px 20px', borderRadius: 8, border: `1px solid ${colors.inkPlum}`,
            background: '#fff', color: colors.inkPlum, fontSize: mobile ? 12 : 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: fonts.body, transition: 'all .15s', minHeight: mobile ? 44 : 'auto',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.ice }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
        >
          {t('order.save')}
        </button>
        <button
          onClick={() => triggerWithPrepaymentCheck('download')}
          style={{
            padding: mobile ? '10px 16px' : '8px 20px', borderRadius: 8, border: `1px solid ${colors.inkPlum}`,
            background: '#fff', color: colors.inkPlum, fontSize: mobile ? 12 : 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: fonts.body, transition: 'all .15s', minHeight: mobile ? 44 : 'auto',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.ice }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
        >
          {t('order.download') || 'Download PDF'}
        </button>
        <button
          onClick={() => triggerWithPrepaymentCheck('print')}
          style={{
            padding: mobile ? '10px 16px' : '8px 24px', borderRadius: 8, border: 'none',
            background: colors.inkPlum, color: '#fff', fontSize: mobile ? 12 : 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: fonts.body, transition: 'opacity .15s', minHeight: mobile ? 44 : 'auto',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
        >
          {t('order.print')}
        </button>
      </div>

      {/* Main content: form pages + calculator */}
      <div id="order-form-scroll-area" ref={scrollAreaRef} style={{ 
        flex: isPrinting ? 'none' : 1, 
        overflow: isPrinting ? 'visible' : 'auto', 
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        padding: isPrinting ? 0 : (mobile ? 12 : 20), 
        display: isPrinting ? 'block' : 'flex', 
        flexDirection: mobile ? 'column' : 'row',
        gap: isPrinting ? 0 : (mobile ? 16 : 20), 
        justifyContent: 'center',
        height: isPrinting ? 'auto' : undefined, 
        alignItems: mobile ? 'stretch' : 'flex-start' 
      }}>

        {/* Pages */}
        <div id="order-form-print" ref={printRef} style={{ display: isPrinting ? 'block' : 'flex', flexDirection: 'column', gap: isPrinting ? 0 : 24 }}>
          {displayPages.map((pageRows, pageIdx) => {
            // When printing, use desktop layout even on mobile (PDF is captured at 1020px)
            const compact = mobile && !isPrinting
            return (
            <div key={pageIdx} className="order-form-page" style={{
              width: '100%',
              maxWidth: 1020,
              background: '#fff',
              borderRadius: 4,
              boxShadow: isPrinting ? 'none' : '0 1px 6px rgba(0,0,0,0.08)',
              padding: compact ? '16px 12px 14px' : '24px 28px 18px',
              boxSizing: 'border-box',
              overflowX: compact ? 'auto' : 'visible',
            }}>
              {/* ─── Page Header ─── */}
              {(pageIdx === 0 || !isPrinting) ? (
              <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 12, gap: compact ? 12 : 16 }}>
                {/* Logo + left header fields */}
                <div style={{ display: 'flex', gap: compact ? 12 : 16, alignItems: 'flex-start', flex: 1 }}>
                  <img src="/logo.png" alt="LoveLab" style={{ height: compact ? 40 : 50, width: 'auto', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={hFieldLabel}>Company Name :</div>
                    <PrintableInput value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={hFieldInput} isPrinting={isPrinting} />
                    <div style={{ ...hFieldLabel, marginTop: 4 }}>Contact Name :</div>
                    <PrintableInput value={contactName} onChange={(e) => setContactName(e.target.value)} style={hFieldInput} isPrinting={isPrinting} />
                    <div style={{ ...hFieldLabel, marginTop: 4 }}>Address :</div>
                    <PrintableInput value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Street address" style={hFieldInput} isPrinting={isPrinting} />
                    <PrintableInput value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Postal code, City" style={{ ...hFieldInput, marginTop: 2 }} isPrinting={isPrinting} />
                    <PrintableInput value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" style={{ ...hFieldInput, marginTop: 2 }} isPrinting={isPrinting} />
                  </div>
                </div>
                {/* Right header fields */}
                <div style={{ minWidth: compact ? 0 : 280, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ flex: 1 }}>
                      <div style={hFieldLabel}>VAT Number :</div>
                      <PrintableInput value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} style={hFieldInput} isPrinting={isPrinting} />
                    </div>
                    {vatValid != null && (
                      <span style={{
                        marginTop: 12,
                        fontSize: 14,
                        color: vatValid ? '#27ae60' : '#c0392b',
                        fontWeight: 700,
                      }}>
                        {vatValid ? '\u2713' : '\u2717'}
                      </span>
                    )}
                  </div>
                  <div>
                    <div style={hFieldLabel}>E-mail :</div>
                    <PrintableInput value={email} onChange={(e) => setEmail(e.target.value)} style={hFieldInput} isPrinting={isPrinting} />
                  </div>
                  <div>
                    <div style={hFieldLabel}>Phone :</div>
                    <PrintableInput value={phone} onChange={(e) => setPhone(e.target.value)} style={hFieldInput} isPrinting={isPrinting} />
                  </div>
                  <div>
                    <div style={hFieldLabel}>Event / Fair :</div>
                    <PrintableInput value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Munich 2026" style={hFieldInput} isPrinting={isPrinting} />
                  </div>
                  <div>
                    <div style={hFieldLabel}>Order by (LoveLab) :</div>
                    <PrintableInput value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} style={hFieldInput} isPrinting={isPrinting} />
                  </div>
                </div>
              </div>
              ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src="/logo.png" alt="LoveLab" style={{ height: 30, width: 'auto' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.charcoal, fontFamily: fonts.body }}>
                    {companyName || 'Order'}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: colors.lovelabMuted, fontFamily: fonts.body }}>
                  Page {pageIdx + 1} of {displayPages.length}
                </span>
              </div>
              )}

              {/* Date & Packaging */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                {/* Page 0: show date input and interactive packaging controls (or plain text when printing) */}
                {pageIdx === 0 && (
                <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabMuted }}>{t('order.date')} :</span>
                  <PrintableInput
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ ...hFieldInput, width: 120, borderBottom: `1px solid ${colors.lineGray}` }}
                    isPrinting={isPrinting}
                  />
                </div>
                {isPrinting ? (
                  /* Print mode: show plain text for packaging and vitrine */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 10, color: colors.lovelabMuted }}>
                      <strong>Packaging:</strong> {packaging}
                    </span>
                    {hasVitrine && (
                      <span style={{ fontSize: 10, color: colors.lovelabMuted }}>
                        <strong>Vitrine:</strong> {vitrineQty}x €{vitrinePrice} = €{(vitrinePrice * vitrineQty).toLocaleString()}
                      </span>
                    )}
                  </div>
                ) : (
                  /* Interactive mode: buttons and inputs */
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabMuted }}>Packaging :</span>
                      {['Black', 'Pink', 'Mix'].map(opt => {
                        const isSelected = packaging === opt
                        const bgColor = opt === 'Black' ? '#222' : opt === 'Pink' ? colors.softPink : '#6b7280'
                        return (
                          <button
                            key={opt}
                            onClick={() => setPackaging(opt)}
                            style={{
                              padding: '4px 10px', borderRadius: 4,
                              border: isSelected ? 'none' : '1px solid #ccc',
                              background: isSelected ? bgColor : '#f0f0f0',
                              color: isSelected ? '#fff' : '#666',
                              fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                            }}
                          >{opt}</button>
                        )
                      })}
                    </div>
                    {/* Vitrine Section */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={hasVitrine}
                          onChange={(e) => setHasVitrine(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabMuted }}>{t('order.vitrine') || 'Vitrine'}</span>
                      </label>
                      {hasVitrine && (
                        <>
                          <span style={{ fontSize: 10, color: colors.lovelabMuted }}>€</span>
                          <PrintableInput
                            type="number"
                            value={vitrinePrice}
                            onChange={(e) => setVitrinePrice(Number(e.target.value) || 0)}
                            style={{
                              width: 60, padding: '2px 6px', borderRadius: 4,
                              border: '1px solid #ddd', fontSize: 10, fontFamily: fonts.body,
                              textAlign: 'right',
                            }}
                            isPrinting={isPrinting}
                          />
                          <span style={{ fontSize: 10, color: colors.lovelabMuted }}>x</span>
                          <select
                            value={vitrineQty}
                            onChange={(e) => setVitrineQty(Number(e.target.value))}
                            style={{
                              padding: '2px 4px', borderRadius: 4,
                              border: '1px solid #ddd', fontSize: 10, fontFamily: fonts.body,
                            }}
                          >
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <span style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabPurple }}>
                            = €{(vitrinePrice * vitrineQty).toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </>
                )}
                </>
                )}
                {/* Pages 1+: always show plain text for packaging (no buttons in preview or print) */}
                {pageIdx > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 10, color: colors.lovelabMuted }}>
                      <strong>Packaging:</strong> {packaging}
                    </span>
                    {hasVitrine && (
                      <span style={{ fontSize: 10, color: colors.lovelabMuted }}>
                        <strong>Vitrine:</strong> {vitrineQty}x €{vitrinePrice} = €{(vitrinePrice * vitrineQty).toLocaleString()}
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: colors.lovelabMuted, marginLeft: 'auto' }}>
                      Page {pageIdx + 1} of {displayPages.length}
                    </span>
                  </div>
                )}
              </div>

              {/* ─── Order Table (Desktop) or Cards (Mobile) ─── */}
              {mobile && mobileCardView && !isPrinting ? (
                /* ─── Mobile Card Layout ─── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pageRows.map((row, rowIdx) => {
                    const globalIdx = pageIdx * ROWS_PER_PAGE + rowIdx
                    const filled = isRowFilled(row)
                    return (
                      <div key={globalIdx} style={{
                        border: `1px solid ${filled ? colors.lineGray : '#f0f0f0'}`,
                        borderRadius: 10,
                        padding: 12,
                        background: filled ? '#fff' : '#fafafa',
                      }}>
                        {/* Card header: row number + total */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#999' }}>#{row.no}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: row.total ? colors.inkPlum : '#ccc' }}>
                            {row.total || '—'}
                          </span>
                        </div>
                        {/* Card fields */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {COLUMNS.filter(col => col.key !== 'no' && col.key !== 'total').map(col => (
                            <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#999', width: 70, textTransform: 'uppercase', flexShrink: 0 }}>
                                {t(col.labelKey)}
                              </span>
                              <input
                                value={row[col.key]}
                                onChange={(e) => updateCell(globalIdx, col.key, e.target.value)}
                                placeholder="—"
                                style={{
                                  flex: 1, border: '1px solid #e8e8e8', borderRadius: 6,
                                  padding: '10px 12px', fontSize: 14, fontFamily: fonts.body,
                                  outline: 'none', color: colors.charcoal, background: '#fff',
                                  minHeight: 44,
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        {/* Card actions */}
                        {filled && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => insertRowBelow(globalIdx)}
                              style={{
                                padding: '8px 14px', borderRadius: 6, border: `1px solid ${colors.lineGray}`,
                                background: '#fff', color: '#666', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: fonts.body, minHeight: 40,
                              }}
                            >+ {t('order.addRow')}</button>
                            <button
                              onClick={() => duplicateRow(globalIdx)}
                              style={{
                                padding: '8px 14px', borderRadius: 6, border: `1px solid ${colors.lineGray}`,
                                background: '#fff', color: '#666', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: fonts.body, minHeight: 40,
                              }}
                            >{t('order.duplicate')}</button>
                            <button
                              onClick={() => deleteRow(globalIdx)}
                              style={{
                                padding: '8px 14px', borderRadius: 6, border: '1px solid #fecaca',
                                background: '#fef2f2', color: '#c0392b', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: fonts.body, minHeight: 40,
                              }}
                            >{t('order.delete')}</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* ─── Table Layout (Desktop or when toggled) ─── */
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: compact ? 700 : 'auto', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                <colgroup>
                  {COLUMNS.map((col) => (
                    <col key={col.key} style={{ width: col.width }} />
                  ))}
                  {!isPrinting && <col className="order-form-dup-col" style={{ width: 72 }} />}
                </colgroup>
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th key={col.key} style={thStyle}>{t(col.labelKey)}</th>
                    ))}
                    {!isPrinting && <th className="order-form-dup-col" style={{ ...thStyle, borderBottom: 'none' }} />}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, rowIdx) => {
                    // When printing, find the real index in the full rows array
                    const globalIdx = isPrinting
                      ? rows.findIndex(r => r === row)
                      : pageIdx * ROWS_PER_PAGE + rowIdx
                    return (
                      <tr key={globalIdx}>
                        {COLUMNS.map((col) => {
                          const isCollectionCol = col.key === 'collection'
                          const isCaratCol = col.key === 'carat'
                          const isShapeCol = col.key === 'shape'
                          const isBpColorCol = col.key === 'bpColor'
                          const isSizeCol = col.key === 'size'
                          const isColorCordCol = col.key === 'colorCord'
                          const rowCol = findCollection(row.collection)
                          const knownCol = (isCaratCol || isShapeCol || isBpColorCol || isSizeCol || isColorCordCol) ? rowCol : null
                          const shapeOptions = isShapeCol && knownCol?.shapes ? knownCol.shapes.map(s => ({ value: s, label: s })) : null
                          const housingOpts = isBpColorCol && knownCol?.housing ? getHousingOptions(knownCol.housing).map(h => ({ value: h, label: h })) : null
                          const sizeOptions = isSizeCol && knownCol?.sizes ? knownCol.sizes.map(s => ({ value: s, label: s })) : null
                          const cordOptions = isColorCordCol && knownCol?.cord ? (CORD_COLORS[knownCol.cord] || []).map(c => ({ value: c.n, label: c.n })) : null
                          return (
                            <td key={col.key} style={{
                              ...tdStyle,
                              borderLeft: col.key === 'no' ? `1px solid ${colors.lineGray}` : 'none',
                              ...(col.key === 'total' ? { borderRight: `1px solid ${colors.lineGray}` } : {}),
                            }}>
                              {isCollectionCol ? (
                                <CellSelect
                                  value={row.collection}
                                  onChange={(val) => updateCell(globalIdx, 'collection', val)}
                                  options={COLLECTIONS.map(c => ({ value: c.label, label: c.label }))}
                                  isPrinting={isPrinting}
                                />
                              ) : isCaratCol && knownCol ? (
                                <CellSelect
                                  value={row.carat}
                                  onChange={(val) => updateCell(globalIdx, 'carat', val)}
                                  options={knownCol.carats.map(c => ({ value: c, label: `${c} ct` }))}
                                  isPrinting={isPrinting}
                                  align="center"
                                />
                              ) : isShapeCol && shapeOptions ? (
                                <CellSelect
                                  value={row.shape}
                                  onChange={(val) => updateCell(globalIdx, 'shape', val)}
                                  options={shapeOptions}
                                  isPrinting={isPrinting}
                                />
                              ) : isBpColorCol && housingOpts && housingOpts.length > 0 ? (
                                <CellSelect
                                  value={row.bpColor}
                                  onChange={(val) => updateCell(globalIdx, 'bpColor', val)}
                                  options={housingOpts}
                                  isPrinting={isPrinting}
                                />
                              ) : isSizeCol && sizeOptions ? (
                                <CellSelect
                                  value={row.size}
                                  onChange={(val) => updateCell(globalIdx, 'size', val)}
                                  options={sizeOptions}
                                  isPrinting={isPrinting}
                                  align="center"
                                />
                              ) : isColorCordCol && cordOptions ? (
                                <CellSelect
                                  value={row.colorCord}
                                  onChange={(val) => updateCell(globalIdx, 'colorCord', val)}
                                  options={cordOptions}
                                  isPrinting={isPrinting}
                                />
                              ) : (
                                <CellInput
                                  value={row[col.key]}
                                  onChange={(val) => updateCell(globalIdx, col.key, val)}
                                  align={['quantity', 'unitPrice', 'total', 'no', 'carat'].includes(col.key) ? 'center' : 'left'}
                                  bold={col.key === 'total'}
                                  color={col.key === 'total' ? colors.inkPlum : colors.charcoal}
                                  isPrinting={isPrinting}
                                />
                              )}
                            </td>
                          )
                        })}
                        {!isPrinting && (
                        <td className="order-form-dup-col" style={{ border: 'none', padding: 0, width: mobile ? 120 : 72, verticalAlign: 'middle' }}>
                          {isRowFilled(row) && (
                            <div style={{ display: 'flex', gap: mobile ? 4 : 2, marginLeft: 3 }}>
                              {/* Add empty row below */}
                              <button
                                onClick={() => insertRowBelow(globalIdx)}
                                title="Add empty row below"
                                style={{
                                  width: mobile ? 36 : 20, height: mobile ? 36 : 20, borderRadius: '50%', border: `1px solid ${colors.lineGray}`,
                                  background: '#fff', color: '#999', fontSize: mobile ? 16 : 13, lineHeight: mobile ? '34px' : '18px',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  padding: 0, fontFamily: fonts.body, transition: 'all .15s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = colors.inkPlum; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = colors.inkPlum }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#999'; e.currentTarget.style.borderColor = colors.lineGray }}
                              >
                                +
                              </button>
                              {/* Duplicate row below */}
                              <button
                                onClick={() => duplicateRow(globalIdx)}
                                title="Duplicate row below"
                                style={{
                                  width: mobile ? 36 : 20, height: mobile ? 36 : 20, borderRadius: '50%', border: `1px solid ${colors.lineGray}`,
                                  background: '#fff', color: '#999', fontSize: mobile ? 14 : 12, lineHeight: mobile ? '34px' : '18px',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  padding: 0, fontFamily: fonts.body, transition: 'all .15s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = colors.inkPlum; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = colors.inkPlum }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#999'; e.currentTarget.style.borderColor = colors.lineGray }}
                              >
                                &#x2750;
                              </button>
                              {/* Delete row */}
                              <button
                                onClick={() => deleteRow(globalIdx)}
                                title="Delete row"
                                style={{
                                  width: mobile ? 36 : 20, height: mobile ? 36 : 20, borderRadius: '50%', border: `1px solid ${colors.lineGray}`,
                                  background: '#fff', color: '#999', fontSize: mobile ? 14 : 12, lineHeight: mobile ? '34px' : '18px',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  padding: 0, fontFamily: fonts.body, transition: 'all .15s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#c0392b'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#c0392b' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#999'; e.currentTarget.style.borderColor = colors.lineGray }}
                              >
                                &#x2715;
                              </button>
                            </div>
                          )}
                        </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              )}

              {/* ─── Remarks + Final Total (always on last page) ─── */}
              {pageIdx === displayPages.length - 1 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  borderTop: `2px solid ${colors.inkPlum}`, marginTop: 0, paddingTop: 8,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, marginBottom: 4 }}>{t('order.remarks')}</div>
                    <PrintableTextarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      style={{
                        width: '80%', minHeight: 40, padding: 6, borderRadius: 4,
                        border: `1px solid ${colors.lineGray}`, fontSize: 10, fontFamily: fonts.body,
                        outline: 'none', resize: 'vertical', color: colors.charcoal, background: 'transparent',
                        boxSizing: 'border-box',
                      }}
                      isPrinting={isPrinting}
                    />
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 200 }}>
                    {/* Final Total (before discount) */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, marginBottom: 4 }}>
                      {afterDiscount != null ? t('order.totalBeforeDiscount') : t('order.finalTotalEuro')}
                    </div>
                    <PrintableInput
                      value={finalTotalOverride != null ? String(finalTotalOverride) : String(subtotal || '')}
                      onChange={(e) => setFinalTotalOverride(Number(e.target.value) || 0)}
                      style={{
                        fontSize: afterDiscount != null ? 14 : 18,
                        fontWeight: 800,
                        color: afterDiscount != null ? colors.lovelabMuted : colors.inkPlum,
                        border: 'none',
                        borderBottom: `2px solid ${afterDiscount != null ? colors.lineGray : colors.inkPlum}`,
                        outline: 'none', textAlign: 'right',
                        fontFamily: fonts.body, background: 'transparent', width: 150,
                        textDecoration: afterDiscount != null ? 'line-through' : 'none',
                      }}
                      isPrinting={isPrinting}
                    />

                    {/* Discount input (hidden in PDF when no discount applied) */}
                    {(!isPrinting || afterDiscount != null) && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: colors.charcoal }}>{t('quote.discount')}:</span>
                      <PrintableInput
                        value={discountDisplay}
                        onChange={(e) => setDiscountDisplay(e.target.value)}
                        placeholder={t('order.discountPlaceholder')}
                        style={{
                          width: 100, padding: '3px 6px', border: 'none',
                          borderBottom: `1px solid ${colors.lineGray}`, outline: 'none',
                          fontFamily: fonts.body, fontSize: 10, color: colors.charcoal,
                          background: 'transparent', boxSizing: 'border-box', textAlign: 'right',
                        }}
                        isPrinting={isPrinting}
                      />
                    </div>
                    )}

                    {/* After Discount total */}
                    {afterDiscount != null && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#27ae60', marginBottom: 4 }}>
                          {t('order.afterDiscount')}
                        </div>
                        <div style={{
                          fontSize: hasVitrine ? 14 : 20,
                          fontWeight: 800,
                          color: hasVitrine ? colors.lovelabMuted : colors.inkPlum,
                          borderBottom: hasVitrine ? 'none' : `2px solid ${colors.inkPlum}`,
                          paddingBottom: 2,
                        }}>
                          {fmt(afterDiscount)}
                        </div>
                      </div>
                    )}

                    {/* Vitrine line item (only if enabled) */}
                    {hasVitrine && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: colors.charcoal, marginBottom: 2 }}>
                          {t('order.vitrine') || 'Vitrine'} x{vitrineQty}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: colors.charcoal }}>
                          + {fmt(vitrineTotal)}
                        </div>
                      </div>
                    )}

                    {/* Grand Total (only if vitrine is added or discount applied) */}
                    {(hasVitrine || afterDiscount != null) && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, marginBottom: 4 }}>
                          {t('order.grandTotal') || 'Grand Total'}
                        </div>
                        <div style={{
                          fontSize: 20, fontWeight: 800, color: colors.inkPlum,
                          borderBottom: `2px solid ${colors.inkPlum}`,
                          paddingBottom: 2,
                        }}>
                          {fmt(grandTotal)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── Prepayment / Discount / Gift (always on last page) ─── */}
              {pageIdx === displayPages.length - 1 && (
                <div style={{
                  display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start',
                  marginTop: 12, padding: '10px 0',
                  borderTop: `1px solid ${colors.lineGray}`,
                }}>
                  {/* Prepayment */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <input
                        type="checkbox"
                        checked={hasPrepayment}
                        onChange={(e) => setHasPrepayment(e.target.checked)}
                        style={{ accentColor: colors.inkPlum, width: 14, height: 14, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 10, fontWeight: 600, color: colors.charcoal, whiteSpace: 'nowrap' }}>Prepayment made</span>
                      {hasPrepayment && (
                        <PrintableInput
                          value={prepaymentAmount}
                          onChange={(e) => setPrepaymentAmount(e.target.value)}
                          placeholder="€ amount"
                          style={{
                            width: 90, padding: '3px 6px', border: 'none',
                            borderBottom: `1px solid ${colors.lineGray}`, outline: 'none',
                            fontFamily: fonts.body, fontSize: 10, color: colors.charcoal,
                            background: 'transparent', boxSizing: 'border-box',
                          }}
                          isPrinting={isPrinting}
                        />
                      )}
                      {['SumUp', 'N26 (transfer)', 'Revolut'].map(m => (
                        <button
                          key={m}
                          onClick={() => setPrepaymentMethod(prev => prev === m ? '' : m)}
                          style={{
                            fontSize: 9, padding: '2px 7px', borderRadius: 10,
                            border: `1px solid ${prepaymentMethod === m ? colors.inkPlum : '#ccc'}`,
                            background: prepaymentMethod === m ? colors.inkPlum : 'transparent',
                            color: prepaymentMethod === m ? '#fff' : colors.charcoal,
                            cursor: 'pointer', fontFamily: fonts.body,
                            lineHeight: 1.4, whiteSpace: 'nowrap',
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    {/* N26 bank wire coordinates — visible on screen and in print */}
                    {prepaymentMethod === 'N26 (transfer)' && (
                      <div style={{
                        marginLeft: 20,
                        padding: '6px 10px',
                        borderLeft: `2px solid ${colors.inkPlum}`,
                        background: isPrinting ? 'transparent' : 'rgba(93,58,94,0.04)',
                        borderRadius: isPrinting ? 0 : 4,
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: colors.charcoal, marginBottom: 2 }}>
                          Beneficiary: Elie Schonfeld
                        </div>
                        <div style={{ fontSize: 9, color: colors.charcoal, lineHeight: 1.6 }}>
                          BANK: N26 &nbsp;|&nbsp; BIC: NTSBDEB1XXX
                        </div>
                        <div style={{ fontSize: 9, color: colors.charcoal, lineHeight: 1.6 }}>
                          IBAN: DE11 1001 1001 2301 0675 66
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── Footer (always on last page) ─── */}
              {pageIdx === displayPages.length - 1 && (
                <div style={{ marginTop: 16 }}>
                  {/* Legal text */}
                  <div style={{ fontSize: 8, color: colors.lovelabMuted, lineHeight: 1.6, marginBottom: 16 }}>
                    {t('order.legalDeliveryVat')}<br />
                    {t('order.paymentTerms')}
                  </div>

                  {/* Signatures */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ width: '40%' }}>
                      <div style={{ fontSize: 9, fontWeight: 600, fontStyle: 'italic', color: colors.charcoal, marginBottom: 4 }}>Signature</div>
                      <div style={{ borderBottom: `1px solid ${colors.lineGray}`, height: 40 }} />
                    </div>
                    <div style={{ width: '40%' }}>
                      <div style={{ fontSize: 9, fontWeight: 600, fontStyle: 'italic', color: colors.charcoal, marginBottom: 4, textAlign: 'right' }}>LoveLab Signature</div>
                      <div style={{ borderBottom: `1px solid ${colors.lineGray}`, height: 40 }} />
                    </div>
                  </div>

                  {/* Company footer */}
                  <div style={{
                    borderTop: `1px solid ${colors.lineGray}`,
                    paddingTop: 8,
                    textAlign: 'center',
                    fontSize: 7,
                    color: colors.lovelabMuted,
                    letterSpacing: '0.02em',
                    lineHeight: 1.6,
                  }}>
                    LOVELAB - The Love Group BV - Schupstraat 20, 2018 Antwerpen, Belgium &nbsp;&nbsp; VAT:BE1017670055 &nbsp;&nbsp; hello@love-lab.com &nbsp;&nbsp; www.love-lab.com
                  </div>
                </div>
              )}

              {/* ─── Page Number Footer (all pages during printing) ─── */}
              {isPrinting && (
                <div style={{
                  marginTop: 12,
                  paddingTop: 8,
                  borderTop: pageIdx < displayPages.length - 1 ? `1px solid ${colors.lineGray}` : 'none',
                  textAlign: 'center',
                  fontSize: 8,
                  color: colors.lovelabMuted,
                }}>
                  Page {pageIdx + 1} of {displayPages.length}
                </div>
              )}
            </div>
          )})}

          {/* Add page button (hidden in print) */}
          {!isPrinting && (
          <button
            className="order-form-add-page"
            onClick={addPage}
            style={{
              width: '100%', maxWidth: 1020, padding: 12, borderRadius: 8, border: `1.5px dashed ${colors.lineGray}`,
              background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: '#888', fontFamily: fonts.body, marginBottom: 40, transition: 'all .12s',
              minHeight: mobile ? 48 : 'auto',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.color = colors.inkPlum }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.lineGray; e.currentTarget.style.color = '#888' }}
          >
            + Add another page (10 rows)
          </button>
          )}
        </div>

        {/* Side Calculator */}
        <Calculator subtotal={subtotal} onApplyToForm={handleApplyFromCalc} mobile={mobile} />
      </div>
    </div>
  )
}

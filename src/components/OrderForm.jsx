import { useState, useCallback, useMemo, useRef } from 'react'
import { colors, fonts } from '../lib/styles'
import { fmt, today } from '../lib/utils'
import { COLLECTIONS } from '../lib/catalog'

const ROWS_PER_PAGE = 10

const COLUMNS = [
  { key: 'no', label: 'No.', width: 30 },
  { key: 'quantity', label: 'Quantity', width: 52 },
  { key: 'collection', label: 'Collection', width: 100 },
  { key: 'carat', label: 'Carat (ct)', width: 58 },
  { key: 'shape', label: 'Shape', width: 64 },
  { key: 'bpColor', label: 'B / P / Color', width: 76 },
  { key: 'size', label: 'Size', width: 44 },
  { key: 'colorCord', label: 'Color Cord', width: 90 },
  { key: 'unitPrice', label: 'Unit Price (€)', width: 74 },
  { key: 'total', label: 'Total (€)', width: 74 },
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

  // Pad to fill complete pages (minimum ROWS_PER_PAGE)
  const totalNeeded = Math.max(ROWS_PER_PAGE, Math.ceil(rows.length / ROWS_PER_PAGE) * ROWS_PER_PAGE)
  while (rows.length < totalNeeded) {
    rows.push(emptyRow(rows.length + 1))
  }
  return rows
}

// ─── Cell input ───
function CellInput({ value, onChange, width, align, bold, color: clr }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        border: 'none',
        outline: 'none',
        background: 'transparent',
        fontFamily: fonts.body,
        fontSize: 11,
        padding: '4px 4px',
        textAlign: align || 'left',
        fontWeight: bold ? 700 : 400,
        color: clr || colors.charcoal,
        boxSizing: 'border-box',
      }}
    />
  )
}

// ─── Side Calculator ───
function Calculator({ subtotal, onFinalTotalChange }) {
  const [discountPct, setDiscountPct] = useState('')
  const [discountFlat, setDiscountFlat] = useState('')
  const [deliveryCost, setDeliveryCost] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [customAmount, setCustomAmount] = useState('')

  const calc = useMemo(() => {
    const sub = Number(subtotal) || 0
    const pctOff = sub * (Number(discountPct) || 0) / 100
    const flatOff = Number(discountFlat) || 0
    const delivery = Number(deliveryCost) || 0
    const custom = Number(customAmount) || 0
    const totalDiscount = pctOff + flatOff
    const final = sub - totalDiscount + delivery + custom
    return { sub, pctOff, flatOff, totalDiscount, delivery, custom, final }
  }, [subtotal, discountPct, discountFlat, deliveryCost, customAmount])

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
      width: 240,
      flexShrink: 0,
      background: '#fff',
      borderRadius: 12,
      border: `1px solid ${colors.lineGray}`,
      padding: 16,
      height: 'fit-content',
      position: 'sticky',
      top: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, marginBottom: 12 }}>
        Calculator
      </div>

      <div style={{ fontSize: 11, color: colors.charcoal, display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
        <span>Subtotal</span>
        <span style={{ fontWeight: 600 }}>{fmt(calc.sub)}</span>
      </div>

      <div style={calcLabel}>Extra discount %</div>
      <input type="number" min="0" max="100" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} placeholder="0" style={calcInput} />
      {calc.pctOff > 0 && (
        <div style={{ fontSize: 10, color: '#c0392b', textAlign: 'right', marginTop: 2 }}>-{fmt(calc.pctOff)}</div>
      )}

      <div style={calcLabel}>Flat discount (€)</div>
      <input type="number" min="0" value={discountFlat} onChange={(e) => setDiscountFlat(e.target.value)} placeholder="0" style={calcInput} />

      <div style={calcLabel}>Delivery cost (€)</div>
      <input type="number" min="0" value={deliveryCost} onChange={(e) => setDeliveryCost(e.target.value)} placeholder="0" style={calcInput} />

      <div style={calcLabel}>Custom adjustment</div>
      <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Label (optional)" style={{ ...calcInput, marginBottom: 4 }} />
      <input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="€ amount (+/-)" style={calcInput} />

      {/* Summary */}
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${colors.lineGray}` }}>
        {calc.totalDiscount > 0 && (
          <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#c0392b' }}>
            <span>Discount</span><span>-{fmt(calc.totalDiscount)}</span>
          </div>
        )}
        {calc.delivery > 0 && (
          <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: colors.charcoal }}>
            <span>Delivery</span><span>+{fmt(calc.delivery)}</span>
          </div>
        )}
        {calc.custom !== 0 && (
          <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: colors.charcoal }}>
            <span>{customLabel || 'Adjustment'}</span><span>{calc.custom > 0 ? '+' : ''}{fmt(calc.custom)}</span>
          </div>
        )}
        <div style={{
          fontSize: 16, fontWeight: 800, display: 'flex', justifyContent: 'space-between',
          padding: '8px 0 4px', borderTop: `1px solid ${colors.lineGray}`, marginTop: 6, color: colors.inkPlum,
        }}>
          <span>Final Total</span><span>{fmt(calc.final)}</span>
        </div>
      </div>

      <button
        onClick={() => onFinalTotalChange(calc.final)}
        style={{
          width: '100%', marginTop: 10, padding: 10, borderRadius: 8, border: 'none',
          background: colors.inkPlum, color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: fonts.body, transition: 'opacity .15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
      >
        Apply to Form
      </button>
    </div>
  )
}

// ═══ MAIN ORDER FORM ═══
export default function OrderForm({ quote, client, onClose }) {
  const printRef = useRef(null)

  // Client info state (editable)
  const [companyName, setCompanyName] = useState(client?.company || '')
  const [address, setAddress] = useState(
    [client?.address, [client?.zip, client?.city].filter(Boolean).join(' '), client?.country].filter(Boolean).join(', ')
  )
  const [vatNumber, setVatNumber] = useState(client?.vat || '')
  const vatValid = client?.vatValid
  const [email, setEmail] = useState(client?.email || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [date, setDate] = useState(today())
  const [packaging, setPackaging] = useState('Black')  // Black or Pink
  const [remarks, setRemarks] = useState('')

  // Prepayment & discount state
  const [hasPrepayment, setHasPrepayment] = useState(false)
  const [prepaymentAmount, setPrepaymentAmount] = useState('')
  const [discountDisplay, setDiscountDisplay] = useState('')      // e.g. "10%" or "€500"

  // Table rows state
  const [rows, setRows] = useState(() => prefillRows(quote))

  // Final total override from calculator
  const [finalTotalOverride, setFinalTotalOverride] = useState(null)

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

  // Split rows into pages
  const pages = useMemo(() => {
    const p = []
    for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
      p.push(rows.slice(i, i + ROWS_PER_PAGE))
    }
    return p
  }, [rows])

  const handlePrint = () => {
    window.print()
  }

  const handleFinalTotalFromCalc = useCallback((val) => {
    setFinalTotalOverride(val)
  }, [])

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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: '#f0eeec',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Print-only styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #order-form-print, #order-form-print * { visibility: visible !important; }
          #order-form-print {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: #fff !important;
          }
          .order-form-calculator, .order-form-toolbar, .order-form-add-page, .order-form-dup-col {
            display: none !important;
          }
          .order-form-page {
            page-break-after: always;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
            width: 100% !important;
            padding: 0 !important;
          }
          .order-form-page:last-child {
            page-break-after: auto;
          }
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      `}</style>

      {/* Toolbar (hidden in print) */}
      <div className="order-form-toolbar" style={{
        background: '#fff', borderBottom: `1px solid ${colors.lineGray}`,
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            padding: '6px 16px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
            background: '#fff', color: colors.charcoal, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: fonts.body,
          }}
        >
          &larr; Back
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>
          Order Form
        </div>
        <button
          onClick={handlePrint}
          style={{
            padding: '8px 24px', borderRadius: 8, border: 'none',
            background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: fonts.body, transition: 'opacity .15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
        >
          Print Order Form
        </button>
      </div>

      {/* Main content: form pages + calculator */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'flex-start' }}>

        {/* Pages */}
        <div id="order-form-print" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {pages.map((pageRows, pageIdx) => (
            <div key={pageIdx} className="order-form-page" style={{
              width: 760,
              background: '#fff',
              borderRadius: 4,
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
              padding: '24px 28px 18px',
              boxSizing: 'border-box',
            }}>
              {/* ─── Page Header ─── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                {/* Logo + left header fields */}
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                  <img src="/logo.png" alt="LoveLab" style={{ height: 56, width: 'auto' }} />
                  <div style={{ minWidth: 200 }}>
                    <div style={hFieldLabel}>Company Name :</div>
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={hFieldInput} />
                    <div style={{ ...hFieldLabel, marginTop: 6 }}>Address :</div>
                    <input value={address} onChange={(e) => setAddress(e.target.value)} style={hFieldInput} />
                  </div>
                </div>
                {/* Right header fields */}
                <div style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ flex: 1 }}>
                      <div style={hFieldLabel}>VAT Number :</div>
                      <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} style={hFieldInput} />
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
                    <input value={email} onChange={(e) => setEmail(e.target.value)} style={hFieldInput} />
                  </div>
                  <div>
                    <div style={hFieldLabel}>Phone :</div>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} style={hFieldInput} />
                  </div>
                </div>
              </div>

              {/* Date & Packaging */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabMuted }}>Date :</span>
                  <input
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ ...hFieldInput, width: 120, borderBottom: `1px solid ${colors.lineGray}` }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabMuted }}>Packaging :</span>
                  <button
                    onClick={() => setPackaging('Black')}
                    style={{
                      padding: '4px 10px', borderRadius: 4, border: 'none',
                      background: packaging === 'Black' ? '#222' : '#f0f0f0',
                      color: packaging === 'Black' ? '#fff' : '#666',
                      fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                    }}
                  >Black</button>
                  <button
                    onClick={() => setPackaging('Pink')}
                    style={{
                      padding: '4px 10px', borderRadius: 4, border: 'none',
                      background: packaging === 'Pink' ? colors.softPink : '#f0f0f0',
                      color: packaging === 'Pink' ? '#fff' : '#666',
                      fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
                    }}
                  >Pink</button>
                </div>
                {pageIdx > 0 && (
                  <span style={{ fontSize: 9, color: colors.lovelabMuted, marginLeft: 'auto' }}>
                    Page {pageIdx + 1} of {pages.length}
                  </span>
                )}
              </div>

              {/* ─── Order Table ─── */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                <colgroup>
                  {COLUMNS.map((col) => (
                    <col key={col.key} style={{ width: col.width }} />
                  ))}
                  <col className="order-form-dup-col" style={{ width: 72 }} />
                </colgroup>
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th key={col.key} style={thStyle}>{col.label}</th>
                    ))}
                    <th className="order-form-dup-col" style={{ ...thStyle, borderBottom: 'none' }} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, rowIdx) => {
                    const globalIdx = pageIdx * ROWS_PER_PAGE + rowIdx
                    return (
                      <tr key={globalIdx}>
                        {COLUMNS.map((col) => (
                          <td key={col.key} style={{
                            ...tdStyle,
                            borderLeft: col.key === 'no' ? `1px solid ${colors.lineGray}` : 'none',
                            ...(col.key === 'total' ? { borderRight: `1px solid ${colors.lineGray}` } : {}),
                          }}>
                            <CellInput
                              value={row[col.key]}
                              onChange={(val) => updateCell(globalIdx, col.key, val)}
                              align={['quantity', 'unitPrice', 'total', 'no', 'carat'].includes(col.key) ? 'center' : 'left'}
                              bold={col.key === 'total'}
                              color={col.key === 'total' ? colors.inkPlum : colors.charcoal}
                            />
                          </td>
                        ))}
                        <td className="order-form-dup-col" style={{ border: 'none', padding: 0, width: 72, verticalAlign: 'middle' }}>
                          {isRowFilled(row) && (
                            <div style={{ display: 'flex', gap: 2, marginLeft: 3 }}>
                              {/* Add empty row below */}
                              <button
                                onClick={() => insertRowBelow(globalIdx)}
                                title="Add empty row below"
                                style={{
                                  width: 20, height: 20, borderRadius: '50%', border: `1px solid ${colors.lineGray}`,
                                  background: '#fff', color: '#999', fontSize: 13, lineHeight: '18px',
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
                                  width: 20, height: 20, borderRadius: '50%', border: `1px solid ${colors.lineGray}`,
                                  background: '#fff', color: '#999', fontSize: 12, lineHeight: '18px',
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
                                  width: 20, height: 20, borderRadius: '50%', border: `1px solid ${colors.lineGray}`,
                                  background: '#fff', color: '#999', fontSize: 12, lineHeight: '18px',
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* ─── Remarks + Final Total (last page only) ─── */}
              {pageIdx === pages.length - 1 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  borderTop: `2px solid ${colors.inkPlum}`, marginTop: 0, paddingTop: 8,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, marginBottom: 4 }}>Remarks</div>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      style={{
                        width: '80%', minHeight: 40, padding: 6, borderRadius: 4,
                        border: `1px solid ${colors.lineGray}`, fontSize: 10, fontFamily: fonts.body,
                        outline: 'none', resize: 'vertical', color: colors.charcoal, background: 'transparent',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 200 }}>
                    {/* Final Total (before discount) */}
                    <div style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, marginBottom: 4 }}>
                      {afterDiscount != null ? 'Total Before Discount (€)' : 'Final Total (€)'}
                    </div>
                    <input
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
                    />

                    {/* Discount input */}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: colors.charcoal }}>Discount:</span>
                      <input
                        value={discountDisplay}
                        onChange={(e) => setDiscountDisplay(e.target.value)}
                        placeholder="e.g. 10% or €500"
                        style={{
                          width: 100, padding: '3px 6px', border: 'none',
                          borderBottom: `1px solid ${colors.lineGray}`, outline: 'none',
                          fontFamily: fonts.body, fontSize: 10, color: colors.charcoal,
                          background: 'transparent', boxSizing: 'border-box', textAlign: 'right',
                        }}
                      />
                    </div>

                    {/* After Discount total */}
                    {afterDiscount != null && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#27ae60', marginBottom: 4 }}>
                          After Discount (€)
                        </div>
                        <div style={{
                          fontSize: 20, fontWeight: 800, color: colors.inkPlum,
                          borderBottom: `2px solid ${colors.inkPlum}`,
                          paddingBottom: 2,
                        }}>
                          {fmt(afterDiscount)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── Prepayment / Discount / Gift (last page only) ─── */}
              {pageIdx === pages.length - 1 && (
                <div style={{
                  display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start',
                  marginTop: 12, padding: '10px 0',
                  borderTop: `1px solid ${colors.lineGray}`,
                }}>
                  {/* Prepayment */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 200 }}>
                    <input
                      type="checkbox"
                      checked={hasPrepayment}
                      onChange={(e) => setHasPrepayment(e.target.checked)}
                      style={{ accentColor: colors.inkPlum, width: 14, height: 14, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 600, color: colors.charcoal, whiteSpace: 'nowrap' }}>Prepayment made</span>
                    {hasPrepayment && (
                      <input
                        value={prepaymentAmount}
                        onChange={(e) => setPrepaymentAmount(e.target.value)}
                        placeholder="€ amount"
                        style={{
                          width: 90, padding: '3px 6px', border: 'none',
                          borderBottom: `1px solid ${colors.lineGray}`, outline: 'none',
                          fontFamily: fonts.body, fontSize: 10, color: colors.charcoal,
                          background: 'transparent', boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* ─── Footer (last page only) ─── */}
              {pageIdx === pages.length - 1 && (
                <div style={{ marginTop: 16 }}>
                  {/* Legal text */}
                  <div style={{ fontSize: 8, color: colors.lovelabMuted, lineHeight: 1.6, marginBottom: 16 }}>
                    Delivery costs will be added to the final invoice. VAT will be applied where required.<br />
                    Payment terms: 50% upon order confirmation and 50% prior to delivery (within 14 working days).
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
            </div>
          ))}

          {/* Add page button (hidden in print) */}
          <button
            className="order-form-add-page"
            onClick={addPage}
            style={{
              width: 760, padding: 12, borderRadius: 8, border: `1.5px dashed ${colors.lineGray}`,
              background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: '#888', fontFamily: fonts.body, marginBottom: 40, transition: 'all .12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.color = colors.inkPlum }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.lineGray; e.currentTarget.style.color = '#888' }}
          >
            + Add another page (10 rows)
          </button>
        </div>

        {/* Side Calculator */}
        <Calculator subtotal={subtotal} onFinalTotalChange={handleFinalTotalFromCalc} />
      </div>
    </div>
  )
}

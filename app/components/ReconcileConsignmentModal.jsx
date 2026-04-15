'use client'

import { useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { getConsignmentRows, rowDescription, rowSpecs } from '@/lib/consignment'

/**
 * ReconcileConsignmentModal
 *
 * Opens when the admin clicks "Returned" on a consignment order.
 *
 * For each item row the admin sees:
 *   - Full product description (collection · carat · shape · setting · material)
 *   - Key specs (color, cord, size)
 *   - Sent qty
 *   - "Came Back" number input (pre-filled = sent qty — assume all returned)
 *   - When Came Back < Sent:
 *       · "Sold" input  (0 .. missing, generates B2B invoice)
 *       · "Lost/Damaged" = auto-derived (missing − sold, noted but no invoice)
 *
 * On confirm:
 *   1. PATCH consignment: returned_at + reconciliation array (includes sold + lost per row)
 *   2. If any sold > 0: POST new B2B order with sold rows only → buyer contact info required
 *
 * Props:
 *   order       — consignment document
 *   onClose     — () => void
 *   onConfirmed — ({ updatedOrder, invoiceId? }) => void
 */
export default function ReconcileConsignmentModal({ order, onClose, onConfirmed }) {
  const existingConsignment = order?.metadata?.consignment || {}
  const existingFormState = order?.metadata?.formState || {}

  // Each entry: { row, sentQty, cameBack, soldQty }
  // getConsignmentRows is inlined here — sourceRows only seeds the initial state once
  const [items, setItems] = useState(() =>
    getConsignmentRows(order).map(row => ({
      row,
      sentQty: Math.max(1, Number(row.quantity) || 1),
      cameBack: Math.max(1, Number(row.quantity) || 1), // default: everything returned
      soldQty: 0,
    }))
  )

  // Client info for the auto-created B2B invoice (pre-filled from order)
  const [client, setClient] = useState({
    contactName: existingFormState.contactName || order.client_name || existingConsignment.recipient_name || '',
    companyName: existingFormState.companyName || order.client_company || existingConsignment.recipient_company || '',
    email: existingFormState.email || existingConsignment.recipient_email || '',
    phone: existingFormState.phone || existingConsignment.recipient_phone || '',
    addressLine1: existingFormState.addressLine1 || existingConsignment.recipient_address || '',
    addressLine2: existingFormState.addressLine2 || '',
    country: existingFormState.country || '',
    vatNumber: existingFormState.vatNumber || '',
  })

  const [step, setStep] = useState(1) // 1 = quantities, 2 = client details
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // ── Derived ──────────────────────────────────────────────────────────────
  const anySold = items.some(i => i.soldQty > 0)
  const anyMissing = items.some(i => i.cameBack < i.sentQty)

  const soldValue = items.reduce((acc, i) => {
    return acc + i.soldQty * (Number(i.row.unitPrice) || 0)
  }, 0)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const setCameBack = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const cb = Math.max(0, Math.min(item.sentQty, Number(val) || 0))
      const missing = item.sentQty - cb
      return {
        ...item,
        cameBack: cb,
        soldQty: Math.min(item.soldQty, missing), // clamp sold to new missing
      }
    }))
  }

  const setSoldQty = (idx, val) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const missing = item.sentQty - item.cameBack
      const sq = Math.max(0, Math.min(missing, Number(val) || 0))
      return { ...item, soldQty: sq }
    }))
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const validateQuantities = () => {
    for (const item of items) {
      const missing = item.sentQty - item.cameBack
      if (item.soldQty > missing) {
        return `Sold qty cannot exceed missing qty for row ${item.row.no}`
      }
    }
    return null
  }

  const validateClient = () => {
    if (!anySold) return null
    if (!client.contactName.trim()) {
      return 'Please enter the contact name for the B2B invoice'
    }
    if (!client.companyName.trim()) {
      return 'Please enter the company name for the B2B invoice'
    }
    if (!client.addressLine1.trim()) {
      return 'Please enter the billing street address for the B2B invoice'
    }
    if (!client.addressLine2.trim()) {
      return 'Please enter city / ZIP for the B2B invoice'
    }
    if (!client.country.trim()) {
      return 'Please enter the billing country for the B2B invoice'
    }
    return null
  }

  const handleNextStep = () => {
    const err = validateQuantities()
    if (err) { setError(err); return }
    setError(null)
    if (anySold) {
      setStep(2)
    } else {
      handleConfirm()
    }
  }

  // ── Format ────────────────────────────────────────────────────────────────
  const fmt = (n) => {
    if (n == null || isNaN(n)) return '—'
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    const validationError = validateClient()
    if (validationError) { setError(validationError); return }

    setSaving(true)
    setError(null)

    try {
      const reconciliation = items.map(item => {
        const missing = item.sentQty - item.cameBack
        const lost = missing - item.soldQty
        return {
          row_no: item.row.no,
          description: rowDescription(item.row),
          specs: rowSpecs(item.row),
          sent: item.sentQty,
          came_back: item.cameBack,
          sold: item.soldQty,
          lost,
          unit_price: Number(item.row.unitPrice) || 0,
        }
      })

      const res = await fetch('/api/consignment/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          reconciliation,
          client: anySold ? client : null,
          sold_value: soldValue,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Reconciliation failed')

      const updatedOrder = data.document || {
        ...order,
        metadata: {
          ...(order.metadata || {}),
          consignment: {
            ...existingConsignment,
            returned_at: new Date().toISOString(),
            reconciliation,
            ...(data.invoice_id ? { invoice_document_id: data.invoice_id } : {}),
          },
        },
      }

      onConfirmed({ updatedOrder, invoiceId: data.invoice_id })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    }

    setSaving(false)
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const inputNum = {
    width: 56,
    padding: '5px 8px',
    borderRadius: 7,
    border: `1px solid ${colors.lineGray}`,
    fontSize: 13,
    fontFamily: fonts.body,
    textAlign: 'center',
    outline: 'none',
    fontWeight: 700,
    boxSizing: 'border-box',
  }
  const inputText = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 7,
    border: `1px solid ${colors.lineGray}`,
    fontSize: 13,
    fontFamily: fonts.body,
    outline: 'none',
    boxSizing: 'border-box',
  }
  const lbl = {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    color: colors.lovelabMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 800,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          width: '100%', maxWidth: 700, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          fontFamily: fonts.body,
          overflow: 'hidden',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${colors.lineGray}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: colors.inkPlum }}>
                  {step === 1 ? 'Reconcile / Mark as Sold' : 'Confirm Customer Details'}
                </h2>
                {anySold && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2].map(n => (
                      <div key={n} style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: step >= n ? colors.inkPlum : '#e5e5e5',
                        color: step >= n ? '#fff' : '#aaa',
                        fontSize: 10, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{n}</div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                {step === 1
                  ? `${order.client_name || order.file_name || 'Consignment order'} — confirm what came back, what was sold, and what was lost`
                  : 'Review and confirm the customer details for the B2B invoice before it is created.'
                }
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: 22, color: '#bbb', cursor: 'pointer', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>

          {/* ── Step 2: Client details ── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#faf5ff', border: `1px solid ${colors.inkPlum}25`, borderRadius: 10, fontSize: 12, color: '#555' }}>
                <strong style={{ color: colors.inkPlum }}>Invoice summary:</strong>
                {' '}{items.reduce((a, i) => a + i.soldQty, 0)} item{items.reduce((a, i) => a + i.soldQty, 0) !== 1 ? 's' : ''} sold · <strong>{fmt(soldValue)}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>Contact name *</label>
                  <input style={inputText} value={client.contactName} onChange={e => setClient(c => ({ ...c, contactName: e.target.value }))} placeholder="Jane Smith" autoFocus />
                </div>
                <div>
                  <label style={lbl}>Company name *</label>
                  <input style={inputText} value={client.companyName} onChange={e => setClient(c => ({ ...c, companyName: e.target.value }))} placeholder="Bijouterie Martin" />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input type="email" style={inputText} value={client.email} onChange={e => setClient(c => ({ ...c, email: e.target.value }))} placeholder="jane@example.com" />
                </div>
                <div>
                  <label style={lbl}>Phone</label>
                  <input style={inputText} value={client.phone} onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} placeholder="+33 6 00 00 00 00" />
                </div>
                <div>
                  <label style={lbl}>Street address *</label>
                  <input style={inputText} value={client.addressLine1} onChange={e => setClient(c => ({ ...c, addressLine1: e.target.value }))} placeholder="12 Rue de la Paix" />
                </div>
                <div>
                  <label style={lbl}>City / ZIP *</label>
                  <input style={inputText} value={client.addressLine2} onChange={e => setClient(c => ({ ...c, addressLine2: e.target.value }))} placeholder="75002 Paris" />
                </div>
                <div>
                  <label style={lbl}>Country *</label>
                  <input style={inputText} value={client.country} onChange={e => setClient(c => ({ ...c, country: e.target.value }))} placeholder="France" />
                </div>
                <div>
                  <label style={lbl}>VAT number</label>
                  <input style={inputText} value={client.vatNumber} onChange={e => setClient(c => ({ ...c, vatNumber: e.target.value }))} placeholder="FR12345678901" />
                </div>
              </div>
              {error && (
                <div style={{ marginTop: 14, padding: '9px 12px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 1 && items.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📦</div>
              No item rows found on this order.
              <br />
              Click <strong>Confirm Return</strong> to mark it as returned.
            </div>
          ) : step === 1 ? (
            <>
              {/* Legend */}
              <div style={{ marginBottom: 14, fontSize: 12, color: '#888', background: '#faf8fc', borderRadius: 8, padding: '8px 12px', lineHeight: 1.5 }}>
                Default: everything came back. Reduce <strong>Came Back</strong> for any item that didn't return fully — then specify how much was <strong>sold</strong> vs <strong>lost / damaged</strong>.
              </div>

              {/* Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((item, idx) => {
                  const missing = item.sentQty - item.cameBack
                  const lost = missing - item.soldQty
                  const desc = rowDescription(item.row)
                  const specs = rowSpecs(item.row)
                  const hasIssue = missing > 0
                  const isActive = hasIssue

                  return (
                    <div
                      key={idx}
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${isActive ? colors.inkPlum + '40' : colors.lineGray}`,
                        background: isActive ? '#fdf9ff' : '#fff',
                        padding: '12px 14px',
                        transition: 'all .1s',
                      }}
                    >
                      {/* Top row: description + controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {/* Item description */}
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ fontWeight: 700, color: '#222', fontSize: 13 }}>{desc}</div>
                          {specs && <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{specs}</div>}
                          {item.row.unitPrice && (
                            <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 1 }}>
                              {fmt(Number(item.row.unitPrice))} / unit
                            </div>
                          )}
                        </div>

                        {/* Sent */}
                        <div style={{ textAlign: 'center', minWidth: 44 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Sent</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#555' }}>{item.sentQty}</div>
                        </div>

                        {/* Came Back (input) */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Came Back</div>
                          <input
                            type="number"
                            min={0}
                            max={item.sentQty}
                            value={item.cameBack}
                            onChange={e => setCameBack(idx, e.target.value)}
                            style={{
                              ...inputNum,
                              border: `1.5px solid ${hasIssue ? colors.inkPlum : colors.lineGray}`,
                              color: hasIssue ? colors.inkPlum : '#333',
                            }}
                          />
                        </div>

                        {/* Missing breakdown — only when something is missing */}
                        {hasIssue && (
                          <>
                            <div style={{ fontSize: 11, color: '#bbb', alignSelf: 'center', marginTop: 8 }}>→</div>

                            {/* Sold */}
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Sold</div>
                              <input
                                type="number"
                                min={0}
                                max={missing}
                                value={item.soldQty}
                                onChange={e => setSoldQty(idx, e.target.value)}
                                style={{
                                  ...inputNum,
                                  border: `1.5px solid ${item.soldQty > 0 ? '#d97706' : colors.lineGray}`,
                                  color: item.soldQty > 0 ? '#d97706' : '#aaa',
                                }}
                                placeholder="0"
                              />
                            </div>

                            {/* Lost (auto) */}
                            <div style={{ textAlign: 'center', minWidth: 44 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Lost</div>
                              <div style={{
                                width: 56, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 16, fontWeight: 800,
                                color: lost > 0 ? '#dc2626' : '#ccc',
                              }}>
                                {lost}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Missing summary */}
                      {hasIssue && (
                        <div style={{ marginTop: 8, fontSize: 11, color: '#888', borderTop: `1px dashed ${colors.lineGray}`, paddingTop: 6 }}>
                          {missing} missing:{' '}
                          {item.soldQty > 0 && <span style={{ color: '#d97706', fontWeight: 600 }}>{item.soldQty} sold ({fmt(item.soldQty * Number(item.row.unitPrice || 0))})</span>}
                          {item.soldQty > 0 && lost > 0 && <span style={{ color: '#bbb' }}> · </span>}
                          {lost > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>{lost} lost/damaged</span>}
                          {item.soldQty === 0 && lost === 0 && <span style={{ color: '#aaa', fontStyle: 'italic' }}>specify sold / lost above</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Summary banner when anything is missing */}
              {anyMissing && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: '#faf5ff', border: `1px solid ${colors.inkPlum}25`, borderRadius: 10, fontSize: 12, color: '#555' }}>
                  <strong style={{ color: colors.inkPlum }}>Summary:</strong>
                  {' '}
                  {items.reduce((a, i) => a + i.cameBack, 0)} items back
                  {anySold && <> · <span style={{ color: '#d97706', fontWeight: 700 }}>{items.reduce((a, i) => a + i.soldQty, 0)} sold ({fmt(soldValue)})</span></>}
                  {items.some(i => i.sentQty - i.cameBack - i.soldQty > 0) && (
                    <> · <span style={{ color: '#dc2626', fontWeight: 700 }}>{items.reduce((a, i) => a + Math.max(0, i.sentQty - i.cameBack - i.soldQty), 0)} lost/damaged</span></>
                  )}
                </div>
              )}

            </>
          ) : null}

          {step === 1 && error && (
            <div style={{ marginTop: 14, padding: '9px 12px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div style={{
          padding: '16px 24px', borderTop: `1px solid ${colors.lineGray}`,
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          flexShrink: 0, background: '#faf8fc',
        }}>
          {step === 2 && (
            <button
              onClick={() => { setStep(1); setError(null) }}
              disabled={saving}
              style={{
                padding: '10px 18px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
                background: '#fff', color: '#555', fontSize: 13, cursor: 'pointer',
                fontFamily: fonts.body, fontWeight: 600, marginRight: 'auto',
              }}
            >
              ← Back
            </button>
          )}
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '10px 18px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
              background: '#fff', color: '#555', fontSize: 13, cursor: 'pointer',
              fontFamily: fonts.body, fontWeight: 600,
            }}
          >
            Cancel
          </button>
          {step === 1 ? (
            <button
              onClick={handleNextStep}
              disabled={saving}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: colors.inkPlum,
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: fonts.body,
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              {anySold ? `Next — Review Customer →` : '✓ Confirm Return'}
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={saving}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: saving ? '#aaa' : '#dc2626',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer', fontFamily: fonts.body,
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              {saving ? 'Saving…' : `✓ Confirm & Create Invoice (${fmt(soldValue)})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

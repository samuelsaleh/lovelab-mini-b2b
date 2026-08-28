'use client'

import { useState, useEffect } from 'react'
import { colors, fonts, card, btn, inputSm, lbl } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, formatEur } from '@/lib/igi/derive'
import { formatMonth } from '@/lib/igi/dates'
import SerialSpec from './igi/SerialSpec'
import Chip from './igi/Chip'

/**
 * What we think IGI should have billed, beside what they did.
 *
 * The point is not to approve anything — it is that until now there was no way
 * to check an invoice at all, because the detail behind it lived in IGI's file
 * and the movements lived in ours.
 */
export default function CertificatesInvoicesClient() {
  const { isCompact } = useResponsive()
  const [months, setMonths] = useState([])
  const [bases, setBases] = useState({})
  const [fee, setFee] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [savingMonth, setSavingMonth] = useState(null)
  const [draft, setDraft] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/invoices')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the invoices')
      setMonths(body.months || [])
      setBases(body.bases || {})
      setFee(body.fee_eur ?? 1.2)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function save(month) {
    const d = draft[month] || {}
    setSavingMonth(month)
    try {
      const res = await fetch('/api/igi/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          reference: d.reference ?? '',
          total_eur: d.total === '' || d.total == null ? null : Number(d.total),
          basis: d.basis,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to save the invoice')
      setNotice(`Saved for ${formatMonth(`${month}-01`)}.`)
      setTimeout(() => setNotice(null), 4000)
      setDraft((p) => ({ ...p, [month]: {} }))
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingMonth(null)
    }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 1080 }}>
      <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
        Invoices
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        What the movements say, at {formatEur(fee)} a certificate, beside what IGI actually billed.
      </p>

      {error && (
        <div style={{ ...banner, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={dismiss} data-testid="dismiss-error">Dismiss</button>
        </div>
      )}
      {notice && (
        <div style={{ ...banner, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }} data-testid="notice">
          {notice}
        </div>
      )}

      {months.length === 0 && !error && (
        <div style={{ ...card, padding: 28, textAlign: 'center', color: colors.textMuted, fontSize: 14 }} data-testid="empty">
          Nothing has been completed yet, so there is nothing to invoice.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {months.map((m) => {
          const d = draft[m.month] || {}
          const c = m.comparison
          return (
            <div key={m.month} style={{ ...card, padding: isCompact ? 16 : 22 }} data-testid="invoice-month">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{formatMonth(`${m.month}-01`)}</h2>
                <span style={{ fontSize: 12, color: colors.textMuted }}>
                  counted on: {bases[m.basis]?.label || m.basis}
                </span>
              </div>

              {/* ── The two numbers, and whether they agree ─────────────── */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isCompact ? '1fr' : 'repeat(3, 1fr)',
                gap: 12, margin: '14px 0',
              }}>
                <Total
                  testId="ours"
                  label="What the movements say"
                  value={formatEur(m.ours.eur)}
                  sub={`${formatQty(m.ours.qty)} certificates`}
                />
                <Total
                  testId="billed"
                  label="What IGI billed"
                  value={m.billed?.total_eur == null ? '—' : formatEur(m.billed.total_eur)}
                  sub={m.billed?.reference || 'no invoice recorded yet'}
                />
                <div style={{ ...tile, borderColor: toneBorder(c.status) }} data-testid="comparison">
                  <span style={tileLabel}>Difference</span>
                  <div style={{ fontSize: 22, fontWeight: 700, color: toneText(c.status), marginTop: 4 }}>
                    {c.status === 'not_recorded' ? '—' : formatEur(Math.abs(c.difference))}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textLight, marginTop: 2 }}>
                    {c.status === 'agrees' && 'They agree.'}
                    {c.status === 'they_billed_more' && 'They billed more than the movements.'}
                    {c.status === 'they_billed_less' && 'They billed less than the movements.'}
                    {c.status === 'not_recorded' && 'Enter their invoice to compare.'}
                  </div>
                </div>
              </div>

              {/* The whole point of keeping all three: a gap that has an
                  explanation is a conversation, not a bug report. */}
              {m.basis_that_would_match && m.basis_that_would_match !== m.basis && (
                <div style={{ ...banner, background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#6d28d9', display: 'block' }} data-testid="explains-gap">
                  <strong>That difference has an explanation.</strong>
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    Their figure matches “{bases[m.basis_that_would_match]?.label}” exactly.
                    {' '}{bases[m.basis_that_would_match]?.note} It is worth agreeing with IGI which
                    one the invoice is meant to count, then setting it here.
                  </div>
                </div>
              )}

              <details style={{ marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: colors.textLight }}>
                  The same month counted three ways
                </summary>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                  {Object.entries(m.totals_by_basis).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 12 }} data-testid="basis-figure">
                      <div style={{ color: colors.textMuted }}>{bases[k]?.label || k}</div>
                      <div style={{ fontWeight: 700 }}>{formatEur(v.eur)}</div>
                      <div style={{ color: colors.textLight }}>{formatQty(v.qty)} certificates</div>
                    </div>
                  ))}
                </div>
              </details>

              {/* ── Record their invoice ────────────────────────────────── */}
              <div style={{ background: colors.bgOff, borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1.2fr 1fr 1.2fr auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <div style={lbl}>Their invoice number</div>
                    <input
                      value={d.reference ?? m.billed?.reference ?? ''}
                      onChange={(e) => setDraft((p) => ({ ...p, [m.month]: { ...d, reference: e.target.value } }))}
                      placeholder="ATW/26/SC/02896"
                      data-testid="reference"
                      style={{ ...inputSm, width: '100%' }}
                    />
                  </div>
                  <div>
                    <div style={lbl}>Their total</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={d.total ?? (m.billed?.total_eur ?? '')}
                      onChange={(e) => setDraft((p) => ({ ...p, [m.month]: { ...d, total: e.target.value } }))}
                      data-testid="total"
                      style={{ ...inputSm, width: '100%', textAlign: 'right' }}
                    />
                  </div>
                  <div>
                    <div style={lbl}>They bill on</div>
                    <select
                      value={d.basis ?? m.basis}
                      onChange={(e) => setDraft((p) => ({ ...p, [m.month]: { ...d, basis: e.target.value } }))}
                      data-testid="basis"
                      style={{ ...inputSm, width: '100%' }}
                    >
                      {Object.entries(bases).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => save(m.month)}
                    disabled={savingMonth === m.month}
                    data-testid="save-invoice"
                    style={{ ...btn.primary, padding: '8px 18px', fontSize: 13, opacity: savingMonth === m.month ? 0.5 : 1 }}
                  >
                    {savingMonth === m.month ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {/* ── Model by model ──────────────────────────────────────── */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={th}>Model</th>
                      <th style={th}>Serial · check</th>
                      <th style={thNum}>Certificates</th>
                      <th style={thNum}>At {formatEur(fee)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.ours.rows.map((r) => (
                      <tr key={r.model_id} data-testid="invoice-row">
                        <td style={{ ...td, fontSize: 13, fontWeight: 600 }}>{r.name}</td>
                        <td style={td}><SerialSpec model={r} compact /></td>
                        <td style={tdNum}>{formatQty(r.qty)}</td>
                        <td style={tdNum}>{formatEur(r.eur)}</td>
                      </tr>
                    ))}
                    {m.ours.unattributed > 0 && (
                      <tr data-testid="invoice-gap">
                        <td style={{ ...td, fontSize: 13 }} colSpan={2}>
                          Issued with no model recorded <Chip tone="gap">unresolved</Chip>
                        </td>
                        <td style={tdNum}>{formatQty(m.ours.unattributed)}</td>
                        <td style={tdNum}>{formatEur(m.ours.unattributed * fee)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Total</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{formatQty(m.ours.qty)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{formatEur(m.ours.eur)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Total({ label, value, sub, testId }) {
  return (
    <div style={tile} data-testid={testId}>
      <span style={tileLabel}>{label}</span>
      <div style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: colors.textLight, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

const toneText = (s) => (
  s === 'agrees' ? '#15803d' : s === 'not_recorded' ? colors.textMuted : '#b45309'
)
const toneBorder = (s) => (
  s === 'agrees' ? '#bbf7d0' : s === 'not_recorded' ? colors.border : '#fde68a'
)

const tile = {
  padding: 14, borderRadius: 10, background: '#fff',
  border: `1px solid ${colors.border}`,
}
const tileLabel = {
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: colors.textMuted, fontWeight: 700,
}
const th = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase',
  letterSpacing: '0.04em', fontWeight: 700, color: colors.textMuted,
  borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap',
}
const thNum = { ...th, textAlign: 'right' }
const td = { padding: '10px 12px', borderBottom: `1px solid ${colors.borderLight}`, verticalAlign: 'top' }
const tdNum = { ...td, textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap' }
const banner = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10,
  fontSize: 13, marginBottom: 16,
}
const dismiss = {
  background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline',
  cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
}

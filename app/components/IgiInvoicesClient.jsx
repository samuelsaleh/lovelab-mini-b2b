'use client'

import { useState, useEffect } from 'react'
import { colors, fonts, card } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, formatEur } from '@/lib/igi/derive'
import { formatMonth } from '@/lib/igi/dates'
import SerialSpec from './igi/SerialSpec'
import Chip from './igi/Chip'

/** What IGI have issued, month by month, at the agreed fee. */
export default function IgiInvoicesClient() {
  const { isCompact } = useResponsive()
  const [months, setMonths] = useState([])
  const [fee, setFee] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi-portal/invoices')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not load the invoices')
      setMonths(body.months || [])
      setFee(body.fee_eur ?? 1.2)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 900 }}>
      <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
        Invoices
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        Everything you have issued, at {formatEur(fee)} a certificate.
      </p>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {months.length === 0 && !error && (
        <div style={{ ...card, padding: 28, textAlign: 'center', color: colors.textMuted, fontSize: 14 }} data-testid="empty">
          Nothing has been completed yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {months.map((m) => (
          <div key={m.month} style={{ ...card, padding: isCompact ? 16 : 20 }} data-testid="invoice-month">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                {formatMonth(`${m.month}-01`)}
              </h2>
              <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, color: colors.inkPlum }}>
                {formatEur(m.eur)}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={th}>Model</th>
                    <th style={th}>Serial · check</th>
                    <th style={thNum}>Issued</th>
                    <th style={thNum}>At {formatEur(fee)}</th>
                  </tr>
                </thead>
                <tbody>
                  {m.rows.map((r) => (
                    <tr key={r.model_id} data-testid="invoice-row">
                      <td style={{ ...td, fontSize: 13, fontWeight: 600 }}>{r.name}</td>
                      <td style={td}><SerialSpec model={r} compact /></td>
                      <td style={tdNum}>{formatQty(r.qty)}</td>
                      <td style={tdNum}>{formatEur(r.eur)}</td>
                    </tr>
                  ))}
                  {m.unattributed > 0 && (
                    <tr data-testid="invoice-gap">
                      <td style={{ ...td, fontSize: 13 }} colSpan={2}>
                        Issued without models recorded <Chip tone="gap">no breakdown</Chip>
                      </td>
                      <td style={tdNum}>{formatQty(m.unattributed)}</td>
                      <td style={tdNum}>{formatEur(m.unattributed * fee)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Total</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{formatQty(m.qty)}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{formatEur(m.eur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const th = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase',
  letterSpacing: '0.04em', fontWeight: 700, color: colors.textMuted,
  borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap',
}
const thNum = { ...th, textAlign: 'right' }
const td = { padding: '10px 12px', borderBottom: `1px solid ${colors.borderLight}`, verticalAlign: 'top' }
const tdNum = { ...td, textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap' }

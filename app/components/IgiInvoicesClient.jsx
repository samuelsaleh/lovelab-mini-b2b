'use client'

import { useState, useEffect } from 'react'
import { formatQty, formatEur } from '@/lib/igi/derive'
import { formatMonth } from '@/lib/igi/dates'
import { Serial, Spec } from './igi/SerialSpec'
import Chip from './igi/Chip'
import { PageHead, Card, Loading, Toast, TableWrap, Empty } from './certificates/ui'

/** What IGI have issued, month by month, at the agreed fee. */
export default function IgiInvoicesClient() {
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

  if (loading) return <Loading />

  return (
    <>
      <PageHead title="Invoices" sub={`Everything you have issued, at ${formatEur(fee)} a certificate`} />

      {error && <Toast bad>{error}</Toast>}

      {months.length === 0 && !error && (
        <Card flush>
          <Empty><span data-testid="empty">Nothing has been completed yet.</span></Empty>
        </Card>
      )}

      {months.map((m) => (
        <section className="card" key={m.month} data-testid="invoice-month">
          <div className="card-head">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
              {formatMonth(`${m.month}-01`)}
            </h3>
            <span className="right bignum">{formatEur(m.eur)}</span>
          </div>

          <TableWrap>
            <table style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Check</th>
                <th>Serial</th>
                  <th className="num">Issued</th>
                  <th className="num">At {formatEur(fee)}</th>
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.model_id} data-testid="invoice-row">
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td><Spec model={r} compact /></td>
                    <td><Serial model={r} compact /></td>
                    <td className="num">{formatQty(r.qty)}</td>
                    <td className="num">{formatEur(r.eur)}</td>
                  </tr>
                ))}
                {m.unattributed > 0 && (
                  <tr data-testid="invoice-gap">
                    <td colSpan={3}>
                      Issued without models recorded <Chip tone="a">no breakdown</Chip>
                    </td>
                    <td className="num">{formatQty(m.unattributed)}</td>
                    <td className="num">{formatEur(m.unattributed * fee)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td className="num">{formatQty(m.qty)}</td>
                  <td className="num">{formatEur(m.eur)}</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        </section>
      ))}
    </>
  )
}

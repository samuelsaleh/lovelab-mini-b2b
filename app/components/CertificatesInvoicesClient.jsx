'use client'

import { useState, useEffect } from 'react'
import { formatQty, formatEur } from '@/lib/igi/derive'
import { formatMonth } from '@/lib/igi/dates'
import { Serial, Spec } from './igi/SerialSpec'
import Chip from './igi/Chip'
import { PageHead, Card, Loading, Note, Toast, Btn, TableWrap, Empty } from './certificates/ui'

/**
 * What we think IGI should have billed, beside what they did.
 *
 * The point is not to approve anything — it is that until now there was no way
 * to check an invoice at all, because the detail behind it lived in IGI's file
 * and the movements lived in ours.
 */
export default function CertificatesInvoicesClient() {
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

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="Invoices"
        sub={`What the movements say, at ${formatEur(fee)} a certificate, beside what IGI actually billed`}
      />

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      {months.length === 0 && !error && (
        <Card flush>
          <Empty>
            <span data-testid="empty">Nothing has been completed yet, so there is nothing to invoice.</span>
          </Empty>
        </Card>
      )}

      {months.map((m) => {
        const d = draft[m.month] || {}
        const c = m.comparison
        return (
          <section className="card" key={m.month} data-testid="invoice-month">
            <div className="card-head">
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
                {formatMonth(`${m.month}-01`)}
              </h3>
              <span className="sub">counted on: {bases[m.basis]?.label || m.basis}</span>
            </div>

            {/* ── The two numbers, and whether they agree ─────────────── */}
            <div className="crow" data-testid="ours">
              <div className="k">
                What the movements say
                <small>{formatQty(m.ours.qty)} certificates</small>
              </div>
              <span className="v">{formatEur(m.ours.eur)}</span>
            </div>
            <div className="crow" data-testid="billed">
              <div className="k">
                What IGI billed
                <small>{m.billed?.reference || 'no invoice recorded yet'}</small>
              </div>
              <span className="v">
                {m.billed?.total_eur == null ? '—' : formatEur(m.billed.total_eur)}
              </span>
            </div>

            <div
              className={c.status === 'agrees' ? 'verdict' : 'verdict off'}
              data-testid="comparison"
              style={c.status === 'not_recorded'
                ? { background: 'var(--surface-2)', color: 'var(--ink-soft)' }
                : undefined}
            >
              <span>
                {c.status === 'agrees' && 'They agree.'}
                {c.status === 'they_billed_more' && 'They billed more than the movements.'}
                {c.status === 'they_billed_less' && 'They billed less than the movements.'}
                {c.status === 'not_recorded' && 'Enter their invoice to compare.'}
              </span>
              <span className="sp" />
              <span className="bignum">
                {c.status === 'not_recorded' ? '—' : formatEur(Math.abs(c.difference))}
              </span>
            </div>

            {/* The whole point of keeping all three: a gap that has an
                explanation is a conversation, not a bug report. */}
            {m.basis_that_would_match && m.basis_that_would_match !== m.basis && (
              <div className="nextstep" data-testid="explains-gap">
                <b>That difference has an explanation.</b>
                <span>
                  Their figure matches “{bases[m.basis_that_would_match]?.label}” exactly.
                  {' '}{bases[m.basis_that_would_match]?.note} It is worth agreeing with IGI which
                  one the invoice is meant to count, then setting it here.
                </span>
              </div>
            )}

            <div className="card-body">
              <details style={{ marginBottom: 14 }}>
                <summary style={{ cursor: 'pointer', fontSize: '.83rem', color: 'var(--ink-soft)' }}>
                  The same month counted three ways
                </summary>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10 }}>
                  {Object.entries(m.totals_by_basis).map(([k, v]) => (
                    <div key={k} data-testid="basis-figure">
                      <div className="spec">{bases[k]?.label || k}</div>
                      <div className="bignum">{formatEur(v.eur)}</div>
                      <div style={{ fontSize: '.8rem', color: 'var(--ink-soft)' }}>
                        {formatQty(v.qty)} certificates
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              {/* ── Record their invoice ────────────────────────────────── */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 4 }}>
                <label style={{ flex: '1 1 190px' }}>
                  <div className="spec" style={{ marginBottom: 4 }}>Their invoice number</div>
                  <input
                    type="text"
                    value={d.reference ?? m.billed?.reference ?? ''}
                    onChange={(e) => setDraft((p) => ({ ...p, [m.month]: { ...d, reference: e.target.value } }))}
                    placeholder="ATW/26/SC/02896"
                    data-testid="reference"
                    style={{ width: '100%' }}
                  />
                </label>
                <label>
                  <div className="spec" style={{ marginBottom: 4 }}>Their total</div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={d.total ?? (m.billed?.total_eur ?? '')}
                    onChange={(e) => setDraft((p) => ({ ...p, [m.month]: { ...d, total: e.target.value } }))}
                    data-testid="total"
                    style={{ width: 120 }}
                  />
                </label>
                <label style={{ flex: '1 1 190px' }}>
                  <div className="spec" style={{ marginBottom: 4 }}>They bill on</div>
                  <select
                    value={d.basis ?? m.basis}
                    onChange={(e) => setDraft((p) => ({ ...p, [m.month]: { ...d, basis: e.target.value } }))}
                    data-testid="basis"
                    style={{ width: '100%', maxWidth: 'none' }}
                  >
                    {Object.entries(bases).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </label>
                <Btn kind="primary" onClick={() => save(m.month)} disabled={savingMonth === m.month} testId="save-invoice">
                  {savingMonth === m.month ? 'Saving…' : 'Save'}
                </Btn>
              </div>
            </div>

            {/* ── Model by model ──────────────────────────────────────── */}
            <TableWrap>
              <table style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Check</th>
                <th>Serial</th>
                    <th className="num">Certificates</th>
                    <th className="num">At {formatEur(fee)}</th>
                  </tr>
                </thead>
                <tbody>
                  {m.ours.rows.map((r) => (
                    <tr key={r.model_id} data-testid="invoice-row">
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td><Spec model={r} compact /></td>
                    <td><Serial model={r} compact /></td>
                      <td className="num">{formatQty(r.qty)}</td>
                      <td className="num">{formatEur(r.eur)}</td>
                    </tr>
                  ))}
                  {m.ours.unattributed > 0 && (
                    <tr data-testid="invoice-gap">
                      <td colSpan={3}>
                        Issued with no model recorded <Chip tone="a">unresolved</Chip>
                      </td>
                      <td className="num">{formatQty(m.ours.unattributed)}</td>
                      <td className="num">{formatEur(m.ours.unattributed * fee)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total</td>
                    <td className="num">{formatQty(m.ours.qty)}</td>
                    <td className="num">{formatEur(m.ours.eur)}</td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          </section>
        )
      })}
    </>
  )
}

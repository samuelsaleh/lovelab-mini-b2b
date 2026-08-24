'use client'

/**
 * OrgSettlementCard — "one payment per organization" (Phase 31).
 *
 * Sits at the top of the admin organization detail page. Shows the org's
 * global money picture in one strip (earned / paid out / OWED), with two
 * actions:
 *
 *   - "Send org report"  → POST /api/commission-reports/generate with
 *     { organization_id }: ONE report sweeping every member's ready
 *     commissions, keyed to the org owner, with a per-agent breakdown
 *     inside the xlsx.
 *
 *   - "Record payment"   → POST /api/agent-payments against the owner,
 *     optionally linked to an org report so ALL members' commissions on
 *     that report settle (status → paid) in one action.
 *
 * Per-agent tracking is untouched — the TeamDashboard below this card
 * still shows each sub-agent's own revenue / orders / commission.
 *
 * Admin-only by construction (only rendered on /admin/organizations/[id];
 * the APIs it calls are admin-gated server-side anyway).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { colors } from '@/lib/styles'
import { isHideRevenue } from '@/lib/utils'

const fmt = (n) => {
  if (isHideRevenue()) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0)
}

export default function OrgSettlementCard({ organizationId }) {
  const [ledger, setLedger] = useState(null)
  const [reports, setReports] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Send-report state
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null) // { kind, message }

  // Payment modal state
  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payInvoice, setPayInvoice] = useState('')
  const [payReportId, setPayReportId] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState(null)
  const [paySuccess, setPaySuccess] = useState(null)

  // Per-member breakdown, needed at payout time only
  const [breakdownOpen, setBreakdownOpen] = useState(false)

  const owner = useMemo(
    () => (ledger?.per_member || []).find((m) => m.role === 'owner') || null,
    [ledger],
  )

  const loadData = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError(null)
    try {
      const ledgerRes = await fetch(`/api/organizations/${organizationId}/ledger`)
      if (!ledgerRes.ok) throw new Error('ledger_failed')
      const ledgerData = await ledgerRes.json()
      setLedger(ledgerData)

      const ownerRow = (ledgerData?.per_member || []).find((m) => m.role === 'owner')
      if (ownerRow?.user_id) {
        const [repRes, payRes] = await Promise.all([
          fetch(`/api/commission-reports?agent_id=${encodeURIComponent(ownerRow.user_id)}&limit=24`),
          fetch(`/api/agent-payments?agent_id=${encodeURIComponent(ownerRow.user_id)}`),
        ])
        const repData = repRes.ok ? await repRes.json() : { reports: [] }
        const payData = payRes.ok ? await payRes.json() : { payments: [] }
        setReports(repData.reports || [])
        setPayments(payData.payments || [])
      }
    } catch {
      setError('Failed to load organization settlement data.')
    }
    setLoading(false)
  }, [organizationId])

  useEffect(() => { loadData() }, [loadData])

  // Reports that have not been paid against yet (no payment references them).
  const openReports = useMemo(() => {
    const paidReportIds = new Set((payments || []).map((p) => p.report_id).filter(Boolean))
    return (reports || []).filter((r) => !paidReportIds.has(r.id) && Number(r.total_due) > 0)
  }, [reports, payments])

  const handleSendReport = async () => {
    if (isHideRevenue()) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/commission-reports/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, send_email: true, upload_to_drive: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
      const r = j?.result
      if (r?.skipped) {
        setSendResult({ kind: 'skipped', message: 'Nothing ready to pay — no report was created. Tick "Customer paid?" on orders first.' })
      } else {
        setSendResult({ kind: 'success', message: `Org report created — total due ${fmt(r?.totals?.grandTotal || 0)}.` })
      }
      await loadData()
    } catch (err) {
      setSendResult({ kind: 'error', message: err?.message || 'Failed to generate the org report.' })
    }
    setSending(false)
  }

  const openPayModal = () => {
    setPayError(null)
    setPaySuccess(null)
    const latest = openReports[0]
    setPayReportId(latest?.id || '')
    setPayAmount(latest ? String(latest.total_due) : String(ledger?.organization_summary?.pending_balance || ''))
    setPayInvoice('')
    setPayNotes('')
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayOpen(true)
  }

  const handleReportPick = (id) => {
    setPayReportId(id)
    const rep = openReports.find((r) => r.id === id)
    if (rep) setPayAmount(String(rep.total_due))
  }

  const handleRecordPayment = async () => {
    if (!owner?.user_id || !payAmount) return
    setPaying(true)
    setPayError(null)
    try {
      const res = await fetch('/api/agent-payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agent_id: owner.user_id,
          amount: Number(payAmount),
          payment_date: payDate ? new Date(`${payDate}T12:00:00.000Z`).toISOString() : undefined,
          report_id: payReportId || null,
          invoice_number: payInvoice.trim() || null,
          notes: payNotes.trim() || `Organization payment — settles the whole team`,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
      const settledCount = j?.settled?.marked || 0
      setPaySuccess(
        payReportId
          ? `Payment recorded — ${settledCount} commission${settledCount === 1 ? '' : 's'} across the team marked paid.`
          : 'Payment recorded.',
      )
      setPayOpen(false)
      await loadData()
    } catch (err) {
      setPayError(err?.message || 'Failed to record the payment.')
    }
    setPaying(false)
  }

  if (loading) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: 20, marginBottom: 20, fontSize: 13, color: colors.lovelabMuted }}>
        Loading settlement…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ background: '#fef2f2', borderRadius: 12, padding: 14, marginBottom: 20, fontSize: 13, color: '#dc2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {error}
        <button onClick={loadData} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>Retry</button>
      </div>
    )
  }

  const summary = ledger?.organization_summary || { total_commission_earned: 0, total_paid_out: 0, pending_balance: 0 }
  const members = ledger?.per_member || []
  const hasZeroRatePipeline = members.some((m) => isZeroRateWithCounts(m))
  const orgEurosZero =
    (Number(summary.total_commission_earned) || 0) === 0 &&
    (Number(summary.pending_balance) || 0) === 0

  return (
    <div data-testid="org-settlement-card" style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Organization settlement
        </span>
        <span style={{ fontSize: 11, color: colors.lovelabMuted }}>
          {/* Earned / paid out / outstanding are on the summary cards above, so
              this card only names who the single payment goes to. */}
          One report, one payment — {owner
            ? `payable to ${owner.profile?.full_name || owner.profile?.email || 'the owner'}`
            : 'no owner found'}
        </span>
      </div>

      {orgEurosZero && hasZeroRatePipeline && (
        <div
          data-testid="org-settlement-zero-rate-banner"
          style={{
            padding: '10px 18px',
            background: '#fffbeb',
            borderTop: `1px solid ${colors.lineGray}`,
            borderBottom: `1px solid ${colors.lineGray}`,
            fontSize: 12,
            color: '#92400e',
            lineHeight: 1.45,
          }}
        >
          Orders are waiting, but commission is €0 because member rates are 0% (and the organization rate is unset).
          Set a rate under <strong>Edit settings</strong> or on each agent&apos;s page — unpaid amounts will recalculate automatically.
        </div>
      )}

      {/* One organization payment, transparently allocated back to each member
          through the commissions settled by the linked report. The per-member
          table is collapsed by default: it is only needed at payout time, and
          leaving it open made this page show the same member list three times. */}
      <div style={{ borderTop: `1px solid ${colors.lineGray}` }}>
        <div style={{ padding: '11px 18px', background: '#fcfbfd', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Team settlement breakdown
          </span>
          <button
            data-testid="org-settlement-breakdown-toggle"
            onClick={() => setBreakdownOpen((v) => !v)}
            aria-expanded={breakdownOpen}
            style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: '#fff', color: colors.inkPlum, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {breakdownOpen ? 'Hide breakdown' : `Show breakdown (${members.length} ${members.length === 1 ? 'member' : 'members'})`}
          </button>
        </div>
        {breakdownOpen && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={tableHead}>Member</th>
                <th style={moneyHead}>Awaiting</th>
                <th style={moneyHead}>Ready</th>
                <th style={moneyHead}>Reported</th>
                <th style={moneyHead}>Paid share</th>
                <th style={tableHead}>Invoice</th>
                <th style={{ ...tableHead, textAlign: 'right' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const zeroRateNote = isZeroRateWithCounts(member)
                return (
                <tr key={member.user_id} data-testid={`org-settlement-member-${member.user_id}`}>
                  <td style={tableCell}>
                    <div style={{ fontWeight: 700, color: colors.charcoal }}>
                      {member.profile?.full_name || member.profile?.email || member.user_id}
                      {member.role === 'owner' && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: colors.inkPlum, background: '#f3f0f8', borderRadius: 4, padding: '1px 5px' }}>OWNER</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: colors.lovelabMuted }}>
                      {member.awaiting_count || 0} awaiting · {member.ready_count || 0} ready · {member.reported_count || 0} reported
                    </div>
                    {zeroRateNote && (
                      <div data-testid={`org-settlement-zero-rate-${member.user_id}`} style={{ fontSize: 10, color: '#92400e', marginTop: 3, fontWeight: 600 }}>
                        0% rate — set a rate to calculate commission
                      </div>
                    )}
                  </td>
                  <td style={moneyCell}>{fmt(member.awaiting_customer)}</td>
                  <td style={{ ...moneyCell, color: '#166534', fontWeight: 700 }}>{fmt(member.ready_to_pay)}</td>
                  <td style={{ ...moneyCell, color: '#3730a3', fontWeight: 700 }}>{fmt(member.reported)}</td>
                  <td style={{ ...moneyCell, color: colors.inkPlum, fontWeight: 800 }}>{fmt(member.settled_amount)}</td>
                  <td style={{ ...tableCell, fontSize: 11 }}>
                    {member.last_invoice_number || '—'}
                    {(member.invoice_numbers || []).length > 1 && (
                      <span title={member.invoice_numbers.join(', ')} style={{ marginLeft: 4, color: colors.lovelabMuted }}>
                        +{member.invoice_numbers.length - 1}
                      </span>
                    )}
                  </td>
                  <td style={{ ...tableCell, textAlign: 'right' }}>
                    <a href={`/admin/agents/${member.user_id}`} style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textDecoration: 'none' }}>
                      View agent →
                    </a>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
        {payments.length > 0 && (
          <div style={{ padding: '10px 18px', borderTop: `1px solid ${colors.lineGray}`, fontSize: 11, color: colors.lovelabMuted }}>
            <strong style={{ color: colors.charcoal }}>Latest organization payment:</strong>{' '}
            {fmt(payments[0].amount)} on {new Date(payments[0].payment_date).toLocaleDateString('en-GB')}
            {payments[0].invoice_number ? ` · Invoice ${payments[0].invoice_number}` : ''}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '14px 18px', borderTop: `1px solid ${colors.lineGray}`, background: '#fafafa', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          data-testid="org-send-report"
          onClick={handleSendReport}
          disabled={sending || isHideRevenue()}
          style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: sending ? '#aaa' : colors.inkPlum, color: '#fff', fontSize: 12, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', fontFamily: 'inherit' }}
        >
          {sending ? 'Generating…' : 'Send org report'}
        </button>
        <button
          data-testid="org-record-payment"
          onClick={openPayModal}
          disabled={!owner}
          style={{ padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, fontSize: 12, fontWeight: 700, cursor: owner ? 'pointer' : 'default', opacity: owner ? 1 : 0.5, fontFamily: 'inherit' }}
        >
          Record payment
        </button>
        <span style={{ fontSize: 11, color: colors.lovelabMuted }}>
          The report includes every member&apos;s ready commissions with a per-agent breakdown.
        </span>
        {sendResult && (
          <span
            role="status"
            style={{
              fontSize: 12, padding: '6px 10px', borderRadius: 6, fontWeight: 600,
              ...(sendResult.kind === 'success' && { background: '#f0fdf4', color: '#166534' }),
              ...(sendResult.kind === 'skipped' && { background: '#fffbeb', color: '#92400e' }),
              ...(sendResult.kind === 'error' && { background: '#fee2e2', color: '#991b1b' }),
            }}
          >
            {sendResult.message}
          </span>
        )}
        {paySuccess && (
          <span role="status" style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, fontWeight: 600, background: '#f0fdf4', color: '#166534' }}>
            {paySuccess}
          </span>
        )}
      </div>

      {/* Payment modal */}
      {payOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 22, width: '100%', maxWidth: 440 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: colors.inkPlum }}>Record organization payment</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: colors.lovelabMuted }}>
              Paid to {owner?.profile?.full_name || owner?.profile?.email || 'the organization owner'}. Linking a report marks every commission on it (all team members) as paid.
            </p>

            <ModalField label="Linked report (recommended)">
              <select
                value={payReportId}
                onChange={(e) => handleReportPick(e.target.value)}
                style={modalInput}
                data-testid="org-pay-report"
              >
                <option value="">No report — payment only</option>
                {openReports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {(r.period_label || r.period_key)} — {fmt(r.total_due)}
                  </option>
                ))}
              </select>
            </ModalField>
            <ModalField label="Amount (EUR)">
              <input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={modalInput} data-testid="org-pay-amount" />
            </ModalField>
            <ModalField label="Payment date">
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={modalInput} />
            </ModalField>
            <ModalField label="Invoice number (optional)">
              <input value={payInvoice} onChange={(e) => setPayInvoice(e.target.value)} placeholder="e.g. INV-2026-041" style={modalInput} />
            </ModalField>
            <ModalField label="Notes (optional)">
              <input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} style={modalInput} />
            </ModalField>

            {payError && <div style={{ margin: '10px 0 0', fontSize: 12, color: '#dc2626' }}>{payError}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setPayOpen(false)} disabled={paying} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${colors.border}`, background: '#fff', color: colors.charcoal, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={paying || !payAmount || Number(payAmount) <= 0}
                data-testid="org-pay-submit"
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: paying || !payAmount ? '#ccc' : colors.inkPlum, color: '#fff', fontSize: 12, fontWeight: 700, cursor: paying ? 'wait' : 'pointer', fontFamily: 'inherit' }}
              >
                {paying ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Counts > 0 but every euro column is €0 → almost always a 0% rate. */
export function isZeroRateWithCounts(member) {
  const counts =
    (Number(member?.awaiting_count) || 0) +
    (Number(member?.ready_count) || 0) +
    (Number(member?.reported_count) || 0)
  if (counts <= 0) return false
  const euros =
    (Number(member?.awaiting_customer) || 0) +
    (Number(member?.ready_to_pay) || 0) +
    (Number(member?.reported) || 0) +
    (Number(member?.settled_amount) || 0)
  return euros === 0
}

function ModalField({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  )
}

const modalInput = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

const tableHead = {
  padding: '9px 12px',
  fontSize: 10,
  fontWeight: 700,
  color: colors.lovelabMuted,
  textTransform: 'uppercase',
  textAlign: 'left',
  borderBottom: `1px solid ${colors.lineGray}`,
}

const moneyHead = { ...tableHead, textAlign: 'right' }

const tableCell = {
  padding: '10px 12px',
  fontSize: 12,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
}

const moneyCell = { ...tableCell, textAlign: 'right', whiteSpace: 'nowrap' }

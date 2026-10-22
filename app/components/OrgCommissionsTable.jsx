'use client'

/**
 * OrgCommissionsTable — every commission line of an organization's team,
 * with the agent named on each row.
 *
 * Lives inside OrgSettlementCard on /admin/organizations/[id]. It is the
 * org-level twin of the "Orders & Commission" table on the agent page, so
 * Dionne can see what is Ready to pay (customer paid, not yet reported)
 * versus Awaiting across the whole team, tick Paid?, type invoice numbers
 * and move a line by hand — without opening each member's page.
 *
 * Data: GET /api/commissions?organization_id=…  (rows carry `agent`).
 * Row actions reuse the per-commission endpoints the agent page uses:
 *   Paid?            PATCH /api/commissions/[id]/customer-paid  { paid }
 *   Invoice #        PATCH /api/commissions/[id]                { invoice_number }
 *   Mark reported    PATCH /api/commissions/[id]/reported       { reported }
 *   Force paid       PATCH /api/commissions/[id]/force-paid
 *   Undo             PATCH /api/commissions/[id]/revert-paid
 *   Bulk Paid?       PATCH /api/commissions/customer-paid-bulk  { ids, paid }
 *
 * Admin-only by construction (the page is admin-only and every endpoint is
 * admin-gated server-side).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { colors } from '@/lib/styles'
import { isHideRevenue } from '@/lib/utils'
import { commissionSettlementStage } from '@/lib/organizations/settlement'
import { applyCustomerPaidLocally, selectableForBulk, sendBulkCustomerPaid } from '@/lib/bulkCustomerPaid'
import { commissionMatchesQuery } from '@/lib/commissionSearch'

const PAGE_SIZE = 500
const MAX_BULK_IDS = 200

export const ORG_COMMISSION_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'ready', label: 'Ready' },
  { key: 'reported', label: 'Reported' },
  { key: 'settled', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
]

const STAGE_PILL = {
  cancelled: { label: 'Cancelled', bg: '#fee2e2', fg: '#991b1b' },
  settled: { label: 'Paid', bg: '#16a34a', fg: '#ffffff' },
  reported: { label: 'Reported', bg: '#eef2ff', fg: '#3730a3' },
  ready: { label: 'Ready', bg: '#f0fdf4', fg: '#166534' },
  awaiting: { label: 'Awaiting', bg: '#fff7ed', fg: '#9a3412' },
}

const fmt = (n) => {
  if (isHideRevenue()) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)
}

const isRealRow = (row) => !!row?.id && !String(row.id).startsWith('doc-')

/** Rows the Paid? tick (single or bulk) can act on. */
export function canToggleCustomerPaid(row) {
  return isRealRow(row) && row.status !== 'paid' && row.status !== 'cancelled'
}

export function agentLabel(row) {
  return row?.agent?.full_name || row?.agent?.email || 'Agent'
}

export function clientLabel(row) {
  if (!row) return 'Order'
  if (row.type === 'new_client_bonus') {
    return `New client bonus${row.document?.client_company ? ` — ${row.document.client_company}` : ''}`
  }
  if (row.type === 'bonus') return 'Bonus'
  return row.document?.client_company || row.document?.client_name || row.client_label || 'Order'
}

function displayDate(row) {
  const iso = row?.document?.created_at || row?.created_at
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

async function patchJson(url, body) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json
}

/**
 * @param {object} props
 * @param {string} props.organizationId
 * @param {Array}  [props.members]      ledger `per_member` rows (for the agent filter)
 * @param {object} [props.summary]      ledger `organization_summary` (euros per stage)
 * @param {number} [props.reloadToken]  bump to refetch (after Send report / Record payment)
 * @param {Function} [props.onChanged]  called after any write so the parent can refresh its ledger
 */
export default function OrgCommissionsTable({ organizationId, members = [], summary = null, reloadToken = 0, onChanged }) {
  const [rows, setRows] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filter, setFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [busyIds, setBusyIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [invoiceDrafts, setInvoiceDrafts] = useState({})
  const [invoiceState, setInvoiceState] = useState(null) // { id, kind, message }

  const load = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/commissions?organization_id=${encodeURIComponent(organizationId)}&per_page=${PAGE_SIZE}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setRows(Array.isArray(json?.commissions) ? json.commissions : [])
      setTotalCount(Number(json?.total_count) || 0)
    } catch (err) {
      setError(err?.message || 'Could not load the team commissions.')
    }
    setLoading(false)
  }, [organizationId])

  useEffect(() => { load() }, [load, reloadToken])

  const notifyChanged = useCallback(() => { if (typeof onChanged === 'function') onChanged() }, [onChanged])

  const markBusy = (id, busy) => setBusyIds((prev) => {
    const next = new Set(prev)
    if (busy) next.add(id); else next.delete(id)
    return next
  })

  // ── Derived views ───────────────────────────────────────────────────
  const counts = useMemo(() => rows.reduce((acc, r) => {
    const k = commissionSettlementStage(r)
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {}), [rows])

  const agentOptions = useMemo(() => {
    const byId = new Map()
    for (const m of members || []) {
      if (!m?.user_id) continue
      byId.set(m.user_id, m.profile?.full_name || m.profile?.email || m.user_id)
    }
    for (const r of rows) {
      if (r?.agent_id && !byId.has(r.agent_id)) byId.set(r.agent_id, agentLabel(r))
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [members, rows])

  const visibleRows = useMemo(() => rows.filter((r) =>
    (filter === 'all' || commissionSettlementStage(r) === filter) &&
    (!agentFilter || r.agent_id === agentFilter) &&
    commissionMatchesQuery(r, search)
  ), [rows, filter, agentFilter, search])

  const selectableVisibleIds = visibleRows.filter(canToggleCustomerPaid).map((r) => r.id)
  const selectedVisibleIds = selectableVisibleIds.filter((id) => selected.has(id))
  const allVisibleSelected = selectableVisibleIds.length > 0 && selectedVisibleIds.length === selectableVisibleIds.length

  const toggleSelectAllVisible = () => setSelected((prev) => {
    const next = new Set(prev)
    for (const id of selectableVisibleIds) {
      if (allVisibleSelected) next.delete(id); else next.add(id)
    }
    return next
  })
  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // ── Writes ──────────────────────────────────────────────────────────
  const handleToggleCustomerPaid = async (row, paid) => {
    setActionError(null)
    markBusy(row.id, true)
    try {
      await patchJson(`/api/commissions/${row.id}/customer-paid`, { paid })
      setRows((prev) => applyCustomerPaidLocally(prev, [row.id], paid))
      notifyChanged()
    } catch (err) {
      setActionError(err?.message || 'Failed to update the Paid? tick.')
    }
    markBusy(row.id, false)
  }

  const handleBulkCustomerPaid = async (paid) => {
    const ids = selectableForBulk(rows.filter(canToggleCustomerPaid), [...selected], paid)
    if (ids.length === 0) {
      setSelected(new Set())
      return
    }
    setBulkBusy(true)
    setActionError(null)
    try {
      for (let i = 0; i < ids.length; i += MAX_BULK_IDS) {
        const chunk = ids.slice(i, i + MAX_BULK_IDS)
        await sendBulkCustomerPaid(chunk, paid)
        setRows((prev) => applyCustomerPaidLocally(prev, chunk, paid))
      }
      setSelected(new Set())
      notifyChanged()
    } catch (err) {
      setActionError(err?.message || 'Failed to update the selected lines.')
    }
    setBulkBusy(false)
  }

  const handleSaveInvoice = async (row, raw) => {
    const value = String(raw ?? '').trim()
    const current = row.invoice_number || ''
    if (value === current) {
      setInvoiceDrafts((prev) => { const next = { ...prev }; delete next[row.id]; return next })
      return
    }
    setInvoiceState({ id: row.id, kind: 'saving', message: 'Saving…' })
    try {
      await patchJson(`/api/commissions/${row.id}`, { invoice_number: value || null })
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, invoice_number: value || null } : r)))
      setInvoiceDrafts((prev) => { const next = { ...prev }; delete next[row.id]; return next })
      setInvoiceState({ id: row.id, kind: 'success', message: 'Saved' })
      notifyChanged()
    } catch (err) {
      setInvoiceState({ id: row.id, kind: 'error', message: err?.message || 'Not saved' })
    }
  }

  // Net / Commission typed by hand. A new net recalculates the commission
  // server-side from the line's rate; the row takes whatever comes back.
  const [amountDrafts, setAmountDrafts] = useState({}) // `${id}:${field}` → text
  const [amountState, setAmountState] = useState(null) // { key, kind, message }
  const handleSaveAmount = async (row, field, raw) => {
    const key = `${row.id}:${field}`
    const text = String(raw ?? '').trim().replace(',', '.')
    const current = Number(row[field]) || 0
    const clearDraft = () => setAmountDrafts((prev) => { const next = { ...prev }; delete next[key]; return next })
    if (text === '' || Number(text) === current) { clearDraft(); return }
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0) {
      setAmountState({ key, kind: 'error', message: 'Not a valid amount' })
      return
    }
    setAmountState({ key, kind: 'saving', message: 'Saving…' })
    try {
      const json = await patchJson(`/api/commissions/${row.id}`, { [field]: value })
      const c = json?.commission || {}
      setRows((prev) => prev.map((r) => (r.id === row.id
        ? { ...r, order_total: c.order_total ?? r.order_total, commission_amount: c.commission_amount ?? r.commission_amount }
        : r)))
      clearDraft()
      setAmountState({ key, kind: 'success', message: 'Saved' })
      notifyChanged()
    } catch (err) {
      setAmountState({ key, kind: 'error', message: err?.message || 'Not saved' })
    }
  }

  // A cancelled order whose commission line is still here (the agent page
  // has the same action). The row disappears; the order itself is untouched.
  const handleDelete = async (row) => {
    const label = clientLabel(row)
    if (!window.confirm(`Delete the ${label} commission line for ${agentLabel(row)} (${fmt(row.commission_amount)})? This cannot be undone.`)) return
    setActionError(null)
    markBusy(row.id, true)
    try {
      const res = await fetch(`/api/commissions/${row.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      setSelected((prev) => { const next = new Set(prev); next.delete(row.id); return next })
      notifyChanged()
    } catch (err) {
      setActionError(err?.message || 'Failed to delete the line.')
    }
    markBusy(row.id, false)
  }

  // Reported / Force paid / Undo change more than one field (and may cascade
  // onto a bonus line), so the table reloads instead of guessing the result.
  const runRowAction = async (row, url, body) => {
    setActionError(null)
    markBusy(row.id, true)
    try {
      await patchJson(url, body)
      await load()
      notifyChanged()
    } catch (err) {
      setActionError(err?.message || 'Action failed.')
    }
    markBusy(row.id, false)
  }

  // ── Render ──────────────────────────────────────────────────────────
  const stageEuros = {
    awaiting: summary?.awaiting_customer,
    ready: summary?.ready_to_pay,
    reported: summary?.reported,
    settled: summary?.settled_amount,
  }

  return (
    <div data-testid="org-commissions-table" style={{ borderTop: `1px solid ${colors.lineGray}` }}>
      {/* Stage strip: what is ready vs not, in euros and lines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, background: colors.lineGray, borderBottom: `1px solid ${colors.lineGray}` }}>
        {[
          { key: 'awaiting', label: 'Awaiting customer', hint: 'Customer has not paid yet', color: '#9a3412', bg: '#fff' },
          { key: 'ready', label: 'Ready to pay', hint: 'Customer paid · goes on the next org report', color: '#166534', bg: '#f0fdf4' },
          { key: 'reported', label: 'Reported', hint: 'On a report · waiting for the payment', color: '#3730a3', bg: '#fff' },
          { key: 'settled', label: 'Paid to the team', hint: 'Settled by an organization payment', color: colors.inkPlum, bg: '#fff' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            data-testid={`org-commissions-stage-${s.key}`}
            onClick={() => setFilter(filter === s.key ? 'all' : s.key)}
            title={s.hint}
            style={{ padding: '10px 16px', background: s.bg, border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', outline: filter === s.key ? `2px solid ${s.color}` : 'none', outlineOffset: -2 }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color, marginTop: 2 }}>{fmt(stageEuros[s.key])}</div>
            <div style={{ fontSize: 10, color: colors.lovelabMuted }}>{counts[s.key] || 0} line{(counts[s.key] || 0) === 1 ? '' : 's'}</div>
          </button>
        ))}
      </div>

      <div style={{ padding: '10px 18px', borderBottom: `1px solid ${colors.lineGray}`, background: '#fcfbfe', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 6 }}>
          Team orders &amp; commission
        </span>
        {ORG_COMMISSION_FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0).map((f) => {
          const count = f.key === 'all' ? rows.length : (counts[f.key] || 0)
          const isActive = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              data-testid={`org-commissions-filter-${f.key}`}
              onClick={() => setFilter(f.key)}
              style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${isActive ? colors.inkPlum : colors.lineGray}`, background: isActive ? colors.inkPlum : '#fff', color: isActive ? '#fff' : colors.charcoal }}
            >
              {f.label} <span style={{ opacity: 0.7 }}>{count}</span>
            </button>
          )
        })}
        <input
          type="search"
          data-testid="org-commissions-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, invoice #, order…"
          aria-label="Search commissions"
          style={{ marginLeft: 'auto', minWidth: 220, fontSize: 12, padding: '5px 10px', borderRadius: 20, border: `1px solid ${colors.lineGray}`, fontFamily: 'inherit', color: colors.charcoal, background: '#fff' }}
        />
        <select
          data-testid="org-commissions-agent-filter"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          aria-label="Filter by agent"
          style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${colors.lineGray}`, fontFamily: 'inherit', color: colors.charcoal, background: '#fff' }}
        >
          <option value="">All agents</option>
          {agentOptions.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {actionError && (
        <div role="alert" data-testid="org-commissions-action-error" style={{ padding: '8px 18px', background: '#fef2f2', fontSize: 12, color: '#991b1b', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700, fontSize: 12, padding: 0 }}>×</button>
        </div>
      )}

      {selected.size > 0 && (
        <div data-testid="org-commissions-bulk-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '9px 18px', borderBottom: `1px solid ${colors.lineGray}`, background: '#f3f0f8' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum }}>{selected.size} selected</span>
          <button
            type="button"
            onClick={() => handleBulkCustomerPaid(true)}
            disabled={bulkBusy}
            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none', background: colors.inkPlum, color: '#fff', cursor: bulkBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: bulkBusy ? 0.6 : 1 }}
          >
            {bulkBusy ? 'Saving…' : `Mark ${selected.size} as paid`}
          </button>
          <button
            type="button"
            onClick={() => handleBulkCustomerPaid(false)}
            disabled={bulkBusy}
            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: bulkBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: bulkBusy ? 0.6 : 1 }}
          >
            Mark as unpaid
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={bulkBusy}
            style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
          >
            Clear
          </button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>Loading team commissions…</div>
      ) : error ? (
        <div data-testid="org-commissions-error" style={{ padding: 14, fontSize: 13, color: '#dc2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>{error}</span>
          <button type="button" onClick={load} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No commissions for this team yet.</div>
      ) : visibleRows.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>
          No {ORG_COMMISSION_FILTERS.find((f) => f.key === filter)?.label?.toLowerCase() || ''} commissions{agentFilter ? ' for this agent' : ''}{search.trim() ? ` matching “${search.trim()}”` : ''}.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
            <thead>
              <tr style={{ background: '#faf8fc' }}>
                <th style={{ ...th, textAlign: 'center', width: 34 }}>
                  {selectableVisibleIds.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all rows"
                      title="Select every row shown, then use the bulk Paid? buttons"
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: colors.inkPlum }}
                    />
                  )}
                </th>
                <th style={th}>Agent</th>
                <th style={th}>Date</th>
                <th style={th}>Client</th>
                <th style={th}>Fair</th>
                <th style={{ ...th, textAlign: 'right' }} title="The full order total as invoiced to the customer (includes shipping).">Total</th>
                <th style={{ ...th, textAlign: 'right' }} title="Order total minus shipping. Commission is a % of this number.">Net</th>
                <th style={{ ...th, textAlign: 'right' }}>Rate</th>
                <th style={{ ...th, textAlign: 'right' }}>Commission</th>
                <th style={th} title="Optional: the matching invoice number. Saves when you click away.">Invoice #</th>
                <th style={{ ...th, textAlign: 'center' }} title="Tick when the customer has paid this order. Only ticked rows go on the next org report.">Paid?</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const stage = commissionSettlementStage(row)
                const pill = STAGE_PILL[stage] || STAGE_PILL.awaiting
                const isBonus = row.type === 'new_client_bonus' || row.type === 'bonus'
                const isCustomerPaid = !!row.customer_paid_at
                const isPaidOut = row.status === 'paid'
                const isCancelled = row.status === 'cancelled'
                const isReported = stage === 'reported'
                const canToggle = canToggleCustomerPaid(row)
                const canForcePaid = canToggle && (isCustomerPaid || isReported)
                const rowBusy = busyIds.has(row.id)
                const netTotal = Number(row.order_total) || 0
                const grossTotal = Number(row.document?.total_amount ?? netTotal)
                const rate = Number(row.commission_rate) || 0
                const fairLabel = row.document?.event?.name || 'Direct'
                const docId = row.document_id || row.document?.id || null
                const label = clientLabel(row)
                return (
                  <tr key={row.id} data-testid={`org-commissions-row-${row.id}`} style={isCancelled ? { opacity: 0.55 } : undefined}>
                    <td style={{ ...td, textAlign: 'center', width: 34 }}>
                      {canToggle && (
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelected(row.id)}
                          aria-label={`Select ${label}`}
                          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: colors.inkPlum }}
                        />
                      )}
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: colors.inkPlum, whiteSpace: 'nowrap' }}>
                      <a href={`/admin/agents/${row.agent_id}`} style={{ color: 'inherit', textDecoration: 'none' }} title="Open this agent's page">
                        {agentLabel(row)}
                      </a>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{displayDate(row)}</td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {label}
                      {row.type === 'new_client_bonus' && (
                        <span style={{ marginLeft: 5, fontSize: 9, color: colors.inkPlum, fontWeight: 700, background: '#f3f0f8', padding: '1px 5px', borderRadius: 3 }}>NEW</span>
                      )}
                      {row.document?.order_channel === 'b2c' && (
                        <span style={{ marginLeft: 5, fontSize: 9, color: colors.luxeGold, fontWeight: 700, background: '#fef9ec', padding: '1px 5px', borderRadius: 3 }}>B2C</span>
                      )}
                      {row.type === 'order' && !isCancelled && docId && (
                        <div style={{ marginTop: 3 }}>
                          <a href={`/?reEdit=${docId}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, textDecoration: 'none' }}>
                            Edit order <span aria-hidden="true">↗</span>
                          </a>
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: colors.lovelabMuted }}>{isBonus ? '—' : fairLabel}</td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 12, color: colors.lovelabMuted, whiteSpace: 'nowrap' }}>{isBonus ? '—' : fmt(grossTotal)}</td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {isBonus ? '—' : canToggle ? (
                        <AmountInput
                          row={row}
                          field="order_total"
                          label={`Net for ${label}`}
                          title="Type the net amount (order total minus shipping) and click away to save. The commission is recalculated from the rate."
                          drafts={amountDrafts}
                          setDrafts={setAmountDrafts}
                          state={amountState}
                          setState={setAmountState}
                          onSave={handleSaveAmount}
                        />
                      ) : fmt(netTotal)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 12, color: colors.lovelabMuted }}>{isBonus ? '—' : `${rate}%`}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colors.charcoal, whiteSpace: 'nowrap' }}>
                      {canToggle ? (
                        <AmountInput
                          row={row}
                          field="commission_amount"
                          label={`Commission for ${label}`}
                          title="Type the commission to pay for this line and click away to save."
                          bold
                          drafts={amountDrafts}
                          setDrafts={setAmountDrafts}
                          state={amountState}
                          setState={setAmountState}
                          onSave={handleSaveAmount}
                        />
                      ) : fmt(row.commission_amount)}
                    </td>
                    <td style={td}>
                      {isRealRow(row) ? (
                        <div>
                          <input
                            type="text"
                            value={invoiceDrafts[row.id] ?? row.invoice_number ?? ''}
                            placeholder="—"
                            aria-label={`Invoice number for ${label}`}
                            disabled={invoiceState?.id === row.id && invoiceState.kind === 'saving'}
                            onChange={(e) => {
                              const value = e.target.value
                              setInvoiceDrafts((prev) => ({ ...prev, [row.id]: value }))
                              if (invoiceState?.id === row.id) setInvoiceState(null)
                            }}
                            onBlur={(e) => handleSaveInvoice(row, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                            style={{ width: 96, fontSize: 11, padding: '3px 6px', border: `1px solid ${invoiceState?.id === row.id && invoiceState.kind === 'error' ? '#dc2626' : colors.lineGray}`, borderRadius: 4, fontFamily: 'inherit', color: colors.charcoal, background: '#fff' }}
                          />
                          {invoiceState?.id === row.id && (
                            <div role="status" style={{ marginTop: 2, fontSize: 9, color: invoiceState.kind === 'error' ? '#dc2626' : '#16a34a' }}>
                              {invoiceState.message}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: colors.lovelabMuted }}>{row.invoice_number || '—'}</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {canToggle ? (
                        <input
                          type="checkbox"
                          checked={isCustomerPaid}
                          disabled={rowBusy}
                          onChange={(e) => handleToggleCustomerPaid(row, e.target.checked)}
                          aria-label={`Customer paid ${label}`}
                          title={isCustomerPaid ? 'Untick to take it off the next org report' : 'Tick when the customer has paid the order'}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: colors.inkPlum }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, color: colors.lovelabMuted }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: pill.fg, background: pill.bg, borderRadius: 12, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {pill.label}
                      </span>
                      {canToggle && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => runRowAction(row, `/api/commissions/${row.id}/reported`, { reported: !isReported })}
                            disabled={rowBusy}
                            title={isReported
                              ? 'Take this line off its report — it goes back to Ready and the next org report picks it up again.'
                              : 'Put this line on the latest organization report by hand. Ticks Paid? if it is not ticked yet.'}
                            style={rowActionStyle(colors.inkPlum, rowBusy)}
                          >
                            {isReported ? 'Not reported' : 'Mark reported'}
                          </button>
                        </div>
                      )}
                      {canForcePaid && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => runRowAction(row, `/api/commissions/${row.id}/force-paid`)}
                            disabled={rowBusy}
                            title="Move this line to Paid by hand — for a line already paid outside the app. No payment is recorded; Undo reverses it."
                            style={rowActionStyle('#15803d', rowBusy)}
                          >
                            Force paid
                          </button>
                        </div>
                      )}
                      {isPaidOut && isRealRow(row) && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => runRowAction(row, `/api/commissions/${row.id}/revert-paid`)}
                            disabled={rowBusy}
                            title="Mark unpaid — the line returns to Ready / Reported"
                            style={rowActionStyle(colors.inkPlum, rowBusy)}
                          >
                            Undo
                          </button>
                        </div>
                      )}
                      {canToggle && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => runRowAction(row, `/api/commissions/${row.id}`, { status: 'cancelled' })}
                            disabled={rowBusy}
                            title="Cancel this commission line — it leaves every total and report, but stays visible under Cancelled. The order itself is untouched."
                            style={rowActionStyle('#9a3412', rowBusy)}
                          >
                            Cancel line
                          </button>
                        </div>
                      )}
                      {isCancelled && isRealRow(row) && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => runRowAction(row, `/api/commissions/${row.id}`, { status: 'pending' })}
                            disabled={rowBusy}
                            title="Bring this line back to Awaiting / Ready"
                            style={rowActionStyle(colors.inkPlum, rowBusy)}
                          >
                            Restore
                          </button>
                        </div>
                      )}
                      {isRealRow(row) && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            disabled={rowBusy}
                            title="Delete this commission line permanently — for an order that was cancelled."
                            style={rowActionStyle('#b91c1c', rowBusy)}
                          >
                            {rowBusy ? '…' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ padding: '8px 18px', borderTop: `1px solid ${colors.lineGray}`, fontSize: 11, color: colors.lovelabMuted, lineHeight: 1.5, background: '#fafafa' }}>
        {totalCount > rows.length && (
          <span style={{ color: '#92400e', fontWeight: 600 }}>Showing the {rows.length} most recent of {totalCount} lines. </span>
        )}
        Tick <strong style={{ color: colors.charcoal }}>Paid?</strong> when the customer settles an order (→ <strong style={{ color: colors.charcoal }}>Ready</strong>).{' '}
        <strong style={{ color: colors.charcoal }}>Send org report now</strong> above emails Dionne one Excel with every Ready line, agent named on each, and marks them <strong style={{ color: colors.charcoal }}>Reported</strong>.{' '}
        <strong style={{ color: colors.charcoal }}>Record payment</strong> against that report settles them all as <strong style={{ color: colors.charcoal }}>Paid</strong>.
      </div>
    </div>
  )
}

/**
 * Right-aligned money input that saves on blur / Enter; shows Saved / error
 * under it. Shared with the agent page's Orders & Commission table.
 */
export function AmountInput({ row, field, label, title, bold = false, drafts, setDrafts, state, setState, onSave }) {
  const key = `${row.id}:${field}`
  const current = Number(row[field]) || 0
  const draft = drafts[key]
  const own = state?.key === key ? state : null
  return (
    <div>
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? current.toFixed(2)}
        aria-label={label}
        title={title}
        disabled={own?.kind === 'saving'}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const value = e.target.value
          setDrafts((prev) => ({ ...prev, [key]: value }))
          if (own) setState(null)
        }}
        onBlur={(e) => onSave(row, field, e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
        style={{ width: 92, fontSize: 12, fontWeight: bold ? 700 : 400, textAlign: 'right', padding: '3px 6px', border: `1px solid ${own?.kind === 'error' ? '#dc2626' : colors.lineGray}`, borderRadius: 4, fontFamily: 'inherit', color: colors.charcoal, background: '#fff' }}
      />
      {own && (
        <div role="status" style={{ marginTop: 2, fontSize: 9, color: own.kind === 'error' ? '#dc2626' : '#16a34a', textAlign: 'right' }}>
          {own.message}
        </div>
      )}
    </div>
  )
}

function rowActionStyle(color, busy) {
  return { fontSize: 10, fontWeight: 700, color, background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit', opacity: busy ? 0.5 : 1 }
}

const th = {
  padding: '9px 10px',
  fontSize: 10,
  fontWeight: 700,
  color: colors.lovelabMuted,
  textTransform: 'uppercase',
  textAlign: 'left',
  borderBottom: `1px solid ${colors.lineGray}`,
}

const td = {
  padding: '9px 10px',
  fontSize: 13,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
  verticalAlign: 'top',
}

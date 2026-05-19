'use client';

/**
 * AgentSelfView
 *
 * Single source of truth for the agent portal. Mirrors the admin agent-detail
 * page (`app/admin/agents/[id]/page.jsx`) but for the *current* agent only,
 * and with all admin-only controls hidden (no Add Bonus, no Record Payment,
 * no Edit Org, etc.). The agent sees the same layout admins see when they
 * open that agent's profile, so the two views stay in sync.
 *
 * Layout (mirrors admin):
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Hero card: avatar · name · email · rate · status · contract │
 *   ├─ READY TO PAY ─ AWAITING CUSTOMER ─ PAID OUT ─ REVENUE ─────┤
 *   │ Tabs: Financials | Reports | Consignment | Organisation |   │
 *   │       Documents                                              │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Props:
 *   defaultTab — which tab to open initially. Each agent portal page
 *                (/agent, /agent/reports, ...) mounts this component with
 *                the matching tab so the sidebar links land on the right
 *                section, but the user can still switch tabs inline.
 *   focused    — when true, hides the hero card, KPI strip and tab strip
 *                and renders ONLY the active section. Used by the
 *                single-purpose sidebar pages (Reports, Documents,
 *                Contracts, Consignment) so each route looks visually
 *                distinct from the Dashboard overview. The Dashboard
 *                (`/agent`) keeps the full multi-tab layout.
 *   pageTitle  — optional heading shown at the top of focused pages so
 *                the user knows where they landed.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { colors, fonts } from '@/lib/styles';
import { fmt } from '@/lib/utils';
import { useAuth } from './AuthProvider';
import { useOrgData } from '@/app/hooks/useOrgData';
import AgentFolderBrowser from './AgentFolderBrowser';
import ContractChatPanel from './ContractChatPanel';
import { isReturned, isOverdue, daysUntil } from '@/lib/consignment';

const STATUS_BADGE = {
  pending:   { bg: '#fff7ed', fg: '#9a3412', label: 'Awaiting' },
  approved:  { bg: '#f0fdf4', fg: '#166534', label: 'Ready' },
  paid:      { bg: '#f3f4f6', fg: '#374151', label: 'Paid' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b', label: 'Cancelled' },
};

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AgentSelfView({ defaultTab = 'financials', focused = false, pageTitle = null }) {
  const router = useRouter();
  const { profile, user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [commissions, setCommissions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [orgDocuments, setOrgDocuments] = useState([]);
  const [consignmentOrders, setConsignmentOrders] = useState([]);
  const [reports, setReports] = useState([]);
  const [contractInfo, setContractInfo] = useState({ url: null, name: null });

  // Contract upload state
  const [contractFile, setContractFile] = useState(null);
  const [contractUploading, setContractUploading] = useState(false);
  const [contractMsg, setContractMsg] = useState(null);
  const [contractChatOpen, setContractChatOpen] = useState(false);

  // Reports tab — agents can pick a month and download past reports but
  // they cannot trigger a new generate (admin-only on the API side).
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Keep the active tab in sync when the parent route changes (each route
  // mounts AgentSelfView with a different defaultTab). Without this the user
  // would see the previously selected tab when switching sidebar links.
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const { orgDetails, orgLedger, orgMembers } = useOrgData(profile?.organization_id);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [commRes, payRes, docsRes, consRes, reportsRes, contractRes] = await Promise.all([
        fetch('/api/commissions'),
        fetch('/api/agent-payments'),
        fetch('/api/documents?per_page=200'),
        fetch('/api/consignment/my'),
        fetch('/api/commission-reports?limit=24'),
        fetch(`/api/agents/${profile.id}/contract`),
      ]);

      const commJson = await commRes.json().catch(() => ({}));
      const payJson = await payRes.json().catch(() => ({}));
      const docsJson = await docsRes.json().catch(() => ({}));
      const consJson = await consRes.json().catch(() => ({}));
      const reportsJson = await reportsRes.json().catch(() => ({}));
      const contractJson = await contractRes.json().catch(() => ({}));

      const dedupedCommissions = Array.isArray(commJson?.commissions)
        ? Object.values((commJson.commissions || []).reduce((acc, row) => {
            if (row?.id) acc[row.id] = row;
            return acc;
          }, {}))
        : [];
      setCommissions(dedupedCommissions);
      setSummary(commJson.summary || null);
      setPayments(payJson.payments || []);
      setOrgDocuments(docsJson.documents || []);
      setConsignmentOrders(consJson.documents || []);
      setReports(reportsJson.reports || []);
      setContractInfo({ url: contractJson.url || null, name: contractJson.name || null });
    } catch (err) {
      setError(err?.message || 'Failed to load your data');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const orderRows = useMemo(
    () => commissions.filter((c) => c.type === 'order'),
    [commissions]
  );

  const orderDocs = useMemo(
    () => orgDocuments.filter((d) => d.document_type === 'order' && !d.deleted_at),
    [orgDocuments]
  );

  const orderRevenue = useMemo(() => {
    const docRev = orderDocs.reduce((acc, d) => acc + (Number(d.total_amount) || 0), 0);
    if (docRev > 0) return docRev;
    return orderRows.reduce((acc, c) => acc + (Number(c.order_total) || 0), 0);
  }, [orderDocs, orderRows]);

  const activeConsignment = useMemo(
    () => consignmentOrders.filter((o) => !isReturned(o)),
    [consignmentOrders]
  );

  const initials = (profile?.full_name || profile?.email || user?.email || '?')
    .split(/[\s.@]+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

  const commRate = Number(profile?.commission_rate) || 0;
  const s = summary || {};

  // ── Contract upload ─────────────────────────────────────────────────────
  const handleContractUpload = useCallback(async () => {
    if (!contractFile || !profile?.id) return;
    setContractUploading(true);
    setContractMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', contractFile);
      const res = await fetch(`/api/agents/${profile.id}/contract`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setContractFile(null);
      setContractMsg('Contract uploaded successfully');
      // Reload contract info
      const r = await fetch(`/api/agents/${profile.id}/contract`);
      const j = await r.json().catch(() => ({}));
      setContractInfo({ url: j.url || null, name: j.name || null });
    } catch (err) {
      setContractMsg(err?.message || 'Upload failed');
    } finally {
      setContractUploading(false);
    }
  }, [contractFile, profile?.id]);

  const handleContractRemove = useCallback(async () => {
    if (!profile?.id) return;
    if (typeof window !== 'undefined' && !window.confirm('Remove your contract?')) return;
    try {
      await fetch(`/api/agents/${profile.id}/contract`, { method: 'DELETE' });
      setContractInfo({ url: null, name: null });
      setContractMsg('Contract removed');
    } catch {
      setContractMsg('Failed to remove contract');
    }
  }, [profile?.id]);

  if (authLoading || loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted, fontFamily: fonts.body }}>
        Loading your dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: fonts.body }}>
        <div style={{ fontSize: 16, color: colors.danger }}>{error}</div>
        <button
          onClick={load}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Phase 22 (2026-05-13) — Reports tab merged into Financials. The
  // sidebar's "Reports" link now lands on /agent/reports which renders
  // the financials body in focused mode (so the agent still sees a
  // dedicated "your money" page, just sharing the same data plumbing).
  const TABS = [
    { id: 'financials',   label: 'Financials' },
    { id: 'consignment',  label: `Consignment (${consignmentOrders.length})` },
    { id: 'organisation', label: 'Organisation' },
    { id: 'documents',    label: 'Documents' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', fontFamily: fonts.body, background: '#f8f7fb' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* ── Focused page header (only when scaffold is hidden) ──────── */}
        {focused && pageTitle && (
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.charcoal, margin: 0, letterSpacing: '-0.01em' }}>
              {pageTitle}
            </h1>
            <div style={{ fontSize: 12, color: colors.lovelabMuted, marginTop: 4 }}>
              {profile?.full_name || profile?.email || user?.email}
              {commRate ? ` · ${commRate}% commission` : ''}
            </div>
          </div>
        )}

        {/* ── Hero card ───────────────────────────────────────────────── */}
        {!focused && (
        <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: colors.inkPlum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, flexShrink: 0 }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: colors.charcoal, marginBottom: 3 }}>
                {profile?.full_name || profile?.email || user?.email}
              </div>
              <div style={{ fontSize: 12, color: colors.lovelabMuted }}>{profile?.email || user?.email}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, background: '#f3f0f8', borderRadius: 20, padding: '2px 9px' }}>
                  {commRate}% rate
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: profile?.agent_status === 'active' ? '#374151' : '#9ca3af', background: profile?.agent_status === 'active' ? '#f0fdf4' : '#f5f5f5', border: `1px solid ${profile?.agent_status === 'active' ? '#d1fae5' : '#e5e7eb'}`, borderRadius: 20, padding: '2px 9px' }}>
                  {profile?.agent_status || 'unknown'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {contractInfo.url && (
              <button
                onClick={() => setContractChatOpen(true)}
                style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                Contract Q&amp;A
              </button>
            )}
          </div>
        </div>
        )}

        {/* ── 4 KPI cards (mirrors admin) ─────────────────────────────── */}
        {!focused && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            {
              label: 'READY TO PAY',
              value: fmt(s.ready_to_pay || 0),
              sub: s.ready_to_pay_count ? `${s.ready_to_pay_count} commission${s.ready_to_pay_count === 1 ? '' : 's'}` : 'customer paid',
              accent: '#16a34a',
              background: '#f0fdf4',
              border: '#bbf7d0',
            },
            {
              label: 'AWAITING CUSTOMER',
              value: fmt(s.awaiting_customer || 0),
              sub: s.awaiting_customer_count ? `${s.awaiting_customer_count} on hold` : 'customer not paid yet',
              accent: '#c2410c',
              background: '#fff7ed',
              border: '#fed7aa',
            },
            {
              label: 'PAID OUT',
              value: fmt(s.paid_amount || s.total_paid_out || 0),
              sub: 'transferred',
              accent: colors.charcoal,
              background: '#fff',
              border: colors.lineGray,
            },
            {
              label: 'REVENUE',
              value: fmt(orderRevenue),
              sub: `${orderDocs.length} order${orderDocs.length === 1 ? '' : 's'}`,
              accent: colors.charcoal,
              background: '#fff',
              border: colors.lineGray,
            },
          ].map((k) => (
            <div key={k.label} style={{ background: k.background, border: `1px solid ${k.border}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: colors.lovelabMuted, marginBottom: 6, textTransform: 'uppercase' }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.accent, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 5 }}>{k.sub}</div>
            </div>
          ))}
        </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        {!focused && (
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${colors.lineGray}`, marginBottom: 20, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 18px',
                border: 'none',
                borderBottom: activeTab === t.id ? `2px solid ${colors.inkPlum}` : '2px solid transparent',
                marginBottom: -2,
                background: 'none',
                cursor: 'pointer',
                fontFamily: fonts.body,
                fontSize: 13,
                fontWeight: activeTab === t.id ? 700 : 500,
                color: activeTab === t.id ? colors.inkPlum : colors.lovelabMuted,
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        )}

        {/* ── Tab: Financials ─────────────────────────────────────────── */}
        {/* Phase 22 (2026-05-13) — Reports panel slotted in at the top
            of the Financials body. Read-only for agents (only admins can
            click "Send report now"). The /agent/reports sidebar route
            now passes `defaultTab="financials"` and `focused`, so the
            agent's "Reports" link still works and lands on a clean
            "your money" page that includes this list. */}
        {activeTab === 'financials' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            <AgentReportsPanel reports={reports} />

            {/* Commission History */}
            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                Commission History
              </div>
              {commissions.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No commissions yet.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                      <tr style={{ background: '#faf8fc' }}>
                        <th style={th}>Date</th>
                        <th style={th}>Client</th>
                        <th style={{ ...th, textAlign: 'right' }} title="The full order total as invoiced to the customer (includes shipping).">Total</th>
                        <th style={{ ...th, textAlign: 'right' }} title="Order total minus shipping. Commission is a % of this number.">Net</th>
                        <th style={{ ...th, textAlign: 'right' }}>Rate</th>
                        <th style={{ ...th, textAlign: 'right' }}>Commission</th>
                        <th style={{ ...th, textAlign: 'center' }}>Paid?</th>
                        <th style={{ ...th, textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map((row) => {
                        const isBonus = row.type === 'new_client_bonus' || row.type === 'bonus';
                        const isCustomerPaid = !!row.customer_paid_at;
                        const isPaidOut = row.status === 'paid';
                        const isCancelled = row.status === 'cancelled';
                        const status = isCancelled
                          ? STATUS_BADGE.cancelled
                          : isPaidOut
                          ? STATUS_BADGE.paid
                          : isCustomerPaid
                          ? { bg: '#f0fdf4', fg: '#166534', label: 'Ready' }
                          : { bg: '#fff7ed', fg: '#9a3412', label: 'Awaiting' };
                        const clientLabel = row.type === 'new_client_bonus'
                          ? `New client bonus${row.document?.client_company ? ` — ${row.document.client_company}` : ''}`
                          : row.type === 'bonus'
                          ? 'Bonus'
                          : (row.document?.client_company || row.document?.client_name || 'Order');
                        const netTotal = Number(row.order_total) || 0;
                        const grossTotal = Number(row.gross_total ?? row.document?.total_amount ?? netTotal);
                        const hasShipping = isFinite(grossTotal) && grossTotal > netTotal;
                        const rowRate = Number(row.commission_rate) || 0;
                        const displayRate = isBonus ? null : (rowRate > 0 ? rowRate : commRate);
                        return (
                          <tr key={row.id} style={isCancelled ? { opacity: 0.55 } : undefined}>
                            <td style={td}>{new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                            <td style={{ ...td, fontSize: 12 }}>
                              {clientLabel}
                              {row.type === 'new_client_bonus' && (
                                <span style={{ marginLeft: 5, fontSize: 9, color: colors.inkPlum, fontWeight: 700, background: '#f3f0f8', padding: '1px 5px', borderRadius: 3 }}>NEW</span>
                              )}
                              {row.document?.order_channel === 'b2c' && (
                                <span style={{ marginLeft: 5, fontSize: 9, color: colors.luxeGold, fontWeight: 700, background: '#fef9ec', padding: '1px 5px', borderRadius: 3 }}>B2C</span>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontSize: 12, color: colors.lovelabMuted }}>{isBonus ? '—' : fmt(grossTotal)}</td>
                            <td style={{ ...td, textAlign: 'right', fontSize: 12, color: hasShipping ? colors.charcoal : colors.lovelabMuted, fontWeight: hasShipping ? 600 : 400 }}>
                              {isBonus ? '—' : fmt(netTotal)}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontSize: 12, color: colors.lovelabMuted }}>{displayRate == null ? '—' : `${displayRate}%`}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colors.charcoal }}>{fmt(row.commission_amount)}</td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              {/* Read-only checkbox — only admins can toggle this */}
                              <span title={isCustomerPaid ? 'Customer has paid' : 'Customer has not paid yet'} style={{ fontSize: 14, color: isCustomerPaid ? '#16a34a' : '#cbd5e1' }}>
                                {isCustomerPaid ? '✓' : '—'}
                              </span>
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: status.fg, background: status.bg, borderRadius: 12, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {status.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {commissions.length > 0 && (
                <div style={{ padding: '10px 14px', borderTop: `1px solid ${colors.lineGray}`, fontSize: 11, color: colors.lovelabMuted, lineHeight: 1.5, background: '#fafafa' }}>
                  <strong style={{ color: colors.charcoal }}>Total</strong> = full invoice. <strong style={{ color: colors.charcoal }}>Net</strong> = Total − shipping. <strong style={{ color: colors.charcoal }}>Commission</strong> = Rate × Net. The <strong style={{ color: colors.charcoal }}>Paid?</strong> column is set by your administrator.
                </div>
              )}
            </div>

            {/* Payments Ledger (read-only) */}
            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                Payments Ledger
              </div>
              {payments.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No payments recorded yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#faf8fc' }}>
                      <th style={th}>Date</th>
                      <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                      <th style={th}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((row) => (
                      <tr key={row.id}>
                        <td style={td}>{new Date(row.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colors.charcoal }}>{fmt(row.amount)}</td>
                        <td style={{ ...td, fontSize: 11, color: colors.lovelabMuted }}>{row.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab: Reports — REMOVED (Phase 22, 2026-05-13). The reports
            panel now lives inside the Financials tab body above as
            <AgentReportsPanel/>. The /agent/reports route updates its
            defaultTab to 'financials' so the sidebar still works. */}

        {/* ── Tab: Consignment ─────────────────────────────────────────── */}
        {activeTab === 'consignment' && (
          <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>My Consignments</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {activeConsignment.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', background: '#f3f4f6', borderRadius: 20, padding: '2px 9px' }}>
                    {activeConsignment.length} active
                  </span>
                )}
                {consignmentOrders.filter(isOverdue).length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 20, padding: '2px 9px' }}>overdue</span>
                )}
              </div>
            </div>
            {consignmentOrders.length === 0 ? (
              <div style={{ padding: 24, fontSize: 13, color: colors.lovelabMuted }}>
                No consignment orders assigned to you yet.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#faf8fc' }}>
                    {['Date', 'Recipient', 'Amount', 'Return Date', 'Status'].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consignmentOrders.map((o) => {
                    const c = o.metadata?.consignment || {};
                    const ret = isReturned(o);
                    const ovd = isOverdue(o);
                    const days = !ret ? daysUntil(o) : null;
                    return (
                      <tr key={o.id}>
                        <td style={td}>{o.created_at ? fmtDate(o.created_at) : '—'}</td>
                        <td style={td}>
                          <div style={{ fontWeight: 600 }}>{c.recipient_name || o.client_name || '—'}</div>
                          {(c.recipient_company || o.client_company) && (
                            <div style={{ fontSize: 11, color: '#aaa' }}>{c.recipient_company || o.client_company}</div>
                          )}
                        </td>
                        <td style={{ ...td, fontWeight: 700 }}>{o.total_amount != null ? fmt(o.total_amount) : '—'}</td>
                        <td style={td}>
                          {c.return_date ? (
                            <>
                              <div style={{ fontWeight: 600, color: ovd ? '#dc2626' : '#333' }}>{fmtDate(c.return_date)}</div>
                              {days !== null && (
                                <div style={{ fontSize: 10, fontWeight: 700, color: days < 0 ? '#dc2626' : days <= 7 ? '#d97706' : '#aaa' }}>
                                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
                                </div>
                              )}
                            </>
                          ) : '—'}
                        </td>
                        <td style={td}>
                          {ret
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '2px 8px' }}>Returned</span>
                            : ovd
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 20, padding: '2px 8px' }}>Overdue</span>
                              : <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', background: '#f0fdf4', borderRadius: 20, padding: '2px 8px' }}>Active</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tab: Organisation (org info + contract) ──────────────────── */}
        {activeTab === 'organisation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Organisation card */}
            {profile?.organization_id && orgDetails ? (
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum, marginBottom: 12 }}>{orgDetails.name}</div>
                <div style={{ display: 'flex', gap: 20, fontSize: 13, color: colors.charcoal, flexWrap: 'wrap' }}>
                  {orgDetails.territory && <span>Territory: <strong>{orgDetails.territory}</strong></span>}
                  {orgDetails.commission_rate != null && <span>Rate: <strong>{orgDetails.commission_rate}%</strong></span>}
                  {orgDetails.conditions && <span>Conditions: <strong>{orgDetails.conditions}</strong></span>}
                  {!orgDetails.territory && orgDetails.commission_rate == null && !orgDetails.conditions && (
                    <span style={{ color: colors.lovelabMuted }}>No settings yet</span>
                  )}
                </div>
                {orgLedger?.organization_summary && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.lineGray}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', marginBottom: 10 }}>Company Totals</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      <Stat label="Earned" value={fmt(orgLedger.organization_summary.total_commission_earned || 0)} />
                      <Stat label="Paid" value={fmt(orgLedger.organization_summary.total_paid_out || 0)} />
                      <Stat label="Pending" value={fmt(orgLedger.organization_summary.pending_balance || 0)} />
                    </div>
                  </div>
                )}
                {orgMembers && orgMembers.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', marginBottom: 8 }}>Team Members</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#faf8fc' }}>
                          <th style={th}>Name</th>
                          <th style={th}>Email</th>
                          <th style={th}>Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgMembers.map((m) => (
                          <tr key={m.id || m.user_id}>
                            <td style={td}>
                              {m.profiles?.full_name || m.profile?.full_name || '—'}
                              {(m.user_id === profile?.id || m.profiles?.id === profile?.id) && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, marginLeft: 6 }}>YOU</span>
                              )}
                            </td>
                            <td style={td}>{m.profiles?.email || m.profile?.email || '—'}</td>
                            <td style={td}>{m.role}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, fontSize: 13, color: colors.lovelabMuted }}>
                You are not part of an organisation yet. Your administrator can add you to one.
              </div>
            )}

            {/* My contract */}
            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>My Contract</div>
                {contractInfo.url && (
                  <button
                    onClick={() => setContractChatOpen(true)}
                    style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}
                  >
                    Ask about my contract
                  </button>
                )}
              </div>
              {contractInfo.url && (
                <div style={{ background: '#fafafa', borderRadius: 8, border: `1px solid ${colors.lineGray}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.inkPlum} strokeWidth="2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {contractInfo.name || 'Contract.pdf'}
                    </div>
                  </div>
                  <a href={contractInfo.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum, textDecoration: 'none' }}>View</a>
                  <button
                    onClick={handleContractRemove}
                    style={{ fontSize: 12, color: colors.danger, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                  >
                    Remove
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 10 * 1024 * 1024) { setContractMsg('File too large (max 10MB)'); return; }
                    setContractFile(f || null);
                    setContractMsg(null);
                  }}
                  style={{ fontSize: 13, color: colors.charcoal }}
                />
                <button
                  type="button"
                  disabled={!contractFile || contractUploading}
                  onClick={handleContractUpload}
                  style={{ alignSelf: 'flex-start', padding: '8px 16px', background: colors.inkPlum, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: !contractFile || contractUploading ? 'default' : 'pointer', fontFamily: 'inherit', opacity: !contractFile || contractUploading ? 0.6 : 1 }}
                >
                  {contractUploading ? 'Uploading…' : (contractInfo.url ? 'Replace Contract (PDF)' : 'Upload Contract (PDF)')}
                </button>
                {contractMsg && (
                  <div style={{ fontSize: 12, color: /failed|too large|forbidden|removed/i.test(contractMsg) ? colors.danger : colors.success }}>{contractMsg}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Documents (folders + subfolders) ────────────────────── */}
        {activeTab === 'documents' && (
          <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 20 }}>
            <AgentFolderBrowser
              agentId={profile?.id}
              organizationId={profile?.organization_id}
              orderDocuments={orgDocuments}
            />
          </div>
        )}
      </div>

      <ContractChatPanel
        isOpen={contractChatOpen}
        onClose={() => setContractChatOpen(false)}
        agentId={profile?.id}
        agentName={profile?.full_name || profile?.email}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: colors.lovelabMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, color: colors.charcoal, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

/**
 * Phase 22 (2026-05-13) — Read-only past-reports list for agent self-view.
 *
 * Lives inside the Financials body now (was its own tab). Agents can't
 * trigger generation themselves (admin-only on the API side), so this
 * panel only shows historical rows — no "Generate" button. Admins use
 * the richer `<CommissionReportsCard>` instead.
 */
function AgentReportsPanel({ reports }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Commission Reports</span>
        <span style={{ fontSize: 11, color: colors.lovelabMuted, fontWeight: 500 }}>
          Generated by your administrator
        </span>
      </div>
      {reports.length === 0 ? (
        <div style={{ padding: 24, fontSize: 13, color: colors.lovelabMuted }}>
          No reports yet. You will see your commission report here once your administrator generates it.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
            <thead>
              <tr style={{ background: '#faf8fc' }}>
                <th style={th}>Period</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
                <th style={th}>Generated</th>
                <th style={{ ...th, textAlign: 'right' }}>Files</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const isEmpty = Number(r.total_due) === 0;
                const status = (r.status === 'sent' || r.email_sent_at)
                  ? { label: 'Sent', bg: '#f0fdf4', fg: '#166534' }
                  : r.email_error
                  ? { label: 'Email failed', bg: '#fee2e2', fg: '#991b1b' }
                  : isEmpty
                  ? { label: 'Empty', bg: '#f3f4f6', fg: '#374151' }
                  : { label: 'Generated', bg: '#fffbeb', fg: '#92400e' };
                const generatedAt = r.created_at
                  ? new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
                  : '—';
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${colors.lineGray}` }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{r.period_label || r.period_key}</div>
                      <div style={{ fontSize: 11, color: colors.lovelabMuted }}>
                        {(r.order_count || 0)} order{r.order_count === 1 ? '' : 's'}
                        {r.bonus_count > 0 ? ` · ${r.bonus_count} bonus${r.bonus_count === 1 ? '' : 'es'}` : ''}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: isEmpty ? colors.lovelabMuted : colors.luxeGold }}>
                      {fmt(r.total_due)}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: status.bg, color: status.fg }}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: 11, color: colors.lovelabMuted }}>{generatedAt}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                        {r.drive_view_link && (
                          <a
                            href={r.drive_view_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, fontWeight: 600, color: colors.inkPlum, padding: '4px 8px', border: `1px solid ${colors.lineGray}`, borderRadius: 6, textDecoration: 'none' }}
                          >
                            Drive
                          </a>
                        )}
                        {r.storage_path && (
                          <a
                            href={`/api/commission-reports/${r.id}/download`}
                            download
                            style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: colors.inkPlum, padding: '4px 10px', borderRadius: 6, textDecoration: 'none' }}
                          >
                            Download
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = {
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 700,
  color: colors.lovelabMuted,
  textTransform: 'uppercase',
  textAlign: 'left',
  borderBottom: `1px solid ${colors.lineGray}`,
};

const td = {
  padding: '10px 12px',
  fontSize: 13,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
};

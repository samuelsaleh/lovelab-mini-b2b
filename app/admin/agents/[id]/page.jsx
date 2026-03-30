'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { colors, fonts } from '@/lib/styles';
import { fmt } from '@/lib/utils';
import ContractChatPanel from '@/app/components/ContractChatPanel';
import AgentFolderBrowser from '@/app/components/AgentFolderBrowser';
import KpiCard from '@/app/components/KpiCard';

export default function AdminAgentDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agent, setAgent] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [docDerivedRows, setDocDerivedRows] = useState([]);
  const [organizationLedger, setOrganizationLedger] = useState(null);
  const [organizationMembers, setOrganizationMembers] = useState([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingPayment, setSavingPayment] = useState(false);

  // Contract Q&A panel
  const [contractChatOpen, setContractChatOpen] = useState(false);

  // Commission extraction
  const [extracting, setExtracting] = useState(false);
  const [proposedConfig, setProposedConfig] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState(null);

  // Organization documents (orders/quotes linked via events)
  const [orgDocuments, setOrgDocuments] = useState([]);
  // Consignment orders assigned to this agent
  const [agentConsignmentOrders, setAgentConsignmentOrders] = useState([]);

  // Org editing
  const [orgData, setOrgData] = useState(null);
  const [editingOrg, setEditingOrg] = useState(false);
  const [orgForm, setOrgForm] = useState({ name: '', territory: '', commission_rate: '', conditions: '' });
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgMsg, setOrgMsg] = useState(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError('');
    try {
      const [agentsRes, commRes, payRes] = await Promise.all([
        fetch('/api/agents'),
        fetch(`/api/commissions?agent_id=${encodeURIComponent(agentId)}`),
        fetch(`/api/agent-payments?agent_id=${encodeURIComponent(agentId)}`)
      ]);
      const agentsJson = await agentsRes.json().catch(() => ({}));
      const commJson = await commRes.json().catch(() => ({}));
      const payJson = await payRes.json().catch(() => ({}));

      if (!agentsRes.ok) throw new Error(agentsJson?.error || 'Failed to load agent');
      if (!commRes.ok) throw new Error(commJson?.error || 'Failed to load commissions');

      const found = (agentsJson.agents || []).find((a) => a.id === agentId);
      if (!found) throw new Error('Agent not found');

      setAgent(found);
      setCommissions(commJson.commissions || []);
      setSummary(commJson.summary || null);
      setPayments(payJson.payments || []);

      if (found.organization_id) {
        const [ledgerRes, membersRes, orgRes] = await Promise.all([
          fetch(`/api/organizations/${found.organization_id}/ledger`),
          fetch(`/api/organizations/${found.organization_id}/members`),
          fetch(`/api/organizations/${found.organization_id}`),
        ]);
        const ledgerJson = await ledgerRes.json().catch(() => ({}));
        const membersJson = await membersRes.json().catch(() => ({}));
        const orgJson = await orgRes.json().catch(() => ({}));
        setOrganizationLedger(ledgerRes.ok ? ledgerJson : null);
        setOrganizationMembers(membersJson?.members || []);
        if (orgRes.ok && orgJson.organization) {
          setOrgData(orgJson.organization);
          setOrgForm({
            name: orgJson.organization.name || '',
            territory: orgJson.organization.territory || '',
            commission_rate: orgJson.organization.commission_rate != null ? String(orgJson.organization.commission_rate) : '',
            conditions: orgJson.organization.conditions || '',
          });
        }
      } else {
        setOrganizationLedger(null);
        setOrganizationMembers([]);
        setOrgData(null);
      }

      // Fetch docs + consignment orders in parallel (reuse docs for derived rows — no double fetch)
      let fetchedOrgDocs = [];
      let fetchedConsignmentOrders = [];
      try {
        const [orgDocsRes, consRes] = await Promise.all([
          fetch(`/api/documents?created_by_agent=${encodeURIComponent(agentId)}&per_page=200`),
          fetch(`/api/documents?order_channel=consignment&per_page=200`),
        ]);
        const orgDocsJson = await orgDocsRes.json().catch(() => ({}));
        const consJson2 = await consRes.json().catch(() => ({}));
        fetchedOrgDocs = orgDocsJson.documents || [];
        // Filter consignment orders assigned to this specific agent
        fetchedConsignmentOrders = (consJson2.documents || []).filter(
          d => d.consignment_agent_id === agentId
        );
        setOrgDocuments(fetchedOrgDocs);
        setAgentConsignmentOrders(fetchedConsignmentOrders);
      } catch {
        setOrgDocuments([]);
        setAgentConsignmentOrders([]);
      }

      // Always build derived commission rows from actual documents when no real records exist.
      // This fixes agents who have orders but no agent_commissions table entries yet.
      const commList = commJson.commissions || [];
      if (commList.filter(c => c.type === 'order').length === 0) {
        const orderDocs = fetchedOrgDocs.filter(
          (d) => d.document_type === 'order' && !d.deleted_at && (Number(d.total_amount) || 0) > 0
        );
        const rate = Number(found.commission_rate) || 0;
        setDocDerivedRows(orderDocs.map((d) => ({
          id: `doc-${d.id}`,
          type: 'order',
          created_at: d.created_at,
          order_total: Number(d.total_amount) || 0,
          commission_amount: Math.round(((Number(d.total_amount) || 0) * rate / 100) * 100) / 100,
          document: { client_company: d.client_company || d.client_name || 'Order', id: d.id, order_channel: d.order_channel },
          _derived: true,
        })));
      } else {
        setDocDerivedRows([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load details');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExtractCommission = useCallback(async () => {
    if (!agentId) return;
    setExtracting(true);
    setProposedConfig(null);
    setConfigMsg(null);
    try {
      const textRes = await fetch(`/api/agents/${agentId}/contract-text`);
      const textData = await textRes.json();
      if (!textData.text) { setConfigMsg('No contract text found.'); return; }

      const extRes = await fetch(`/api/agents/${agentId}/extract-commission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractText: textData.text }),
      });
      const extData = await extRes.json();
      if (extRes.ok && extData.proposed) {
        setProposedConfig(extData.proposed);
      } else {
        setConfigMsg(extData.error || 'Extraction failed');
      }
    } catch {
      setConfigMsg('Failed to extract commission structure');
    } finally {
      setExtracting(false);
    }
  }, [agentId]);

  const handleConfirmConfig = useCallback(async () => {
    if (!proposedConfig || !agentId) return;
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/commission-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: proposedConfig }),
      });
      const d = await res.json();
      if (res.ok) {
        setProposedConfig(null);
        setConfigMsg('Commission structure saved!');
        await load();
      } else {
        setConfigMsg(d.error || 'Failed to save');
      }
    } catch {
      setConfigMsg('Failed to save commission config');
    } finally {
      setSavingConfig(false);
    }
  }, [proposedConfig, agentId, load]);

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentAmount || Number(paymentAmount) <= 0) return;
    setSavingPayment(true);
    try {
      const res = await fetch('/api/agent-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          amount: paymentAmount,
          notes: paymentNotes,
          payment_date: new Date(paymentDate).toISOString()
        })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save payment');
      }
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!agent?.organization_id || !memberEmail.trim()) return;
    setAddingMember(true);
    try {
      const res = await fetch(`/api/organizations/${agent.organization_id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberEmail.trim().toLowerCase(), role: 'member' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to add member');
      setMemberEmail('');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleSaveOrg = async () => {
    if (!agent?.organization_id) return;
    setSavingOrg(true);
    setOrgMsg(null);
    try {
      const body = {
        name: orgForm.name.trim(),
        territory: orgForm.territory.trim() || null,
        commission_rate: orgForm.commission_rate ? Number(orgForm.commission_rate) : null,
        conditions: orgForm.conditions.trim() || null,
      };
      const res = await fetch(`/api/organizations/${agent.organization_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update organization');
      setOrgData(json.organization);
      setEditingOrg(false);
      setOrgMsg('Organization updated');
      setTimeout(() => setOrgMsg(null), 3000);
      await load();
    } catch (err) {
      setOrgMsg(err.message || 'Failed to save');
    } finally {
      setSavingOrg(false);
    }
  };

  const orderRows = useMemo(
    () => commissions.filter((c) => c.type === 'order'),
    [commissions]
  );

  const [activeTab, setActiveTab] = useState('financials');

  // ── derived financials ──────────────────────────────────────────────────────
  const s = summary || {};
  const st = agent?.stats || {};
  const commRate = Number(agent?.commission_rate) || 0;
  const orderDocsList = orgDocuments.filter(d => d.document_type === 'order' && !d.deleted_at);
  const docRevenue = orderDocsList.reduce((acc, d) => acc + (Number(d.total_amount) || 0), 0);
  const docCommission = Math.round(docRevenue * commRate / 100 * 100) / 100;
  const totalEarned =
    (s.total_earned || 0) > 0 ? s.total_earned
    : (st.effective_total_commission || 0) > 0 ? st.effective_total_commission
    : docCommission;
  const totalPaid = s.total_paid_out || 0;
  const pendingBalance = Math.max(0, totalEarned - totalPaid);
  const orderRevenue = docRevenue > 0 ? docRevenue
    : (s.order_count || 0) > 0
      ? orderRows.reduce((acc, c) => acc + (Number(c.order_total) || 0), 0)
      : (st.effective_revenue || 0);
  const activeConsignment = agentConsignmentOrders.filter(d => !d.metadata?.consignment?.returned_at);

  // ── avatar initials ──────────────────────────────────────────────────────────
  const initials = (agent?.full_name || agent?.email || '?')
    .split(/[\s.@]+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  const TABS = [
    { id: 'financials', label: 'Financials' },
    { id: 'consignment', label: `Consignment (${agentConsignmentOrders.length})` },
    { id: 'organisation', label: 'Organisation' },
    { id: 'documents', label: 'Documents' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', fontFamily: fonts.body, background: '#f8f7fb' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* back */}
        <button
          onClick={() => router.push('/admin/agents')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18, padding: '6px 12px', borderRadius: 7, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600 }}
        >
          ← Back to Agents
        </button>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: colors.lovelabMuted }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: 14, borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>{error}</div>
        ) : (
          <>
            {/* ── Hero card ────────────────────────────────────────────────── */}
            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* avatar */}
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: colors.inkPlum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, flexShrink: 0 }}>
                  {initials}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: colors.charcoal, marginBottom: 3 }}>
                    {agent?.full_name || agent?.email}
                  </div>
                  <div style={{ fontSize: 12, color: colors.lovelabMuted }}>{agent?.email}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, background: '#f3f0f8', borderRadius: 20, padding: '2px 9px' }}>
                      {commRate}% rate
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: agent?.agent_status === 'active' ? '#374151' : '#9ca3af', background: agent?.agent_status === 'active' ? '#f0fdf4' : '#f5f5f5', border: `1px solid ${agent?.agent_status === 'active' ? '#d1fae5' : '#e5e7eb'}`, borderRadius: 20, padding: '2px 9px' }}>
                      {agent?.agent_status || 'unknown'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {agent?.agent_contract_url && (
                  <button
                    onClick={() => setContractChatOpen(true)}
                    style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Contract Q&A
                  </button>
                )}
                <button
                  onClick={() => setShowPaymentModal(true)}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 700 }}
                >
                  Record Payment
                </button>
              </div>
            </div>

            {/* ── 4 KPI cards ──────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'EARNED', value: fmt(totalEarned), sub: `est. ${commRate}%` },
                { label: 'PENDING', value: fmt(pendingBalance), sub: 'to pay out' },
                { label: 'REVENUE', value: fmt(orderRevenue), sub: 'total' },
                { label: 'ORDERS', value: orderDocsList.length, sub: 'B2B / B2C' },
              ].map(k => (
                <div key={k.label} style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: colors.lovelabMuted, marginBottom: 6, textTransform: 'uppercase' }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: colors.charcoal, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 5 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── AI contract config banner ────────────────────────────────── */}
            {agent?.agent_contract_url && (
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: '12px 18px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: colors.lovelabMuted }}>
                    {agent?.agent_commission_config
                      ? <><strong style={{ color: colors.inkPlum }}>Commission config:</strong> {agent.agent_commission_config.type}{agent.agent_commission_config.description ? ` — ${agent.agent_commission_config.description}` : ''}</>
                      : 'No AI commission config extracted yet.'}
                  </div>
                  <button
                    onClick={handleExtractCommission}
                    disabled={extracting}
                    style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: extracting ? 'wait' : 'pointer', fontFamily: fonts.body, fontSize: 11, fontWeight: 600, flexShrink: 0, opacity: extracting ? 0.6 : 1 }}
                  >
                    {extracting ? 'Extracting…' : (agent?.agent_commission_config ? 'Re-extract' : 'Extract from Contract')}
                  </button>
                </div>
                {proposedConfig && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>AI detected this structure — confirm?</div>
                    <div style={{ color: '#374151', marginBottom: 8 }}>
                      <strong>Type:</strong> {proposedConfig.type}
                      {proposedConfig.description && <> — {proposedConfig.description}</>}
                      {proposedConfig.type === 'tiered' && (
                        <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                          {(proposedConfig.tiers || []).map((t, i) => (
                            <li key={i}>{t.upTo ? `Up to €${t.upTo.toLocaleString()}: ${t.rate}%` : `Above: ${t.rate}%`}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleConfirmConfig} disabled={savingConfig} style={{ padding: '6px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: savingConfig ? 0.6 : 1 }}>
                        {savingConfig ? 'Saving…' : 'Confirm & Save'}
                      </button>
                      <button onClick={() => setProposedConfig(null)} style={{ padding: '6px 12px', background: 'none', border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#1d4ed8' }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                {configMsg && (
                  <div style={{ marginTop: 8, fontSize: 12, color: /saved|success/i.test(configMsg) ? '#059669' : '#dc2626' }}>{configMsg}</div>
                )}
              </div>
            )}

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${colors.lineGray}`, marginBottom: 20 }}>
              {TABS.map(t => (
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
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Financials ───────────────────────────────────────────── */}
            {activeTab === 'financials' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
                {/* Commission */}
                <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                    Commission History
                  </div>
                  {(() => {
                    const allRows = commissions.length > 0 ? commissions : docDerivedRows;
                    const isDerived = commissions.length === 0 && docDerivedRows.length > 0;
                    if (allRows.length === 0) return (
                      <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No commissions yet.</div>
                    );
                    return (
                      <>
                        {isDerived && (
                          <div style={{ padding: '7px 14px', background: '#fffbeb', fontSize: 11, color: '#92400e', borderBottom: `1px solid ${colors.lineGray}` }}>
                            Estimated from order documents
                          </div>
                        )}
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#faf8fc' }}>
                              <th style={th}>Date</th>
                              <th style={th}>Client</th>
                              <th style={{ ...th, textAlign: 'right' }}>Total</th>
                              <th style={{ ...th, textAlign: 'right' }}>Comm.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allRows.map((row) => (
                              <tr key={row.id}>
                                <td style={td}>{new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                                <td style={{ ...td, fontSize: 12 }}>
                                  {row.type === 'bonus' ? 'Bonus' : (row.document?.client_company || 'Order')}
                                  {row.document?.order_channel === 'b2c' && (
                                    <span style={{ marginLeft: 5, fontSize: 9, color: colors.luxeGold, fontWeight: 700, background: '#fef9ec', padding: '1px 5px', borderRadius: 3 }}>B2C</span>
                                  )}
                                </td>
                                <td style={{ ...td, textAlign: 'right', fontSize: 12, color: colors.lovelabMuted }}>{row.type === 'order' ? fmt(row.order_total) : '—'}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colors.charcoal }}>{fmt(row.commission_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    );
                  })()}
                </div>

                {/* Payments */}
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

            {/* ── Tab: Consignment ──────────────────────────────────────────── */}
            {activeTab === 'consignment' && (
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>Consignment Orders</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {activeConsignment.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', background: '#f3f4f6', borderRadius: 20, padding: '2px 9px' }}>
                        {activeConsignment.length} active
                      </span>
                    )}
                    {agentConsignmentOrders.filter(d => {
                      const rd = d.metadata?.consignment?.return_date;
                      return rd && !d.metadata?.consignment?.returned_at && new Date(rd) < new Date();
                    }).length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 20, padding: '2px 9px' }}>overdue</span>
                    )}
                  </div>
                </div>
                {agentConsignmentOrders.length === 0 ? (
                  <div style={{ padding: 24, fontSize: 13, color: colors.lovelabMuted }}>No consignment orders assigned to this agent.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#faf8fc' }}>
                        {['Date', 'Recipient', 'Amount', 'Return Date', 'Status'].map(h => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agentConsignmentOrders.map(o => {
                        const c = o.metadata?.consignment || {};
                        const isRet = !!c.returned_at;
                        const isOvd = !isRet && c.return_date && new Date(c.return_date) < new Date();
                        const days = c.return_date && !isRet
                          ? Math.ceil((new Date(c.return_date) - new Date()) / 86400000)
                          : null;
                        return (
                          <tr key={o.id}>
                            <td style={td}>{o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td style={td}>
                              <div style={{ fontWeight: 600 }}>{c.recipient_name || o.client_name || '—'}</div>
                              {(c.recipient_company || o.client_company) && <div style={{ fontSize: 11, color: '#aaa' }}>{c.recipient_company || o.client_company}</div>}
                            </td>
                            <td style={{ ...td, fontWeight: 700 }}>{o.total_amount != null ? fmt(o.total_amount) : '—'}</td>
                            <td style={td}>
                              {c.return_date ? (
                                <>
                                  <div style={{ fontWeight: 600, color: isOvd ? '#dc2626' : '#333' }}>
                                    {new Date(c.return_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </div>
                                  {days !== null && (
                                    <div style={{ fontSize: 10, fontWeight: 700, color: days < 0 ? '#dc2626' : days <= 7 ? '#d97706' : '#aaa' }}>
                                      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
                                    </div>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                            <td style={td}>
                              {isRet
                                ? <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '2px 8px' }}>Returned</span>
                                : isOvd
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

            {/* ── Tab: Organisation ─────────────────────────────────────────── */}
            {activeTab === 'organisation' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {agent?.organization_id && orgData ? (
                  <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>{orgData.name}</div>
                      <button
                        onClick={() => { setEditingOrg(!editingOrg); setOrgMsg(null); }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.lineGray}`, background: editingOrg ? '#fef2f2' : '#fff', color: editingOrg ? '#dc2626' : colors.charcoal, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                      >
                        {editingOrg ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                    {editingOrg ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, display: 'block', marginBottom: 4 }}>Org Name</label>
                            <input value={orgForm.name} onChange={(e) => setOrgForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, display: 'block', marginBottom: 4 }}>Territory</label>
                            <input value={orgForm.territory} onChange={(e) => setOrgForm(f => ({ ...f, territory: e.target.value }))} style={inputStyle} />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, display: 'block', marginBottom: 4 }}>Org Rate (%)</label>
                            <input type="number" min="0" max="100" step="0.5" value={orgForm.commission_rate} onChange={(e) => setOrgForm(f => ({ ...f, commission_rate: e.target.value }))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, display: 'block', marginBottom: 4 }}>Conditions</label>
                            <input value={orgForm.conditions} onChange={(e) => setOrgForm(f => ({ ...f, conditions: e.target.value }))} style={inputStyle} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button onClick={handleSaveOrg} disabled={savingOrg || !orgForm.name.trim()} style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: colors.inkPlum, color: '#fff', cursor: savingOrg ? 'default' : 'pointer', fontSize: 12, fontWeight: 700, opacity: savingOrg ? 0.6 : 1 }}>
                            {savingOrg ? 'Saving...' : 'Save'}
                          </button>
                          {orgMsg && <span style={{ fontSize: 12, color: /fail|error/i.test(orgMsg) ? '#dc2626' : '#059669' }}>{orgMsg}</span>}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 20, fontSize: 13, color: colors.charcoal, flexWrap: 'wrap' }}>
                        {orgData.territory && <span>Territory: <strong>{orgData.territory}</strong></span>}
                        {orgData.commission_rate != null && <span>Rate: <strong>{orgData.commission_rate}%</strong></span>}
                        {orgData.conditions && <span>Conditions: <strong>{orgData.conditions}</strong></span>}
                        {!orgData.territory && orgData.commission_rate == null && !orgData.conditions && <span style={{ color: colors.lovelabMuted }}>No settings yet</span>}
                      </div>
                    )}

                    {organizationLedger?.organization_summary && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.lineGray}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', marginBottom: 10 }}>Company Totals</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                          <Stat label="Earned" value={fmt(organizationLedger.organization_summary.total_commission_earned || 0)} />
                          <Stat label="Paid" value={fmt(organizationLedger.organization_summary.total_paid_out || 0)} />
                          <Stat label="Pending" value={fmt(organizationLedger.organization_summary.pending_balance || 0)} />
                        </div>
                        {(organizationLedger.per_member || []).length > 0 && (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', marginBottom: 8 }}>Per Member</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#faf8fc' }}>
                                  <th style={th}>Member</th>
                                  <th style={{ ...th, textAlign: 'right' }}>Earned</th>
                                  <th style={{ ...th, textAlign: 'right' }}>Paid</th>
                                  <th style={{ ...th, textAlign: 'right' }}>Pending</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(organizationLedger.per_member || []).map((m) => (
                                  <tr key={m.user_id}>
                                    <td style={td}>{m.profile?.full_name || m.profile?.email || m.user_id}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{fmt(m.total_commission_earned || 0)}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{fmt(m.total_paid_out || 0)}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{fmt(m.pending_balance || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, fontSize: 13, color: colors.lovelabMuted }}>
                    No organisation linked to this agent.
                  </div>
                )}

                {/* Team members */}
                {agent?.organization_id && (
                  <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, marginBottom: 12 }}>Team Members</div>
                    <form onSubmit={handleAddMember} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        type="email"
                        placeholder="colleague@company.com"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button type="submit" disabled={addingMember || !memberEmail.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: addingMember ? 'default' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                        {addingMember ? 'Adding...' : 'Add'}
                      </button>
                    </form>
                    {organizationMembers.length > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#faf8fc' }}>
                            <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {organizationMembers.map((m) => (
                            <tr key={m.id}>
                              <td style={td}>{m.profiles?.full_name || '—'}</td>
                              <td style={td}>{m.profiles?.email || '—'}</td>
                              <td style={td}>{m.role}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Documents ────────────────────────────────────────────── */}
            {activeTab === 'documents' && (
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 20 }}>
                <AgentFolderBrowser agentId={agentId} organizationId={agent?.organization_id} orderDocuments={orgDocuments} />
              </div>
            )}

            {/* ── Payment Modal ─────────────────────────────────────────────── */}
            {showPaymentModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: '#fff', padding: 24, borderRadius: 14, width: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.15)', fontFamily: fonts.body }}>
                  <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 800, color: colors.inkPlum }}>Record Payment</h3>
                  <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 4 }}>Date</label>
                      <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 4 }}>Amount (€)</label>
                      <input type="number" step="0.01" min="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" required style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 4 }}>Notes (optional)</label>
                      <input type="text" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="e.g. bank transfer" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button type="button" onClick={() => setShowPaymentModal(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, background: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: fonts.body }}>Cancel</button>
                      <button type="submit" disabled={savingPayment} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: savingPayment ? 'default' : 'pointer', fontWeight: 700, fontFamily: fonts.body }}>
                        {savingPayment ? 'Saving...' : 'Save Payment'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ContractChatPanel
        isOpen={contractChatOpen}
        onClose={() => setContractChatOpen(false)}
        agentId={agentId}
        agentName={agent?.full_name || agent?.email}
      />
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: colors.lovelabMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 20, color: color || colors.charcoal, fontWeight: 800 }}>{value}</div>
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

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${colors.lineGray}`,
  fontSize: 14,
  fontFamily: fonts.body,
  boxSizing: 'border-box'
};

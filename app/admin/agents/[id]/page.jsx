'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { colors, fonts } from '@/lib/styles';
import { fmt } from '@/lib/utils';
import ContractChatPanel from '@/app/components/ContractChatPanel';
import AgentFolderBrowser from '@/app/components/AgentFolderBrowser';

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

      const commList = commJson.commissions || [];
      const stats = found.stats || {};
      if (commList.filter(c => c.type === 'order').length === 0 && (stats.effective_orders || 0) > 0) {
        try {
          const docsRes = await fetch(`/api/documents?created_by_agent=${encodeURIComponent(agentId)}`);
          const docsJson = await docsRes.json().catch(() => ({}));
          const orderDocs = (docsJson.documents || []).filter(
            (d) => d.document_type === 'order' && !d.deleted_at && (Number(d.total_amount) || 0) > 0
          );
          const rate = Number(found.commission_rate) || 0;
          setDocDerivedRows(orderDocs.map((d) => ({
            id: `doc-${d.id}`,
            type: 'order',
            created_at: d.created_at,
            order_total: Number(d.total_amount) || 0,
            commission_amount: Math.round(((Number(d.total_amount) || 0) * rate / 100) * 100) / 100,
            document: { client_company: d.client_company || d.client_name || 'Order', id: d.id },
            _derived: true,
          })));
        } catch {
          setDocDerivedRows([]);
        }
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

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', fontFamily: fonts.body }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>
            Agent Performance & Ledger
          </h1>
          <button
            onClick={() => router.push('/admin/agents')}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: `1px solid ${colors.lineGray}`,
              background: '#fff',
              color: colors.charcoal,
              cursor: 'pointer',
              fontFamily: fonts.body,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ← Back to Agents
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.lovelabMuted }}>Loading details…</div>
        ) : error ? (
          <div style={{ padding: 14, borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>{error}</div>
        ) : (
          <>
            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.charcoal }}>{agent?.full_name || agent?.email}</div>
                  <div style={{ fontSize: 13, color: colors.lovelabMuted, marginTop: 4 }}>{agent?.email}</div>
                  <div style={{ marginTop: 8, fontSize: 12, color: colors.charcoal }}>
                    Rate: {agent?.commission_rate ?? '—'}% · Status: {agent?.agent_status || '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {agent?.agent_contract_url && (
                    <button
                      onClick={() => setContractChatOpen(true)}
                      style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                      Contract Q&A
                    </button>
                  )}
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 13, fontWeight: 700 }}
                  >
                    Record Payment
                  </button>
                </div>
              </div>

              {/* Commission config section */}
              {agent?.agent_contract_url && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.lineGray}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 12, color: colors.lovelabMuted }}>
                      {agent?.agent_commission_config
                        ? <>Commission config: <strong style={{ color: colors.inkPlum }}>{agent.agent_commission_config.type}</strong> — {agent.agent_commission_config.description || JSON.stringify(agent.agent_commission_config).slice(0, 80)}</>
                        : 'No AI commission config yet.'}
                    </div>
                    <button
                      onClick={handleExtractCommission}
                      disabled={extracting}
                      style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: extracting ? 'wait' : 'pointer', fontFamily: fonts.body, fontSize: 11, fontWeight: 600, flexShrink: 0, opacity: extracting ? 0.6 : 1 }}
                    >
                      {extracting ? 'Extracting…' : (agent?.agent_commission_config ? 'Re-extract from Contract' : 'Extract from Contract')}
                    </button>
                  </div>

                  {/* Proposed config confirmation banner */}
                  {proposedConfig && (
                    <div style={{ marginTop: 12, padding: 12, background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>AI detected this compensation structure — confirm?</div>
                      <div style={{ color: '#374151', marginBottom: 10 }}>
                        <strong>Type:</strong> {proposedConfig.type}
                        {proposedConfig.description && <> — {proposedConfig.description}</>}
                        {proposedConfig.type === 'flat' && <> ({proposedConfig.rate}%)</>}
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
                    <div style={{ marginTop: 8, fontSize: 12, color: /saved|success/i.test(configMsg) ? colors.success : colors.danger }}>{configMsg}</div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
              {(() => {
                const s = summary || {};
                const st = agent?.stats || {};
                const totalEarned = (s.total_earned || 0) > 0 ? s.total_earned : (st.effective_total_commission || 0);
                const totalPaid = s.total_paid_out || 0;
                const pendingBalance = totalEarned > 0 ? totalEarned - totalPaid : (st.effective_pending_commission || 0);
                const orderRevenue = (s.order_count || 0) > 0
                  ? orderRows.reduce((acc, c) => acc + (Number(c.order_total) || 0), 0)
                  : (st.effective_revenue || 0);
                const orderCount = (s.order_count || 0) > 0 ? s.order_count : (st.effective_orders || 0);
                return (
                  <>
                    <Stat label="Total Earned" value={fmt(totalEarned)} />
                    <Stat label="Total Paid" value={fmt(totalPaid)} color={colors.success} />
                    <Stat label="True Pending Balance" value={fmt(pendingBalance)} color={pendingBalance > 0 ? colors.warning : colors.inkPlum} />
                    <Stat label="Order Revenue" value={fmt(orderRevenue)} />
                    <Stat label="Orders" value={orderCount} />
                  </>
                );
              })()}
            </div>

            {agent?.organization_id && orgData && (
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                    Organization — {orgData.name}
                  </div>
                  <button
                    onClick={() => { setEditingOrg(!editingOrg); setOrgMsg(null); }}
                    style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.lineGray}`, background: editingOrg ? '#fef2f2' : '#fff', color: editingOrg ? '#dc2626' : colors.charcoal, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                  >
                    {editingOrg ? 'Cancel' : 'Edit Org'}
                  </button>
                </div>
                {editingOrg ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
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
                        <input type="number" min="0" max="100" step="0.5" value={orgForm.commission_rate} onChange={(e) => setOrgForm(f => ({ ...f, commission_rate: e.target.value }))} placeholder="e.g. 15" style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, display: 'block', marginBottom: 4 }}>Conditions</label>
                        <input value={orgForm.conditions} onChange={(e) => setOrgForm(f => ({ ...f, conditions: e.target.value }))} placeholder="Special conditions" style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={handleSaveOrg} disabled={savingOrg || !orgForm.name.trim()} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: colors.inkPlum, color: '#fff', cursor: savingOrg ? 'default' : 'pointer', fontSize: 12, fontWeight: 700, opacity: savingOrg ? 0.6 : 1 }}>
                        {savingOrg ? 'Saving...' : 'Save Organization'}
                      </button>
                      {orgMsg && <span style={{ fontSize: 12, color: /fail|error/i.test(orgMsg) ? '#dc2626' : '#059669' }}>{orgMsg}</span>}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: colors.charcoal, marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {orgData.territory && <span>Territory: <strong>{orgData.territory}</strong></span>}
                    {orgData.commission_rate != null && <span>Org Rate: <strong>{orgData.commission_rate}%</strong></span>}
                    {orgData.conditions && <span>Conditions: <strong>{orgData.conditions}</strong></span>}
                    {!orgData.territory && orgData.commission_rate == null && !orgData.conditions && <span style={{ color: colors.lovelabMuted }}>No org-level settings configured yet</span>}
                  </div>
                )}
                {organizationLedger?.organization_summary && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                      <Stat label="Company Earned" value={fmt(organizationLedger.organization_summary.total_commission_earned || 0)} />
                      <Stat label="Company Paid" value={fmt(organizationLedger.organization_summary.total_paid_out || 0)} color={colors.success} />
                      <Stat label="Company Pending" value={fmt(organizationLedger.organization_summary.pending_balance || 0)} color={colors.warning} />
                    </div>
                    {(organizationLedger.per_member || []).length > 0 && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: colors.lovelabMuted, marginBottom: 8, textTransform: 'uppercase' }}>
                          Per Member Totals
                        </div>
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
                                <td style={{ ...td, textAlign: 'right', color: colors.success }}>{fmt(m.total_paid_out || 0)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmt(m.pending_balance || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {agent?.organization_id && (
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, marginBottom: 10 }}>
                  Company Team Members
                </div>
                <form onSubmit={handleAddMember} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="submit"
                    disabled={addingMember || !memberEmail.trim()}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: colors.inkPlum,
                      color: '#fff',
                      cursor: addingMember ? 'default' : 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {addingMember ? 'Adding...' : 'Add Member'}
                  </button>
                </form>
                {organizationMembers.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#faf8fc' }}>
                        <th style={th}>Name</th>
                        <th style={th}>Email</th>
                        <th style={th}>Role</th>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24, alignItems: 'start' }}>
              {/* Payments History */}
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                  Payments Ledger (Payouts)
                </div>
                {payments.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No payments recorded yet.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#faf8fc' }}>
                        <th style={th}>Date</th>
                        <th style={{ ...th, textAlign: 'right' }}>Amount Paid</th>
                        <th style={th}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((row) => (
                        <tr key={row.id}>
                          <td style={td}>{new Date(row.payment_date).toLocaleDateString('en-GB')}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colors.success }}>{fmt(row.amount)}</td>
                          <td style={{ ...td, fontSize: 11, color: colors.lovelabMuted }}>{row.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Commission Details */}
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                  Commission History (Earned)
                </div>
                {(() => {
                  const allRows = commissions.length > 0 ? commissions : docDerivedRows;
                  const isDerived = commissions.length === 0 && docDerivedRows.length > 0;
                  if (allRows.length === 0) {
                    return <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No commissions yet.</div>;
                  }
                  return (
                    <>
                      {isDerived && (
                        <div style={{ padding: '8px 14px', background: '#fffbeb', fontSize: 11, color: '#92400e', borderBottom: `1px solid ${colors.lineGray}` }}>
                          Estimated from order documents (no commission records found)
                        </div>
                      )}
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#faf8fc' }}>
                            <th style={th}>Date</th>
                            <th style={th}>Details</th>
                            <th style={{ ...th, textAlign: 'right' }}>Order Total</th>
                            <th style={{ ...th, textAlign: 'right' }}>Commission</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allRows.map((row) => (
                            <tr key={row.id}>
                              <td style={td}>{new Date(row.created_at).toLocaleDateString('en-GB')}</td>
                              <td style={{ ...td, fontSize: 11 }}>
                                {row.type === 'bonus' ? 'Bonus' : (row.document?.client_company || 'Order')}
                              </td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 12, color: colors.lovelabMuted }}>
                                {row.type === 'order' ? fmt(row.order_total) : '—'}
                              </td>
                              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(row.commission_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Agent Folder */}
            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Documents Folder
              </div>
              <AgentFolderBrowser agentId={agentId} organizationId={agent?.organization_id} />
            </div>

            {/* Payment Modal */}
            {showPaymentModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 400, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 18, color: colors.inkPlum }}>Record Payment to Agent</h3>
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
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 4 }}>Notes (Optional)</label>
                      <input type="text" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="e.g. Bank transfer ID" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" onClick={() => setShowPaymentModal(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                      <button type="submit" disabled={savingPayment} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: savingPayment ? 'default' : 'pointer', fontWeight: 600 }}>
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

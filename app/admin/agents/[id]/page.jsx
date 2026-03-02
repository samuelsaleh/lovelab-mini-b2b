'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { colors, fonts } from '@/lib/styles';

const fmt = (n) => {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
};

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
  
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingPayment, setSavingPayment] = useState(false);

  const load = async () => {
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
    } catch (err) {
      setError(err.message || 'Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [agentId]);

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
      alert(err.message);
    } finally {
      setSavingPayment(false);
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
            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 16, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.charcoal }}>{agent?.full_name || agent?.email}</div>
                <div style={{ fontSize: 13, color: colors.lovelabMuted, marginTop: 4 }}>{agent?.email}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: colors.charcoal }}>
                  Rate: {agent?.commission_rate ?? '—'}% · Status: {agent?.agent_status || '—'}
                </div>
              </div>
              <button
                onClick={() => setShowPaymentModal(true)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: colors.inkPlum,
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Record Payment
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
              <Stat label="Total Earned" value={fmt(summary?.total_earned || 0)} />
              <Stat label="Total Paid" value={fmt(summary?.total_paid_out || 0)} color={colors.success} />
              <Stat label="True Pending Balance" value={fmt(summary?.true_pending_balance || 0)} color={summary?.true_pending_balance > 0 ? colors.warning : colors.inkPlum} />
              <Stat label="Order Revenue" value={fmt(orderRows.reduce((acc, c) => acc + (Number(c.order_total) || 0), 0))} />
              <Stat label="Orders" value={summary?.order_count ?? 0} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24, alignItems: 'start' }}>
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
                {commissions.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No commissions yet.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#faf8fc' }}>
                        <th style={th}>Date</th>
                        <th style={th}>Details</th>
                        <th style={{ ...th, textAlign: 'right' }}>Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map((row) => (
                        <tr key={row.id}>
                          <td style={td}>{new Date(row.created_at).toLocaleDateString('en-GB')}</td>
                          <td style={{ ...td, fontSize: 11 }}>
                            {row.type === 'bonus' ? 'Bonus' : (row.document?.client_company || 'Order')}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(row.commission_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
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

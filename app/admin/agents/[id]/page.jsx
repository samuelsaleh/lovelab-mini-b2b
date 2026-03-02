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
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!agentId) return;
      setLoading(true);
      setError('');
      try {
        const [agentsRes, commRes] = await Promise.all([
          fetch('/api/agents'),
          fetch(`/api/commissions?agent_id=${encodeURIComponent(agentId)}`),
        ]);
        const agentsJson = await agentsRes.json().catch(() => ({}));
        const commJson = await commRes.json().catch(() => ({}));

        if (!agentsRes.ok) throw new Error(agentsJson?.error || 'Failed to load agent');
        if (!commRes.ok) throw new Error(commJson?.error || 'Failed to load commissions');

        const found = (agentsJson.agents || []).find((a) => a.id === agentId);
        if (!found) throw new Error('Agent not found');

        setAgent(found);
        setCommissions(commJson.commissions || []);
        setSummary(commJson.summary || null);
      } catch (err) {
        setError(err.message || 'Failed to load details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agentId]);

  const orderRows = useMemo(
    () => commissions.filter((c) => c.type === 'order'),
    [commissions]
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', fontFamily: fonts.body }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>
            Agent Performance
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
              <div style={{ fontSize: 18, fontWeight: 700, color: colors.charcoal }}>{agent?.full_name || agent?.email}</div>
              <div style={{ fontSize: 13, color: colors.lovelabMuted, marginTop: 4 }}>{agent?.email}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: colors.charcoal }}>
                Rate: {agent?.commission_rate ?? '—'}% · Status: {agent?.agent_status || '—'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
              <Stat label="Orders" value={summary?.order_count ?? 0} />
              <Stat label="Order Revenue" value={fmt(orderRows.reduce((acc, c) => acc + (Number(c.order_total) || 0), 0))} />
              <Stat label="Commission Earned" value={fmt(summary?.total_earned || 0)} />
              <Stat label="Pending to Pay" value={fmt(summary?.pending_amount || 0)} />
            </div>

            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                Orders made by this agent
              </div>
              {orderRows.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No orders yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#faf8fc' }}>
                      <th style={th}>Client</th>
                      <th style={th}>Date</th>
                      <th style={{ ...th, textAlign: 'right' }}>Order total</th>
                      <th style={{ ...th, textAlign: 'right' }}>Commission</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderRows.map((row) => (
                      <tr key={row.id}>
                        <td style={td}>{row.document?.client_company || row.document?.client_name || '—'}</td>
                        <td style={td}>{new Date(row.created_at).toLocaleDateString('en-GB')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(row.order_total)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(row.commission_amount)}</td>
                        <td style={td}>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: colors.lovelabMuted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, color: colors.charcoal, fontWeight: 700 }}>{value}</div>
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

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { colors, fonts } from '@/lib/styles';
import AgentFormModal from '../../components/AgentFormModal';

const fmt = (n) => {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
};

const statusColors = {
  active: colors.success,
  paused: colors.warning,
  inactive: colors.danger,
  invited: colors.info,
};

export default function AdminAgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [error, setError] = useState('');
  const [bonusAgent, setBonusAgent] = useState(null);
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusNotes, setBonusNotes] = useState('');
  const [bonusLoading, setBonusLoading] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchAgents = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load agents');
      setAgents(data.agents || []);
    } catch (err) {
      setError(err.message || 'Failed to load agents');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const activeAgents = agents.filter(a => !a.agent_deleted_at);
  const trashedAgents = agents.filter(a => a.agent_deleted_at);

  const filteredAgents = activeAgents.filter((a) => {
    const matchSearch =
      !search ||
      (a.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.agent_company || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === 'all' || (a.agent_status || '').toLowerCase() === statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });

  const activeCount = activeAgents.filter((a) => a.agent_status === 'active').length;

  const handleDelete = async (agent) => {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error || 'Failed'); }
      setConfirmDelete(null);
      fetchAgents();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRestore = async (agent) => {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _restore: true }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error || 'Failed'); }
      fetchAgents();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePermanentDelete = async (agent) => {
    try {
      const res = await fetch(`/api/agents/${agent.id}?permanent=true`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Failed');
      fetchAgents();
    } catch (err) {
      setError(err.message);
    }
  };

  const getDaysLeft = (deletedAt) => {
    if (!deletedAt) return 7;
    const days = 7 - (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(days));
  };

  const handleAddAgent = () => {
    setEditingAgent(null);
    setShowForm(true);
  };

  const handleEdit = (agent) => {
    setEditingAgent(agent);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingAgent(null);
  };

  const handleFormSaved = () => {
    fetchAgents();
  };

  const handleAddBonus = (agent) => {
    setBonusAgent(agent);
    setBonusAmount('');
    setBonusNotes('');
  };

  const handleBonusClose = () => {
    setBonusAgent(null);
    setBonusAmount('');
    setBonusNotes('');
  };

  const handleBonusSubmit = async (e) => {
    e.preventDefault();
    if (!bonusAgent) return;
    const amt = Number(bonusAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setBonusLoading(true);
    setError('');
    try {
      const res = await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: bonusAgent.id, amount: amt, notes: bonusNotes.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to add bonus');
      handleBonusClose();
      fetchAgents();
    } catch (err) {
      setError(err.message || 'Failed to add bonus');
    } finally {
      setBonusLoading(false);
    }
  };

  const formatAgentSince = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', fontFamily: fonts.body }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>
            Agents ({activeCount} active)
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {trashedAgents.length > 0 && (
              <button
                onClick={() => setShowTrash(!showTrash)}
                style={{
                  padding: '10px 16px',
                  border: `1px solid ${colors.lineGray}`,
                  background: showTrash ? '#fef2f2' : '#fff',
                  color: showTrash ? '#dc2626' : '#888',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: fonts.body,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                🗑 Trash ({trashedAgents.length})
              </button>
            )}
            <button
              onClick={handleAddAgent}
              style={{
                padding: '10px 24px',
                border: 'none',
                background: colors.inkPlum,
                color: '#fff',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: fonts.body,
              }}
            >
              + Add Agent
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search by name, email, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '10px 14px',
              borderRadius: 8,
              border: `1px solid ${colors.lineGray}`,
              fontSize: 13,
              fontFamily: fonts.body,
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: `1px solid ${colors.lineGray}`,
              fontSize: 13,
              fontFamily: fonts.body,
              background: '#fff',
              color: colors.charcoal,
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="inactive">Inactive</option>
            <option value="invited">Invited</option>
          </select>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: '#fef2f2',
              color: colors.danger,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: colors.lovelabMuted, fontSize: 14 }}>
            Loading agents...
          </div>
        ) : filteredAgents.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: 'center',
              color: colors.lovelabMuted,
              fontSize: 14,
              background: '#fff',
              borderRadius: 12,
              border: `1px solid ${colors.lineGray}`,
            }}
          >
            No agents found
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: `1px solid ${colors.lineGray}`,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: colors.inkPlum,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {(agent.full_name || agent.email || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: colors.charcoal }}>
                        {agent.full_name || agent.email || 'Unknown'}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '4px 8px',
                          borderRadius: 6,
                          background: statusColors[agent.agent_status] || colors.lovelabMuted,
                          color: '#fff',
                        }}
                      >
                        {agent.agent_status || '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: colors.lovelabMuted, marginBottom: 6 }}>
                      {agent.email}
                    </div>
                    {(agent.agent_city || agent.agent_country || agent.agent_region) && (
                      <div style={{ fontSize: 12, color: colors.charcoal, marginBottom: 4 }}>
                        Territory: {[agent.agent_city, agent.agent_country].filter(Boolean).join(', ')}
                        {agent.agent_region && ` · ${agent.agent_region}`}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: colors.charcoal, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Rate: {agent.commission_rate ?? '—'}% · Since: {formatAgentSince(agent.agent_since)}
                      {agent.agent_contract_url && (
                        <span title="Contract on file" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#059669', fontWeight: 600, background: '#ecfdf5', borderRadius: 5, padding: '2px 7px' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                          Contract
                        </span>
                      )}
                    </div>
                    {agent.stats && (
                      <div style={{ fontSize: 12, color: colors.lovelabMuted, marginBottom: 4 }}>
                        Orders: {agent.stats.total_orders ?? 0} · Revenue: {fmt(agent.stats.total_revenue)} ·
                        Commission: {fmt(agent.stats.total_commission)}
                      </div>
                    )}
                    {agent.agent_conditions && (
                      <div
                        style={{
                          fontSize: 11,
                          color: colors.lovelabMuted,
                          marginTop: 6,
                          maxWidth: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {agent.agent_conditions.length > 100
                          ? agent.agent_conditions.slice(0, 100) + '...'
                          : agent.agent_conditions}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => router.push(`/admin/agents/${agent.id}`)}
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          border: `1px solid ${colors.inkPlum}`,
                          background: '#fff',
                          color: colors.inkPlum,
                          borderRadius: 8,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: fonts.body,
                        }}
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleEdit(agent)}
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          border: `1px solid ${colors.lineGray}`,
                          background: '#fff',
                          color: colors.charcoal,
                          borderRadius: 8,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: fonts.body,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleAddBonus(agent)}
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          border: 'none',
                          background: colors.inkPlum,
                          color: '#fff',
                          borderRadius: 8,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: fonts.body,
                        }}
                      >
                        Add Bonus
                      </button>
                      <button
                        onClick={() => setConfirmDelete(agent)}
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          border: '1px solid #fca5a5',
                          background: '#fff',
                          color: '#dc2626',
                          borderRadius: 8,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: fonts.body,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Trash section */}
        {showTrash && trashedAgents.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Trash — deleted agents (auto-removed after 7 days)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {trashedAgents.map(agent => {
                const daysLeft = getDaysLeft(agent.agent_deleted_at);
                const canPermDelete = daysLeft <= 0;
                return (
                  <div key={agent.id} style={{ background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.85 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>{agent.full_name || agent.email}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>
                        {agent.email} · Deleted {new Date(agent.agent_deleted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {daysLeft > 0 ? ` · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` : ' · Expired'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleRestore(agent)}
                        style={{ padding: '6px 14px', fontSize: 12, border: '1px solid #86efac', background: '#f0fdf4', color: '#166534', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
                      >
                        Restore
                      </button>
                      {canPermDelete && (
                        <button
                          onClick={() => handlePermanentDelete(agent)}
                          style={{ padding: '6px 14px', fontSize: 12, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
                        >
                          Delete Forever
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 20 }} onClick={() => setConfirmDelete(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', fontFamily: fonts.body }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#dc2626', margin: '0 0 12px' }}>Delete Agent?</h3>
            <p style={{ fontSize: 13, color: '#555', margin: '0 0 8px' }}>
              <strong>{confirmDelete.full_name || confirmDelete.email}</strong> will be moved to trash.
            </p>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 20px' }}>
              You can restore them within 7 days. After that, their agent data will be permanently removed (commission history is always preserved).
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '8px 16px', border: 'none', background: 'transparent', color: '#888', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{ padding: '10px 20px', border: 'none', background: '#dc2626', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body }}>Move to Trash</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <AgentFormModal
          isOpen={showForm}
          onClose={handleFormClose}
          agent={editingAgent}
          onSaved={handleFormSaved}
        />
      )}

      {bonusAgent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            padding: 20,
          }}
          onClick={handleBonusClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 360,
              width: '100%',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              fontFamily: fonts.body,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: colors.inkPlum, margin: '0 0 16px' }}>
              Add Bonus — {bonusAgent.full_name || bonusAgent.email}
            </h3>
            <form onSubmit={handleBonusSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: colors.lovelabMuted,
                    marginBottom: 6,
                    display: 'block',
                    fontWeight: 600,
                  }}
                >
                  Amount (€)
                </label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1px solid ${colors.lineGray}`,
                    fontSize: 13,
                    fontFamily: fonts.body,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: colors.lovelabMuted,
                    marginBottom: 6,
                    display: 'block',
                    fontWeight: 600,
                  }}
                >
                  Notes
                </label>
                <textarea
                  value={bonusNotes}
                  onChange={(e) => setBonusNotes(e.target.value)}
                  placeholder="Optional"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1px solid ${colors.lineGray}`,
                    fontSize: 13,
                    fontFamily: fonts.body,
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleBonusClose}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    background: 'transparent',
                    color: '#888',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: fonts.body,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bonusLoading}
                  style={{
                    padding: '10px 24px',
                    border: 'none',
                    background: colors.inkPlum,
                    color: '#fff',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: bonusLoading ? 'not-allowed' : 'pointer',
                    fontFamily: fonts.body,
                  }}
                >
                  {bonusLoading ? 'Adding...' : 'Add Bonus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

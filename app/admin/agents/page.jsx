'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { colors, fonts } from '@/lib/styles';
import AgentFormModal from '../../components/AgentFormModal';
import AddBonusModal from '../../components/AddBonusModal';
import SalesTeamTabs from '../../components/SalesTeamTabs';
import { resolveEffectiveRate } from '@/lib/effectiveRate';

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

const secondaryActionStyle = {
  padding: '6px 10px',
  border: `1px solid ${colors.lineGray}`,
  borderRadius: 7,
  background: '#fff',
  color: colors.charcoal,
  cursor: 'pointer',
  fontFamily: fonts.body,
  fontSize: 11,
  fontWeight: 600,
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
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [trashedAgents, setTrashedAgents] = useState([]);
  const [repairingId, setRepairingId] = useState(null);
  const [repairResult, setRepairResult] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [resetResult, setResetResult] = useState(null);

  const fetchAgents = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/agents?include_trashed=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load agents');
      setAgents(data.agents || []);
      setTrashedAgents(data.trashedAgents || []);
    } catch (err) {
      setError(err.message || 'Failed to load agents');
      setAgents([]);
      setTrashedAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const activeAgents = agents;

  const filteredAgents = activeAgents.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      (a.full_name || '').toLowerCase().includes(q) ||
      (a.email || '').toLowerCase().includes(q) ||
      (a.agent_company || '').toLowerCase().includes(q) ||
      (a.organization_name || '').toLowerCase().includes(q);
    const matchStatus =
      statusFilter === 'all' || (a.agent_status || '').toLowerCase() === statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });

  const { soloAgents, sharedOrganizations } = useMemo(() => {
    const visibleIds = new Set(filteredAgents.map((agent) => agent.id));
    const groups = new Map();
    for (const agent of agents) {
      const key = agent.organization_id || `solo_${agent.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          organizationId: agent.organization_id,
          organizationName: agent.organization_name,
          agents: [],
        });
      }
      groups.get(key).agents.push(agent);
    }
    const visibleGroups = [...groups.values()]
      .map((group) => ({
        ...group,
        visibleAgents: group.agents.filter((agent) => visibleIds.has(agent.id)),
      }))
      .filter((group) => group.visibleAgents.length > 0);

    return {
      soloAgents: visibleGroups
        .filter((group) => group.agents.length === 1)
        .map((group) => group.visibleAgents[0]),
      sharedOrganizations: visibleGroups.filter((group) => group.agents.length >= 2),
    };
  }, [agents, filteredAgents]);

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

  const handleRepair = async (agent) => {
    setRepairingId(agent.id);
    setRepairResult(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}/repair`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Repair failed');
      setRepairResult({ agentId: agent.id, ...data });
      fetchAgents();
    } catch (err) {
      setError(err.message);
    } finally {
      setRepairingId(null);
    }
  };

  const handleResetPassword = async (agent) => {
    const label = agent.full_name || agent.email;
    if (!window.confirm(`Reset password for ${label}? A new password will be generated and emailed to ${agent.email}.`)) return;
    setResettingId(agent.id);
    setResetResult(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}/reset-password`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Reset failed');
      setResetResult({ agentId: agent.id, ...data });
    } catch (err) {
      setError(err.message);
    } finally {
      setResettingId(null);
    }
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

  const handleAddBonus = (agent) => setBonusAgent(agent);
  const handleBonusClose = () => setBonusAgent(null);
  const handleBonusSuccess = () => {
    setBonusAgent(null);
    fetchAgents();
  };

  const renderAgentEntry = (agent, { nested = false } = {}) => {
    const effectiveRate = resolveEffectiveRate(
      agent,
      { commission_rate: agent.organization_rate }
    ).rate;
    const outstanding = agent.stats?.effective_pending_commission
      ?? agent.stats?.pending_commission;
    const initials = (agent.full_name || agent.email || '?')
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <article
        key={agent.id}
        style={{
          background: '#fff',
          borderTop: nested ? `1px solid ${colors.lineGray}` : 'none',
        }}
      >
        <button
          type="button"
          className="agent-main-row"
          onClick={() => router.push(`/admin/agents/${agent.id}`)}
          aria-label={`Open ${agent.full_name || agent.email || 'agent'} profile`}
          style={{
            width: '100%',
            display: 'grid',
            alignItems: 'center',
            gap: 16,
            padding: nested ? '16px 18px' : '18px 20px',
            border: 'none',
            background: '#fff',
            color: colors.charcoal,
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: fonts.body,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{
                width: nested ? 34 : 38,
                height: nested ? 34 : 38,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f4edf3',
                color: colors.inkPlum,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {initials}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {agent.full_name || agent.email || 'Unknown'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, color: colors.lovelabMuted, fontSize: 11 }}>
                <span
                  aria-hidden="true"
                  style={{ width: 6, height: 6, borderRadius: '50%', background: statusColors[agent.agent_status] || colors.lovelabMuted }}
                />
                <span>{agent.agent_status || 'Unknown status'}</span>
                {!nested && agent.organization_id && (
                  <span>· {agent.organization_name || 'own organization'}</span>
                )}
                {!nested && !agent.organization_id && <span>· Independent</span>}
              </span>
            </span>
          </span>
          <span>
            <span style={{ display: 'block', color: colors.lovelabMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rate</span>
            <span style={{ display: 'block', marginTop: 3, color: colors.inkPlum, fontSize: 14, fontWeight: 700 }}>{effectiveRate}%</span>
          </span>
          <span>
            <span style={{ display: 'block', color: colors.lovelabMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding</span>
            <span style={{ display: 'block', marginTop: 3, color: colors.charcoal, fontSize: 14, fontWeight: 700 }}>{fmt(outstanding)}</span>
          </span>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.lovelabMuted} strokeWidth="1.8">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <details style={{ borderTop: `1px solid ${colors.lineGray}`, padding: '0 20px' }}>
          <summary
            style={{
              width: 'fit-content',
              padding: '9px 0',
              color: colors.lovelabMuted,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Manage agent
          </summary>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '2px 0 14px' }}>
            <button type="button" onClick={() => handleEdit(agent)} style={secondaryActionStyle}>Edit</button>
            <button type="button" onClick={() => handleAddBonus(agent)} style={secondaryActionStyle}>Bonus</button>
            {(!agent.organization_id || agent.agent_status === 'invited') && (
              <button type="button" onClick={() => handleRepair(agent)} disabled={repairingId === agent.id} style={secondaryActionStyle}>
                {repairingId === agent.id ? 'Repairing…' : 'Repair'}
              </button>
            )}
            <button type="button" onClick={() => handleResetPassword(agent)} disabled={resettingId === agent.id} style={secondaryActionStyle}>
              {resettingId === agent.id ? 'Resetting…' : 'Reset password'}
            </button>
            <button type="button" onClick={() => setConfirmDelete(agent)} style={{ ...secondaryActionStyle, color: colors.danger }}>Delete</button>
          </div>
          {repairResult?.agentId === agent.id && (
            <div role="status" style={{ marginBottom: 12, padding: '8px 10px', background: '#f0fdf4', borderRadius: 7, color: '#166534', fontSize: 11 }}>
              {repairResult.message}
              {repairResult.fixes?.length > 0 && ` Fixed: ${repairResult.fixes.map((fix) => fix.item).join(', ')}`}
            </div>
          )}
          {resetResult?.agentId === agent.id && (
            <div role="status" style={{ marginBottom: 12, padding: '8px 10px', background: '#f5f3ff', borderRadius: 7, color: '#5b21b6', fontSize: 11 }}>
              {resetResult.message}
            </div>
          )}
        </details>
      </article>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', fontFamily: fonts.body }}>
      <style>{`
        .agent-main-row {
          grid-template-columns: minmax(180px, 1fr) minmax(90px, 120px) minmax(110px, 150px) 24px;
        }
        @media (max-width: 640px) {
          .agent-main-row {
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 12px !important;
          }
          .agent-main-row > span:nth-child(2),
          .agent-main-row > span:nth-child(3) {
            grid-row: 2;
          }
          .agent-main-row > span:nth-child(2) {
            grid-column: 1;
            padding-left: 50px;
          }
          .agent-main-row > span:nth-child(3) {
            grid-column: 2;
          }
          .agent-main-row > svg {
            grid-column: 2;
            grid-row: 1;
          }
        }
      `}</style>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SalesTeamTabs active="agents" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 230, position: 'relative' }}>
            <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>Search agents</span>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.lovelabMuted} strokeWidth="2" style={{ position: 'absolute', left: 13, top: 12 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              placeholder="Search agents"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px 11px 39px',
                borderRadius: 10,
                border: `1px solid ${colors.lineGray}`,
                fontSize: 13,
                fontFamily: fonts.body,
              }}
            />
          </label>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '11px 14px',
              borderRadius: 10,
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
          {trashedAgents.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTrash(!showTrash)}
              aria-expanded={showTrash}
              style={{ ...secondaryActionStyle, minHeight: 41, padding: '9px 13px', color: showTrash ? colors.danger : colors.lovelabMuted }}
            >
              Trash ({trashedAgents.length})
            </button>
          )}
          <button
            type="button"
            onClick={handleAddAgent}
            style={{
              minHeight: 41,
              padding: '10px 19px',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {soloAgents.length > 0 && (
              <section aria-labelledby="solo-agents-heading">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                  <h2 id="solo-agents-heading" style={{ margin: 0, color: colors.inkPlum, fontSize: 15, fontWeight: 700 }}>Solo agents</h2>
                  <span style={{ color: colors.lovelabMuted, fontSize: 11 }}>{soloAgents.length}</span>
                </div>
                <div style={{ border: `1px solid ${colors.lineGray}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(74,37,69,0.04)' }}>
                  {soloAgents.map((agent, index) => (
                    <div key={agent.id} style={{ borderTop: index === 0 ? 'none' : `1px solid ${colors.lineGray}` }}>
                      {renderAgentEntry(agent)}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sharedOrganizations.length > 0 && (
              <section aria-labelledby="shared-organizations-heading">
                <h2 id="shared-organizations-heading" style={{ margin: '0 0 10px', color: colors.inkPlum, fontSize: 15, fontWeight: 700 }}>Shared organizations</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {sharedOrganizations.map((group) => (
                    <details
                      key={group.organizationId}
                      open
                      style={{ border: `1px solid ${colors.lineGray}`, borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 12px rgba(74,37,69,0.04)' }}
                    >
                      <summary style={{ padding: '16px 18px', cursor: 'pointer', color: colors.inkPlum }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginLeft: 5 }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{group.organizationName || 'Organization'}</span>
                          <span style={{ color: colors.lovelabMuted, fontSize: 11 }}>
                            {group.agents.length} members
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              router.push(`/admin/organizations/${group.organizationId}`);
                            }}
                            style={{ ...secondaryActionStyle, marginLeft: 4, padding: '5px 9px', color: colors.inkPlum }}
                          >
                            Open organization
                          </button>
                        </span>
                      </summary>
                      {group.visibleAgents.map((agent) => renderAgentEntry(agent, { nested: true }))}
                    </details>
                  ))}
                </div>
              </section>
            )}
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
        <AddBonusModal
          agent={bonusAgent}
          onClose={handleBonusClose}
          onSuccess={handleBonusSuccess}
        />
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { colors, fonts, btn, inp, lbl } from '@/lib/styles';

export default function AgentFormModal({ isOpen, onClose, agent, onSaved }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [agentStatus, setAgentStatus] = useState('active');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentCompany, setAgentCompany] = useState('');
  const [agentCountry, setAgentCountry] = useState('');
  const [agentCity, setAgentCity] = useState('');
  const [agentRegion, setAgentRegion] = useState('');
  const [agentTerritory, setAgentTerritory] = useState('');
  const [agentSpecialty, setAgentSpecialty] = useState('');
  const [agentConditions, setAgentConditions] = useState('');
  const [agentNotes, setAgentNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Contract upload state (edit mode only)
  const [contractName, setContractName] = useState(null);
  const [contractUrl, setContractUrl] = useState(null);
  const [contractFile, setContractFile] = useState(null);
  const [contractUploading, setContractUploading] = useState(false);
  const [contractMsg, setContractMsg] = useState(null);

  const isEdit = !!agent;

  useEffect(() => {
    if (isOpen) {
      setError('');
      if (agent) {
        setEmail(agent.email || '');
        setFullName(agent.full_name || '');
        setCommissionRate(String(agent.commission_rate ?? ''));
        setAgentStatus(agent.agent_status || 'active');
        setAgentPhone(agent.agent_phone || '');
        setAgentCompany(agent.agent_company || '');
        setAgentCountry(agent.agent_country || '');
        setAgentCity(agent.agent_city || '');
        setAgentRegion(agent.agent_region || '');
        setAgentTerritory(agent.agent_territory || '');
        setAgentSpecialty(agent.agent_specialty || '');
        setAgentConditions(agent.agent_conditions || '');
        setAgentNotes(agent.agent_notes || '');
      } else {
        setEmail('');
        setFullName('');
        setCommissionRate('');
        setAgentStatus('active');
        setAgentPhone('');
        setAgentCompany('');
        setAgentCountry('');
        setAgentCity('');
        setAgentRegion('');
        setAgentTerritory('');
        setAgentSpecialty('');
        setAgentConditions('');
        setAgentNotes('');
      }
      // Fetch existing contract info when editing
      if (agent) {
        fetch(`/api/agents/${agent.id}/contract`)
          .then(r => r.json())
          .then(d => { setContractUrl(d.url || null); setContractName(d.name || null); })
          .catch(() => {});
      } else {
        setContractUrl(null);
        setContractName(null);
      }
      setContractFile(null);
      setContractMsg(null);
    }
  }, [isOpen, agent]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const rate = Number(commissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        setError('Commission rate must be between 0 and 100');
        setSaving(false);
        return;
      }
      const body = {
        full_name: fullName.trim() || null,
        commission_rate: rate,
        agent_status: agentStatus,
        agent_phone: agentPhone.trim() || null,
        agent_company: agentCompany.trim() || null,
        agent_country: agentCountry.trim() || null,
        agent_city: agentCity.trim() || null,
        agent_region: agentRegion.trim() || null,
        agent_territory: agentTerritory.trim() || null,
        agent_specialty: agentSpecialty.trim() || null,
        agent_conditions: agentConditions.trim() || null,
        agent_notes: agentNotes.trim() || null,
      };
      if (isEdit) {
        const res = await fetch(`/api/agents/${agent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to update agent');
        onSaved?.();
        onClose?.();
      } else {
        if (!email.trim()) {
          setError('Email is required');
          setSaving(false);
          return;
        }
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, email: email.trim().toLowerCase() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to create agent');
        onSaved?.();
        onClose?.();
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          maxWidth: 480,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          fontFamily: fonts.body,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.inkPlum, margin: '0 0 20px' }}>
          {isEdit ? 'Edit Agent' : 'Add Agent'}
        </h2>
        <form onSubmit={handleSubmit}>
          {!isEdit && (
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ ...inp, width: '100%' }}
                placeholder="agent@example.com"
                required
              />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={{ ...inp, width: '100%' }}
              placeholder="Agent name"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Commission rate (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              style={{ ...inp, width: '100%' }}
              placeholder="10"
              required
            />
          </div>
          {isEdit && (
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Status</label>
              <select
                value={agentStatus}
                onChange={(e) => setAgentStatus(e.target.value)}
                style={{ ...inp, width: '100%' }}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="inactive">Inactive</option>
                <option value="invited">Invited</option>
              </select>
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Company</label>
            <input
              type="text"
              value={agentCompany}
              onChange={(e) => setAgentCompany(e.target.value)}
              style={{ ...inp, width: '100%' }}
              placeholder="Company name"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>City</label>
              <input
                type="text"
                value={agentCity}
                onChange={(e) => setAgentCity(e.target.value)}
                style={{ ...inp, width: '100%' }}
                placeholder="City"
              />
            </div>
            <div>
              <label style={lbl}>Country</label>
              <input
                type="text"
                value={agentCountry}
                onChange={(e) => setAgentCountry(e.target.value)}
                style={{ ...inp, width: '100%' }}
                placeholder="Country"
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Region</label>
            <input
              type="text"
              value={agentRegion}
              onChange={(e) => setAgentRegion(e.target.value)}
              style={{ ...inp, width: '100%' }}
              placeholder="Region"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Conditions</label>
            <textarea
              value={agentConditions}
              onChange={(e) => setAgentConditions(e.target.value)}
              style={{ ...inp, width: '100%', minHeight: 60, resize: 'vertical' }}
              placeholder="Special conditions"
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Notes</label>
            <textarea
              value={agentNotes}
              onChange={(e) => setAgentNotes(e.target.value)}
              style={{ ...inp, width: '100%', minHeight: 60, resize: 'vertical' }}
              placeholder="Internal notes"
            />
          </div>
          {/* Contract PDF upload — edit mode only */}
          {isEdit && (
            <div style={{ marginBottom: 20, padding: 14, background: '#fafafa', borderRadius: 8, border: '1px solid #eee' }}>
              <label style={{ ...lbl, marginBottom: 8, display: 'block' }}>Contract (PDF)</label>
              {contractUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5D3A5E" strokeWidth="2">
                    <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span style={{ fontSize: 13, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contractName}</span>
                  <a href={contractUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: colors.inkPlum, fontWeight: 600, textDecoration: 'none' }}>Download</a>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Remove contract?')) return;
                      await fetch(`/api/agents/${agent.id}/contract`, { method: 'DELETE' });
                      setContractUrl(null); setContractName(null);
                    }}
                    style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >Remove</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 10 * 1024 * 1024) { setContractMsg('File too large (max 10MB)'); return; }
                      setContractFile(f || null); setContractMsg(null);
                    }}
                    style={{ fontSize: 12, flex: 1 }}
                  />
                  <button
                    type="button"
                    disabled={!contractFile || contractUploading}
                    onClick={async () => {
                      if (!contractFile) return;
                      setContractUploading(true); setContractMsg(null);
                      const fd = new FormData(); fd.append('file', contractFile);
                      const res = await fetch(`/api/agents/${agent.id}/contract`, { method: 'POST', body: fd });
                      const d = await res.json();
                      if (res.ok) {
                        setContractMsg('Uploaded!');
                        const r2 = await fetch(`/api/agents/${agent.id}/contract`);
                        const d2 = await r2.json();
                        setContractUrl(d2.url || null); setContractName(d2.name || null);
                        setContractFile(null);
                      } else { setContractMsg(d.error || 'Upload failed'); }
                      setContractUploading(false);
                    }}
                    style={{ fontSize: 12, padding: '6px 12px', background: colors.inkPlum, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', opacity: (!contractFile || contractUploading) ? 0.5 : 1 }}
                  >{contractUploading ? 'Uploading…' : 'Upload'}</button>
                </div>
              )}
              {contractMsg && <div style={{ fontSize: 12, marginTop: 6, color: contractMsg === 'Uploaded!' ? '#059669' : '#dc2626' }}>{contractMsg}</div>}
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 16, padding: 10, background: '#fef2f2', color: colors.danger, borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btn.ghost}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={btn.primary}>
              {saving ? 'Saving...' : isEdit ? 'Save' : 'Add Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

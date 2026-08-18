'use client';

import { useState, useEffect } from 'react';
import { colors, fonts } from '@/lib/styles';
import SalesTeamTabs from '@/app/components/SalesTeamTabs';

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${colors.lineGray}`,
  fontSize: 13,
  fontFamily: fonts.body,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#999',
  marginBottom: 6,
  fontWeight: 600,
  display: 'block',
};

function AssistantFormModal({ assistant, fairs, onClose, onSaved }) {
  const isEditing = Boolean(assistant);
  const [fullName, setFullName] = useState(assistant?.full_name || '');
  const [email, setEmail] = useState(assistant?.email || '');
  const [selectedFairIds, setSelectedFairIds] = useState(
    new Set((assistant?.fairs || []).map((f) => f.id))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleFair = (id) => {
    setSelectedFairIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    setError('');
    if (!isEditing && !email.trim()) { setError('Email is required'); return; }
    if (selectedFairIds.size === 0) { setError('Select at least one fair'); return; }

    setSaving(true);
    try {
      const res = isEditing
        ? await fetch(`/api/assistants/${assistant.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: fullName, event_ids: [...selectedFairIds] }),
          })
        : await fetch('/api/assistants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), full_name: fullName, event_ids: [...selectedFairIds] }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 480,
          maxHeight: '85vh', overflowY: 'auto', fontFamily: fonts.body,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.inkPlum, margin: '0 0 4px' }}>
          {isEditing ? 'Edit Assistant' : 'Invite Assistant'}
        </h2>
        <p style={{ fontSize: 12, color: '#999', margin: '0 0 20px' }}>
          {isEditing
            ? 'Change her name or the fairs she can access.'
            : 'She will receive an email with sign-in details and only see the fairs you pick here.'}
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Full name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Marie Dupont"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="assistant@example.com"
            disabled={isEditing}
            style={{ ...inputStyle, background: isEditing ? '#f5f5f5' : '#fff', color: isEditing ? '#888' : '#333' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Fairs she can access</label>
          {fairs.length === 0 ? (
            <div style={{ fontSize: 13, color: '#999', padding: '12px 0' }}>
              No fairs found. Create a fair on the Fairs page first.
            </div>
          ) : (
            <div style={{
              border: `1px solid ${colors.lineGray}`, borderRadius: 10,
              maxHeight: 240, overflowY: 'auto',
            }}>
              {fairs.map((fair) => (
                <label
                  key={fair.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    borderBottom: `1px solid ${colors.borderLight}`, cursor: 'pointer',
                    background: selectedFairIds.has(fair.id) ? '#fdf7fa' : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedFairIds.has(fair.id)}
                    onChange={() => toggleFair(fair.id)}
                    style={{ accentColor: colors.inkPlum, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{fair.name}</span>
                  {fair.start_date && (
                    <span style={{ fontSize: 11, color: '#999', marginLeft: 'auto' }}>
                      {new Date(fair.start_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, background: '#fef2f2',
            color: '#dc2626', fontSize: 13, marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px', border: `1px solid ${colors.lineGray}`, background: '#fff',
              color: '#666', borderRadius: 10, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: fonts.body,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '10px 24px', border: 'none', background: colors.inkPlum, color: '#fff',
              borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', fontFamily: fonts.body,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminAssistantsPage() {
  const [assistants, setAssistants] = useState([]);
  const [fairs, setFairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAssistant, setEditingAssistant] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [assistantsRes, eventsRes] = await Promise.all([
        fetch('/api/assistants'),
        fetch('/api/events'),
      ]);
      const assistantsData = await assistantsRes.json();
      if (!assistantsRes.ok) throw new Error(assistantsData?.error || 'Failed to load assistants');
      const eventsData = await eventsRes.json();
      if (!eventsRes.ok) throw new Error(eventsData?.error || 'Failed to load fairs');

      setAssistants(assistantsData.assistants || []);
      setFairs((eventsData.events || []).filter((e) => e.type === 'fair'));
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResend = async (assistant) => {
    setBusyId(assistant.id);
    setNotice('');
    setError('');
    try {
      const res = await fetch(`/api/assistants/${assistant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _resend: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to re-send invite');
      setNotice(`Invite re-sent to ${assistant.email}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (assistant) => {
    setBusyId(assistant.id);
    setNotice('');
    setError('');
    try {
      const res = await fetch(`/api/assistants/${assistant.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to remove assistant');
      setConfirmRemove(null);
      setNotice(`${assistant.full_name || assistant.email} no longer has access. Their orders are preserved.`);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', fontFamily: fonts.body }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SalesTeamTabs active="assistants" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>
            Commercial Assistants
          </h1>
          <button
            onClick={() => { setEditingAssistant(null); setShowForm(true); }}
            style={{
              padding: '10px 24px', border: 'none', background: colors.inkPlum, color: '#fff',
              borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body,
            }}
          >
            + Invite Assistant
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#999', margin: '0 0 24px' }}>
          Helpers who can build and file orders inside the fairs you give them. No commissions, no other access.
        </p>

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}
        {notice && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: '#f0fdf4', color: '#15803d', fontSize: 13, marginBottom: 16 }}>
            {notice}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 13 }}>Loading…</div>
        ) : assistants.length === 0 ? (
          <div style={{
            padding: '48px 20px', textAlign: 'center', background: '#fff',
            borderRadius: 12, border: `1px dashed ${colors.lineGray}`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#666', marginBottom: 6 }}>No assistants yet</div>
            <div style={{ fontSize: 13, color: '#999' }}>
              Invite someone with their name and email, pick the fairs they may access, and they receive sign-in details by email.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {assistants.map((a) => {
              const invited = !a.has_password_set;
              return (
                <div
                  key={a.id}
                  style={{
                    background: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`,
                    padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', background: colors.inkPlum,
                    color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {(a.full_name || a.email || '?')[0].toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>
                        {a.full_name || a.email}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase',
                        background: invited ? '#eff6ff' : '#f0fdf4',
                        color: invited ? colors.info : colors.success,
                      }}>
                        {invited ? 'Invited' : 'Active'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{a.email}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {(a.fairs || []).length === 0 ? (
                        <span style={{ fontSize: 11, color: colors.danger }}>No fairs assigned</span>
                      ) : (
                        a.fairs.map((f) => (
                          <span
                            key={f.id}
                            style={{
                              padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: '#fdf7fa', color: colors.inkPlum,
                              border: `1px solid ${colors.lovelabBorder}`,
                            }}
                          >
                            {f.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => { setEditingAssistant(a); setShowForm(true); }}
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: `1px solid ${colors.inkPlum}`,
                        background: '#fdf7fa', color: colors.inkPlum, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: fonts.body,
                      }}
                    >
                      Edit Fairs
                    </button>
                    {invited && (
                      <button
                        onClick={() => handleResend(a)}
                        disabled={busyId === a.id}
                        style={{
                          padding: '7px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
                          background: '#fff', color: '#666', fontSize: 12, fontWeight: 600,
                          cursor: busyId === a.id ? 'wait' : 'pointer', fontFamily: fonts.body,
                        }}
                      >
                        {busyId === a.id ? 'Sending…' : 'Resend Invite'}
                      </button>
                    )}
                    {confirmRemove === a.id ? (
                      <>
                        <button
                          onClick={() => handleRemove(a)}
                          disabled={busyId === a.id}
                          style={{
                            padding: '7px 14px', borderRadius: 8, border: 'none',
                            background: colors.danger, color: '#fff', fontSize: 12, fontWeight: 700,
                            cursor: busyId === a.id ? 'wait' : 'pointer', fontFamily: fonts.body,
                          }}
                        >
                          {busyId === a.id ? 'Removing…' : 'Confirm Remove'}
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          style={{
                            padding: '7px 12px', borderRadius: 8, border: 'none',
                            background: 'transparent', color: '#888', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: fonts.body,
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(a.id)}
                        style={{
                          padding: '7px 12px', borderRadius: 8, border: '1px solid #fecaca',
                          background: '#fef2f2', color: colors.danger, fontSize: 12,
                          cursor: 'pointer', fontFamily: fonts.body,
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <AssistantFormModal
          assistant={editingAssistant}
          fairs={fairs}
          onClose={() => { setShowForm(false); setEditingAssistant(null); }}
          onSaved={() => {
            setShowForm(false);
            setEditingAssistant(null);
            setNotice(editingAssistant ? 'Assistant updated.' : 'Invite sent.');
            fetchData();
          }}
        />
      )}
    </div>
  );
}

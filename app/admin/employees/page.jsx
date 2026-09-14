'use client';

import { useState, useEffect } from 'react';
import { colors, fonts } from '@/lib/styles';
import SalesTeamTabs from '@/app/components/SalesTeamTabs';

/**
 * Employees — colleagues with the same access as an admin.
 *
 * Sam, 14 Sep 2026: invite from a button, like agents; they get an email with
 * a temporary password. One screen: the list, an invite form, and per person
 * "Resend invite" (a fresh temporary password, before or after their first
 * login) and "Remove" (full access taken away, their documents kept).
 */

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

function InviteEmployeeModal({ onClose, onSaved }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), full_name: fullName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to send the invite');
      onSaved(data);
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
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="invite-employee-modal"
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440,
          padding: 24, fontFamily: fonts.body, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.inkPlum, margin: '0 0 6px' }}>
          Invite Employee
        </h2>
        <p style={{ fontSize: 13, color: '#777', margin: '0 0 20px' }}>
          They receive an email with a temporary password and get everything you can see.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Full name</label>
          <input
            data-testid="employee-name"
            style={inputStyle}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Christelle Peeters"
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Email</label>
          <input
            data-testid="employee-email"
            style={inputStyle}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@love-lab.com"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 10, border: `1px solid ${colors.lineGray}`,
              background: '#fff', color: '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
            }}
          >
            Cancel
          </button>
          <button
            data-testid="employee-send-invite"
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', fontFamily: fonts.body, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/employees');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load employees');
      setEmployees(data.employees || []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResend = async (employee) => {
    setBusyId(employee.id);
    setNotice('');
    setError('');
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _resend: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to re-send the invite');
      setNotice(data.message || `A new temporary password was sent to ${employee.email}.`);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (employee) => {
    setBusyId(employee.id);
    setNotice('');
    setError('');
    try {
      const res = await fetch(`/api/employees/${employee.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to remove access');
      setConfirmRemove(null);
      setNotice(`${employee.full_name || employee.email} no longer has access. Their documents are preserved.`);
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
        <SalesTeamTabs active="employees" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>
            Employees
          </h1>
          <button
            data-testid="invite-employee"
            onClick={() => setShowForm(true)}
            style={{
              padding: '10px 24px', border: 'none', background: colors.inkPlum, color: '#fff',
              borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body,
            }}
          >
            + Invite Employee
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#999', margin: '0 0 24px' }}>
          Colleagues with the same access as you. They get an email with a temporary password and choose their own on first sign-in. Remove access here any time.
        </p>

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}
        {notice && (
          <div data-testid="employee-notice" style={{ padding: '12px 16px', borderRadius: 10, background: '#f0fdf4', color: '#15803d', fontSize: 13, marginBottom: 16 }}>
            {notice}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 13 }}>Loading…</div>
        ) : employees.length === 0 ? (
          <div style={{
            padding: '48px 20px', textAlign: 'center', background: '#fff',
            borderRadius: 12, border: `1px dashed ${colors.lineGray}`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#666', marginBottom: 6 }}>No employees yet</div>
            <div style={{ fontSize: 13, color: '#999' }}>
              Invite someone with their name and email, and they receive sign-in details by email.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {employees.map((e) => {
              const invited = !e.has_password_set && !e.you;
              return (
                <div
                  key={e.id}
                  data-testid="employee-row"
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
                    {(e.full_name || e.email || '?')[0].toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>
                        {e.full_name || e.email}
                      </span>
                      {e.you ? (
                        <span style={{
                          padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase', background: '#fdf7fa', color: colors.inkPlum,
                        }}>
                          you
                        </span>
                      ) : (
                        <span style={{
                          padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase',
                          background: invited ? '#eff6ff' : '#f0fdf4',
                          color: invited ? colors.info : colors.success,
                        }}>
                          {invited ? 'Invited' : 'Active'}
                        </span>
                      )}
                      {e.is_agent && (
                        <span style={{ fontSize: 11, color: '#999' }}>also an agent</span>
                      )}
                      {e.is_assistant && (
                        <span style={{ fontSize: 11, color: '#999' }}>also an assistant</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{e.email}</div>
                  </div>

                  {!e.you && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                      <button
                        data-testid="employee-resend"
                        onClick={() => handleResend(e)}
                        disabled={busyId === e.id}
                        title="Sends a fresh temporary password by email"
                        style={{
                          padding: '7px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
                          background: '#fff', color: '#666', fontSize: 12, fontWeight: 600,
                          cursor: busyId === e.id ? 'wait' : 'pointer', fontFamily: fonts.body,
                        }}
                      >
                        {busyId === e.id ? 'Sending…' : invited ? 'Resend Invite' : 'Reset Password'}
                      </button>
                      {confirmRemove === e.id ? (
                        <>
                          <button
                            data-testid="employee-remove-confirm"
                            onClick={() => handleRemove(e)}
                            disabled={busyId === e.id}
                            style={{
                              padding: '7px 14px', borderRadius: 8, border: 'none',
                              background: colors.danger, color: '#fff', fontSize: 12, fontWeight: 700,
                              cursor: busyId === e.id ? 'wait' : 'pointer', fontFamily: fonts.body,
                            }}
                          >
                            {busyId === e.id ? 'Removing…' : 'Confirm Remove'}
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            style={{
                              padding: '7px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`,
                              background: '#fff', color: '#666', fontSize: 12, fontWeight: 600,
                              cursor: 'pointer', fontFamily: fonts.body,
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          data-testid="employee-remove"
                          onClick={() => setConfirmRemove(e.id)}
                          style={{
                            padding: '7px 14px', borderRadius: 8, border: `1px solid #fecaca`,
                            background: '#fff', color: colors.danger, fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: fonts.body,
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showForm && (
          <InviteEmployeeModal
            onClose={() => setShowForm(false)}
            onSaved={(data) => {
              setShowForm(false);
              const who = data?.employee?.full_name || data?.employee?.email || 'them';
              setNotice(data?.created
                ? `Invite sent to ${who}. They received a temporary password by email.`
                : `${who} already had an account and now has full access.`);
              fetchData();
            }}
          />
        )}
      </div>
    </div>
  );
}

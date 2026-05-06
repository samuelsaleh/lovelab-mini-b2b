'use client';

/**
 * AddBonusModal
 *
 * Shared modal for granting an ad-hoc cash bonus to an agent. POSTs to
 * /api/commissions which records a `type='bonus'` row in agent_commissions.
 *
 * Used from:
 *   - app/admin/agents/page.jsx        (agents list, "Add Bonus" per row)
 *   - app/admin/agents/[id]/page.jsx   (agent details header, alongside "Record Payment")
 *
 * Props:
 *   - agent     {{ id, full_name?, email? }}   required — the recipient
 *   - onClose   () => void                     called for cancel and backdrop click
 *   - onSuccess (createdRow) => void           called after the API returns 200 OK
 */

import { useState } from 'react';
import { colors, fonts } from '@/lib/styles';

export default function AddBonusModal({ agent, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!agent) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = Number(amount);
    if (Number.isNaN(amt) || amt <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agent.id,
          amount: amt,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to add bonus');
      onSuccess?.(data?.commission || data);
    } catch (err) {
      setError(err?.message || 'Failed to add bonus');
    } finally {
      setLoading(false);
    }
  };

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
          maxWidth: 360,
          width: '100%',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          fontFamily: fonts.body,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, color: colors.inkPlum, margin: '0 0 16px' }}>
          Add Bonus — {agent.full_name || agent.email}
        </h3>
        {error && (
          <div
            role="alert"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              autoFocus
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              onClick={onClose}
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
              disabled={loading}
              style={{
                padding: '10px 24px',
                border: 'none',
                background: colors.inkPlum,
                color: '#fff',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: fonts.body,
              }}
            >
              {loading ? 'Adding...' : 'Add Bonus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

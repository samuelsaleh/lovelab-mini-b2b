'use client';

/**
 * AddQuickOrderModal (Phase 27)
 *
 * Lets an admin quickly attribute a past sale to an agent by entering just a
 * client name + amount (and optionally a date), without building a full order
 * document. POSTs to /api/commissions with type='order', which records a
 * manual agent_commissions row (document_id NULL, client_label set). The entry
 * flows through the same pending → customer_paid → paid lifecycle as real
 * orders and appears in the commission report Excel.
 *
 * Used from:
 *   - app/admin/agents/[id]/page.jsx   (agent details header, next to "Add Bonus")
 *
 * Props:
 *   - agent     {{ id, full_name?, email?, commission_rate? }}  required
 *   - onClose   () => void                  called for cancel and backdrop click
 *   - onSuccess (createdRow) => void        called after the API returns 200 OK
 */

import { useState } from 'react';
import { colors, fonts } from '@/lib/styles';
import { parseAmount } from '@/lib/parseAmount';

export default function AddQuickOrderModal({ agent, onClose, onSuccess }) {
  const [clientLabel, setClientLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [amountMode, setAmountMode] = useState('order_total'); // 'order_total' | 'direct'
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerPaid, setCustomerPaid] = useState(true);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!agent) return null;

  const rate = Number(agent.commission_rate) || 0;
  const numericAmount = parseAmount(amount);
  const validAmount = !Number.isNaN(numericAmount) && numericAmount > 0;
  // Live preview of what the agent will be paid.
  const computedCommission = validAmount
    ? amountMode === 'direct'
      ? numericAmount
      : Math.round(numericAmount * rate / 100 * 100) / 100
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clientLabel.trim()) {
      setError('Enter a client name');
      return;
    }
    if (!validAmount) {
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
          type: 'order',
          client_label: clientLabel.trim(),
          amount: numericAmount,
          amount_mode: amountMode,
          created_at: new Date(date).toISOString(),
          customer_paid: customerPaid,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to add quick order');
      onSuccess?.(data?.commission || data);
    } catch (err) {
      setError(err?.message || 'Failed to add quick order');
    } finally {
      setLoading(false);
    }
  };

  const fieldLabel = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: colors.lovelabMuted,
    marginBottom: 6,
    display: 'block',
    fontWeight: 600,
  };
  const input = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.lineGray}`,
    fontSize: 13,
    fontFamily: fonts.body,
    boxSizing: 'border-box',
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
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          fontFamily: fonts.body,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, color: colors.inkPlum, margin: '0 0 4px' }}>
          Add Quick Order
        </h3>
        <p style={{ fontSize: 12, color: colors.lovelabMuted, margin: '0 0 16px' }}>
          Record a past sale for {agent.full_name || agent.email} without a full order.
        </p>
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
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Client name</label>
            <input
              type="text"
              value={clientLabel}
              onChange={(e) => setClientLabel(e.target.value)}
              placeholder="e.g. Boutique Marie"
              required
              autoFocus
              style={input}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Amount (€)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              required
              style={input}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>This amount is…</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: colors.charcoal, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="amount_mode"
                  checked={amountMode === 'order_total'}
                  onChange={() => setAmountMode('order_total')}
                  style={{ marginTop: 2, accentColor: colors.inkPlum }}
                />
                <span>
                  the <strong>order amount</strong> — pay {rate}% commission
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: colors.charcoal, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="amount_mode"
                  checked={amountMode === 'direct'}
                  onChange={() => setAmountMode('direct')}
                  style={{ marginTop: 2, accentColor: colors.inkPlum }}
                />
                <span>
                  the <strong>exact amount to pay</strong> the agent
                </span>
              </label>
            </div>
          </div>

          {validAmount && (
            <div
              style={{
                marginBottom: 14,
                padding: '8px 12px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                fontSize: 12,
                color: '#166534',
              }}
            >
              Agent will be paid{' '}
              <strong>
                €{computedCommission.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              {amountMode === 'order_total' ? ` (${rate}% of €${numericAmount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Order date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={input}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.charcoal, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={customerPaid}
                onChange={(e) => setCustomerPaid(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: colors.inkPlum }}
              />
              <span>Customer already paid (ready to include in next report)</span>
            </label>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={fieldLabel}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              rows={2}
              style={{ ...input, resize: 'vertical' }}
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
              {loading ? 'Adding...' : 'Add Quick Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

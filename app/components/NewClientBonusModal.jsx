'use client';

/**
 * NewClientBonusModal — Phase 19
 *
 * Per-agent toggle for "earn €X every time you bring in a new client".
 *
 * UX flow:
 *   1. Modal opens with current state (enabled/disabled + amount).
 *   2. Sam tweaks the amount and the LIVE PREVIEW underneath updates
 *      (debounced 300ms): "Enabling at €200 will create N retroactive
 *      bonuses across these N customers — total: €X,XXX."
 *   3. Confirm button calls PATCH /api/agents/[id]/new-client-bonus
 *      which saves settings AND runs the backfill atomically.
 *   4. Disabling skips the backfill — earned bonuses stay earned.
 *
 * Props:
 *   - agent     {{ id, full_name?, email?, new_client_bonus_enabled?, new_client_bonus_amount? }}
 *   - onClose   () => void
 *   - onSuccess (response) => void   called after PATCH 200 OK
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { colors, fonts } from '@/lib/styles';
import { fmt } from '@/lib/utils';

const DEFAULT_AMOUNT = 200;

export default function NewClientBonusModal({ agent, onClose, onSuccess }) {
  const startEnabled = !!agent?.new_client_bonus_enabled;
  const startAmount =
    agent?.new_client_bonus_amount != null
      ? String(agent.new_client_bonus_amount)
      : String(DEFAULT_AMOUNT);

  const [enabled, setEnabled] = useState(startEnabled);
  const [amount, setAmount] = useState(startAmount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Live preview state
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const previewAbortRef = useRef(null);

  // Debounced preview fetch — fires 300ms after the user stops typing.
  // We always run the preview when toggling ON. Toggling OFF skips it.
  useEffect(() => {
    if (!agent?.id) return;
    if (!enabled) {
      setPreview(null);
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(async () => {
      previewAbortRef.current?.abort?.();
      const ctrl = new AbortController();
      previewAbortRef.current = ctrl;
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(agent.id)}/new-client-bonus/preview?amount=${amt}`,
          { signal: ctrl.signal },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Failed to load preview');
        setPreview(json);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setPreviewError(err.message || 'Failed to load preview');
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [agent?.id, enabled, amount]);

  const previewRows = preview?.rows || [];
  const previewTotal = preview?.total || 0;
  const previewCount = preview?.customer_count || 0;

  const isDirty = useMemo(() => {
    if (enabled !== startEnabled) return true;
    return Number(amount) !== Number(startAmount);
  }, [enabled, amount, startEnabled, startAmount]);

  const isAmountValid = useMemo(() => {
    if (!enabled) return true; // amount is optional when disabling
    const n = Number(amount);
    return Number.isFinite(n) && n > 0;
  }, [amount, enabled]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agent?.id) return;
    if (!isAmountValid) {
      setError('Enter a positive amount before enabling.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        enabled,
        amount: amount === '' ? null : Number(amount),
      };
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agent.id)}/new-client-bonus`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to save bonus settings');
      onSuccess?.(json);
    } catch (err) {
      setError(err.message || 'Failed to save bonus settings');
    } finally {
      setSaving(false);
    }
  };

  if (!agent) return null;

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
          borderRadius: 14,
          padding: 24,
          maxWidth: 460,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          fontFamily: fonts.body,
        }}
      >
        <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>
            New Client Bonus
          </h3>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: colors.lovelabMuted,
            }}
          >
            {agent.full_name || agent.email}
          </span>
        </div>
        <p style={{ fontSize: 12, color: colors.lovelabMuted, margin: '0 0 20px' }}>
          Pay this agent a flat fee every time they bring in a brand-new
          client (matched by company name, fuzzy). Existing customers
          earned retroactively when you enable.
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
          {/* Enabled toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 14px',
              background: '#faf7fb',
              border: `1px solid ${colors.lineGray}`,
              borderRadius: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.charcoal }}>
                Bonus enabled
              </div>
              <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 2 }}>
                {enabled
                  ? 'New clients trigger a bonus on save.'
                  : 'No bonus is paid for new clients.'}
              </div>
            </div>
            <label
              style={{
                position: 'relative',
                display: 'inline-block',
                width: 44,
                height: 24,
                flexShrink: 0,
              }}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  inset: 0,
                  background: enabled ? colors.inkPlum : '#d1d5db',
                  borderRadius: 24,
                  transition: 'background .15s',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  height: 18,
                  width: 18,
                  left: enabled ? 23 : 3,
                  top: 3,
                  background: '#fff',
                  borderRadius: '50%',
                  transition: 'left .15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  pointerEvents: 'none',
                }}
              />
            </label>
          </div>

          {/* Amount input */}
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
              Amount per new client (€)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="200.00"
              required={enabled}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: `1px solid ${
                  !isAmountValid ? '#dc2626' : colors.lineGray
                }`,
                fontSize: 14,
                fontFamily: fonts.body,
                boxSizing: 'border-box',
              }}
            />
            {!isAmountValid && (
              <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>
                Amount must be greater than 0 to enable the bonus.
              </div>
            )}
          </div>

          {/* Live preview */}
          {enabled && (
            <div
              style={{
                background: '#fff',
                border: `1px solid ${colors.lineGray}`,
                borderRadius: 10,
                padding: 14,
                marginBottom: 18,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Retroactive backfill preview
              </div>
              {previewLoading ? (
                <div style={{ fontSize: 12, color: colors.lovelabMuted, padding: '8px 0' }}>
                  Computing…
                </div>
              ) : previewError ? (
                <div style={{ fontSize: 12, color: '#dc2626' }}>{previewError}</div>
              ) : preview ? (
                previewCount === 0 ? (
                  <div style={{ fontSize: 12, color: colors.lovelabMuted }}>
                    No retroactive bonuses to create — this agent has no
                    historical customers, or all of them already have a
                    bonus row.
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: colors.charcoal, marginBottom: 8 }}>
                      Will create{' '}
                      <strong style={{ color: colors.inkPlum }}>
                        {previewCount} bonus{previewCount === 1 ? '' : 'es'}
                      </strong>{' '}
                      for a total of{' '}
                      <strong style={{ color: colors.inkPlum }}>
                        {fmt(previewTotal)}
                      </strong>
                      .
                    </div>
                    <div
                      style={{
                        maxHeight: 160,
                        overflowY: 'auto',
                        border: `1px solid ${colors.borderLight}`,
                        borderRadius: 6,
                      }}
                    >
                      {previewRows.map((r) => (
                        <div
                          key={r.document_id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            fontSize: 12,
                            borderBottom: `1px solid ${colors.borderLight}`,
                          }}
                        >
                          <span style={{ color: colors.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.customer || '(unnamed)'}
                          </span>
                          <span style={{ color: colors.lovelabMuted, fontSize: 11, marginLeft: 8 }}>
                            {(r.first_order_date || '').slice(0, 10)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )
              ) : (
                <div style={{ fontSize: 12, color: colors.lovelabMuted }}>
                  Enter a positive amount to preview.
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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
              disabled={saving || !isAmountValid || !isDirty}
              style={{
                padding: '10px 22px',
                border: 'none',
                background: !isAmountValid || !isDirty ? '#bda5be' : colors.inkPlum,
                color: '#fff',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: saving || !isAmountValid || !isDirty ? 'not-allowed' : 'pointer',
                fontFamily: fonts.body,
              }}
            >
              {saving
                ? 'Saving…'
                : enabled
                ? previewCount > 0
                  ? `Confirm — ${fmt(previewTotal)}`
                  : 'Enable bonus'
                : 'Disable bonus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

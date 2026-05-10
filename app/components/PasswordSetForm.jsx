'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { colors, fonts, brandGradient } from '@/lib/styles';

/**
 * Reusable password-choosing form. Shared by:
 *   - /set-password   (forced after first magic-link sign-in)
 *   - /reset-password (after a recovery link)
 *
 * Both flows do the same thing: the user has a Supabase session and needs
 * to choose a new password. The only differences are the headline copy and
 * what to do after success — encapsulated via props.
 *
 * Props:
 *   - title       (string)   header bar text, defaults to "LoveLab B2B"
 *   - headline    (string)   bold subhead, e.g. "Set your password"
 *   - subtext     (string)   greyed paragraph above the form
 *   - submitLabel (string)   button text, defaults to "Save & Continue"
 *   - markPasswordSet (bool) whether to PATCH /api/me/password-set after save
 *   - onSuccess   (fn)       called when the password update succeeds
 */
export default function PasswordSetForm({
  title = 'LoveLab B2B',
  headline = 'Set your password',
  subtext = 'Choose a password to secure your account.',
  submitLabel = 'Save & Continue',
  markPasswordSet = true,
  onSuccess,
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      if (markPasswordSet) {
        // Best-effort flag flip — if it fails the user is still signed in
        // with the new password, so we don't block the success path on it.
        try {
          await fetch('/api/me/password-set', { method: 'PATCH' });
        } catch {
          console.warn('[PasswordSetForm] could not mark has_password_set, continuing.');
        }
      }

      if (onSuccess) await onSuccess();
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.lovelabBg,
        fontFamily: fonts.body,
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 4px 32px rgba(93,58,94,0.10)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: brandGradient,
            padding: '28px 32px 24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#fff',
              fontFamily: fonts.heading,
              letterSpacing: '0.02em',
              marginBottom: 6,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{headline}</div>
        </div>

        <div style={{ padding: '32px' }}>
          <p
            style={{
              fontSize: 13,
              color: colors.lovelabMuted,
              marginBottom: 24,
              lineHeight: 1.6,
              margin: '0 0 24px',
            }}
          >
            {subtext}
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  style={inputStyle}
                  autoFocus
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: colors.lovelabMuted,
                    fontSize: 12,
                    padding: 4,
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                required
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 16,
                  fontSize: 13,
                  color: colors.danger,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                background: loading ? colors.lovelabMuted : colors.inkPlum,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: fonts.body,
                transition: 'background .15s',
              }}
            >
              {loading ? 'Saving…' : submitLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: colors.lovelabMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  padding: '10px 36px 10px 12px',
  border: `1px solid ${colors.lineGray}`,
  borderRadius: 8,
  fontSize: 14,
  fontFamily: fonts.body,
  outline: 'none',
  boxSizing: 'border-box',
  color: '#333',
  background: '#fff',
};

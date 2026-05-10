'use client';

import { useState } from 'react';
import Link from 'next/link';
import { colors, fonts, brandGradient } from '@/lib/styles';

/**
 * Forgot Password — single email field, posts to /api/forgot-password.
 *
 * The API always returns 200 (no enumeration leak) so the success message
 * is generic on purpose: "if your email is registered…". Don't be tempted
 * to render different copy for known vs. unknown — it would defeat the
 * server-side mitigation.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // We always show the success state regardless of response — the API
      // returns 200 even for unknown addresses by design.
      if (res.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
        setLoading(false);
        return;
      }
      setSubmitted(true);
    } catch {
      // Network error — still show success so we don't leak through error states.
      setSubmitted(true);
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
        <div style={{ background: brandGradient, padding: '28px 32px 24px', textAlign: 'center' }}>
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
            LoveLab
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
            {submitted ? 'Check your inbox' : 'Reset your password'}
          </div>
        </div>

        <div style={{ padding: '32px' }}>
          {submitted ? (
            <>
              <p
                style={{
                  fontSize: 14,
                  color: '#333',
                  lineHeight: 1.6,
                  marginTop: 0,
                }}
              >
                If <strong>{email}</strong> is registered with LoveLab, we just sent a reset
                link. Click the link in your inbox within the next hour to choose a new password.
              </p>
              <p style={{ fontSize: 12, color: colors.lovelabMuted, lineHeight: 1.5 }}>
                Didn't receive anything? Check your spam folder, then{' '}
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setEmail('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.inkPlum,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontFamily: fonts.body,
                    fontSize: 12,
                    padding: 0,
                  }}
                >
                  try a different email
                </button>
                .
              </p>
              <Link
                href="/login"
                style={{
                  display: 'inline-block',
                  marginTop: 20,
                  fontSize: 13,
                  color: colors.inkPlum,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                ← Back to sign in
              </Link>
            </>
          ) : (
            <>
              <p
                style={{
                  fontSize: 13,
                  color: colors.lovelabMuted,
                  lineHeight: 1.6,
                  margin: '0 0 24px',
                }}
              >
                Enter the email you use for LoveLab and we'll send you a link to choose
                a new password.
              </p>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    style={inputStyle}
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
                  }}
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <Link
                  href="/login"
                  style={{
                    fontSize: 12,
                    color: colors.lovelabMuted,
                    textDecoration: 'none',
                  }}
                >
                  ← Back to sign in
                </Link>
              </div>
            </>
          )}
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
  padding: '10px 12px',
  border: `1px solid ${colors.lineGray}`,
  borderRadius: 8,
  fontSize: 14,
  fontFamily: fonts.body,
  outline: 'none',
  boxSizing: 'border-box',
  color: '#333',
  background: '#fff',
};

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { colors, fonts, brandGradient } from '@/lib/styles';

/**
 * Request Access — public form anyone can fill in.
 *
 * Posts to the existing /api/signup-request route. On success Alberto (and
 * Sam, when CC is configured) receives an email with one-click Approve and
 * Reject buttons. The requester sees a friendly "we'll be in touch" page.
 */
export default function RequestAccessPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/signup-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name: fullName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSubmitted(true);
      } else {
        // The API surfaces a helpful message for the common cases (already
        // has access, already pending, previously rejected). Pass it through.
        setError(data?.error || 'Could not submit your request. Please try again later.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
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
            {submitted ? 'Request received' : 'Request access'}
          </div>
        </div>

        <div style={{ padding: '32px' }}>
          {submitted ? (
            <>
              <p style={{ fontSize: 14, color: '#333', lineHeight: 1.6, margin: '0 0 16px' }}>
                Thanks, <strong>{fullName}</strong>! We've notified the LoveLab team.
              </p>
              <p style={{ fontSize: 13, color: colors.lovelabMuted, lineHeight: 1.6, margin: '0 0 24px' }}>
                You'll receive an email at <strong>{email}</strong> with sign-in
                instructions once your request is approved. This usually takes less than
                a working day.
              </p>
              <Link
                href="/login"
                style={{
                  display: 'inline-block',
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
                LoveLab B2B is reserved for our sales partners. Tell us who you are and
                we'll get in touch.
              </p>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Full name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Marc Schlund"
                    required
                    autoFocus
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@boutique.com"
                    required
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
                  {loading ? 'Sending…' : 'Request access'}
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

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { colors, fonts, brandGradient } from '@/lib/styles';

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.lovelabBg }}>
        Loading...
      </div>
    }>
      <SetPasswordContent />
    </Suspense>
  );
}

function getSafeNext(raw) {
  if (!raw) return '/';
  if (!/^\/[^/]/.test(raw) && raw !== '/') return '/';
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) return '/';
  if (/[\\@]/.test(raw)) return '/';
  if (/%2f/i.test(raw)) return '/';
  return raw;
}

function SetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeNext(searchParams.get('next'));

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login');
      } else {
        setAuthChecked(true);
      }
    });
  }, [router]);

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

      // Set the password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      // Mark has_password_set = true in profile
      const res = await fetch('/api/me/password-set', { method: 'PATCH' });
      if (!res.ok) {
        console.error('Failed to mark password as set, but continuing.');
      }

      router.replace(next);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.lovelabBg }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.lovelabBg,
      fontFamily: fonts.body,
      padding: '24px 16px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 4px 32px rgba(93,58,94,0.10)',
        overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{
          background: brandGradient,
          padding: '28px 32px 24px',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#fff',
            fontFamily: fonts.heading,
            letterSpacing: '0.02em',
            marginBottom: 6,
          }}>
            LoveLab B2B
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
            Set your password to secure your account
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: '32px' }}>
          <p style={{
            fontSize: 13,
            color: colors.lovelabMuted,
            marginBottom: 24,
            lineHeight: 1.6,
            margin: '0 0 24px',
          }}>
            Welcome! Please create a password so you can sign in with your email and password in the future.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  style={inputStyle}
                  autoFocus
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: colors.lovelabMuted, fontSize: 12, padding: 4,
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
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                required
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: colors.danger,
              }}>
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
              {loading ? 'Saving…' : 'Set Password & Continue'}
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

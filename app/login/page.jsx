'use client';

import { createClient } from '@/lib/supabase/client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useIsMobile } from '@/lib/useIsMobile';

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}

// Modes: 'google' | 'signin' (email+password) | 'magic' (magic link) | 'request' (request access)
function LoginContent() {
  const mobile = useIsMobile();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [mode, setMode] = useState('google');
  const searchParams = useSearchParams();

  // Email+password fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Magic link field
  const [magicEmail, setMagicEmail] = useState('');

  // Request access fields
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'access_denied') {
      setError('Access denied. Your email is not authorized.');
    } else if (errorParam === 'auth_error') {
      setError('Authentication error. Please try again.');
    }
  }, [searchParams]);

  const getAuthCallbackUrl = () => {
    // Always use the current browser origin to keep local auth on localhost.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/auth/callback`;
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const redirectTo = getAuthCallbackUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) { setError(error.message); setLoading(false); return; }
      if (data?.url) { window.location.href = data.url; }
      else { setError('No redirect URL returned.'); setLoading(false); }
    } catch (err) {
      setError(err?.message || 'Unexpected error.');
      setLoading(false);
    }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const supabase = createClient();
      const redirectTo = getAuthCallbackUrl();
      const { error } = await supabase.auth.signInWithOtp({
        email: magicEmail.trim(),
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      });
      if (error) {
        setError('Could not send magic link. Make sure your email is registered.');
      } else {
        setSuccessMsg('Magic link sent! Check your inbox and click the link to sign in.');
      }
    } catch (err) {
      setError(err?.message || 'Unexpected error.');
    }
    setLoading(false);
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError('Invalid email or password. If you just got approved, check your email to set your password first.');
        setLoading(false);
        return;
      }
      router.push('/');
    } catch (err) {
      setError(err?.message || 'Unexpected error.');
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/signup-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: reqEmail.trim(), full_name: reqName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit request.');
      } else {
        setSuccessMsg('Request sent! You\'ll receive an email once your access is approved.');
        setReqName('');
        setReqEmail('');
      }
    } catch (err) {
      setError('Unexpected error. Please try again.');
    }
    setLoading(false);
  };

  const inkPlum = '#5D3A5E';

  return (
    <div style={{ ...styles.container, padding: mobile ? '16px' : '20px' }}>
      <div style={{ ...styles.card, padding: mobile ? '28px 20px' : '48px' }}>
        <img src="/logo.png" alt="LoveLab" style={{ ...styles.logo, width: mobile ? 100 : 120, marginBottom: mobile ? 20 : 24 }} />
        <h1 style={{ ...styles.title, fontSize: mobile ? 24 : 28 }}>LoveLab B2B</h1>
        <p style={styles.subtitle}>Quote building tool for the sales team</p>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderRadius: 10, border: '1px solid #e5e5e5', overflow: 'hidden', marginBottom: 24 }}>
          {[
            { id: 'google', label: 'Google' },
            { id: 'signin', label: 'Password' },
            { id: 'magic', label: 'Magic Link' },
            { id: 'request', label: 'Request Access' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setMode(tab.id); setError(null); setSuccessMsg(null); }}
              style={{
                flex: 1,
                padding: '9px 4px',
                fontSize: 12,
                fontWeight: mode === tab.id ? 700 : 400,
                color: mode === tab.id ? '#fff' : '#666',
                background: mode === tab.id ? inkPlum : '#fff',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all .15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {successMsg && <div style={styles.success}>{successMsg}</div>}

        {/* ── Google sign-in ── */}
        {mode === 'google' && (
          <>
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{ ...styles.googleButton, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer', padding: mobile ? '16px 20px' : '14px 24px', minHeight: mobile ? 52 : 'auto' }}
            >
              <svg style={styles.googleIcon} viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {loading ? 'Signing in…' : 'Sign in with Google'}
            </button>
            <p style={{ marginTop: 16, fontSize: 12, color: '#aaa', textAlign: 'center' }}>
              Don't have a Gmail?{' '}
              <button onClick={() => setMode('request')} style={{ background: 'none', border: 'none', color: inkPlum, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                Request access →
              </button>
            </p>
          </>
        )}

        {/* ── Email + password login ── */}
        {mode === 'signin' && (
          <form onSubmit={handleEmailSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 4 }}>
              No account yet?{' '}
              <button onClick={() => setMode('request')} style={{ background: 'none', border: 'none', color: inkPlum, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                Request access →
              </button>
            </p>
          </form>
        )}

        {/* ── Magic link sign-in ── */}
        {mode === 'magic' && !successMsg && (
          <form onSubmit={handleMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 4, textAlign: 'left' }}>
              Enter your email and we'll send you a one-click sign-in link — no password needed.
            </p>
            <input
              type="email"
              placeholder="Your email address"
              value={magicEmail}
              onChange={e => setMagicEmail(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
        {mode === 'magic' && successMsg && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
            <p style={{ fontSize: 14, color: '#333', fontWeight: 600 }}>{successMsg}</p>
            <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>The link expires in 1 hour.</p>
          </div>
        )}

        {/* ── Request access ── */}
        {mode === 'request' && !successMsg && (
          <form onSubmit={handleRequestAccess} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              placeholder="Your full name"
              value={reqName}
              onChange={e => setReqName(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="email"
              placeholder="Your email address"
              value={reqEmail}
              onChange={e => setReqEmail(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Sending…' : 'Send access request'}
            </button>
            <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 4 }}>
              Already have access?{' '}
              <button onClick={() => setMode('signin')} style={{ background: 'none', border: 'none', color: inkPlum, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                Sign in →
              </button>
            </p>
          </form>
        )}

        <p style={styles.footer}>Reserved for LoveLab team members</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    padding: '20px',
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '48px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%',
  },
  logo: { width: '120px', height: 'auto', marginBottom: '24px' },
  title: { fontSize: '28px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 8px 0' },
  subtitle: { fontSize: '14px', color: '#666', margin: '0 0 24px 0' },
  error: {
    background: '#fee2e2', color: '#dc2626',
    padding: '12px 16px', borderRadius: '8px',
    marginBottom: '16px', fontSize: '14px', textAlign: 'left',
  },
  success: {
    background: '#ecfdf5', color: '#059669',
    padding: '12px 16px', borderRadius: '8px',
    marginBottom: '16px', fontSize: '14px', textAlign: 'left',
  },
  input: {
    width: '100%', padding: '12px 14px', fontSize: '14px',
    border: '1.5px solid #e5e5e5', borderRadius: '8px',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    color: '#1a1a1a',
  },
  submitBtn: {
    width: '100%', padding: '13px', fontSize: '15px', fontWeight: '600',
    color: '#fff', background: '#5D3A5E', border: 'none',
    borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
    transition: 'opacity .15s',
  },
  googleButton: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '12px', width: '100%', padding: '14px 24px',
    fontSize: '16px', fontWeight: '500', color: '#1a1a1a',
    background: 'white', border: '2px solid #e5e5e5',
    borderRadius: '8px', transition: 'all 0.2s ease', cursor: 'pointer',
    fontFamily: 'inherit',
  },
  googleIcon: { width: '20px', height: '20px' },
  footer: { marginTop: '24px', fontSize: '12px', color: '#999', marginBottom: 0 },
};

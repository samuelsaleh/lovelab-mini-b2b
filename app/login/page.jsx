'use client';

import { createClient } from '@/lib/supabase/client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'access_denied') {
      setError('Access denied. Your email is not authorized. / Accès refusé. Votre email n\'est pas autorisé.');
    } else if (errorParam === 'auth_error') {
      setError('Authentication error. Please try again. / Erreur d\'authentification. Veuillez réessayer.');
    }
  }, [searchParams]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    
    const supabase = createClient();
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img 
          src="/logo.png" 
          alt="LoveLab" 
          style={styles.logo}
        />
        <h1 style={styles.title}>LoveLab B2B</h1>
        <p style={styles.subtitle}>Quote building tool for the sales team</p>
        <p style={styles.subtitleFr}>Outil de création de devis pour l'équipe de vente</p>
        
        {error && (
          <div style={styles.error}>
            {error}
          </div>
        )}
        
        <button 
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            ...styles.googleButton,
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <svg style={styles.googleIcon} viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>
        
        <p style={styles.footer}>
          Reserved for LoveLab team members
        </p>
        <p style={styles.footerFr}>
          Réservé aux membres de l'équipe LoveLab
        </p>
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
  logo: {
    width: '120px',
    height: 'auto',
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    margin: '0 0 4px 0',
  },
  subtitleFr: {
    fontSize: '13px',
    color: '#888',
    margin: '0 0 32px 0',
    fontStyle: 'italic',
  },
  error: {
    background: '#fee2e2',
    color: '#dc2626',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  googleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: '500',
    color: '#1a1a1a',
    background: 'white',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
  },
  googleIcon: {
    width: '20px',
    height: '20px',
  },
  footer: {
    marginTop: '24px',
    fontSize: '12px',
    color: '#999',
    marginBottom: '4px',
  },
  footerFr: {
    fontSize: '11px',
    color: '#aaa',
    fontStyle: 'italic',
    margin: 0,
  },
};

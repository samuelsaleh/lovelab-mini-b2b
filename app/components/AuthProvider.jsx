'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Get initial session -- always use getUser() for server-side verification
    // Timeout so we don't hang forever if Supabase is slow/unreachable
    const AUTH_TIMEOUT_MS = 10000;
    const getInitialSession = async () => {
      try {
        const result = await Promise.race([
          supabase.auth.getUser(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auth timeout')), AUTH_TIMEOUT_MS)
          ),
        ]);
        const serverUser = result?.data?.user;
        if (serverUser) {
          setUser(serverUser);
          await fetchProfile(serverUser.id);
        }
      } catch (err) {
        // Lock timeout (multi-tab) or auth timeout: fail gracefully, don't surface to overlay
        const isLockTimeout = err?.message?.includes?.('Navigator LockManager') || err?.message?.includes?.('timed out');
        if (err?.message !== 'Auth timeout' && !isLockTimeout) {
          console.error('Auth init error:', err);
        }
      }

      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          setUser(session?.user ?? null);
          if (session?.user) {
            await fetchProfile(session.user.id);
          } else {
            setProfile(null);
          }
        } catch (err) {
          const isLockTimeout = err?.message?.includes?.('Navigator LockManager') || err?.message?.includes?.('timed out');
          if (!isLockTimeout) console.error('Auth state change error:', err);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      setProfile(data);
    } catch (err) {
      console.error('Profile fetch error:', err);
    }
  };

  const signOut = async () => {
    try {
      // Execute in background to prevent hanging
      supabase.auth.signOut().catch(err => console.error('Background sign out error:', err));
    } catch (err) {
      console.error('Sign out error:', err);
    }
    setUser(null);
    setProfile(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

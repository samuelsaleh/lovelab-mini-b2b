'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const AuthContext = createContext({
  user: null,
  profile: null,
  profileMissing: false,
  profileError: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profileError, setProfileError] = useState(null);
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
          await fetchProfile(serverUser.id, { retries: 2 });
        } else {
          setProfile(null);
          setProfileMissing(false);
          setProfileError(null);
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
            await fetchProfile(session.user.id, { retries: 2 });
          } else {
            setProfile(null);
            setProfileMissing(false);
            setProfileError(null);
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

  const fetchProfile = async (userId, options = {}) => {
    const retries = Number.isFinite(options.retries) ? options.retries : 0;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        setProfile(null);
        setProfileMissing(false);
        setProfileError('failed_to_load_profile');
        console.error('Profile fetch error:', error);
        return;
      }

      if (!data) {
        setProfile(null);
        setProfileMissing(true);
        setProfileError('missing_profile');
        return;
      }

      setProfile(data);
      setProfileMissing(false);
      setProfileError(null);
    } catch (err) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return fetchProfile(userId, { retries: retries - 1 });
      }
      setProfile(null);
      setProfileMissing(false);
      setProfileError('failed_to_load_profile');
      console.error('Profile fetch error:', err);
    }
  };

  // Self-heal profile state if auth user is present but profile was not loaded.
  useEffect(() => {
    if (!user || profile || profileMissing || loading) return;
    fetchProfile(user.id, { retries: 2 });
  }, [user?.id, profile, profileMissing, loading]);

  const refreshProfile = async () => {
    if (!user?.id) return;
    await fetchProfile(user.id, { retries: 2 });
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
    setProfileMissing(false);
    setProfileError(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, profile, profileMissing, profileError, loading, refreshProfile, signOut }}>
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

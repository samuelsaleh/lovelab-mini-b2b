'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const fetchFromServer = useCallback(async () => {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) {
        setProfileError('failed_to_load_profile');
        return false;
      }
      const json = await res.json();
      if (json.user) {
        setUser(json.user);
        if (json.profile) {
          setProfile(json.profile);
          setProfileMissing(false);
          setProfileError(null);
        } else {
          setProfile(null);
          setProfileMissing(true);
          setProfileError('missing_profile');
        }
        return true;
      }
    } catch (e) {
      setProfileError('failed_to_load_profile');
    }
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const ok = await fetchFromServer();
      if (cancelled) return;

      if (!ok) {
        setUser(null);
        setProfile(null);
        setProfileMissing(false);
        setProfileError(null);
      }
      setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (cancelled) return;
        if (session?.user) {
          await fetchFromServer();
        } else {
          setUser(null);
          setProfile(null);
          setProfileMissing(false);
          setProfileError(null);
        }
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    await fetchFromServer();
  }, [fetchFromServer]);

  const signOut = async () => {
    setUser(null);
    setProfile(null);
    setProfileMissing(false);
    setProfileError(null);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const name = cookie.split('=')[0].trim();
        if (name.startsWith('sb-')) {
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        }
      }
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    window.location.href = '/login?signed_out';
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

'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Auth-related routes where the force-set-password gate must NOT fire.
// Includes /set-password itself (would loop) and the public entry points
// where a user without a password yet still has to be able to land.
const AUTH_PAGES = [
  '/login',
  '/set-password',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/request-access',
];

const AuthContext = createContext({
  user: null,
  profile: null,
  orgMembership: null,
  profileMissing: false,
  profileError: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [orgMembership, setOrgMembership] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  const fetchFromServer = useCallback(async (signal) => {
    try {
      const res = await fetch('/api/me', signal ? { signal } : undefined);
      if (!res.ok) {
        setProfileError('failed_to_load_profile');
        return false;
      }
      const json = await res.json();
      if (json.user) {
        setUser(json.user);
        setOrgMembership(json.organization_membership || null);
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
      if (e?.name === 'AbortError') return false; // React StrictMode cleanup — not an error
      setProfileError('failed_to_load_profile');
    }
    return false;
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const init = async () => {
      const ok = await fetchFromServer(controller.signal);
      if (controller.signal.aborted) return;

      if (!ok) {
        setUser(null);
        setProfile(null);
        setOrgMembership(null);
        setProfileMissing(false);
        setProfileError(null);
      }
      setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (controller.signal.aborted) return;
        if (session?.user) {
          await fetchFromServer();
        } else {
          setUser(null);
          setProfile(null);
          setOrgMembership(null);
          setProfileMissing(false);
          setProfileError(null);
        }
        setLoading(false);
      }
    );

    return () => {
      controller.abort();
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    await fetchFromServer();
  }, [fetchFromServer]);

  // Force-set-password gate. New agents arrive with a temp password emailed
  // to them and has_password_set: false. The /auth/callback route handles
  // this for magic-link / OAuth sign-ins, but direct email+password
  // login (the new invite flow) bypasses that route entirely — the user
  // would otherwise land in the app still using the temp credentials.
  //
  // This effect closes the loop: any agent whose has_password_set is
  // falsy gets pushed to /set-password regardless of how they signed in.
  // We skip the redirect on auth-related pages so /set-password itself
  // doesn't try to redirect to itself.
  useEffect(() => {
    if (loading) return;
    if (!profile) return;
    if (!profile.is_agent) return;
    if (profile.has_password_set) return;
    if (!pathname) return;
    if (AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return;

    const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    router.replace(`/set-password${next}`);
  }, [profile, pathname, loading, router]);

  const signOut = async () => {
    setUser(null);
    setProfile(null);
    setOrgMembership(null);
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
    <AuthContext.Provider value={{ user, profile, orgMembership, profileMissing, profileError, loading, refreshProfile, signOut }}>
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

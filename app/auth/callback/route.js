import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isUserAllowed } from '@/lib/auth/isUserAllowed';
import { NextResponse } from 'next/server';

// Validate the redirect path to prevent open redirects
function getSafeRedirectPath(next) {
  if (!next) return '/';
  // Must start with / and not contain // (protocol-relative) or other schemes
  if (!/^\/[^/]/.test(next) && next !== '/') return '/';
  // Block any URL with a protocol scheme
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(next)) return '/';
  // Block backslashes and encoded characters that could bypass validation
  if (/[\\@]/.test(next)) return '/';
  if (/%2f/i.test(next)) return '/';
  return next;
}

// Validate forwarded host against known allowed hosts
function getSafeHost(forwardedHost) {
  if (!forwardedHost) return null;
  const allowedHosts = (process.env.ALLOWED_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  if (allowedHosts.length === 0) return null;
  return allowedHosts.includes(forwardedHost.toLowerCase()) ? forwardedHost : null;
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = getSafeRedirectPath(searchParams.get('next'));

  // Track sign-in method so we can conditionally trigger set-password
  const isOAuthSignIn = Boolean(code);

  let sessionUser = null;
  let supabase = null;

  // Handle PKCE/OAuth code exchange
  if (code) {
    supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      sessionUser = data.user;
    }
  }
  // Handle magic link / OTP token_hash (agent invitations and magic link sign-in)
  else if (token_hash && type) {
    supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error && data?.user) {
      sessionUser = data.user;
    }
  }

  if (sessionUser && supabase) {
    const adminSupabase = createAdminClient();
    const userEmail = sessionUser.email?.toLowerCase();

    // Run allowed_emails point-lookup and profile fetch in parallel
    const [allowedRow, profileRow] = await Promise.all([
      checkAllowedEmail(adminSupabase, userEmail),
      fetchAuthProfile(adminSupabase, sessionUser.id),
    ]);

    if (!isUserAllowed({ isInAllowedEmails: allowedRow, agentProfile: profileRow })) {
      await supabase.auth.signOut();
      const url = new URL('/login', origin);
      url.searchParams.set('error', 'access_denied');
      return NextResponse.redirect(url);
    }

    // User is allowed — ensure they have a profile
    await ensureProfile(adminSupabase, sessionUser, profileRow);

    const isLocalEnv = process.env.NODE_ENV === 'development';

    const buildRedirect = (path) => {
      if (isLocalEnv) return `${origin}${path}`;
      const forwardedHost = request.headers.get('x-forwarded-host');
      const safeHost = getSafeHost(forwardedHost);
      return safeHost ? `https://${safeHost}${path}` : `${origin}${path}`;
    };

    // Only redirect to set-password for magic link / OTP sign-ins, not for Google OAuth.
    // OAuth users already have an identity — forcing a password step makes no sense.
    if (!isOAuthSignIn && profileRow?.is_agent === true && profileRow?.has_password_set === false) {
      const setPasswordPath = `/set-password${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
      return NextResponse.redirect(buildRedirect(setPasswordPath));
    }

    return NextResponse.redirect(buildRedirect(next));
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}

/**
 * Check if the email exists in allowed_emails (point lookup, not full table scan).
 * Falls back to the ALLOWED_EMAILS env var if the DB returns no rows at all.
 */
async function checkAllowedEmail(adminSupabase, userEmail) {
  if (!userEmail) return false;
  try {
    // First try a fast point-lookup in the DB
    const { data } = await adminSupabase
      .from('allowed_emails')
      .select('email')
      .eq('email', userEmail)
      .maybeSingle();

    if (data) return true;

    // Fallback: check env var (used when allowed_emails table is empty or not yet populated)
    const envEmails = (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);
    return envEmails.includes(userEmail);
  } catch (err) {
    console.error('[auth/callback] checkAllowedEmail error:', err);
    // Fail closed on unexpected errors — do not grant access
    return false;
  }
}

/**
 * Fetch the profile fields needed for the access gate and password check.
 */
async function fetchAuthProfile(adminSupabase, userId) {
  try {
    const { data } = await adminSupabase
      .from('profiles')
      .select('id, role, is_agent, agent_status, agent_deleted_at, has_password_set')
      .eq('id', userId)
      .maybeSingle();
    return data || null;
  } catch (err) {
    console.error('[auth/callback] fetchAuthProfile error:', err);
    return null;
  }
}

function getAdminEmails() {
  const fromEnv = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (fromEnv.length === 0) {
    console.warn('[auth] ADMIN_EMAILS env var is empty -- no admin emails configured');
  }
  return fromEnv;
}

/**
 * Create or update user profile on first/subsequent sign-in.
 * Receives the already-fetched profile row to avoid a redundant DB query.
 */
async function ensureProfile(adminSupabase, user, existingProfile) {
  try {
    const userEmail = (user.email || '').toLowerCase();
    const shouldBeAdmin = getAdminEmails().includes(userEmail);

    if (!existingProfile) {
      const { error } = await adminSupabase.from('profiles').insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
        role: shouldBeAdmin ? 'admin' : 'member',
      });
      if (error) {
        console.error('[auth/callback] Failed to create profile:', error.message);
      }
    } else {
      // Repair admin role if needed
      if (shouldBeAdmin && existingProfile.role !== 'admin') {
        try {
          await adminSupabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', user.id);
        } catch (roleErr) {
          console.error('[auth/callback] Admin role repair error (non-blocking):', roleErr.message);
        }
      }

      // Activate invited agents on first login
      if (existingProfile.is_agent && existingProfile.agent_status === 'invited') {
        try {
          await adminSupabase
            .from('profiles')
            .update({ agent_status: 'active' })
            .eq('id', user.id);
        } catch (agentErr) {
          console.error('[auth/callback] Agent activation error (non-blocking):', agentErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[auth/callback] ensureProfile error:', err);
  }
}

import { createClient, createAdminClient } from '@/lib/supabase/server';
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
  if (allowedHosts.length === 0) return null; // No allowlist configured, don't trust forwarded host
  return allowedHosts.includes(forwardedHost.toLowerCase()) ? forwardedHost : null;
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = getSafeRedirectPath(searchParams.get('next'));

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
  // Handle magic link / OTP token_hash (used by agent invitations and magic link sign-in)
  else if (token_hash && type) {
    supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error && data?.user) {
      sessionUser = data.user;
    }
  }

  if (sessionUser && supabase) {
    // Check if user email is in the allowed list (using admin client to bypass RLS)
    const allowedEmails = await getAllowedEmails();
    const userEmail = sessionUser.email?.toLowerCase();

    if (!allowedEmails.includes(userEmail)) {
      await supabase.auth.signOut();
      const url = new URL('/login', origin);
      url.searchParams.set('error', 'access_denied');
      return NextResponse.redirect(url);
    }

    // User is allowed - ensure they have a profile
    await ensureProfile(supabase, sessionUser);

    // Check if this is an agent who hasn't set a password yet
    const needsPassword = await agentNeedsPassword(sessionUser.id);

    const isLocalEnv = process.env.NODE_ENV === 'development';

    const buildRedirect = (path) => {
      if (isLocalEnv) return `${origin}${path}`;
      const forwardedHost = request.headers.get('x-forwarded-host');
      const safeHost = getSafeHost(forwardedHost);
      return safeHost ? `https://${safeHost}${path}` : `${origin}${path}`;
    };

    if (needsPassword) {
      const setPasswordPath = `/set-password${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
      return NextResponse.redirect(buildRedirect(setPasswordPath));
    }

    return NextResponse.redirect(buildRedirect(next));
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}

// Check if an agent needs to set a password (is_agent and has_password_set = false)
async function agentNeedsPassword(userId) {
  try {
    const adminSupabase = createAdminClient();
    const { data } = await adminSupabase
      .from('profiles')
      .select('is_agent, has_password_set')
      .eq('id', userId)
      .single();
    return data?.is_agent === true && data?.has_password_set === false;
  } catch {
    return false;
  }
}

// Get list of allowed emails using admin client (bypasses RLS)
async function getAllowedEmails() {
  try {
    const adminSupabase = createAdminClient();
    const { data: allowedEmailsData } = await adminSupabase
      .from('allowed_emails')
      .select('email');
    
    if (allowedEmailsData && allowedEmailsData.length > 0) {
      return allowedEmailsData.map(row => row.email.toLowerCase());
    }
  } catch (err) {
    console.error('Failed to fetch allowed emails from DB:', err);
  }
  
  // Fallback to environment variable (comma-separated list)
  const envEmails = process.env.ALLOWED_EMAILS || '';
  return envEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
}

function getAdminEmails() {
  const fromEnv = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  // Safety fallback for existing production admins if ADMIN_EMAILS is missing.
  const fallback = ['albertosaleh@gmail.com', 'alberto@love-lab.com', 'samuelsaleh@gmail.com'];
  return Array.from(new Set([...fromEnv, ...fallback]));
}

// Create or update user profile
async function ensureProfile(supabase, user) {
  try {
    const adminSupabase = createAdminClient();
    const userEmail = (user.email || '').toLowerCase();
    const shouldBeAdmin = getAdminEmails().includes(userEmail);

    const { data: existingProfile } = await adminSupabase
      .from('profiles')
      .select('id, role, is_agent, agent_status')
      .eq('id', user.id)
      .single();
    
    if (!existingProfile) {
      const { error } = await adminSupabase.from('profiles').insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
        role: shouldBeAdmin ? 'admin' : 'member',
      });
      if (error) {
        console.error('Failed to create profile:', error.message);
      }
    } else {
      // Keep admin roles stable even if profile is recreated/updated in future flows.
      if (shouldBeAdmin && existingProfile.role !== 'admin') {
        try {
          await adminSupabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', user.id);
        } catch (roleErr) {
          console.error('Admin role repair error (non-blocking):', roleErr.message);
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
          console.error('Agent activation error (non-blocking):', agentErr.message);
        }
      }
    }
  } catch (err) {
    console.error('ensureProfile error:', err);
  }
}

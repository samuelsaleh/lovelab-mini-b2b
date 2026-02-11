import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Validate the redirect path to prevent open redirects
function getSafeRedirectPath(next) {
  if (!next) return '/';
  // Must start with / and not contain // (protocol-relative) or other schemes
  if (!/^\/[^/]/.test(next) && next !== '/') return '/';
  // Block any URL with a protocol scheme
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(next)) return '/';
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
  const next = getSafeRedirectPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data?.user) {
      // Check if user email is in the allowed list
      const allowedEmails = await getAllowedEmails(supabase);
      const userEmail = data.user.email?.toLowerCase();
      
      if (!allowedEmails.includes(userEmail)) {
        // User not in allowlist - sign them out and show error
        await supabase.auth.signOut();
        const url = new URL('/login', origin);
        url.searchParams.set('error', 'access_denied');
        return NextResponse.redirect(url);
      }
      
      // User is allowed - ensure they have a profile
      await ensureProfile(supabase, data.user);
      
      const isLocalEnv = process.env.NODE_ENV === 'development';
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      
      // In production, validate x-forwarded-host against allowlist
      const forwardedHost = request.headers.get('x-forwarded-host');
      const safeHost = getSafeHost(forwardedHost);
      
      if (safeHost) {
        return NextResponse.redirect(`https://${safeHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}

// Get list of allowed emails from Supabase or environment
async function getAllowedEmails(supabase) {
  // First try to get from database
  const { data: allowedEmailsData } = await supabase
    .from('allowed_emails')
    .select('email');
  
  if (allowedEmailsData && allowedEmailsData.length > 0) {
    return allowedEmailsData.map(row => row.email.toLowerCase());
  }
  
  // Fallback to environment variable (comma-separated list)
  const envEmails = process.env.ALLOWED_EMAILS || '';
  return envEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
}

// Create or update user profile
async function ensureProfile(supabase, user) {
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();
  
  if (!existingProfile) {
    await supabase.from('profiles').insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
    });
  }
}

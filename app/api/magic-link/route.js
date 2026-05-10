import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isValidEmail, normalizeEmail } from '@/lib/auth/validation';
import { sendBrandedAuthLink } from '@/lib/auth/sendBrandedAuthLink';
import { magicLinkEmail } from '@/lib/email-templates';

/**
 * POST /api/magic-link
 *
 * Sends a LoveLab-branded magic-link email instead of relying on Supabase's
 * built-in template (which says "Supabase" in the From and uses a generic
 * developer-template body — confusing for non-technical agents).
 *
 * Defense-in-depth allowed_emails pre-check: we don't generate or send
 * a link for unknown emails, but we always return 200 to the caller so
 * an attacker can't enumerate valid accounts. Recovery (forgot-password)
 * deliberately does NOT pre-check — see the comment there.
 */
export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, {
    maxRequests: 5,
    windowMs: 60_000,
    prefix: 'magic-link',
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: true });
    }

    const email = normalizeEmail(body?.email);
    if (!isValidEmail(email)) {
      // Don't leak whether the format check failed vs. the lookup failed.
      return NextResponse.json({ ok: true });
    }

    const adminSupabase = createAdminClient();
    const { data: allowed } = await adminSupabase
      .from('allowed_emails')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (!allowed) {
      // Email is not on the allowlist — silently skip the send so unknown
      // addresses can't be enumerated by timing the response.
      return NextResponse.json({ ok: true });
    }

    const { origin } = new URL(request.url);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;

    await sendBrandedAuthLink({
      type: 'magiclink',
      email,
      redirectPath: '/auth/callback',
      buildEmail: magicLinkEmail,
      siteUrl,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[/api/magic-link]', err?.message || err);
    return NextResponse.json({
      ok: true,
      ...(process.env.NODE_ENV !== 'production' ? { _debug: err?.message } : {}),
    });
  }
}

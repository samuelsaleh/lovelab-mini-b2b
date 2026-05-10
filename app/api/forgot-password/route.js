import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isValidEmail, normalizeEmail } from '@/lib/auth/validation';
import { sendBrandedAuthLink } from '@/lib/auth/sendBrandedAuthLink';
import { resetPasswordEmail } from '@/lib/email-templates';

/**
 * POST /api/forgot-password
 *
 * Sends a LoveLab-branded password recovery email. The reset link routes
 * through /auth/callback?token_hash=...&type=recovery&next=/reset-password
 * so by the time the user reaches /reset-password they already have a
 * valid Supabase session — no client-side fragment parsing required.
 *
 * Important: unlike /api/magic-link, this route deliberately does NOT
 * pre-check `allowed_emails`. Recovery must work for half-onboarded
 * agents whose first invite expired and for the founders themselves.
 * Supabase's generateLink will silently no-op for non-existent users
 * either way, so the worst case is a wasted Resend send.
 *
 * Always returns 200 so an attacker can't enumerate which addresses
 * have accounts by watching response codes.
 */
export async function POST(request) {
  const rateLimitRes = checkRateLimit(request, {
    maxRequests: 5,
    windowMs: 60_000,
    prefix: 'forgot-password',
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
      return NextResponse.json({ ok: true });
    }

    const { origin } = new URL(request.url);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;

    await sendBrandedAuthLink({
      type: 'recovery',
      email,
      // The reset link goes through /auth/callback first so verifyOtp
      // creates a real session before /reset-password renders. The
      // existing callback at app/auth/callback/route.js line 50 handles
      // type=recovery without modification.
      redirectPath: '/auth/callback?next=/reset-password',
      buildEmail: resetPasswordEmail,
      siteUrl,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[/api/forgot-password]', err?.message || err);
    return NextResponse.json({
      ok: true,
      ...(process.env.NODE_ENV !== 'production' ? { _debug: err?.message } : {}),
    });
  }
}

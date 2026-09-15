import { createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSenderFrom, getAdminNotificationRecipients } from '@/lib/email';
import { isValidEmail, normalizeEmail } from '@/lib/auth/validation';
import { signupRequestEmail } from '@/lib/email-templates';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const rateLimitRes = checkRateLimit(request, { maxRequests: 5, prefix: 'signup-request' });
    if (rateLimitRes) return rateLimitRes;

    const body = await request.json();
    const { email, full_name } = body;

    if (!email || !full_name) {
      return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
    }

    const emailLower = normalizeEmail(email);
    const nameTrimmed = full_name.trim();

    if (!isValidEmail(emailLower)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // Check if already in allowed_emails (already has access)
    const { data: existing } = await adminSupabase
      .from('allowed_emails')
      .select('email')
      .eq('email', emailLower)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'This email already has access. Please sign in.' }, { status: 409 });
    }

    // Check if already has a pending request
    const { data: pendingExisting } = await adminSupabase
      .from('pending_signups')
      .select('id, status')
      .eq('email', emailLower)
      .maybeSingle();

    if (pendingExisting) {
      if (pendingExisting.status === 'pending') {
        return NextResponse.json({ error: 'A request for this email is already pending.' }, { status: 409 });
      }
      if (pendingExisting.status === 'rejected') {
        return NextResponse.json({ error: 'This email request was previously rejected. Please contact the admin.' }, { status: 403 });
      }
    }

    // Insert pending signup
    const { data: signup, error: insertError } = await adminSupabase
      .from('pending_signups')
      .insert({ email: emailLower, full_name: nameTrimmed })
      .select('token')
      .single();

    if (insertError) {
      console.error('[signup-request] Insert error:', insertError.message);
      return NextResponse.json({ error: 'Failed to submit request. Please try again.' }, { status: 500 });
    }

    const { origin } = new URL(request.url);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;
    const approveUrl = `${siteUrl}/api/approve-signup?token=${signup.token}`;
    const rejectUrl = `${siteUrl}/api/reject-signup?token=${signup.token}`;

    // Single source of truth for admin recipients across every email path —
    // see lib/email.js getAdminNotificationRecipients for parsing rules.
    const { to: primaryAdmin, cc: ccAdmins } = getAdminNotificationRecipients();

    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.error('[signup-request] RESEND_API_KEY not set');
      // Still return success to user — don't block them if email fails
      return NextResponse.json({ success: true });
    }

    // Send notification email to admin via Resend (8 s timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: getSenderFrom(),
          to: [primaryAdmin],
          ...(ccAdmins.length > 0 ? { cc: ccAdmins } : {}),
          ...signupRequestEmail(
            { fullName: nameTrimmed, email: emailLower, approveUrl, rejectUrl },
            siteUrl,
          ),
        }),
      });

      if (!emailRes.ok) {
        const err = await emailRes.text();
        console.error('[signup-request] Resend error:', err);
      }
    } catch (fetchErr) {
      console.error('[signup-request] Resend fetch failed/timed out:', fetchErr.message);
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[signup-request] Exception:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

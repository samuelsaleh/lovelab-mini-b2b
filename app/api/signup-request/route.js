import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, full_name } = body;

    if (!email || !full_name) {
      return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();
    const nameTrimmed = full_name.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
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
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'alberto@love-lab.com';
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
          from: 'LoveLab B2B <onboarding@resend.dev>',
          to: [adminEmail],
          subject: `Access Request: ${nameTrimmed} (${emailLower})`,
          html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
              <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
              <h2 style="color: #1a1a1a; margin: 0 0 8px;">New Access Request</h2>
              <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                Someone is requesting access to LoveLab B2B.
              </p>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
                <tr>
                  <td style="padding: 10px 0; color: #888; font-size: 13px; width: 100px;">Name</td>
                  <td style="padding: 10px 0; color: #1a1a1a; font-size: 14px; font-weight: 600;">${nameTrimmed}</td>
                </tr>
                <tr style="border-top: 1px solid #eee;">
                  <td style="padding: 10px 0; color: #888; font-size: 13px;">Email</td>
                  <td style="padding: 10px 0; color: #1a1a1a; font-size: 14px; font-weight: 600;">${emailLower}</td>
                </tr>
              </table>
              <div style="display: flex; gap: 12px;">
                <a href="${approveUrl}" style="display: inline-block; padding: 12px 28px; background: #5D3A5E; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; margin-right: 12px;">
                  ✓ Approve
                </a>
                <a href="${rejectUrl}" style="display: inline-block; padding: 12px 28px; background: #fff; color: #dc2626; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; border: 2px solid #dc2626;">
                  ✗ Reject
                </a>
              </div>
              <p style="color: #aaa; font-size: 11px; margin-top: 32px;">
                LoveLab B2B · This email was sent automatically.
              </p>
            </div>
          `,
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

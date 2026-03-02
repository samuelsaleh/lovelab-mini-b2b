import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get('token');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/approve-result?status=invalid`);
  }

  try {
    const adminSupabase = createAdminClient();

    // Look up the pending signup by token
    const { data: signup, error: lookupError } = await adminSupabase
      .from('pending_signups')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (lookupError || !signup) {
      return NextResponse.redirect(`${siteUrl}/approve-result?status=invalid`);
    }

    if (signup.status !== 'pending') {
      return NextResponse.redirect(`${siteUrl}/approve-result?status=already_actioned&name=${encodeURIComponent(signup.full_name)}`);
    }

    // 1. Add to allowed_emails
    await adminSupabase
      .from('allowed_emails')
      .upsert({ email: signup.email }, { onConflict: 'email' });

    // 2. Invite the user via Supabase (creates auth account + sends set-password email)
    const { error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(signup.email, {
      data: { full_name: signup.full_name },
      redirectTo: `${siteUrl}/auth/callback`,
    });

    if (inviteError) {
      // If user already exists in auth (e.g. had Google account), that's fine — just add to allowed_emails
      console.warn('[approve-signup] Invite warning (may already exist):', inviteError.message);
    }

    // 3. Mark as approved
    await adminSupabase
      .from('pending_signups')
      .update({ status: 'approved' })
      .eq('id', signup.id);

    // 4. Send welcome email to the new user via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'LoveLab B2B <alberto@love-lab.com>',
          to: [signup.email],
          subject: 'Your LoveLab B2B access has been approved!',
          html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
              <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
              <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${signup.full_name}!</h2>
              <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                Your request to access LoveLab B2B has been <strong style="color: #27ae60;">approved</strong>.
              </p>
              <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                You should receive a separate email from Supabase to set your password. Once set, you can log in at:
              </p>
              <a href="${siteUrl}/login" style="display: inline-block; padding: 12px 28px; background: #5D3A5E; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">
                Go to LoveLab B2B →
              </a>
              <p style="color: #aaa; font-size: 11px; margin-top: 32px;">
                LoveLab B2B · This email was sent automatically.
              </p>
            </div>
          `,
        }),
      }).catch(err => console.error('[approve-signup] Welcome email error:', err));
    }

    return NextResponse.redirect(`${siteUrl}/approve-result?status=approved&name=${encodeURIComponent(signup.full_name)}`);
  } catch (err) {
    console.error('[approve-signup] Exception:', err);
    return NextResponse.redirect(`${siteUrl}/approve-result?status=error`);
  }
}

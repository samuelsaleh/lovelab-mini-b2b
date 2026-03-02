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

    // Mark as rejected
    await adminSupabase
      .from('pending_signups')
      .update({ status: 'rejected' })
      .eq('id', signup.id);

    // Send rejection email to the requester
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
          subject: 'Your LoveLab B2B access request',
          html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
              <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
              <h2 style="color: #1a1a1a; margin: 0 0 8px;">Hi ${signup.full_name},</h2>
              <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                Unfortunately your request to access LoveLab B2B could not be approved at this time.
              </p>
              <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
                If you think this is a mistake, please contact the LoveLab team directly.
              </p>
              <p style="color: #aaa; font-size: 11px; margin-top: 32px;">
                LoveLab B2B · This email was sent automatically.
              </p>
            </div>
          `,
        }),
      }).catch(err => console.error('[reject-signup] Rejection email error:', err));
    }

    return NextResponse.redirect(`${siteUrl}/approve-result?status=rejected&name=${encodeURIComponent(signup.full_name)}`);
  } catch (err) {
    console.error('[reject-signup] Exception:', err);
    return NextResponse.redirect(`${siteUrl}/approve-result?status=error`);
  }
}

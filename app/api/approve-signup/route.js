import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';

function confirmationPage(action, token, siteUrl) {
  const color = action === 'approve' ? '#27ae60' : '#dc2626';
  const label = action === 'approve' ? 'Approve' : 'Reject';
  const url = `${siteUrl}/api/${action}-signup?token=${encodeURIComponent(token)}&confirm=1`;
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label} Access Request</title></head>` +
    `<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f8f8">` +
    `<div style="background:#fff;border-radius:12px;padding:32px;max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08)">` +
    `<h2 style="margin:0 0 12px;color:#1a1a1a">${label} this access request?</h2>` +
    `<p style="color:#666;font-size:14px;margin:0 0 24px">Click the button below to confirm.</p>` +
    `<a href="${url}" style="display:inline-block;padding:14px 32px;background:${color};color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">${label} Access</a>` +
    `</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'approve-signup' });
  if (rateLimitRes) return rateLimitRes;

  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get('token');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/approve-result?status=invalid`);
  }

  if (searchParams.get('confirm') !== '1') {
    return confirmationPage('approve', token, siteUrl);
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

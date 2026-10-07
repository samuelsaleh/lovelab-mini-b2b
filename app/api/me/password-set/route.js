import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

export async function PATCH(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'me-password-set' });
  if (rateLimitRes) return rateLimitRes;

  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to update password' },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase
      .from('profiles')
      .update({ has_password_set: true })
      .eq('id', user.id);

    if (error) {
      console.error('[password-set PATCH] Error:', error.message);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    // An invited employee carries must_set_password on the auth user (see
    // lib/employees/invite.js). Clear it now they chose a password. Best
    // effort: has_password_set = true above already ends the redirect.
    if (user.user_metadata?.must_set_password) {
      try {
        const { error: metaErr } = await adminSupabase.auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, must_set_password: false },
        });
        if (metaErr) console.error('[password-set PATCH] Could not clear must_set_password:', metaErr.message);
      } catch (metaErr) {
        console.error('[password-set PATCH] Could not clear must_set_password:', metaErr?.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[password-set PATCH] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

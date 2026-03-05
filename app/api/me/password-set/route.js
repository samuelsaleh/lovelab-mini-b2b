import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

export async function PATCH(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 10, prefix: 'me-password-set' });
  if (rateLimitRes) return rateLimitRes;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[password-set PATCH] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 60, prefix: 'me-get' });
  if (rateLimitRes) return rateLimitRes;

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ user: null, profile: null });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profileError && profile) {
      return NextResponse.json({ user, profile });
    }

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (adminProfile) {
      return NextResponse.json({ user, profile: adminProfile });
    }

    return NextResponse.json({
      user,
      profile: null,
      error: profileError?.message || 'profile not found',
    });
  } catch (err) {
    return NextResponse.json({ user: null, profile: null, error: err.message }, { status: 500 });
  }
}

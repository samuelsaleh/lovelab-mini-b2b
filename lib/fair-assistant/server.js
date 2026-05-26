import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getUserContext } from '@/app/api/_lib/access';
import { NextResponse } from 'next/server';

export async function requireFairAdmin() {
  const supabase = await createClient();
  const { user, isAdmin } = await getUserContext(supabase);
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, supabase, adminSupabase: createAdminClient() };
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://lovelab.be';
}

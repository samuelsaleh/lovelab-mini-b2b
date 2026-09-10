import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUserContext } from '@/app/api/_lib/access';

/**
 * Authorization for the LoveLab side of the certificate module.
 *
 * These screens show both sides at once — LoveLab's shelf and what IGI holds —
 * because deciding between walking across the road and ordering production
 * needs both. That makes them LoveLab-only. IGI's portal has its own routes and
 * never reaches this helper, which is what keeps LoveLab's sales rate on
 * LoveLab's side of the wall.
 *
 * Returns { error } to hand straight back, or { user, adminSupabase } to work with.
 */
export async function requireLoveLab(request, prefix, maxRequests = 60) {
  const rateLimitRes = checkRateLimit(request, { maxRequests, prefix });
  if (rateLimitRes) return { error: rateLimitRes };

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { user, isAdmin } = await getUserContext(supabase);

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, adminSupabase };
}

/** One place to log a route failure, so the shape stays consistent. */
export function fail(route, error, message, status = 500) {
  console.error(`[${route}]`, error?.message || error);
  return NextResponse.json({ error: message }, { status });
}

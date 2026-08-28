import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * Authorization for IGI's own screens.
 *
 * Every route in this directory runs as the signed-in user — `createClient()`
 * only, never `createAdminClient()`. That is a deliberate departure from the
 * rest of this codebase, where authorization is enforced in JavaScript against
 * the service-role client.
 *
 * Everywhere else the boundary is internal: the worst case of a mistake is one
 * LoveLab user seeing another LoveLab user's data. Here it is not. A forgotten
 * column in a .select() would leak LoveLab's shelf — and therefore their sales
 * rate — to another company, silently and for as long as nobody noticed.
 * Running as the user means row level security turns that class of mistake into
 * an empty result instead of a leak.
 *
 * **Do not import createAdminClient into this directory.**
 */
export async function requireIgi(request, prefix, maxRequests = 60) {
  const rateLimitRes = checkRateLimit(request, { maxRequests, prefix });
  if (rateLimitRes) return { error: rateLimitRes };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // The flag is the source of truth. The policies enforce it again in the
  // database, so a mistake here narrows to nothing rather than opening a door.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_igi, full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_igi) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, profile, supabase };
}

/** One place to log a route failure, so the shape stays consistent. */
export function fail(route, error, message, status = 500) {
  console.error(`[${route}]`, error?.message || error);
  return NextResponse.json({ error: message }, { status });
}

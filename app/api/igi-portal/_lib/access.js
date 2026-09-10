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

/** The database has no certificate tables yet: the switch-on file was never run. */
export function isNotSwitchedOn(error) {
  const text = String(error?.message || error || '');
  return error?.code === '42P01' || /relation "?(public\.)?igi_[a-z_]+"? does not exist/i.test(text);
}

/** The tables exist but a column the app now needs does not: the switch-on file was run before an update. */
export function isBehindTheApp(error) {
  const text = String(error?.message || error || '');
  return error?.code === '42703' || /column "?(public\.)?igi_[a-z_]+\.[a-z_]+"? does not exist/i.test(text);
}

export const BEHIND_THE_APP_MESSAGE =
  'The database is behind the app: a certificate column it needs does not exist yet. Run database-migrations/igi-switch-on.sql again in the Supabase SQL editor — it updates in place and is safe to re-run (docs/igi-switch-on.md).';

export const NOT_SWITCHED_ON_MESSAGE =
  'The certificate module is not switched on yet. Paste database-migrations/igi-switch-on.sql into the Supabase SQL editor and run it (docs/igi-switch-on.md).';

/** One place to log a route failure, so the shape stays consistent. */
export function fail(route, error, message, status = 500) {
  if (isNotSwitchedOn(error)) {
    console.warn(`[${route}] certificate tables missing — switch-on not run`);
    return NextResponse.json({ error: NOT_SWITCHED_ON_MESSAGE, not_switched_on: true }, { status: 503 });
  }
  if (isBehindTheApp(error)) {
    console.warn(`[${route}] certificate column missing — switch-on file needs re-running:`, error?.message);
    return NextResponse.json({ error: BEHIND_THE_APP_MESSAGE, behind_the_app: true }, { status: 503 });
  }
  console.error(`[${route}]`, error?.message || error);
  return NextResponse.json({ error: message }, { status });
}

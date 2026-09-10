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

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function updateSession(request) {
  let response = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Allow local boot even when Supabase is not configured yet.
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Non-blocking: if Supabase is unreachable (e.g. slow connection / timeout)
  // allow the request through without crashing the middleware.
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    // ConnectTimeoutError or similar — session won't be refreshed this request,
    // but the user stays logged in via their existing cookie.
    return response;
  }

  if (await isIgiOutsideTheirPortal(supabase, user, request)) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL(IGI_HOME, request.url));
  }

  return response;
}

const IGI_HOME = '/igi';

/** The only paths an IGI session is allowed to reach. */
function isIgiPath(pathname) {
  return pathname === IGI_HOME
    || pathname.startsWith('/igi/')
    || pathname.startsWith('/api/igi-portal');
}

/**
 * IGI Antwerp is another company. Their accounts exist so they can record what
 * they produced — nothing else in this app is theirs to see, and a good deal of
 * it (commissions, agent pay, client revenue) would be actively wrong to show
 * them.
 *
 * Most routes in this codebase only ask "is somebody signed in", which was a
 * fair question while every account belonged to LoveLab or its own agents. It
 * stops being fair once an outside company holds a session, so the answer is
 * given once, here, rather than asked again in 118 places — a route added later
 * is covered without anyone having to remember.
 *
 * The lookup costs one indexed read on requests that carry a session. There is
 * no cheaper way to know: putting the fact in the sign-in token would be free
 * but fails open, because a token issued without the mark sails through.
 */
async function isIgiOutsideTheirPortal(supabase, user, request) {
  if (!user) return false;
  if (isIgiPath(request.nextUrl.pathname)) return false;

  try {
    // A user may read their own profile row under RLS, so this needs no
    // elevated key. is_igi cannot be changed by the account itself: UPDATE on
    // profiles is not granted to `authenticated`.
    const { data, error } = await supabase
      .from('profiles')
      .select('is_igi')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      // Unknown column on a database where the migration has not been applied.
      if (error.code === '42703') return false;
      throw error;
    }
    return data?.is_igi === true;
  } catch (err) {
    // Deciding wrongly here is a choice between two bad outcomes. Refusing on a
    // transient error would lock every LoveLab user out of the whole app;
    // allowing means that during an outage an IGI session could reach a route
    // it should not. For a named partner company rather than an attacker, the
    // outage is the greater harm — but it is a real trade, so it is logged.
    console.error('[middleware] IGI containment check failed, allowing through:', err?.message || err);
    return false;
  }
}

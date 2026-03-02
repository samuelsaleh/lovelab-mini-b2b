import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function updateSession(request) {
  const pathname = request.nextUrl.pathname;
  const publicRoutes = ['/login', '/auth/callback', '/approve-result'];
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  // Performance optimization: API routes already do auth checks themselves.
  // Skipping Supabase getUser() here avoids a full auth roundtrip per API call.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make your app slow.
  // Use a timeout so the app doesn't hang if Supabase is slow/unreachable.
  const getUserWithTimeout = () =>
    Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout')), 5000)
      ),
    ]).catch(() => ({ data: { user: null } }));

  const {
    data: { user },
  } = await getUserWithTimeout();

  // If user is not logged in and trying to access protected route, redirect to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If user is logged in and trying to access login page, redirect to home
  // Skip redirect if ?signed_out param is present (sign-out just happened, cookie may be stale)
  if (user && request.nextUrl.pathname === '/login' && !request.nextUrl.searchParams.has('signed_out')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

import { updateSession } from './lib/supabase/middleware.js';

export async function proxy(request) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static downloads (pdf/xlsx/images) — keep these off the auth
     *   session middleware so catalogue / pricelist downloads stay fast
     *   and do not fail when the cookie refresh is slow.
     * API routes are still included so session tokens get refreshed.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf|xlsx)$).*)',
  ],
};

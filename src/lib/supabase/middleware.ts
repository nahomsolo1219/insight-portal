// Session-refresh helper called from `src/middleware.ts` on every request.
// It (1) rotates the Supabase auth cookies if the access token is near expiry
// and (2) redirects unauthenticated requests away from protected routes.
//
// IMPORTANT: do not insert any code between `createServerClient` and
// `supabase.auth.getUser()` — skipping the getUser() check is the most common
// cause of users getting randomly logged out.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/field');
  const isAuthInfra = pathname.startsWith('/auth') || pathname === '/login' || pathname === '/logout';

  // Unauthenticated access to a protected route → bounce to /login with the
  // original destination preserved so we can return there post-magic-link.
  // Role-based routing happens in the per-area layouts (admin / portal),
  // which already query the user's profile — keeping that off this hot
  // path avoids an extra DB roundtrip per request.
  if (!user && isProtectedRoute && !isAuthInfra) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

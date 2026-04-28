/**
 * Edge middleware — runs before any /admin route hits a server
 * component or API handler.
 *
 * Behavior:
 *   1. Logged-in admins (valid NextAuth JWT) sail through to /admin/*.
 *   2. The login page (/admin/9x-portal) is always reachable so a
 *      logged-out admin whose cookie expired can re-enter creds.
 *   3. Anonymous visitors with `?knock=<ADMIN_ENTRY_TOKEN>` get
 *      redirected to the login page and a short-lived cookie is set
 *      so subsequent navigations within the admin surface work
 *      without the token in the URL.
 *   4. Anonymous visitors with the `admin_knock` cookie can reach any
 *      /admin/* path (real auth still gates server actions / role
 *      checks downstream).
 *   5. Everyone else gets a bare 404 — no redirect, because that
 *      would leak the admin path's existence.
 *
 * On every passthrough we inject `x-pathname` onto the forwarded
 * request so the admin layout can read it via `headers()` and decide
 * whether to render the sidebar (skipped on the login page).
 *
 * Edge-safety: imports `authConfig` (no Mongoose / bcrypt). The Node
 * provider in `auth/options.js` never gets bundled here.
 */

import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';

const KNOCK_COOKIE = 'admin_knock';
const KNOCK_TTL_SECONDS = 300; // 5 min
const LOGIN_PATH = '/admin/9x-portal';

const { auth } = NextAuth(authConfig);

/** Pass-through that also leaks the pathname into request headers
 *  so server components downstream (`headers()`) can read it. */
function passThrough(req, pathname) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export default auth((req) => {
  const { pathname, searchParams } = req.nextUrl;

  // Only the /admin/* surface is gated.
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const isLoggedIn = Boolean(req.auth?.user);
  if (isLoggedIn) {
    return passThrough(req, pathname);
  }

  // The login page IS the gate — never block it. Otherwise a logged-out
  // admin whose session expired mid-flow gets a confusing 404 when
  // NextAuth tries to redirect them back here.
  if (pathname === LOGIN_PATH) {
    return passThrough(req, pathname);
  }

  const expected = process.env.ADMIN_ENTRY_TOKEN;
  const knock = searchParams.get('knock');
  const validKnock = expected && knock && knock === expected;

  if (validKnock) {
    // Strip the knock from the URL by redirecting to the login page,
    // and drop a short-lived cookie so subsequent navigations within
    // the admin surface don't have to re-supply the token.
    const url = new URL(LOGIN_PATH, req.url);
    const res = NextResponse.redirect(url);
    res.cookies.set(KNOCK_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/admin',
      maxAge: KNOCK_TTL_SECONDS,
    });
    return res;
  }

  // Honour an existing knock cookie. The real auth gate is still
  // NextAuth + server-side role checks; the cookie just keeps the
  // page reachable instead of 404ing.
  const hasCookie = req.cookies.get(KNOCK_COOKIE)?.value === '1';
  if (hasCookie) {
    return passThrough(req, pathname);
  }

  // Default: pretend the route doesn't exist.
  return new NextResponse(null, { status: 404 });
});

export const config = {
  matcher: ['/admin/:path*'],
};

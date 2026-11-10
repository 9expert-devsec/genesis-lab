/**
 * Edge middleware — gates the /admin/* surface.
 *
 * Access rules:
 *  1. Valid admin session (NextAuth JWT)  → pass through to any /admin/* page,
 *                                           except a GET of the login page,
 *                                           which redirects into the admin.
 *  2. Login page (/admin/9x-portal)       → always reachable (never blocked).
 *  3. /admin/door                         → sets a 30-min gate cookie then
 *                                           redirects to login. This is the
 *                                           human-friendly entry point.
 *  4. ?knock=<ADMIN_ENTRY_TOKEN>          → same as /door (URL-based entry
 *                                           kept for back-compat / scripts).
 *  5. No session + valid gate cookie      → redirect to login so an admin
 *                                           whose session expired can re-auth.
 *  6. No session + no gate cookie         → 404 (hides admin surface from public).
 *
 * The gate cookie ONLY permits seeing the login page — it never grants
 * access to any protected /admin/* page. Session + role checks downstream
 * are the real authority.
 *
 * Edge-safety: imports `authConfig` (no Mongoose / bcrypt).
 */

import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import {
  DOOR_PATH,
  LOGIN_PATH,
  loginRedirectTarget,
} from '@/lib/auth/loginRedirectTarget';

const GATE_COOKIE  = 'admin_gate';
const GATE_TTL     = 60 * 30;          // 30 min — time window to complete login

const { auth } = NextAuth(authConfig);

/** Inject x-pathname header so server components can read it via headers(). */
function passThrough(req, pathname) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/** Set gate cookie and redirect to login. */
function grantGateAndRedirect(req) {
  const url = new URL(LOGIN_PATH, req.url);
  const res = NextResponse.redirect(url);
  res.cookies.set(GATE_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'strict',
    path:     '/admin',
    maxAge:   GATE_TTL,
  });
  return res;
}

export default auth((req) => {
  const { pathname, searchParams } = req.nextUrl;

  // Only gate the admin surface.
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // ── Rule 1: Valid session → pass through immediately. ──────────────────────
  // Gate cookie state is irrelevant once a user is logged in.
  const isLoggedIn = Boolean(req.auth?.user);
  if (isLoggedIn) {
    // The login page is pointless to a signed-in admin, so send them in. This
    // cannot loop: requirePage only redirects here when auth() finds no session,
    // and that is the same JWT this branch just accepted. A disabled admin or an
    // empty role lands on the dashboard or /admin/403, never back here. GET and
    // HEAD only, because LoginForm's server action POSTs to this path and a tab
    // left open across a sign-in elsewhere must not have that POST redirected.
    if (pathname === LOGIN_PATH && (req.method === 'GET' || req.method === 'HEAD')) {
      const target = loginRedirectTarget(searchParams.get('callbackUrl'));
      return NextResponse.redirect(new URL(target, req.url));
    }
    return passThrough(req, pathname);
  }

  // ── Rule 2: Login page is always reachable. ────────────────────────────────
  if (pathname === LOGIN_PATH) {
    return passThrough(req, pathname);
  }

  // ── Rule 3: /admin/door → set gate cookie + redirect to login. ────────────
  if (pathname === DOOR_PATH) {
    return grantGateAndRedirect(req);
  }

  // ── Rule 4: ?knock=TOKEN → same as /door (URL-based back-compat). ─────────
  const expected   = process.env.ADMIN_ENTRY_TOKEN;
  const knockParam = searchParams.get('knock');
  if (expected && knockParam && knockParam === expected) {
    return grantGateAndRedirect(req);
  }

  // ── Rule 5: No session + gate cookie → redirect to login. ─────────────────
  // The admin's session has expired but they came through the door legitimately.
  // Let them re-authenticate instead of showing 404.
  const hasGate = req.cookies.get(GATE_COOKIE)?.value === '1';
  if (hasGate) {
    const url = new URL(LOGIN_PATH, req.url);
    return NextResponse.redirect(url);
  }

  // ── Rule 6: No session + no gate cookie → 404. ────────────────────────────
  return new NextResponse(null, { status: 404 });
});

export const config = {
  matcher: ['/admin/:path*'],
};

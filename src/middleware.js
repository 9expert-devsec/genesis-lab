/**
 * Edge middleware — gates the /admin/* surface.
 *
 * Access rules:
 *  1. Valid admin session (NextAuth JWT)  → pass through to any /admin/* page.
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

const GATE_COOKIE  = 'admin_gate';
const GATE_TTL     = 60 * 30;          // 30 min — time window to complete login
const LOGIN_PATH   = '/admin/9x-portal';
const DOOR_PATH    = '/admin/door';

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

const MASTERCLASS_DOMAIN = 'https://www.9experttraining.com';

/** Returns true for routes that are allowed on this masterclass-only deployment. */
function isMasterclassRoute(pathname) {
  // /masterclass/payment/* (Omise 3DS return page, etc.)
  if (pathname.startsWith('/masterclass/payment/')) return true;
  // /masterclass/[slug]
  // /masterclass/[slug]/register
  // /masterclass/[slug]/register/* (any sub-step)
  if (/^\/masterclass\/[^/]+(\/register(\/.*)?)?$/.test(pathname)) return true;
  // API routes — always allow
  if (pathname.startsWith('/api/')) return true;
  // Next.js internals + static assets served from /public
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname.startsWith('/brand/')) return true;
  if (pathname.startsWith('/assets/')) return true;
  if (pathname.startsWith('/fonts/')) return true;
  if (pathname.startsWith('/icons/')) return true;
  // Admin surface — handled below
  if (pathname.startsWith('/admin')) return true;
  return false;
}

export default auth((req) => {
  const { pathname, searchParams } = req.nextUrl;

  // ── Masterclass-only mode: redirect non-masterclass public routes ──────────
  if (!isMasterclassRoute(pathname)) {
    return NextResponse.redirect(MASTERCLASS_DOMAIN);
  }

  // Only gate the admin surface.
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // ── Rule 1: Valid session → pass through immediately. ──────────────────────
  // Gate cookie state is irrelevant once a user is logged in.
  const isLoggedIn = Boolean(req.auth?.user);
  if (isLoggedIn) {
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
  matcher: [
    '/admin/:path*',
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|assets|fonts|icons|brand|api).*)',
  ],
};

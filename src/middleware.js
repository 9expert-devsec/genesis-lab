/**
 * Next.js middleware — runs at the edge before matching routes.
 *
 * Strategy: delegate to NextAuth's `authorized` callback (see auth/options.js),
 * which returns true/false based on session + path. When false, NextAuth
 * auto-redirects to /admin/login.
 */

export { auth as middleware } from '@/lib/auth/options';

export const config = {
  // Match /admin and everything under it, EXCEPT /admin/login (NextAuth handles the redirect).
  // We exclude Next static assets and the NextAuth route itself.
  matcher: [
    '/admin/:path*',
  ],
};

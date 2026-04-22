/**
 * Next.js middleware — runs at the Edge before matching routes.
 *
 * Imports only the edge-safe `authConfig` (no Mongoose/bcrypt). The
 * `authorized` callback inside it gates /admin/* on session presence;
 * on `false`, NextAuth auto-redirects to /admin/login.
 */
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/admin/:path*'],
};

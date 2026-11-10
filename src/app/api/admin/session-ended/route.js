/**
 * GET /api/admin/session-ended — where a disabled or deleted admin is sent.
 *
 * Clears the session cookies, then redirects to the login page. It runs in that
 * order because the middleware bounces anyone holding a valid JWT away from the
 * login page, so without the clear the two would loop forever.
 * See lib/auth/assertActiveAdmin.
 *
 * Deliberately no guard: the only visitors are ones the guards just rejected.
 * It is outside the middleware's `/admin/:path*` matcher, and all it can do to
 * anyone is sign them out.
 *
 * A relative Location, so the redirect cannot name an internal host.
 */
import { LOGIN_PATH } from '@/lib/auth/loginRedirectTarget';
import { expiredCookieHeader, sessionCookiesToClear } from '@/lib/auth/sessionCookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req) {
  const headers = new Headers({
    location: `${LOGIN_PATH}?error=inactive`,
    'cache-control': 'no-store',
  });
  const present = req.cookies.getAll().map((cookie) => cookie.name);
  for (const name of sessionCookiesToClear(present)) {
    headers.append('set-cookie', expiredCookieHeader(name));
  }
  return new Response(null, { status: 303, headers });
}

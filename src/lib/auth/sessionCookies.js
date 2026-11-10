/**
 * The session cookies Auth.js sets, as names, so a route handler can clear them.
 *
 * The `__Secure-` name is the one production uses, because the site is HTTPS.
 * Auth.js splits a token too large for one cookie into `.0`, `.1`, …, and those
 * are only knowable from the request, so the caller passes in what it received.
 * test/pure/sessionCookies compares these against Auth.js's own defaultCookies().
 *
 * PURE: no I/O.
 */

const BASE = 'authjs.session-token';
const CHUNK = /^(?:__Secure-)?authjs\.session-token\.\d+$/;

export const SESSION_COOKIE_NAMES = [BASE, `__Secure-${BASE}`];

/** @param {string[]} requestCookieNames every cookie name on the request */
export function sessionCookiesToClear(requestCookieNames = []) {
  return [...SESSION_COOKIE_NAMES, ...requestCookieNames.filter((name) => CHUNK.test(name))];
}

/** A browser refuses a `__Secure-` cookie, even a deletion, without `Secure`. */
export function isSecureCookieName(name) {
  return name.startsWith('__Secure-');
}

/** The Set-Cookie value that deletes `name`. */
export function expiredCookieHeader(name) {
  const secure = isSecureCookieName(name) ? '; Secure' : '';
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

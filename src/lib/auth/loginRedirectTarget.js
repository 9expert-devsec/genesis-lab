/**
 * Where a signed-in admin who opened the login page should land.
 *
 * Runs in the Edge middleware, so this file imports nothing: no Mongoose, no
 * Node-only module.
 *
 * `callbackUrl` is attacker-controlled — it arrives in a link anyone can send
 * — so it is an allowlist and not a blocklist: a same-origin path inside the
 * admin passes, and everything else lands on the dashboard. The login and door
 * paths are refused because sending a signed-in admin back to either is a
 * pointless hop at best.
 *
 * PURE: no I/O.
 */

export const ADMIN_HOME = '/admin';
export const LOGIN_PATH = '/admin/9x-portal';
export const DOOR_PATH  = '/admin/door';

// Backslashes and control characters are refused outright because the URL
// parser rewrites them: `/admin\..` and a tab inside a path do not mean what
// they look like by the time the browser follows the redirect.
const REWRITTEN_BY_THE_URL_PARSER = /[\\\u0000-\u001f\u007f]/;

const DOT_SEGMENT = /\/\.{1,2}(\/|$)/;

/**
 * @param {string|null|undefined} callbackUrl the raw query value
 * @returns {string} a same-origin path under /admin, never the login or door
 */
export function loginRedirectTarget(callbackUrl) {
  if (typeof callbackUrl !== 'string') return ADMIN_HOME;
  if (REWRITTEN_BY_THE_URL_PARSER.test(callbackUrl)) return ADMIN_HOME;
  if (callbackUrl.includes('//')) return ADMIN_HOME;

  const path = callbackUrl.split(/[?#]/, 1)[0];
  if (path !== ADMIN_HOME && !path.startsWith(`${ADMIN_HOME}/`)) return ADMIN_HOME;
  // `%` in the PATH only, not the query. No admin route has an encoded segment,
  // and an encoded `/`, `.` or `-` could spell a refused path past these checks.
  if (path.includes('%') || DOT_SEGMENT.test(path)) return ADMIN_HOME;

  const bare = path.replace(/\/$/, '');
  if (bare === LOGIN_PATH || bare === DOOR_PATH) return ADMIN_HOME;

  return callbackUrl;
}

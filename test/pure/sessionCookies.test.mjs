import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultCookies } from '../../node_modules/@auth/core/lib/utils/cookie.js';
import {
  isSecureCookieName,
  SESSION_COOKIE_NAMES,
  sessionCookiesToClear,
} from '@/lib/auth/sessionCookies';
import { GET } from '@/app/api/admin/session-ended/route';

/**
 * The cookies session-ended clears are the ones the app actually sets. A name
 * that drifts here leaves the JWT in place, and the login page sends the admin
 * straight back to /admin, so this failure is a redirect loop in production.
 *
 * Compared against Auth.js's own defaultCookies() rather than a copy of it, and
 * the route is called for real, because the test that matters is what reaches
 * the browser: `Secure` on the `__Secure-` name, or the browser ignores it.
 */

const requestWith = (...names) => ({
  cookies: { getAll: () => names.map((name) => ({ name, value: 'x' })) },
});

const cleared = (response) =>
  Object.fromEntries(
    response.headers.getSetCookie().map((line) => [line.slice(0, line.indexOf('=')), line]),
  );

test('both names match what Auth.js sets, HTTP and HTTPS', () => {
  const actual = [false, true].map((secure) => defaultCookies(secure).sessionToken.name);
  assert.deepEqual([...SESSION_COOKIE_NAMES].sort(), actual.sort());
});

test('the secure flag follows the same rule Auth.js uses', () => {
  for (const secure of [false, true]) {
    const { name, options } = defaultCookies(secure).sessionToken;
    assert.equal(isSecureCookieName(name), options.secure, name);
  }
});

test('chunks on the request are cleared, on either prefix', () => {
  const names = sessionCookiesToClear([
    '__Secure-authjs.session-token.0',
    'authjs.session-token.1',
  ]);
  assert.ok(names.includes('__Secure-authjs.session-token.0'));
  assert.ok(names.includes('authjs.session-token.1'));
});

test('CONTROL: an unrelated cookie is left alone', () => {
  const names = sessionCookiesToClear([
    'admin_gate',
    'authjs.csrf-token',
    'authjs.session-token.evil',
    'x-authjs.session-token.0',
  ]);
  assert.deepEqual(names, SESSION_COOKIE_NAMES);
});

test('the route redirects to the login page with the reason, relatively', () => {
  const res = GET(requestWith());
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/admin/9x-portal?error=inactive');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('the route expires both names, and Secure only on the __Secure- one', () => {
  const lines = cleared(GET(requestWith()));
  const plain = lines['authjs.session-token'];
  const secure = lines['__Secure-authjs.session-token'];
  assert.match(plain, /Max-Age=0/);
  assert.match(plain, /Path=\//);
  assert.doesNotMatch(plain, /Secure/);
  assert.match(secure, /Max-Age=0/);
  assert.match(secure, /Path=\//);
  assert.match(secure, /; Secure/);
});

test('the route expires chunks it received, and leaves the gate cookie alone', () => {
  const lines = cleared(GET(requestWith('authjs.session-token.0', 'admin_gate')));
  assert.match(lines['authjs.session-token.0'], /Max-Age=0/);
  assert.equal('admin_gate' in lines, false);
});

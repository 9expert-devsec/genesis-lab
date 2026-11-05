import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import {
  ADMIN_HOME,
  DOOR_PATH,
  LOGIN_PATH,
  loginRedirectTarget,
} from '@/lib/auth/loginRedirectTarget';

/**
 * The login page's redirect for a signed-in admin. `callbackUrl` comes off the
 * query string, so every case below that lands on ADMIN_HOME is a link somebody
 * could send an admin. The middleware branch itself is exercised at runtime;
 * NextAuth's wrapper does not load here.
 */

const REFUSED = [
  // Off-site.
  ['protocol-relative', '//evil.com'],
  ['absolute', 'https://evil.com'],
  ['absolute with an /admin path', 'https://evil.com/admin/articles'],
  ['backslash protocol-relative', '/\\evil.com'],
  ['backslash inside /admin', '/admin\\..\\evil.com'],
  ['double slash inside /admin', '/admin//evil.com'],
  ['tab the parser would strip', '/\t/evil.com'],
  // Same origin, but not the admin.
  ['the public site', '/articles'],
  ['a prefix of the word admin', '/admin-evil'],
  ['a longer first segment', '/administrator'],
  ['dot segments out of the admin', '/admin/../evil'],
  ['an encoded dot segment', '/admin/%2e%2e/evil'],
  ['an encoded slash', '/admin/%2F%2Fevil.com'],
  // The two pages that must never be a destination.
  ['the login page', LOGIN_PATH],
  ['the login page with a query', `${LOGIN_PATH}?callbackUrl=/admin`],
  ['the login page with a slash', `${LOGIN_PATH}/`],
  ['an encoded spelling of the login page', '/admin/9x%2Dportal'],
  ['the door', DOOR_PATH],
  ['the door with a query', `${DOOR_PATH}?x=1`],
  // Nothing usable.
  ['empty', ''],
  ['relative', 'admin/articles'],
];

for (const [name, value] of REFUSED) {
  test(`refused, lands on the dashboard: ${name}`, () => {
    assert.equal(loginRedirectTarget(value), ADMIN_HOME);
  });
}

test('a missing query value lands on the dashboard', () => {
  assert.equal(loginRedirectTarget(null), ADMIN_HOME);
  assert.equal(loginRedirectTarget(undefined), ADMIN_HOME);
});

test('CONTROL: a real admin path passes through unchanged', () => {
  assert.equal(loginRedirectTarget('/admin/articles'), '/admin/articles');
  assert.equal(loginRedirectTarget('/admin'), '/admin');
});

test('the query and hash of a real admin path survive', () => {
  assert.equal(
    loginRedirectTarget('/admin/page-configs?tab=skills#top'),
    '/admin/page-configs?tab=skills#top',
  );
});

test('the module stays Edge-safe: it imports nothing', () => {
  const { code } = readSource('src/lib/auth/loginRedirectTarget.js');
  assert.ok(code.length > 300, `scrubbed to ${code.length} chars`);
  assert.doesNotMatch(code, /^\s*import\b/m);
  assert.doesNotMatch(code, /\brequire\(/);
});

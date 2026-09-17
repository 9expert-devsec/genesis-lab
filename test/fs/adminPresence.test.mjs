import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * Presence wiring — the claims a run cannot make, read from source.
 *
 *   · the heartbeat is mounted EXACTLY ONCE, in the admin layout, and the
 *     layout still returns the login page bare before reaching it;
 *   · the heartbeat gates every beat on `document.visibilityState`, and
 *     never beats on leave — no sendBeacon, no pagehide / beforeunload /
 *     unload. A beat on the way out would keep a departed admin Online for a
 *     full threshold, which is the opposite of what the stamp means;
 *   · the route imports no audit writer — nothing in this repo records an
 *     AdminAuditLog row except an explicit recordAdminAction* call, so "no
 *     row" is exactly "no import" (read on `withImports`: the CODE view
 *     strips import lines, and a "nothing imports X" guard read from it
 *     passes vacuously — sourceScan's defect 5);
 *   · logoutAction stamps `lastSignedOutAt` and does NOT `$unset` `lastSeenAt`.
 *
 * Code view everywhere else: each of these files explains in prose the very
 * thing it must not do, and a raw scan would be red on the explanation.
 */

const HEARTBEAT = 'src/components/admin/PresenceHeartbeat.jsx';
const LAYOUT = 'src/app/admin/layout.jsx';
const ROUTE = 'src/app/api/admin/presence/route.js';
const AUTH_ACTIONS = 'src/lib/actions/auth.js';
const MODEL = 'src/models/Admin.js';

// Substring for the three names that also appear as `onpagehide` /
// `onbeforeunload` properties; `unload` alone is matched as an event name
// (quoted) or the `onunload` property, so `reload` and `beforeunload` (already
// caught) do not double up.
const LEAVE_HOOKS = /sendBeacon|pagehide|beforeunload|['"]unload['"]|onunload/;

// ── the heartbeat ───────────────────────────────────────────────────────────

test('heartbeat: a client component that gates on visibilityState, beats on mount / interval / visible / focus, and throttles', () => {
  const { code } = readSource(HEARTBEAT);
  assert.match(code, /^\s*['"]use client['"]/, 'must be a client component — it owns a timer');
  assert.match(code, /document\.visibilityState !== 'visible'/, 'every beat checks visibility (the interval must be a no-op in a hidden tab)');
  assert.match(code, /setInterval\(beat, BEAT_MS\)/);
  assert.match(code, /BEAT_MS = 60_000/);
  assert.match(code, /MIN_GAP_MS = 30_000/);
  assert.match(code, /addEventListener\('visibilitychange'/);
  assert.match(code, /addEventListener\('focus', beat\)/);
  assert.match(code, /clearInterval\(timer\)/, 'the interval is torn down on unmount');
  assert.match(code, /fetch\(PRESENCE_ENDPOINT, \{ method: 'POST', keepalive: true/, 'POST with keepalive');
  assert.match(code, /PRESENCE_ENDPOINT = '\/api\/admin\/presence'/);
  assert.match(code, /return null;/, 'renders nothing');
});

test('heartbeat: NEVER beats on leave — no sendBeacon, pagehide, beforeunload or unload (code view)', () => {
  const { code } = readSource(HEARTBEAT);
  assert.equal(LEAVE_HOOKS.test(code), false, `a leave hook is referenced: ${code.match(LEAVE_HOOKS)?.[0]}`);
});

test('CONTROL: the leave-hook matcher fires on each forbidden name, and not on "reload"', () => {
  for (const s of ["navigator.sendBeacon(url)", "addEventListener('pagehide', beat)", "window.onbeforeunload = f", "addEventListener('unload', beat)"]) {
    assert.equal(LEAVE_HOOKS.test(s), true, s);
  }
  assert.equal(LEAVE_HOOKS.test('router.reload()'), false);
  assert.equal(LEAVE_HOOKS.test("addEventListener('visibilitychange', f)"), false);
});

// ── the mount ───────────────────────────────────────────────────────────────

test('layout: the heartbeat is imported and mounted exactly once, after the bare login return', () => {
  const { code, withImports } = readSource(LAYOUT);
  assert.match(withImports, /import \{ PresenceHeartbeat \} from ['"]@\/components\/admin\/PresenceHeartbeat['"]/);
  const mounts = code.match(/<PresenceHeartbeat \/>/g) ?? [];
  assert.equal(mounts.length, 1, `expected one mount, found ${mounts.length}`);
  const loginReturn = code.indexOf('if (isLoginPage) {');
  const mountAt = code.indexOf('<PresenceHeartbeat />');
  assert.ok(loginReturn !== -1 && loginReturn < mountAt, 'the login page must return before the heartbeat is reached');
});

test('layout: nothing else in src/ mounts the heartbeat', () => {
  // The component name is unique, so a second mount anywhere in src/ would be
  // a second `<PresenceHeartbeat` in some file's code view.
  const offenders = walkSources('src')
    .filter((f) => f.rel !== LAYOUT && f.rel !== HEARTBEAT)
    .filter((f) => /<PresenceHeartbeat\b/.test(f.code))
    .map((f) => f.rel);
  assert.deepEqual(offenders, []);
});

// ── the route ───────────────────────────────────────────────────────────────

test('route: Node runtime, force-dynamic, auth() gate, one updateOne on the session id with active:true, and NO audit import', () => {
  const { code, withImports } = readSource(ROUTE);
  assert.match(code, /export const runtime = 'nodejs'/);
  assert.match(code, /export const dynamic = 'force-dynamic'/);
  assert.match(code, /status: 401/);
  assert.match(code, /\{ _id: id, active: true \}, \{ \$set: \{ lastSeenAt: now\(\) \} \}/);
  assert.match(code, /status: 204/);
  assert.equal(/recordAdminAction/.test(withImports), false, 'the heartbeat must never reach the audit writer');
  assert.equal(/@\/lib\/audit\//.test(withImports), false, 'no audit module is imported at all');
  assert.equal(/\$unset/.test(code), false);
  assert.equal(ROUTE.startsWith('src/lib/actions/'), false, 'outside src/lib/actions so auditCoverage\'s mutating count is untouched');
});

// ── sign-out ────────────────────────────────────────────────────────────────

test('logoutAction stamps lastSignedOutAt on the admin\'s own document before signOut, and never $unsets lastSeenAt', () => {
  const { code } = readSource(AUTH_ACTIONS);
  const fn = code.slice(code.indexOf('export async function logoutAction'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  assert.match(body, /Admin\.updateOne\(\{ _id: id \}, \{ \$set: \{ lastSignedOutAt: new Date\(\) \} \}\)/);
  assert.equal(/\$unset/.test(body), false, 'lastSeenAt is KEPT on sign-out');
  assert.equal(/lastSeenAt/.test(body), false, 'sign-out does not touch lastSeenAt at all');
  const stampAt = body.indexOf('lastSignedOutAt');
  const signOutAt = body.indexOf('await signOut(');
  assert.ok(stampAt !== -1 && signOutAt !== -1 && stampAt < signOutAt, 'the stamp comes BEFORE signOut');
  assert.match(body, /const id = session\?\.user\?\.id/, 'the id is the session\'s, never an argument');
});

// ── the schema ──────────────────────────────────────────────────────────────

test('Admin schema carries lastSeenAt and lastSignedOutAt, both Date, default null', () => {
  const { code } = readSource(MODEL);
  assert.match(code, /lastSeenAt:\s*\{ type: Date, default: null \}/);
  assert.match(code, /lastSignedOutAt:\s*\{ type: Date, default: null \}/);
});

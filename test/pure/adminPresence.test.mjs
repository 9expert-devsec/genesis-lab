import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOnline, PRESENCE_THRESHOLD_MS } from '@/lib/admin/presence';
import { handlePost } from '@/app/api/admin/presence/route';

/**
 * Presence — the pure Online rule, and the heartbeat route driven with fakes.
 *
 * Every time is an explicit epoch-ms value; nothing reads the wall clock.
 * The route's `auth`, `connect` and `updateOne` are injected through its
 * `deps` seam (the corpus routes' shape), so no session stub is mutated and
 * no model is touched — which also means these cases cannot interfere with
 * any other file under the concurrent runner.
 */

const T0 = Date.UTC(2026, 8, 17, 9, 0, 0); // an arbitrary "now"
const at = (offsetMs) => new Date(T0 + offsetMs);

const admin = (over = {}) => ({ active: true, lastSeenAt: at(-1_000), lastSignedOutAt: null, ...over });

// ── isOnline ────────────────────────────────────────────────────────────────

test('the threshold is 150 s and the edge is INCLUSIVE: exactly 150 s → online, 150 s + 1 ms → offline', () => {
  assert.equal(PRESENCE_THRESHOLD_MS, 150_000);
  assert.equal(isOnline(admin({ lastSeenAt: at(-150_000) }), T0), true);
  assert.equal(isOnline(admin({ lastSeenAt: at(-150_001) }), T0), false);
  assert.equal(isOnline(admin({ lastSeenAt: at(0) }), T0), true, 'a beat this instant');
  assert.equal(isOnline(admin({ lastSeenAt: at(-10_000) }), T0, 5_000), false, 'a custom threshold is honoured');
});

test('a null (or absent, or unparseable) lastSeenAt is never online', () => {
  assert.equal(isOnline(admin({ lastSeenAt: null }), T0), false);
  assert.equal(isOnline({ active: true }, T0), false);
  assert.equal(isOnline(admin({ lastSeenAt: 'not a date' }), T0), false);
  assert.equal(isOnline(admin({ lastSeenAt: '' }), T0), false);
});

test('a disabled account is offline however fresh the beat', () => {
  assert.equal(isOnline(admin({ active: false, lastSeenAt: at(0) }), T0), false);
  assert.equal(isOnline(admin({ active: undefined, lastSeenAt: at(0) }), T0), false, 'active must be true, not merely not-false');
  assert.equal(isOnline(null, T0), false);
});

test('signed out AT or AFTER the last beat → offline; a beat AFTER the sign-out → online again', () => {
  // sign-out after the beat: the device is gone
  assert.equal(isOnline(admin({ lastSeenAt: at(-60_000), lastSignedOutAt: at(-30_000) }), T0), false);
  // sign-out at the same instant as the beat: still gone (the beat did not post-date it)
  assert.equal(isOnline(admin({ lastSeenAt: at(-60_000), lastSignedOutAt: at(-60_000) }), T0), false);
  // a newer beat (another device, or a fresh login) after the sign-out
  assert.equal(isOnline(admin({ lastSeenAt: at(-10_000), lastSignedOutAt: at(-60_000) }), T0), true);
  // sign-out long ago, beat recent
  assert.equal(isOnline(admin({ lastSeenAt: at(-1_000), lastSignedOutAt: at(-86_400_000) }), T0), true);
});

test('dates may be Date objects, ISO strings or epoch numbers — .lean() rows and serialised rows agree', () => {
  const iso = new Date(T0 - 5_000).toISOString();
  assert.equal(isOnline({ active: true, lastSeenAt: iso, lastSignedOutAt: null }, T0), true);
  assert.equal(isOnline({ active: true, lastSeenAt: T0 - 5_000, lastSignedOutAt: null }, new Date(T0)), true);
  assert.equal(isOnline({ active: true, lastSeenAt: iso, lastSignedOutAt: new Date(T0 - 1_000).toISOString() }, T0), false);
});

// ── the route ───────────────────────────────────────────────────────────────

const req = () => new Request('http://localhost/api/admin/presence', { method: 'POST' });

test('route: no session → 401, and NOTHING is written', async () => {
  const writes = [];
  const res = await handlePost(req(), { auth: async () => null, connect: async () => {}, updateOne: async (...a) => { writes.push(a); } });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'unauthorized' });
  assert.equal(writes.length, 0);
  const res2 = await handlePost(req(), { auth: async () => ({ user: {} }), connect: async () => {}, updateOne: async (...a) => { writes.push(a); } });
  assert.equal(res2.status, 401, 'a session with no user id is no session');
  assert.equal(writes.length, 0);
});

test('route: with a session → ONE updateOne on the caller\'s own ACTIVE document, $set lastSeenAt = now, then 204', async () => {
  const writes = [];
  const now = new Date(T0);
  const res = await handlePost(req(), {
    auth: async () => ({ user: { id: 'admin-42', email: 'x@9expert.co.th' } }),
    connect: async () => {},
    updateOne: async (filter, update) => { writes.push({ filter, update }); return { matchedCount: 1 }; },
    now: () => now,
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].filter, { _id: 'admin-42', active: true }, 'the id is the SESSION\'s; a disabled account matches nothing');
  assert.deepEqual(writes[0].update, { $set: { lastSeenAt: now } });
  assert.equal(Object.keys(writes[0].update).length, 1, 'no $unset, no other operator');
});

test('route: a failed write is logged and still answers 204 — a heartbeat has no one to tell', async () => {
  const logged = [];
  const res = await handlePost(req(), {
    auth: async () => ({ user: { id: 'admin-42' } }),
    connect: async () => { throw new Error('mongo down'); },
    updateOne: async () => { throw new Error('unreachable'); },
    log: (...a) => logged.push(a.join(' ')),
  });
  assert.equal(res.status, 204);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /mongo down/);
});

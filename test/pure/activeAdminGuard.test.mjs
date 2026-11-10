import { test } from 'node:test';
import assert from 'node:assert/strict';
// A relative path on purpose: `@/lib/auth/assertActiveAdmin` is stubbed in the
// loader, because every guard in the suite would otherwise read Mongo.
import {
  assertActiveAdmin,
  getActiveSession,
  isActiveSession,
  SESSION_ENDED_PATH,
} from '../../src/lib/auth/assertActiveAdmin.js';

/**
 * The real helper with its read injected. test/fakeDb is process-global and the
 * suite runs concurrently, so seeding it here would reach into other files.
 * test/fs/activeAdminGuards proves every guard calls this.
 *
 * The redirect target is the point of the page cases. A rejected admin sent to
 * the login page with a valid JWT loops forever, so "it redirected" is not
 * enough; it has to be session-ended.
 */

const ID = '68da60bb87a228e4c5f4c2c7';
const SESSION = { user: { id: ID } };
const SUPERADMIN = { user: { id: ID, isSuperadmin: true, pages: null } };

const answers = (doc) => async () => doc;
const DELETED = answers(null);
const DISABLED = answers({ active: false });
const ACTIVE = answers({ active: true });

const redirectTarget = async (fn) => {
  try {
    await fn();
  } catch (err) {
    const digest = String(err?.digest ?? '');
    if (digest.startsWith('NEXT_REDIRECT')) return digest.split(';')[2];
    throw err;
  }
  return null;
};

for (const [name, read] of [['deleted', DELETED], ['disabled', DISABLED]]) {
  test(`${name}: a page request goes to session-ended, not the login page`, async () => {
    assert.equal(await redirectTarget(() => assertActiveAdmin(SESSION, { read })), SESSION_ENDED_PATH);
  });

  test(`${name}: an action or route gets null, its existing "not signed in"`, async () => {
    assert.equal(await getActiveSession({ readSession: async () => SESSION, read }), null);
  });

  test(`${name}: a superadmin is not exempt`, async () => {
    assert.equal(await isActiveSession(SUPERADMIN, { read }), false);
  });
}

test('CONTROL: an active admin passes, and getActiveSession returns the session', async () => {
  assert.equal(await redirectTarget(() => assertActiveAdmin(SESSION, { read: ACTIVE })), null);
  assert.equal(await getActiveSession({ readSession: async () => SESSION, read: ACTIVE }), SESSION);
});

test('the read is by the session id', async () => {
  let asked;
  await isActiveSession(SESSION, { read: async (id) => { asked = id; return { active: true }; } });
  assert.equal(asked, ID);
});

test('a malformed id is rejected without reading, not thrown as a cast error', async () => {
  const read = async () => { throw new Error('a malformed id reached the read'); };
  assert.equal(await isActiveSession({ user: { id: 'not-an-object-id' } }, { read }), false);
});

test('no session stays "no session", and costs no read', async () => {
  const read = async () => { throw new Error('read with no session'); };
  assert.equal(await getActiveSession({ readSession: async () => null, read }), null);
  assert.equal(await getActiveSession({ readSession: async () => ({}), read }), null);
});

test('a failed read throws: a database blip must not sign every admin out', async () => {
  const read = async () => { throw new Error('mongo down'); };
  await assert.rejects(() => isActiveSession(SESSION, { read }), { message: 'mongo down' });
  await assert.rejects(() => assertActiveAdmin(SESSION, { read }), { message: 'mongo down' });
  await assert.rejects(
    () => getActiveSession({ readSession: async () => SESSION, read }),
    { message: 'mongo down' },
  );
});

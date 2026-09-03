import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAvatarPublicId, planAvatarWrite, avatarFolderPrefix } from '@/lib/avatar/avatarWrite';
import { setOwnAvatar } from '@/lib/actions/admin-avatar';
import { resetFakeDb, seed, all, cloudinaryDeletes, setSessionUser } from '../fakeDb.mjs';

/**
 * The avatar write: what may be stored, and what gets deleted when it is.
 *
 * ══ THIS FILE CALLS THE REAL ACTION ═════════════════════════════════════════
 * Not a source scan. `setOwnAvatar` runs against the in-memory model in
 * test/fakeDb.mjs, with the session coming from the same place the auth stub
 * reads it — so "replacing an image deletes the OLD one, exactly once" is
 * asserted by looking at what the Cloudinary stub was actually asked to delete,
 * in call order, rather than by matching a regex against a call site.
 *
 * ── THE ESCALATION TEST IS THE SHAPE OF THE SIGNATURE ───────────────────────
 * `setOwnAvatar(publicId)` takes no target. There is no id to smuggle, so the
 * test for "a client-supplied target is ignored" is not a filter test — it is a
 * demonstration that passing extra arguments, an object with an email, or
 * another admin's id changes nothing about WHICH record moves. That is a
 * stronger property than validating an identifier would be, and the control for
 * it (letting the action read a target from the payload) reddens here.
 *
 * ── WHY THE ACTION CASES ARE SUBTESTS OF ONE PARENT ─────────────────────────
 * MEASURED here, and previously measured in test/fs/pageBuilderDraftActions,
 * whose header says the same thing. The runner calls run({ isolation: 'none',
 * concurrency: true }), so root-level tests run CONCURRENTLY. The pure cases
 * above are synchronous and stateless, so it never matters for them. The action
 * cases are async and share one module-level fake database: as root tests they
 * interleaved and reset each other's fixtures mid-flight — 9 of 9 failed, with
 * an empty store and an action that had found a row from a previous case.
 * Awaited subtests of a single parent are sequential. Do not flatten them.
 */

const ME = 'me@9expert.co.th';
const OTHER = 'someone-else@9expert.co.th';
const MINE = 'avatars/mine-abc123';
const NEXT = 'avatars/next-def456';
const THEIRS = 'avatars/theirs-zzz999';

const adminRow = (email) => all('Admin').find((r) => r.email === email);

// ── the validator ───────────────────────────────────────────────────────────
test('the folder prefix is derived the way the uploader derives its folder', () => {
  // If these two ever disagree, every upload succeeds and every save is then
  // refused as malformed — a feature that is broken in a way neither half
  // reports.
  assert.equal(avatarFolderPrefix(''), 'avatars/');
  assert.equal(avatarFolderPrefix('9expert'), '9expert/avatars/');
});

test('a publicId under the avatars folder is accepted', () => {
  assert.equal(isAvatarPublicId('avatars/abc123', ''), true);
  assert.equal(isAvatarPublicId('avatars/nested/abc123', ''), true);
  assert.equal(isAvatarPublicId('9expert/avatars/abc', '9expert'), true);
});

const REJECTED = [
  ['a different folder', 'courses/covers/abc'],
  ['no folder at all', 'abc123'],
  ['the folder itself', 'avatars/'],
  ['a sibling that merely starts the same way', 'avatars-public/abc'],
  ['a traversal out of the folder', 'avatars/../courses/covers/abc'],
  ['a transform separator', 'avatars/abc,w_9999'],
  ['a full URL', 'https://res.cloudinary.com/x/image/upload/avatars/abc'],
  ['a leading slash', '/avatars/abc'],
  ['leading whitespace', '  avatars/abc'],
  ['trailing whitespace', 'avatars/abc  '],
  ['a query string', 'avatars/abc?x=1'],
  ['a newline', 'avatars/abc\nx'],
  ['an empty string', ''],
  ['a number', 42],
  ['an object', { toString: () => 'avatars/abc' }],
  ['undefined', undefined],
];

for (const [name, value] of REJECTED) {
  test(`isAvatarPublicId rejects ${name}`, () => {
    assert.equal(isAvatarPublicId(value, ''), false);
  });
}

// ── the plan ────────────────────────────────────────────────────────────────
test('setting a first avatar stores it and deletes nothing', () => {
  assert.deepEqual(
    planAvatarWrite({ currentPublicId: null, incoming: MINE, baseFolder: '' }),
    { ok: true, value: MINE, deleteId: null },
  );
});

test('replacing stores the new id and marks the OLD one for deletion', () => {
  assert.deepEqual(
    planAvatarWrite({ currentPublicId: MINE, incoming: NEXT, baseFolder: '' }),
    { ok: true, value: NEXT, deleteId: MINE },
  );
});

test('re-saving the SAME id deletes nothing', () => {
  // The bug the obvious implementation ships: "always delete current when
  // replacing" makes the avatar vanish the second time you press save without
  // changing anything.
  assert.deepEqual(
    planAvatarWrite({ currentPublicId: MINE, incoming: MINE, baseFolder: '' }),
    { ok: true, value: MINE, deleteId: null },
  );
});

test('removing stores null and marks the old id for deletion', () => {
  assert.deepEqual(
    planAvatarWrite({ currentPublicId: MINE, incoming: null, baseFolder: '' }),
    { ok: true, value: null, deleteId: MINE },
  );
});

test('null is the ONLY removal signal — undefined and empty string are refused', () => {
  // "the field was not sent" must never mean "delete the photo". A missing form
  // field and a typo both look like undefined or ''.
  assert.equal(planAvatarWrite({ currentPublicId: MINE, incoming: undefined, baseFolder: '' }).ok, false);
  assert.equal(planAvatarWrite({ currentPublicId: MINE, incoming: '', baseFolder: '' }).ok, false);
  assert.equal(planAvatarWrite({ currentPublicId: MINE, incoming: null, baseFolder: '' }).ok, true);
});

test('removing when there is nothing to remove is allowed and deletes nothing', () => {
  assert.deepEqual(
    planAvatarWrite({ currentPublicId: null, incoming: null, baseFolder: '' }),
    { ok: true, value: null, deleteId: null },
  );
});

test('a malformed incoming id is refused, and the current one is left alone', () => {
  const plan = planAvatarWrite({ currentPublicId: MINE, incoming: 'courses/covers/x', baseFolder: '' });
  assert.equal(plan.ok, false);
  assert.ok(plan.error);
  assert.equal(plan.value, undefined, 'a refusal must not carry a value to store');
  assert.equal(plan.deleteId, undefined, 'a refusal must not carry anything to delete');
});

// ── the action, executed ────────────────────────────────────────────────────
//
// One parent, awaited subtests — sequential by construction. See the header.
test('the avatar write action', async (t) => {
  /** One case, with the shared fake database and session reset first. */
  const scenario = (name, fn) => t.test(name, async () => {
    resetFakeDb();
    setSessionUser({ id: 'u-me', email: ME, name: 'Me', isSuperadmin: true, pages: null });
    await fn();
  });

  await scenario('action: setting an avatar writes it to MY record', async () => {
    seed('Admin', { email: ME, name: 'Me', imagePublicId: null });
    const result = await setOwnAvatar(MINE);
    assert.deepEqual(result, { ok: true, imagePublicId: MINE });
    assert.equal(adminRow(ME).imagePublicId, MINE);
    assert.deepEqual(cloudinaryDeletes(), []);
  });

  await scenario('action: replacing deletes the OLD publicId, exactly once', async () => {
    seed('Admin', { email: ME, name: 'Me', imagePublicId: MINE });
    await setOwnAvatar(NEXT);
    assert.equal(adminRow(ME).imagePublicId, NEXT);
    assert.deepEqual(
      cloudinaryDeletes(), [MINE],
      'exactly one delete, of the OLD id — deleting the new one would remove the '
      + 'file the record now points at',
    );
  });

  await scenario('action: removing sets the field to null and deletes the old publicId', async () => {
    seed('Admin', { email: ME, name: 'Me', imagePublicId: MINE });
    const result = await setOwnAvatar(null);
    assert.deepEqual(result, { ok: true, imagePublicId: null });
    assert.equal(adminRow(ME).imagePublicId, null);
    assert.deepEqual(cloudinaryDeletes(), [MINE]);
  });

  await scenario('action: re-saving the same id writes no delete', async () => {
    seed('Admin', { email: ME, name: 'Me', imagePublicId: MINE });
    await setOwnAvatar(MINE);
    assert.equal(adminRow(ME).imagePublicId, MINE);
    assert.deepEqual(cloudinaryDeletes(), []);
  });

  await scenario('action: a malformed publicId is refused and nothing is written or deleted', async () => {
    seed('Admin', { email: ME, name: 'Me', imagePublicId: MINE });
    const result = await setOwnAvatar('courses/covers/someone-elses-cover');
    assert.equal(result.ok, false);
    assert.equal(adminRow(ME).imagePublicId, MINE, 'the stored value must be untouched');
    assert.deepEqual(cloudinaryDeletes(), [], 'a refused write must not delete anything');
  });

// ── escalation ──────────────────────────────────────────────────────────────
test('action: it only ever touches the SESSION email\'s record', async () => {
  seed('Admin', { email: ME, name: 'Me', imagePublicId: null });
  seed('Admin', { email: OTHER, name: 'Someone Else', imagePublicId: THEIRS });

  await setOwnAvatar(MINE);

  assert.equal(adminRow(ME).imagePublicId, MINE);
  assert.equal(adminRow(OTHER).imagePublicId, THEIRS, "another admin's row moved");
  assert.deepEqual(cloudinaryDeletes(), [], "another admin's image was deleted");
  });

  await scenario('action: a client-supplied target identifier changes nothing', async () => {
    seed('Admin', { email: ME, name: 'Me', imagePublicId: null });
    seed('Admin', { email: OTHER, name: 'Someone Else', imagePublicId: THEIRS });

    // Every shape an attacker would try, through the only parameter there is.
    // The signature takes no target, so none of these can name a record — which
    // is the property under test. Extra arguments are simply dropped by JS.
    await setOwnAvatar(MINE, { email: OTHER });
    await setOwnAvatar(MINE, OTHER);

    assert.equal(adminRow(OTHER).imagePublicId, THEIRS);
    assert.equal(adminRow(ME).imagePublicId, MINE);
  });

  await scenario('action: an object pretending to be a publicId is refused, not coerced', async () => {
    seed('Admin', { email: ME, name: 'Me', imagePublicId: null });
    const result = await setOwnAvatar({ email: OTHER, publicId: MINE });
    assert.equal(result.ok, false);
    assert.equal(adminRow(ME).imagePublicId, null);
  });

  await scenario('action: a session with no matching record refuses rather than creating one', async () => {
    // No seed at all. A self-service action must never upsert an admin.
    const result = await setOwnAvatar(MINE);
    assert.equal(result.ok, false);
    assert.equal(all('Admin').length, 0, 'an admin record was created out of a session');
  });

// ── CONTROL ─────────────────────────────────────────────────────────────────
  await scenario('CONTROL: the fake actually records deletes, so the [] assertions mean something', async () => {
    // Every "deletes nothing" assertion above is `deepEqual(…, [])`, which passes
    // just as well if the recorder is broken and never records at all.
    seed('Admin', { email: ME, name: 'Me', imagePublicId: MINE });
    await setOwnAvatar(NEXT);
    assert.equal(cloudinaryDeletes().length, 1, 'the recorder saw nothing — every [] above is vacuous');
  });

});

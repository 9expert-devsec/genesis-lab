import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_SESSION_STORAGE_KEY,
  getOrCreateSessionId,
  rotateSessionId,
} from '@/lib/chat/session';

// The chat session id.
//
// ── WHY ROTATION IS A BUG FIX ───────────────────────────────────────────────
// review-app's reset kept the same id, so "ล้างแชท" cleared the panel while the
// upstream service still held the whole prior conversation. The user asked for
// a fresh start and got a blank screen wired to the old context — the next
// answer could refer to what they had just watched disappear. That is worse
// than not offering the button at all, which is why it is tested here rather
// than left to the eye.
//
// Storage is INJECTED. These functions take a storage object so the behaviour
// can be exercised without a DOM, and — more importantly for this runner — so
// nothing here touches a global. isolation:'none' + concurrency:true means a
// module-level stub would be shared with every other file mid-run.

/** A localStorage-shaped object backed by a Map. */
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    _dump: () => Object.fromEntries(m),
  };
}

test('an id is created once and then reused', () => {
  const s = fakeStorage();
  const first = getOrCreateSessionId(s);
  assert.ok(first, 'an id was minted');
  assert.equal(getOrCreateSessionId(s), first, 'the second call reuses it');
  assert.equal(s._dump()[CHAT_SESSION_STORAGE_KEY], first, 'and it was persisted');
});

test('rotating mints a DIFFERENT id and persists it immediately', () => {
  const s = fakeStorage();
  const before = getOrCreateSessionId(s);
  const after = rotateSessionId(s);

  assert.notEqual(after, before, 'clearing the chat must abandon the upstream conversation');
  assert.equal(s._dump()[CHAT_SESSION_STORAGE_KEY], after, 'persisted, not just returned');
  // Persistence is the half that is easy to miss: a rotation held only in React
  // state is undone by the next reload, which reads storage.
  assert.equal(getOrCreateSessionId(s), after, 'a fresh read sees the new id');
});

test('CONTROL: review-app’s reset returned the SAME id — that is the defect', () => {
  // Replicates the old behaviour and shows the two are distinguishable. Without
  // this, "rotate returns something" would pass for an implementation that
  // returns the id it already had.
  const s = fakeStorage();
  const current = getOrCreateSessionId(s);
  const rotateBroken = (storage) => storage.getItem(CHAT_SESSION_STORAGE_KEY);

  assert.equal(rotateBroken(s), current, 'the broken version hands back the old conversation');
  assert.notEqual(rotateSessionId(s), current, 'the real one does not');
});

test('the storage key is this product’s, not review-app’s', () => {
  assert.equal(CHAT_SESSION_STORAGE_KEY, 'genesis_chat_session_id');
  assert.ok(
    !/reviewapp/i.test(CHAT_SESSION_STORAGE_KEY),
    'a foreign product name in every visitor’s localStorage is permanent unexplained litter',
  );
});

test('storage that throws does not break the chat', () => {
  // Safari in private mode throws on ACCESS, not just on setItem, and a chat
  // that refuses to start is a worse outcome than one that forgets on reload.
  const hostile = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
  };
  const id = getOrCreateSessionId(hostile);
  assert.ok(id, 'still returns a usable id for this page');
  const rotated = rotateSessionId(hostile);
  assert.ok(rotated && rotated !== id, 'and rotation still yields a fresh one');
});

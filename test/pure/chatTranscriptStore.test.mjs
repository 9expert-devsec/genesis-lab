import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSCRIPT_KEY_PREFIX,
  TRANSCRIPT_MAX_MESSAGES,
  dropTranscript,
  readTranscript,
  transcriptKey,
  writeTranscript,
} from '@/lib/chat/transcriptStore';

// The persisted transcript.
//
// ── THE ORDERING IS THE POINT OF THIS FILE ──────────────────────────────────
// Clearing the chat rotates the session id, and the transcript is keyed by that
// id — so rotation alone makes the panel come back empty by construction. What
// rotation does NOT do is remove the old key. Rotate first and the id is gone,
// nothing knows which entry to delete, and the conversation the user pressed
// "ล้างแชท" to destroy is still sitting in sessionStorage for devtools to read.
//
// That is the failure this file exists for, and it is invisible from the UI:
// the panel looks correctly empty in both the fixed and the broken version.
// Only a test that inspects storage can tell them apart.
//
// Storage is injected — no globals, because this runner shares one process
// across every tier.

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _keys: () => [...m.keys()],
  };
}

const MSGS = [
  { id: 'u1', role: 'user', text: 'อยากเรียน Power BI', createdAt: 1 },
  { id: 'a1', role: 'assistant', text: 'แนะนำหลักสูตรพื้นฐานครับ', createdAt: 2, courses: [] },
];

test('a transcript round-trips under its session id', () => {
  const s = fakeStorage();
  writeTranscript('sess-A', MSGS, s);
  assert.deepEqual(readTranscript('sess-A', s), MSGS);
  assert.deepEqual(s._keys(), [transcriptKey('sess-A')], 'stored under exactly one key');
  assert.ok(transcriptKey('sess-A').startsWith(TRANSCRIPT_KEY_PREFIX));
});

test('the key really is the session id, not a shared bucket', () => {
  // If it were shared, rotating the id on clear would leave the panel showing
  // the conversation it had just cleared.
  const s = fakeStorage();
  writeTranscript('sess-A', MSGS, s);
  assert.deepEqual(readTranscript('sess-B', s), [], 'a different conversation reads nothing');
});

test('clearing to empty removes the key rather than storing []', () => {
  const s = fakeStorage();
  writeTranscript('sess-A', MSGS, s);
  writeTranscript('sess-A', [], s);
  assert.deepEqual(s._keys(), [], 'nothing is left behind at all');
  assert.deepEqual(readTranscript('sess-A', s), []);
});

test('dropTranscript removes exactly one conversation', () => {
  const s = fakeStorage();
  writeTranscript('sess-A', MSGS, s);
  writeTranscript('sess-B', MSGS, s);
  dropTranscript('sess-A', s);
  assert.deepEqual(readTranscript('sess-A', s), [], 'the named one is gone');
  assert.deepEqual(readTranscript('sess-B', s), MSGS, 'and only that one');
});

test('CONTROL: rotating BEFORE dropping leaves the cleared chat readable', () => {
  // The defect, replicated. Both versions leave the panel empty — the user sees
  // no difference — so the only way to tell them apart is to look at storage,
  // which is exactly why this is a test and not a click-test item.
  const broken = fakeStorage();
  writeTranscript('sess-old', MSGS, broken);
  const newIdB = 'sess-new';                 // rotate…
  dropTranscript(newIdB, broken);            // …then drop, which knows only the NEW id
  assert.deepEqual(
    readTranscript('sess-old', broken),
    MSGS,
    'BROKEN: the conversation the user asked to clear is still there',
  );

  const fixed = fakeStorage();
  writeTranscript('sess-old', MSGS, fixed);
  dropTranscript('sess-old', fixed);         // drop while the old id is still known…
  const newIdF = 'sess-new';                 // …then rotate
  assert.deepEqual(readTranscript('sess-old', fixed), [], 'FIXED: it is gone');
  assert.deepEqual(readTranscript(newIdF, fixed), [], 'and the new conversation starts empty');
  // Both end with an empty panel — the observable difference is storage alone.
  assert.deepEqual(readTranscript(newIdB, broken), []);
});

test('the persisted tail is bounded', () => {
  const s = fakeStorage();
  const many = Array.from({ length: TRANSCRIPT_MAX_MESSAGES + 15 }, (_, i) => ({
    id: `m${i}`, role: i % 2 ? 'assistant' : 'user', text: `t${i}`, createdAt: i,
  }));
  writeTranscript('sess-A', many, s);
  const back = readTranscript('sess-A', s);
  assert.equal(back.length, TRANSCRIPT_MAX_MESSAGES, 'exactly the cap, not "about"');
  assert.equal(back.at(-1).text, `t${many.length - 1}`, 'and it keeps the NEWEST turns');
});

test('corrupt or unavailable storage costs history, never the panel', () => {
  // A thrown error here would take down the whole chat on a browser with site
  // data blocked, which is a far worse outcome than a forgotten transcript.
  // '{' is the cheapest realistic corruption: a tab killed mid-serialise, or a
  // partial write. JSON.parse throws on it, and a throw here happens at MOUNT —
  // it would take the panel down on open rather than starting an empty chat.
  assert.deepEqual(readTranscript('sess-A', fakeStorage({ [transcriptKey('sess-A')]: '{' })), []);
  assert.deepEqual(readTranscript('sess-A', fakeStorage({ [transcriptKey('sess-A')]: 'not json' })), []);
  assert.deepEqual(readTranscript('sess-A', fakeStorage({ [transcriptKey('sess-A')]: '{"not":"an array"}' })), []);

  const hostile = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  assert.deepEqual(readTranscript('sess-A', hostile), []);
  assert.doesNotThrow(() => writeTranscript('sess-A', MSGS, hostile));
  assert.doesNotThrow(() => dropTranscript('sess-A', hostile));
  // …and a missing session id is a no-op rather than a key called "undefined".
  assert.deepEqual(readTranscript('', fakeStorage()), []);
  const s = fakeStorage();
  writeTranscript('', MSGS, s);
  assert.deepEqual(s._keys(), []);
});

test('a corrupt value is DISCARDED on the next write, not retried forever', () => {
  // Reading a bad entry returns [] — but that alone would leave the broken value
  // in storage to be re-parsed (and re-caught) on every single mount. It is
  // actually removed, and this test exists because that is an EMERGENT property
  // of two independent rules rather than one deliberate line: readTranscript
  // returns [] on garbage, and writeTranscript removes the key when the
  // transcript is empty. Change either in isolation and the self-healing quietly
  // stops, with no symptom — the panel still opens fine, the entry just never
  // goes away.
  const s = fakeStorage({ [transcriptKey('sess-A')]: '{' });

  const restored = readTranscript('sess-A', s);          // mount: read
  assert.deepEqual(restored, [], 'the garbage does not reach the panel');

  writeTranscript('sess-A', restored, s);                // the persist effect
  assert.deepEqual(s._keys(), [], 'and the entry is gone, not left to rot');
  assert.deepEqual(readTranscript('sess-A', s), [], 'a second mount finds nothing to parse');
});

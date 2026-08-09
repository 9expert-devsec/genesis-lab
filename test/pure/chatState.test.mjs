import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chatReducer, initialChatState, toHistory } from '@/lib/chat/chatState';
import {
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_CHARS,
  isMessageWithinCap,
  messageOverflow,
} from '@/lib/chat/limits';
import { readSourceForScanning } from '../sourceScan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

const populated = {
  sessionId: 'sess-old',
  messages: [
    { id: 'a', role: 'user', text: 'สวัสดี', createdAt: 1 },
    { id: 'b', role: 'assistant', text: 'ครับ', createdAt: 2 },
  ],
  isLoading: true,
  error: 'boom',
};

// ── RESET ───────────────────────────────────────────────────────────────────

test('RESET takes the session id from the ACTION, never from the old state', () => {
  const next = chatReducer(populated, { type: 'RESET', sessionId: 'sess-new' });
  assert.equal(next.sessionId, 'sess-new', 'the rotated id is what survives');
  assert.notEqual(next.sessionId, populated.sessionId, 'and the old conversation is abandoned');
});

test('RESET clears the transcript, the spinner and the error together', () => {
  const next = chatReducer(populated, { type: 'RESET', sessionId: 'sess-new' });
  assert.deepEqual(next.messages, [], 'transcript cleared');
  assert.equal(next.isLoading, false, 'a reset mid-request must not leave a spinner');
  assert.equal(next.error, '', 'nor an error about a request nobody is waiting for');
  assert.deepEqual(Object.keys(next).sort(), Object.keys(initialChatState).sort());
});

test('CONTROL: review-app’s RESET kept state.sessionId — replicated, and it differs', () => {
  // The exact line from review-app's reducer. If the real one ever reverts to
  // it, `next.sessionId` becomes 'sess-old' and the test above goes red; this
  // control proves the two implementations are actually distinguishable on this
  // fixture rather than agreeing by accident.
  const resetBroken = (state) => ({ ...initialChatState, sessionId: state.sessionId });
  assert.equal(resetBroken(populated).sessionId, 'sess-old', 'the defect: the old id survives');
  assert.equal(
    chatReducer(populated, { type: 'RESET', sessionId: 'sess-new' }).sessionId,
    'sess-new',
  );
});

test('the store’s reset() is what supplies the rotated id', () => {
  // The reducer cannot rotate anything by itself — it is pure. This is the one
  // line that makes the claim above true in the running app, and no render test
  // reaches it.
  const store = src('src/components/chat/useChatStore.js');
  assert.match(store, /rotateSessionId/, 'reset() rotates');
  assert.match(
    store,
    /dispatch\(\{\s*type:\s*'RESET',\s*sessionId:\s*rotateSessionId\(\)\s*\}\)/,
    'and hands the NEW id straight to the action',
  );
});

test('ERROR carries the route’s CODE alongside its prose', () => {
  // The prose is what the user reads; the code is what decides whether this is
  // a fault at all. Dropping the code would collapse the route's five-code
  // vocabulary into one red banner and make it useless.
  const next = chatReducer(initialChatState, {
    type: 'ERROR',
    error: 'ระบบแชทยังไม่พร้อมใช้งานในขณะนี้',
    code: 'chat_unavailable',
  });
  assert.equal(next.errorCode, 'chat_unavailable');
  assert.equal(next.error, 'ระบบแชทยังไม่พร้อมใช้งานในขณะนี้');
  // A caller that supplies no code must not leave a stale one behind.
  const cleared = chatReducer(next, { type: 'ERROR', error: 'x' });
  assert.equal(cleared.errorCode, '', 'a new error without a code clears the old one');
});

test('RESET clears the error CODE as well as the message', () => {
  // Otherwise "ล้างแชท" on an unavailable service leaves the composer disabled
  // with nothing on screen explaining why.
  const errored = chatReducer(populated, { type: 'ERROR', error: 'boom', code: 'chat_unavailable' });
  const next = chatReducer(errored, { type: 'RESET', sessionId: 'sess-new' });
  assert.equal(next.errorCode, '');
  assert.equal(next.error, '');
});

// ── History ─────────────────────────────────────────────────────────────────

test('history is bounded to the shared turn limit', () => {
  const many = Array.from({ length: MAX_HISTORY_TURNS + 8 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user',
    text: `t${i}`,
  }));
  const h = toHistory(many);
  assert.equal(h.length, MAX_HISTORY_TURNS, 'exactly the cap, not "at most something"');
  assert.equal(h.at(-1).content, `t${many.length - 1}`, 'and it keeps the NEWEST turns');
  assert.deepEqual(toHistory(null), [], 'a missing transcript is not a crash');
});

// ── The message cap ─────────────────────────────────────────────────────────

test('the message cap is exact at the boundary', () => {
  assert.equal(isMessageWithinCap('ก'.repeat(MAX_MESSAGE_CHARS)), true, 'exactly at the cap passes');
  assert.equal(isMessageWithinCap('ก'.repeat(MAX_MESSAGE_CHARS + 1)), false, 'one over does not');
  assert.equal(messageOverflow('ก'.repeat(MAX_MESSAGE_CHARS + 5)), 5, 'and the excess is reported exactly');
  assert.equal(messageOverflow('ก'.repeat(MAX_MESSAGE_CHARS)), 0);
  // Whitespace is trimmed before counting, or a trailing newline would push a
  // legitimate message over.
  assert.equal(isMessageWithinCap(`  ${'ก'.repeat(MAX_MESSAGE_CHARS)}  `), true);
});

test('CONTROL: an unbounded cap would accept what the route refuses', () => {
  const withinBroken = () => true; // the "no cap" implementation
  const over = 'ก'.repeat(MAX_MESSAGE_CHARS + 1);
  assert.equal(withinBroken(over), true, 'unbounded: the composer would send it');
  assert.equal(isMessageWithinCap(over), false, 'the real cap refuses it first');
  assert.ok(MAX_MESSAGE_CHARS > 0 && Number.isFinite(MAX_MESSAGE_CHARS), 'and the cap is a real number');
});

test('the route and the composer share ONE cap, not two copies', () => {
  // A cap written twice is a cap that gets raised once, and the failure is
  // silent in the worse direction: the client sends what the server refuses and
  // the user sees a generic error on a message they were allowed to type.
  const route = src('src/app/api/chat/route.js');
  assert.match(route, /from '@\/lib\/chat\/limits'/, 'the route imports the shared limits');
  assert.ok(
    !/const\s+MAX_MESSAGE_CHARS\s*=/.test(route),
    'and does NOT redeclare its own copy',
  );
  assert.ok(
    !/const\s+MAX_HISTORY_TURNS\s*=/.test(route),
    'nor its own history cap',
  );
});

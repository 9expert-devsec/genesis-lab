import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendChat, sendChatFeedback } from '@/lib/chat/chatClient';

/**
 * chatClient — the backend's `message_id` becomes `serverMessageId`, and the
 * feedback call files a rating against THAT id, never the widget's local one.
 *
 * `globalThis.fetch` is replaced inside try/finally in every test: the runner
 * shares ONE process across every file, so a stub left behind would answer the
 * next file's fetches with this file's fixtures.
 */

const UUID = '3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c';

/** Run `fn` with fetch answering `body` (as JSON, status 200) and recording every call. */
async function withFetch(body, fn, { status = 200 } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const ARGS = { sessionId: 'sess-1', message: 'มีหลักสูตร Power BI ไหม', history: [] };

test('a valid UUID message_id comes back as serverMessageId', async () => {
  await withFetch({ response: 'มีครับ', message_id: UUID }, async (calls) => {
    const r = await sendChat(ARGS);
    assert.equal(r.serverMessageId, UUID);
    assert.equal(r.reply, 'มีครับ', 'the reply is unaffected');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/chat', 'same-origin proxy, never the upstream host');
  });
});

test('missing, null, number, empty string, or over-100-char message_id → serverMessageId null', async () => {
  const cases = [
    ['missing', { response: 'x' }],
    ['null', { response: 'x', message_id: null }],
    ['number', { response: 'x', message_id: 12345 }],
    ['empty string', { response: 'x', message_id: '' }],
    ['whitespace', { response: 'x', message_id: '   ' }],
    ['over 100 chars', { response: 'x', message_id: 'a'.repeat(101) }],
    ['object', { response: 'x', message_id: { id: UUID } }],
  ];
  for (const [label, body] of cases) {
    await withFetch(body, async () => {
      const r = await sendChat(ARGS);
      assert.equal(r.serverMessageId, null, `${label}: expected null`);
      assert.equal(r.reply, 'x', `${label}: the reply still arrives`);
    });
  }
});

test('exactly 100 chars is accepted (the proxy caps messageId at 100), and the id is read from the TOP-LEVEL body', async () => {
  const id = 'b'.repeat(100);
  await withFetch({ response: 'x', message_id: id }, async () => {
    assert.equal((await sendChat(ARGS)).serverMessageId, id);
  });
  // A wrapped body: the reply is unwrapped through `data` (a shape that has
  // been seen), but the id is only ever read from the top level — the proxy
  // relays the upstream body verbatim, and that is where the backend puts it.
  await withFetch({ data: { response: 'wrapped', message_id: UUID } }, async () => {
    const r = await sendChat(ARGS);
    assert.equal(r.reply, 'wrapped');
    assert.equal(r.serverMessageId, null, 'not guessed from inside the wrapper');
  });
});

test('the feedback call posts messageId = the serverMessageId it is given, with the unchanged payload shape', async () => {
  await withFetch({ ok: true, forwarded: true }, async (calls) => {
    const payload = {
      rating: 'up',
      messageId: UUID,
      sessionId: 'sess-1',
      userText: 'มีหลักสูตร Power BI ไหม',
      assistantText: 'มีครับ',
      pageUrl: 'https://www.9experttraining.com/training-course',
      createdAt: 1758000000000,
    };
    await sendChatFeedback(payload);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/chat/feedback');
    assert.equal(calls[0].init.method, 'POST');
    const sent = JSON.parse(calls[0].init.body);
    assert.deepEqual(Object.keys(sent), ['rating', 'messageId', 'sessionId', 'userText', 'assistantText', 'pageUrl', 'createdAt'], 'the payload SHAPE is unchanged');
    assert.equal(sent.messageId, UUID, 'the SERVER id, not a local m_… id');
    assert.equal(sent.userText, payload.userText, 'userText still travels — the old feedback service reads it');
    assert.equal(sent.assistantText, payload.assistantText);
    assert.equal(sent.pageUrl, payload.pageUrl);
  });
});

test('the feedback call never throws — a dropped network is swallowed, and the stub is restored either way', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  try {
    await assert.doesNotReject(sendChatFeedback({ rating: 'down', messageId: UUID }));
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(globalThis.fetch, original, 'fetch restored');
});

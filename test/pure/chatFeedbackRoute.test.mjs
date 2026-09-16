import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/app/api/chat/feedback/route';
import { clearHeaders, setHeaders } from '../stub-next-headers.mjs';

/**
 * POST /api/chat/feedback — the proxy in front of the feedback service.
 *
 * The route is driven EXACTLY as Next would drive it: its exported POST with a
 * Request. The upstream is `globalThis.fetch`, replaced inside try/finally in
 * every test (the runner shares one process); `next/headers` is the loader's
 * stub, whose bag is set per test and cleared after. `FEEDBACK_API_URL` is
 * saved and restored in finally whenever a test touches it.
 *
 * Every test gives the rate limiter a DISTINCT session id: the limiter is a
 * per-process counter keyed on ip+session, and this file runs in the same
 * process as everything else.
 */

const UUID = '3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c';
let seq = 0;
const session = () => `sess-feedback-test-${Date.now().toString(36)}-${(seq += 1)}`;

const req = (body, init = {}) =>
  new Request('http://localhost/api/chat/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

/** Run `fn` with the upstream env and fetch stubbed; both restored in finally. */
async function withUpstream({ url, status = 200, body = { ok: true } }, fn) {
  const savedEnv = process.env.FEEDBACK_API_URL;
  const savedFetch = globalThis.fetch;
  const calls = [];
  if (url === undefined) delete process.env.FEEDBACK_API_URL; else process.env.FEEDBACK_API_URL = url;
  globalThis.fetch = async (target, init) => {
    calls.push({ url: String(target), init, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  setHeaders({ 'x-forwarded-for': '203.0.113.7' });
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedEnv === undefined) delete process.env.FEEDBACK_API_URL; else process.env.FEEDBACK_API_URL = savedEnv;
    clearHeaders();
  }
}

const valid = (extra = {}) => ({
  rating: 'up',
  messageId: UUID,
  sessionId: session(),
  userText: 'มีหลักสูตร Power BI ไหม',
  assistantText: 'มีครับ',
  pageUrl: 'https://www.9experttraining.com/training-course',
  createdAt: 1758000000000,
  ...extra,
});

// ── The two rejections ──────────────────────────────────────────────────────

test('a non-JSON body → 400 invalid_json, and nothing is forwarded', async () => {
  await withUpstream({ url: 'https://feedback.example' }, async (calls) => {
    const res = await POST(req('{not json'));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'invalid_json', message: 'รูปแบบคำขอไม่ถูกต้อง' });
    assert.equal(calls.length, 0);
    // A JSON body that is not an object is refused the same way.
    const arr = await POST(req('[1,2]'));
    assert.equal(arr.status, 400);
    assert.equal(calls.length, 0);
  });
});

test('a bad rating → 400 invalid_rating, and nothing is forwarded', async () => {
  await withUpstream({ url: 'https://feedback.example' }, async (calls) => {
    for (const rating of ['meh', 'UP', '', null, 1, undefined]) {
      const res = await POST(req(valid({ rating })));
      assert.equal(res.status, 400, `rating ${JSON.stringify(rating)}`);
      assert.deepEqual(await res.json(), { error: 'invalid_rating', message: 'ค่าคะแนนไม่ถูกต้อง' });
    }
    assert.equal(calls.length, 0);
  });
});

// ── The forwarded body ──────────────────────────────────────────────────────

test('a valid body → upstream receives EXACTLY the whitelisted fields, with over-cap strings cut to their caps', async () => {
  await withUpstream({ url: 'https://feedback.example' }, async (calls) => {
    const payload = valid({
      messageId: 'm'.repeat(150),        // cap 100
      userText: 'u'.repeat(2500),        // cap 2000
      assistantText: 'a'.repeat(2500),   // cap 2000
      pageUrl: 'https://x/' + 'p'.repeat(600), // cap 500
      extra: 'should not travel',        // not whitelisted
      rating: 'down',
    });
    const res = await POST(req(payload));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, forwarded: true });

    assert.equal(calls.length, 1);
    const sent = calls[0].body;
    assert.deepEqual(Object.keys(sent), ['rating', 'messageId', 'sessionId', 'userText', 'assistantText', 'pageUrl', 'createdAt'], 'the whitelist, in order, and nothing else');
    assert.equal('extra' in sent, false);
    assert.equal(sent.rating, 'down');
    assert.equal(sent.messageId, 'm'.repeat(100), 'messageId cut to 100');
    assert.equal(sent.sessionId, payload.sessionId);
    assert.equal(sent.userText.length, 2000);
    assert.equal(sent.assistantText.length, 2000);
    assert.equal(sent.pageUrl.length, 500);
    assert.equal(sent.createdAt, 1758000000000);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.equal(Object.keys(calls[0].init.headers).length, 1, 'no auth header is sent — content-type only');
  });
});

test('a UUID messageId passes through untouched, and missing optional fields become empty strings / now', async () => {
  await withUpstream({ url: 'https://feedback.example' }, async (calls) => {
    const before = Date.now();
    const res = await POST(req({ rating: 'up', messageId: UUID, sessionId: session() }));
    assert.equal(res.status, 200);
    const sent = calls[0].body;
    assert.equal(sent.messageId, UUID);
    assert.equal(sent.userText, '');
    assert.equal(sent.assistantText, '');
    assert.equal(sent.pageUrl, '');
    assert.ok(sent.createdAt >= before, 'createdAt defaults to now');
  });
});

// ── The upstream URL ────────────────────────────────────────────────────────

test('a bare-host FEEDBACK_API_URL → the upstream path is /api/feedback (trailing slash tolerated)', async () => {
  for (const base of ['https://feedback.example', 'https://feedback.example/']) {
    await withUpstream({ url: base }, async (calls) => {
      await POST(req(valid()));
      assert.equal(calls[0].url, 'https://feedback.example/api/feedback', `base ${base}`);
    });
  }
});

test('a URL already ending in /api/feedback (or /feedback) is used as-is', async () => {
  for (const full of ['https://feedback.example/api/feedback', 'https://svc.run.app/v2/api/feedback?x=1', 'https://feedback.example/feedback']) {
    await withUpstream({ url: full }, async (calls) => {
      await POST(req(valid()));
      assert.equal(calls[0].url, full, `url ${full}`);
    });
  }
});

// ── The never-fail contract ─────────────────────────────────────────────────

test('unset FEEDBACK_API_URL → 200 with forwarded:false, reason not_configured, and NO fetch', async () => {
  for (const url of [undefined, '', '   ']) {
    await withUpstream({ url }, async (calls) => {
      const res = await POST(req(valid()));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, forwarded: false, reason: 'not_configured' });
      assert.equal(calls.length, 0, 'nothing was fetched');
    });
  }
});

test('an upstream 404 → still 200 to the widget, forwarded:false with the upstream status reported', async () => {
  await withUpstream({ url: 'https://feedback.example', status: 404, body: { detail: 'not found' } }, async (calls) => {
    const res = await POST(req(valid()));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, forwarded: false, reason: 'upstream_failed', upstreamStatus: 404 });
    assert.equal(calls.length, 1, 'it was attempted');
  });
});

test('an upstream that throws (network) → still 200, reason upstream_error', async () => {
  const savedEnv = process.env.FEEDBACK_API_URL;
  const savedFetch = globalThis.fetch;
  process.env.FEEDBACK_API_URL = 'https://feedback.example';
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  setHeaders({ 'x-forwarded-for': '203.0.113.7' });
  try {
    const res = await POST(req(valid()));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, forwarded: false, reason: 'upstream_error' });
  } finally {
    globalThis.fetch = savedFetch;
    if (savedEnv === undefined) delete process.env.FEEDBACK_API_URL; else process.env.FEEDBACK_API_URL = savedEnv;
    clearHeaders();
  }
});

test('CONTROL: the env and fetch really are restored after each test', () => {
  // withUpstream deletes FEEDBACK_API_URL for the "unset" case; if the finally
  // did not put it back, every later test in this process would be reading a
  // value this file left behind. The stub fetch has no `name` of ours.
  assert.notEqual(globalThis.fetch?.toString?.().includes('calls.push'), true, 'a stub fetch is still installed');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/app/api/chat/feedback/route';
import { clearHeaders, setHeaders } from '../stub-next-headers.mjs';
import { fetchStubState, jsonResponse, withFetch } from '../fetchStub.mjs';

/**
 * POST /api/chat/feedback — the proxy in front of the feedback service.
 *
 * The route is driven EXACTLY as Next would drive it: its exported POST with a
 * Request. The upstream is `globalThis.fetch`, stubbed through
 * test/fetchStub.mjs (a URL-keyed dispatcher, registered and removed in
 * try/finally — a bare save/replace of the global raced test/pure/chatClient
 * under the concurrent runner and leaked); `next/headers` is the loader's
 * stub, whose bag is set per test and cleared after. `FEEDBACK_API_URL` is
 * saved and restored in finally whenever a test touches it.
 *
 * Every test gives the rate limiter a DISTINCT key. The limiter is a
 * per-process counter (15 per minute) keyed on the FORWARDED IP first —
 * rateLimitKeyFrom's own ladder, where the ip wins over any sessionId — so
 * each call gets its own x-forwarded-for, not just its own session id.
 */

const NAME = 'chatFeedbackRoute';
const UUID = '3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c';
const HOST = 'https://feedback.example';
let seq = 0;
const session = () => `sess-feedback-test-${Date.now().toString(36)}-${(seq += 1)}`;
/** A fresh key per call — the first hop is used verbatim, so a suffix keeps it unique. */
const freshIp = () => `203.0.113.${(seq += 1) % 250 + 1}-fb-${Date.now().toString(36)}`;

const req = (body, init = {}) =>
  new Request('http://localhost/api/chat/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

/**
 * Run `fn` with FEEDBACK_API_URL set to `url` (deleted when undefined) and the
 * upstream answering `status`/`body`; env, fetch handler and header bag are
 * all put back in finally. The handler claims every URL on the feedback host
 * (and the two full-endpoint spellings tested below), and nothing else.
 */
async function withUpstream({ url, status = 200, body = { ok: true }, handle }, fn) {
  const savedEnv = process.env.FEEDBACK_API_URL;
  if (url === undefined) delete process.env.FEEDBACK_API_URL; else process.env.FEEDBACK_API_URL = url;
  setHeaders({ 'x-forwarded-for': freshIp() });
  try {
    return await withFetch(
      {
        name: NAME,
        match: (u) => u.startsWith(HOST) || u.startsWith('https://svc.run.app/'),
        handle: handle ?? (() => jsonResponse(body, status)),
      },
      fn,
    );
  } finally {
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

/**
 * ONE top-level test, subtests AWAITED IN SEQUENCE. The runner is
 * `isolation: 'none'` with `concurrency: true`, and under that setting
 * node:test runs every TOP-LEVEL test of every file concurrently — the
 * tests of this file included, against each other. Measured: with these
 * as siblings, the "unset FEEDBACK_API_URL" case deleted the variable while
 * "valid body" was mid-await, and the CONTROL saw handlers still live.
 * Awaited subtests of one parent run one after another; that is the whole
 * reason for the wrapper.
 */
test('POST /api/chat/feedback — driven sequentially (env, headers and the fetch handler are process-global)', async (t) => {
  await t.test('a non-JSON body → 400 invalid_json, and nothing is forwarded', async () => {
    await withUpstream({ url: HOST }, async (calls) => {
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

  await t.test('a bad rating → 400 invalid_rating, and nothing is forwarded', async () => {
    await withUpstream({ url: HOST }, async (calls) => {
      for (const rating of ['meh', 'UP', '', null, 1, undefined]) {
        const res = await POST(req(valid({ rating })));
        assert.equal(res.status, 400, `rating ${JSON.stringify(rating)}`);
        assert.deepEqual(await res.json(), { error: 'invalid_rating', message: 'ค่าคะแนนไม่ถูกต้อง' });
      }
      assert.equal(calls.length, 0);
    });
  });

  // ── The forwarded body ──────────────────────────────────────────────────────

  await t.test('a valid body → upstream receives EXACTLY the whitelisted fields, with over-cap strings cut to their caps', async () => {
    await withUpstream({ url: HOST }, async (calls) => {
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

  await t.test('a UUID messageId passes through untouched, and missing optional fields become empty strings / now', async () => {
    await withUpstream({ url: HOST }, async (calls) => {
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

  await t.test('a bare-host FEEDBACK_API_URL → the upstream path is /api/feedback (trailing slash tolerated)', async () => {
    for (const base of [HOST, `${HOST}/`]) {
      await withUpstream({ url: base }, async (calls) => {
        await POST(req(valid()));
        assert.equal(calls[0].url, `${HOST}/api/feedback`, `base ${base}`);
      });
    }
  });

  await t.test('a URL already ending in /api/feedback (or /feedback) is used as-is', async () => {
    for (const full of [`${HOST}/api/feedback`, 'https://svc.run.app/v2/api/feedback?x=1', `${HOST}/feedback`]) {
      await withUpstream({ url: full }, async (calls) => {
        await POST(req(valid()));
        assert.equal(calls[0].url, full, `url ${full}`);
      });
    }
  });

  // ── The never-fail contract ─────────────────────────────────────────────────

  await t.test('unset FEEDBACK_API_URL → 200 with forwarded:false, reason not_configured, and NO fetch', async () => {
    for (const url of [undefined, '', '   ']) {
      await withUpstream({ url }, async (calls) => {
        const res = await POST(req(valid()));
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { ok: true, forwarded: false, reason: 'not_configured' });
        assert.equal(calls.length, 0, 'nothing was fetched');
      });
    }
  });

  await t.test('an upstream 404 → still 200 to the widget, forwarded:false with the upstream status reported', async () => {
    await withUpstream({ url: HOST, status: 404, body: { detail: 'not found' } }, async (calls) => {
      const res = await POST(req(valid()));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, forwarded: false, reason: 'upstream_failed', upstreamStatus: 404 });
      assert.equal(calls.length, 1, 'it was attempted');
    });
  });

  await t.test('an upstream that throws (network) → still 200, reason upstream_error', async () => {
    await withUpstream({ url: HOST, handle: () => { throw new TypeError('fetch failed'); } }, async () => {
      const res = await POST(req(valid()));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, forwarded: false, reason: 'upstream_error' });
    });
  });

  await t.test('CONTROL: this file leaves no fetch handler registered and no FEEDBACK_API_URL of its own', () => {
    assert.equal(fetchStubState().names.includes(NAME), false, 'a handler from this file is still registered');
    assert.notEqual(process.env.FEEDBACK_API_URL, HOST, 'the test host leaked into the environment');
  });

});

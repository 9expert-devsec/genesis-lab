import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPanelSummary, getPanelTrends, listPanelSessions, getPanelSession,
  PANEL_KEY_HEADER, PANEL_TIMEOUT_MS,
} from '@/lib/chatPanel/client';
import { PANEL_FAILURE_REASONS } from '@/lib/chatPanel/messages';
import { fetchStubState, jsonResponse, withFetch } from '../fetchStub.mjs';

/**
 * src/lib/chatPanel/client.js — the server-only client for the chatbot's
 * panel API, driven with the SAME globals it uses in production: `process.env`
 * for its configuration and `globalThis.fetch` for the request, the latter
 * through test/fetchStub.mjs (a URL-keyed dispatcher registered and removed
 * in try/finally; see that file for why a bare save/replace of the global
 * raced under the concurrent runner).
 *
 * ── ONE top-level test, subtests AWAITED IN SEQUENCE ────────────────────────
 * The runner is `isolation: 'none'` with `concurrency: true`: every TOP-LEVEL
 * test in every file runs concurrently, this file's included. Each subtest
 * below SETS the two env vars and one of them DELETES them; as siblings, the
 * "not configured" case would delete the variables while a neighbour was
 * mid-await. Awaited subtests of one parent run one after another.
 *
 * `server-only` resolves to test/stub-server-only.mjs under the loader — the
 * real package throws on import outside Next's react-server condition.
 */

const NAME = 'chatPanelClient';
const HOST = 'https://panel.example';
const RANGE = { from: '2026-09-01', to: '2026-09-17' };

/**
 * Run `fn` with the env set (`base`/`key`; a name in `unset` is DELETED —
 * a destructuring default cannot express "absent", which is why this is a
 * list and not `undefined`) and every fetch to HOST answered by `handle`.
 * Env and handler are put back in finally.
 */
async function withPanel({ base = HOST, key = 'k-secret', unset = [], handle }, fn) {
  const saved = { url: process.env.CHAT_PANEL_API_URL, key: process.env.CHAT_PANEL_API_KEY };
  if (unset.includes('url')) delete process.env.CHAT_PANEL_API_URL; else process.env.CHAT_PANEL_API_URL = base;
  if (unset.includes('key')) delete process.env.CHAT_PANEL_API_KEY; else process.env.CHAT_PANEL_API_KEY = key;
  try {
    return await withFetch(
      { name: NAME, match: (u) => u.startsWith(HOST), handle: handle ?? (() => jsonResponse({ ok: 1 })) },
      fn,
    );
  } finally {
    if (saved.url === undefined) delete process.env.CHAT_PANEL_API_URL; else process.env.CHAT_PANEL_API_URL = saved.url;
    if (saved.key === undefined) delete process.env.CHAT_PANEL_API_KEY; else process.env.CHAT_PANEL_API_KEY = saved.key;
  }
}

test('chatPanel client — driven sequentially (env and the fetch handler are process-global)', async (t) => {
  // ── configuration ─────────────────────────────────────────────────────────

  await t.test('no URL, no key, or a URL that does not parse → not_configured, and NO request', async () => {
    for (const cfg of [{ unset: ['url'] }, { unset: ['key'] }, { unset: ['url', 'key'] }, { base: 'not a url' }, { base: '   ', key: '' }]) {
      await withPanel(cfg, async (calls) => {
        const r = await getPanelSummary(RANGE);
        assert.deepEqual(r, { ok: false, reason: 'not_configured' }, JSON.stringify(cfg));
        assert.equal(calls.length, 0, 'a request was made without configuration');
      });
    }
  });

  // ── the request itself ────────────────────────────────────────────────────

  await t.test('a summary read: GET, the key in x-api-key, no-store, a timeout signal, the query on the URL', async () => {
    await withPanel({ handle: () => jsonResponse({ totals: { sessions: 3 } }) }, async (calls) => {
      const r = await getPanelSummary(RANGE);
      assert.deepEqual(r, { ok: true, data: { totals: { sessions: 3 } } });
      assert.equal(calls.length, 1);
      const [{ url, init }] = calls;
      assert.equal(url, `${HOST}/api/panel/summary?from=2026-09-01&to=2026-09-17`);
      assert.equal(init.method, 'GET');
      assert.equal(init.headers[PANEL_KEY_HEADER], 'k-secret', 'the configured key travels in x-api-key');
      assert.equal(init.cache, 'no-store', 'a panel read must never enter the Data Cache');
      assert.ok(init.signal instanceof AbortSignal, 'the request carries an abort signal (the timeout)');
      assert.equal(PANEL_TIMEOUT_MS, 10_000);
    });
  });

  await t.test('a trailing slash on the base does not double up', async () => {
    await withPanel({ base: `${HOST}/` }, async (calls) => {
      await getPanelSummary(RANGE);
      assert.equal(calls[0].url, `${HOST}/api/panel/summary?from=2026-09-01&to=2026-09-17`);
    });
  });

  // ── every failure reason, by status ───────────────────────────────────────

  await t.test('401 → unauthorized, 503 → disabled_upstream, 400 → bad_request, 404 → not_found, 500 → upstream_error', async () => {
    const cases = [
      [401, { error: 'unauthorized' }, 'unauthorized'],
      [503, { error: 'panel_disabled' }, 'disabled_upstream'],
      [400, { error: 'invalid_range', detail: 'span' }, 'bad_request'],
      [404, { error: 'not_found' }, 'not_found'],
      [500, { error: 'boom' }, 'upstream_error'],
      [502, 'not json', 'upstream_error'],
    ];
    for (const [status, body, reason] of cases) {
      await withPanel({
        handle: () => (typeof body === 'string'
          ? new Response(body, { status, headers: { 'content-type': 'text/html' } })
          : jsonResponse(body, status)),
      }, async () => {
        const r = await getPanelSummary(RANGE);
        assert.deepEqual(r, { ok: false, reason }, `status ${status}`);
        assert.ok(PANEL_FAILURE_REASONS.includes(r.reason), 'every reason is in the declared vocabulary');
      });
    }
  });

  await t.test('a 200 whose body is not JSON → upstream_error (never a throw, never a fake success)', async () => {
    await withPanel({ handle: () => new Response('<html>', { status: 200 }) }, async () => {
      assert.deepEqual(await getPanelSummary(RANGE), { ok: false, reason: 'upstream_error' });
    });
  });

  await t.test('a network failure → upstream_error', async () => {
    await withPanel({ handle: () => { throw new TypeError('fetch failed'); } }, async () => {
      assert.deepEqual(await getPanelSummary(RANGE), { ok: false, reason: 'upstream_error' });
    });
  });

  await t.test('the timeout path → timeout (a TimeoutError from the abort signal)', async () => {
    // AbortSignal.timeout rejects the fetch with a DOMException named
    // TimeoutError. The handler raises exactly that, which is what the real
    // fetch does when the signal fires — without waiting ten seconds for it.
    await withPanel({ handle: () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); } }, async () => {
      assert.deepEqual(await getPanelSummary(RANGE), { ok: false, reason: 'timeout' });
    });
    await withPanel({ handle: () => { throw new DOMException('aborted', 'AbortError'); } }, async () => {
      assert.deepEqual(await getPanelSummary(RANGE), { ok: false, reason: 'timeout' }, 'a plain abort is the same outcome');
    });
  });

  // ── input validation: no network on bad input ─────────────────────────────

  await t.test('a bad date, a reversed window, or a span over 92 days → bad_request with NO request', async () => {
    const bad = [
      { from: '2026-09-01', to: '2026-09-31' },   // not a real date
      { from: '2026/09/01', to: '2026-09-17' },   // wrong shape
      { from: '2026-09-17', to: '2026-09-01' },   // reversed
      { from: '2026-06-17', to: '2026-09-17' },   // 93 days inclusive
      { from: '', to: '' },
      {},
    ];
    await withPanel({}, async (calls) => {
      for (const range of bad) {
        for (const call of [getPanelSummary, getPanelTrends]) {
          assert.deepEqual(await call(range), { ok: false, reason: 'bad_request' }, `${call.name} ${JSON.stringify(range)}`);
        }
        assert.deepEqual(await listPanelSessions(range), { ok: false, reason: 'bad_request' });
      }
      assert.equal(calls.length, 0, 'validation must refuse BEFORE the network');
      // The boundary: exactly 92 inclusive days is accepted.
      assert.equal((await getPanelSummary({ from: '2026-06-18', to: '2026-09-17' })).ok, true);
      assert.equal(calls.length, 1);
    });
  });

  await t.test('trends: limit is CLAMPED into 1..50 and defaults to 20', async () => {
    await withPanel({ handle: () => jsonResponse({ courses: [] }) }, async (calls) => {
      await getPanelTrends(RANGE);
      await getPanelTrends({ ...RANGE, limit: 500 });
      await getPanelTrends({ ...RANGE, limit: 0 });
      await getPanelTrends({ ...RANGE, limit: '7.9' });
      await getPanelTrends({ ...RANGE, limit: 'abc' });
      const limits = calls.map((c) => new URL(c.url).searchParams.get('limit'));
      assert.deepEqual(limits, ['20', '50', '1', '7', '20']);
      assert.ok(calls.every((c) => c.url.startsWith(`${HOST}/api/panel/trends?`)));
    });
  });

  await t.test('sessions: page ≥ 1, page_size 1..100, vote narrowed to any|up|down, has_error as true/false', async () => {
    await withPanel({ handle: () => jsonResponse({ items: [] }) }, async (calls) => {
      await listPanelSessions(RANGE);
      await listPanelSessions({ ...RANGE, page: 0, pageSize: 1000, vote: 'sideways', hasError: 'yes' });
      await listPanelSessions({ ...RANGE, page: 3, pageSize: 10, vote: 'down', hasError: true });
      const q = calls.map((c) => Object.fromEntries(new URL(c.url).searchParams));
      assert.deepEqual(q[0], { from: RANGE.from, to: RANGE.to, page: '1', page_size: '50', vote: 'any', has_error: 'false' });
      assert.deepEqual(q[1], { from: RANGE.from, to: RANGE.to, page: '1', page_size: '100', vote: 'any', has_error: 'false' });
      assert.deepEqual(q[2], { from: RANGE.from, to: RANGE.to, page: '3', page_size: '10', vote: 'down', has_error: 'true' });
    });
  });

  await t.test('session detail: the id is a path segment — empty, over-long or unsafe ids are refused without a request', async () => {
    await withPanel({ handle: () => jsonResponse({ session_id: 'x', messages: [] }) }, async (calls) => {
      for (const id of ['', '   ', null, 'a/b', 'a?b', 'x'.repeat(101), 'ล้าง']) {
        assert.deepEqual(await getPanelSession(id), { ok: false, reason: 'bad_request' }, JSON.stringify(id));
      }
      assert.equal(calls.length, 0);
      const r = await getPanelSession('3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c');
      assert.equal(r.ok, true);
      assert.equal(calls[0].url, `${HOST}/api/panel/sessions/3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c`);
      await getPanelSession('sess_1726000000_ab12cd');
      assert.equal(calls[1].url, `${HOST}/api/panel/sessions/sess_1726000000_ab12cd`, 'the widget fallback id shape is accepted');
    });
  });

  await t.test('a 404 on the detail read → not_found', async () => {
    await withPanel({ handle: () => jsonResponse({ error: 'not_found' }, 404) }, async () => {
      assert.deepEqual(await getPanelSession('missing-id'), { ok: false, reason: 'not_found' });
    });
  });

  // ── CONTROL ───────────────────────────────────────────────────────────────

  await t.test('CONTROL: this file left no fetch handler behind', () => {
    const { names } = fetchStubState();
    assert.equal(names.includes(NAME), false, `handler "${NAME}" is still registered`);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/app/api/chat/route';
import { clearHeaders, setHeaders } from '../stub-next-headers.mjs';
import { fetchStubState, jsonResponse, withFetch } from '../fetchStub.mjs';

/**
 * POST /api/chat — `page_url` reaches the upstream body.
 *
 * Driven exactly as Next drives it: the exported POST with a Request, the
 * upstream answered through test/fetchStub.mjs, `next/headers` from the
 * loader's stub. The same shape as test/pure/chatFeedbackRoute, and for the
 * same reason a source scan would not do: the claim is about the BODY THAT
 * LEAVES, and only a run shows what JSON.stringify actually emitted — an
 * `undefined` property is dropped, a '' is not, and the two read identically
 * in source.
 *
 * Every request gets a fresh forwarded IP so the per-process rate limiter
 * (15/min, keyed on the ip first) never counts one case against another.
 */

const NAME = 'chatRoutePageUrl';
const HOST = 'https://chat.example';
let seq = 0;
const freshIp = () => `203.0.113.${(seq += 1) % 250 + 1}-pu-${Date.now().toString(36)}`;

const req = (body) =>
  new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Run `fn` with CHATBOT_V2_API_URL = HOST and the upstream answering a plain reply; everything restored in finally. */
async function withUpstream(fn) {
  const saved = process.env.CHATBOT_V2_API_URL;
  process.env.CHATBOT_V2_API_URL = HOST;
  setHeaders({ 'x-forwarded-for': freshIp() });
  try {
    return await withFetch(
      { name: NAME, match: (u) => u.startsWith(HOST), handle: () => jsonResponse({ response: 'ok', message_type: 'text' }) },
      fn,
    );
  } finally {
    if (saved === undefined) delete process.env.CHATBOT_V2_API_URL; else process.env.CHATBOT_V2_API_URL = saved;
    clearHeaders();
  }
}

const BASE = { sessionId: 'sess-pu-1', message: 'มีคอร์ส Excel ไหม', history: [] };

test('/api/chat page_url — driven sequentially (env, headers and the fetch handler are process-global)', async (t) => {
  await t.test('page_url is forwarded upstream, beside user_id, sessionId, message and history', async () => {
    await withUpstream(async (calls) => {
      const res = await POST(req({ ...BASE, page_url: 'https://www.9experttraining.com/excel-adv-training-course' }));
      assert.equal(res.status, 200);
      assert.equal(calls.length, 1);
      const sent = calls[0].body;
      assert.deepEqual(sent, {
        sessionId: 'sess-pu-1',
        user_id: 'sess-pu-1',
        message: 'มีคอร์ส Excel ไหม',
        history: [],
        page_url: 'https://www.9experttraining.com/excel-adv-training-course',
      }, 'the whole upstream body — nothing extra rides through, and page_url is present');
      setHeaders({ 'x-forwarded-for': freshIp() });
    });
  });

  await t.test('a query string or hash is stripped to origin + path', async () => {
    await withUpstream(async (calls) => {
      await POST(req({ ...BASE, page_url: 'https://www.9experttraining.com/search?q=excel&utm_source=x#top' }));
      assert.equal(calls[0].body.page_url, 'https://www.9experttraining.com/search');
    });
  });

  await t.test('absent, empty, relative, non-http, or over-long page_url → the key is OMITTED, not sent as ""', async () => {
    const cases = [undefined, '', '   ', '/relative/path', 'javascript:alert(1)', 'data:text/html,x', 'not a url', `https://x.example/${'a'.repeat(600)}`, 42, { a: 1 }];
    for (const page_url of cases) {
      await withUpstream(async (calls) => {
        await POST(req(page_url === undefined ? BASE : { ...BASE, page_url }));
        assert.equal(calls.length, 1);
        assert.equal('page_url' in calls[0].body, false, `page_url should be omitted for ${JSON.stringify(page_url)}`);
        assert.equal(calls[0].body.user_id, 'sess-pu-1', 'the rest of the body is unaffected');
      });
    }
  });

  await t.test('CONTROL: this file left no fetch handler behind', () => {
    assert.equal(fetchStubState().names.includes(NAME), false);
  });
});

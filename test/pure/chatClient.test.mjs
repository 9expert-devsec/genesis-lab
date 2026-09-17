import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendChat, sendChatFeedback } from '@/lib/chat/chatClient';
import { fetchStubState, jsonResponse, withFetch } from '../fetchStub.mjs';

/**
 * chatClient — the backend's `message_id` becomes `serverMessageId`, and the
 * feedback call files a rating against THAT id, never the widget's local one.
 *
 * `fetch` is stubbed through test/fetchStub.mjs — a cooperative dispatcher
 * keyed on the URL, registered and removed in try/finally — because the
 * runner shares ONE process and interleaves files: a bare save/replace/
 * restore of the global raced the feedback-route tests and leaked a stub.
 */

const UUID = '3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c';
const NAME = 'chatClient';

/** Run `fn` with the same-origin chat routes answering `body` (JSON, `status`). */
const withChat = (body, fn, status = 200) =>
  withFetch({ name: NAME, match: (url) => url === '/api/chat' || url === '/api/chat/feedback', handle: () => jsonResponse(body, status) }, fn);

const ARGS = { sessionId: 'sess-1', message: 'มีหลักสูตร Power BI ไหม', history: [] };

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
test('chatClient — driven sequentially (the fetch handler is process-global)', async (t) => {
  await t.test('a valid UUID message_id comes back as serverMessageId', async () => {
    await withChat({ response: 'มีครับ', message_id: UUID }, async (calls) => {
      const r = await sendChat(ARGS);
      assert.equal(r.serverMessageId, UUID);
      assert.equal(r.reply, 'มีครับ', 'the reply is unaffected');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, '/api/chat', 'same-origin proxy, never the upstream host');
    });
  });

  await t.test('the page the turn was sent from travels to the proxy as page_url; absent → ""', async () => {
    await withChat({ response: 'x' }, async (calls) => {
      await sendChat({ ...ARGS, pageUrl: 'https://www.9experttraining.com/excel-adv-training-course' });
      assert.equal(calls[0].body.page_url, 'https://www.9experttraining.com/excel-adv-training-course');
      assert.deepEqual(Object.keys(calls[0].body).sort(), ['history', 'message', 'page_url', 'sessionId'], 'and nothing else joined the body');
      await sendChat(ARGS);
      assert.equal(calls[1].body.page_url, '', 'no pageUrl → an empty string the proxy drops, never undefined-as-missing-key ambiguity');
    });
  });

  await t.test('missing, null, number, empty string, or over-100-char message_id → serverMessageId null', async () => {
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
      await withChat(body, async () => {
        const r = await sendChat(ARGS);
        assert.equal(r.serverMessageId, null, `${label}: expected null`);
        assert.equal(r.reply, 'x', `${label}: the reply still arrives`);
      });
    }
  });

  await t.test('exactly 100 chars is accepted (the proxy caps messageId at 100), and the id is read from the TOP-LEVEL body', async () => {
    const id = 'b'.repeat(100);
    await withChat({ response: 'x', message_id: id }, async () => {
      assert.equal((await sendChat(ARGS)).serverMessageId, id);
    });
    // A wrapped body: the reply is unwrapped through `data` (a shape that has
    // been seen), but the id is only ever read from the top level — the proxy
    // relays the upstream body verbatim, and that is where the backend puts it.
    await withChat({ data: { response: 'wrapped', message_id: UUID } }, async () => {
      const r = await sendChat(ARGS);
      assert.equal(r.reply, 'wrapped');
      assert.equal(r.serverMessageId, null, 'not guessed from inside the wrapper');
    });
  });

  await t.test('the feedback call posts messageId = the serverMessageId it is given, with the unchanged payload shape', async () => {
    await withChat({ ok: true, forwarded: true }, async (calls) => {
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
      const sent = calls[0].body;
      assert.deepEqual(Object.keys(sent), ['rating', 'messageId', 'sessionId', 'userText', 'assistantText', 'pageUrl', 'createdAt'], 'the payload SHAPE is unchanged');
      assert.equal(sent.messageId, UUID, 'the SERVER id, not a local m_… id');
      assert.equal(sent.userText, payload.userText, 'userText still travels — the old feedback service reads it');
      assert.equal(sent.assistantText, payload.assistantText);
      assert.equal(sent.pageUrl, payload.pageUrl);
    });
  });

  await t.test('the feedback call never throws — a dropped network is swallowed', async () => {
    await withFetch({ name: NAME, match: (url) => url === '/api/chat/feedback', handle: () => { throw new TypeError('network down'); } }, async () => {
      await assert.doesNotReject(sendChatFeedback({ rating: 'down', messageId: UUID }));
    });
  });

  await t.test('a top-level `masterclasses` array is picked as-is, elements unvalidated, order kept', async () => {
    const items = [
      { slug: 'mas-ai-dmc', title: 'AI DMC', subtitle: null, cover_image_url: null, instructors: [], level_label: null, duration_label: null, url: 'https://www.9experttraining.com/masterclass/mas-ai-dmc', price: null },
      { slug: 'mas-claude-ai-for-data-analyst', title: 'Claude', price: { amount: 9675, normal_amount: 12900, early_bird: true, early_bird_ends_at: '2026-10-02T16:59:00.000Z' } },
    ];
    await withChat({ response: 'x', message_id: UUID, masterclasses: items }, async () => {
      const r = await sendChat(ARGS);
      assert.deepEqual(r.masterclasses, items, 'the array, untouched');
      assert.deepEqual(r.masterclasses.map((m) => m.slug), ['mas-ai-dmc', 'mas-claude-ai-for-data-analyst'], 'in the order received');
      assert.deepEqual(r.courses, [], 'and it does not leak into the course pick');
      assert.deepEqual(r.promotions, []);
    });
  });

  await t.test('field absent (today), null, or not an array → masterclasses is [] and nothing else changes', async () => {
    for (const [label, body] of [
      ['absent', { response: 'x', message_id: UUID, courses: [{ title: 'c' }] }],
      ['null', { response: 'x', message_id: UUID, courses: [{ title: 'c' }], masterclasses: null }],
      ['an object', { response: 'x', message_id: UUID, courses: [{ title: 'c' }], masterclasses: { slug: 'x' } }],
    ]) {
      await withChat(body, async () => {
        const r = await sendChat(ARGS);
        assert.deepEqual(r.masterclasses, [], label);
        assert.equal(r.reply, 'x', label);
        assert.equal(r.serverMessageId, UUID, label);
        assert.deepEqual(r.courses, [{ title: 'c' }], `${label}: the course pick is untouched`);
        assert.deepEqual(Object.keys(r), ['raw', 'reply', 'quickReplies', 'courses', 'promotions', 'masterclasses', 'careerPaths', 'serverMessageId'], label);
      });
    }
    // NO fallback chain: a masterclass list under a course-style alias is not guessed at.
    await withChat({ response: 'x', cards: { masterclasses: [{ slug: 'x' }] }, ui: { masterclasses: [{ slug: 'y' }] } }, async () => {
      assert.deepEqual((await sendChat(ARGS)).masterclasses, [], 'one name, by contract');
    });
  });

  await t.test('a top-level `career_paths` array is picked as careerPaths as-is, order kept; absent / null / non-array → [] and nothing else changes', async () => {
    const items = [
      { slug: 'data-analyst', title: 'Data Analyst', short_description: null, hero_image_url: null, courses: [{ code: 'POWER-BI', name: 'Power BI Desktop for Business Analytics' }], course_count: 1, url: 'https://www.9experttraining.com/data-analyst-career-path', price: { sale: 50150, full: 59000, discount_percent: 15 } },
      { slug: 'prompt-engineer', title: 'Prompt Engineer', courses: [], course_count: 0, url: 'https://www.9experttraining.com/prompt-engineer-career-path', price: null },
    ];
    await withChat({ response: 'x', message_id: UUID, career_paths: items }, async () => {
      const r = await sendChat(ARGS);
      assert.deepEqual(r.careerPaths, items, 'the array, untouched');
      assert.deepEqual(r.careerPaths.map((p) => p.slug), ['data-analyst', 'prompt-engineer'], 'in the order received');
      assert.deepEqual(r.courses, [], 'no leak into the course pick');
      assert.deepEqual(r.masterclasses, [], 'nor the masterclass pick');
    });
    for (const [label, body] of [
      ['absent', { response: 'x', message_id: UUID, courses: [{ title: 'c' }] }],
      ['null', { response: 'x', message_id: UUID, courses: [{ title: 'c' }], career_paths: null }],
      ['an object', { response: 'x', message_id: UUID, courses: [{ title: 'c' }], career_paths: { slug: 'x' } }],
    ]) {
      await withChat(body, async () => {
        const r = await sendChat(ARGS);
        assert.deepEqual(r.careerPaths, [], label);
        assert.deepEqual(r.courses, [{ title: 'c' }], `${label}: the course pick is untouched`);
        assert.deepEqual(Object.keys(r), ['raw', 'reply', 'quickReplies', 'courses', 'promotions', 'masterclasses', 'careerPaths', 'serverMessageId'], label);
      });
    }
    // ONE name, by contract: a camelCase or nested spelling is not guessed at.
    await withChat({ response: 'x', careerPaths: [{ slug: 'x' }], cards: { career_paths: [{ slug: 'y' }] } }, async () => {
      assert.deepEqual((await sendChat(ARGS)).careerPaths, []);
    });
  });

  await t.test('CONTROL: this file leaves no fetch handler registered', () => {
    assert.equal(fetchStubState().names.includes(NAME), false, 'a handler from this file is still registered');
  });

});

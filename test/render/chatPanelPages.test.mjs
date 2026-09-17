import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import StatsPage from '@/app/admin/chat/page';
import SessionsPage from '@/app/admin/chat/sessions/page';
import TranscriptPage from '@/app/admin/chat/sessions/[sessionId]/page';
import { setSessionUser } from '../fakeDb.mjs';
import { withFetch } from '../fetchStub.mjs';

/**
 * The three /admin/chat pages, RENDERED — driven as Next drives them
 * (`await Page(props, deps)` then static markup), never createRoot.
 *
 * ── WHAT IS REAL AND WHAT IS INJECTED ───────────────────────────────────────
 * `requirePage` is the real guard over the auth stub (test/fakeDb's session).
 * The panel READERS are injected through each page's `deps` seam for the
 * populated cases, so the page's own wiring — which fields it reads, what it
 * links, what it escapes — is what renders, with no env and no network. The
 * not-configured case uses the REAL client with the env deleted, so it also
 * proves the page reaches for `@/lib/chatPanel/client` by default.
 *
 * ── ONE top-level test, subtests in sequence ────────────────────────────────
 * The session and the env are process-global (see test/pure/chatPanelClient
 * and test/fs/pageBuilderDraftActions for the same shape). `setSessionUser`
 * is called synchronously before `Page()` in every subtest: the auth stub
 * reads the session synchronously at the call, so no other file's
 * microtask can slip between the two.
 */

const NOW = () => Date.UTC(2026, 8, 17, 12); // 19:00 Bangkok, the 17th
const SUPER = { id: 'u-super', name: 'Super', isSuperadmin: true, pages: null };
const STATS_ONLY = { id: 'u-stats', name: 'Stats Only', isSuperadmin: false, pages: ['chat_stats'] };

const dom = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
const text = (el) => el?.textContent?.trim() ?? null;

const SUMMARY = {
  range: { from: '2026-09-01', to: '2026-09-17', timezone: 'Asia/Bangkok' },
  totals: { sessions: 12, user_messages: 40, assistant_messages: 39, error_messages: 2, votes_up: 5, votes_down: 1 },
  daily: [
    { date: '2026-09-01', sessions: 3, assistant_messages: 9, error_messages: 0, votes_up: 2, votes_down: 0 },
    { date: '2026-09-02', sessions: 9, assistant_messages: 30, error_messages: 2, votes_up: 3, votes_down: 1 },
  ],
};
const TRENDS = {
  courses: [{ id: 'Power-Apps', count: 4 }, { id: 'EXCEL-ADV', count: 2 }],
  masterclasses: [{ slug: 'mas-ai-dmc', count: 3 }],
  career_paths: [{ slug: 'prompt-engineer', count: 1 }],
  search_queries: [{ query: 'excel <b>x</b>', count: 5 }],
  intents: [{ intent: 'course_query', count: 7 }],
};
const SESSIONS = {
  page: 2, page_size: 50, total: 120,
  items: [{
    session_id: '3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c',
    started_at: '2026-09-17T09:00:00+07:00', last_message_at: '2026-09-17T09:05:00+07:00',
    message_count: 4, votes_up: 0, votes_down: 1, error_count: 1,
    first_user_message: 'สวัสดี <b>bold?</b> 081-234-5678', page_url: 'https://www.9experttraining.com/excel',
  }],
};
const TRANSCRIPT = {
  session_id: '3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c',
  started_at: '2026-09-17T09:00:00+07:00', last_message_at: '2026-09-17T09:05:00+07:00', truncated: true,
  messages: [
    { role: 'user', text: 'line one\nline two <b>bold?</b> <script>alert(1)</script>', created_at: '2026-09-17T09:00:00+07:00', page_url: 'https://www.9experttraining.com/x', intent: null, is_error: null, cards: null, vote: null },
    { role: 'assistant', text: 'answer', created_at: '2026-09-17T09:00:05+07:00', page_url: null, intent: 'course_query', is_error: true,
      cards: { courses: ['EXCEL-ADV'], masterclasses: ['mas-ai-dmc'], career_paths: ['data-analyst'] },
      vote: { value: 'down', reason: 'ไม่ตรงคำถาม', voted_at: '2026-09-17T09:01:00+07:00' } },
  ],
};

const okOf = (data) => async () => ({ ok: true, data });
const failOf = (reason) => async () => ({ ok: false, reason });

test('chat panel pages — driven sequentially (session and env are process-global)', async (t) => {
  // ── the guard ─────────────────────────────────────────────────────────────

  await t.test('a user without the key is redirected (the guard runs before any read)', async () => {
    let reads = 0;
    setSessionUser({ id: 'u-none', name: 'Nobody', isSuperadmin: false, pages: ['dashboard'] });
    await assert.rejects(
      StatsPage({ searchParams: Promise.resolve({}) }, { now: NOW, fetchSummary: async () => { reads += 1; }, fetchTrends: async () => { reads += 1; } }),
      (e) => /NEXT_REDIRECT/.test(String(e?.message)) && /\/admin\/403/.test(String(e?.digest)),
    );
    setSessionUser(STATS_ONLY);
    await assert.rejects(
      SessionsPage({ searchParams: Promise.resolve({}) }, { now: NOW, fetchSessions: async () => { reads += 1; } }),
      (e) => /\/admin\/403/.test(String(e?.digest)), 'chat_stats alone does not open the sessions list',
    );
    await assert.rejects(
      TranscriptPage({ params: Promise.resolve({ sessionId: 'x' }) }, { fetchSession: async () => { reads += 1; }, recordView: () => { reads += 1; } }),
      (e) => /\/admin\/403/.test(String(e?.digest)), 'chat_stats alone does not open a transcript',
    );
    assert.equal(reads, 0, 'no reader ran for a caller the guard refused');
  });

  // ── the not-configured state, through the REAL client ─────────────────────

  await t.test('with no CHAT_PANEL_* env, /admin/chat renders the not-configured sentence and makes no request', async () => {
    const saved = { url: process.env.CHAT_PANEL_API_URL, key: process.env.CHAT_PANEL_API_KEY };
    delete process.env.CHAT_PANEL_API_URL;
    delete process.env.CHAT_PANEL_API_KEY;
    try {
      // Any PANEL fetch is a failure here. The matcher is the panel path, NOT a
      // catch-all: the dispatcher is process-global and newest-first, so a
      // `() => true` here would claim every other file's fetches for the
      // duration (measured — it broke test/pure/chatRoutePageUrl when the two
      // overlapped). A misconfigured page could only ever reach `…/api/panel/*`.
      await withFetch({ name: 'chatPanelPages', match: (u) => u.includes('/api/panel/'), handle: () => { throw new Error('the page must not fetch without configuration'); } }, async (calls) => {
        setSessionUser(SUPER);
        const doc = dom(renderToStaticMarkup(await StatsPage({ searchParams: Promise.resolve({}) }, { now: NOW })));
        const notices = [...doc.querySelectorAll('[data-testid="panel-failure"]')];
        assert.equal(notices.length, 2, 'both reads (summary, trends) report the state');
        for (const n of notices) {
          assert.equal(n.getAttribute('data-reason'), 'not_configured');
          assert.match(text(n), /CHAT_PANEL_API_URL/);
        }
        assert.equal(calls.length, 0);
        assert.ok(doc.querySelector('[data-testid="panel-range"]'), 'the range control still renders — the page is usable, not blank');
        assert.equal(doc.querySelector('[data-testid="panel-totals"]'), null, 'no numbers are drawn for a read that failed');
      });
    } finally {
      if (saved.url === undefined) delete process.env.CHAT_PANEL_API_URL; else process.env.CHAT_PANEL_API_URL = saved.url;
      if (saved.key === undefined) delete process.env.CHAT_PANEL_API_KEY; else process.env.CHAT_PANEL_API_KEY = saved.key;
    }
  });

  await t.test('every failure reason renders its own Thai sentence, on every page', async () => {
    const reasons = ['not_configured', 'unauthorized', 'disabled_upstream', 'bad_request', 'not_found', 'timeout', 'upstream_error'];
    const seen = new Set();
    for (const reason of reasons) {
      setSessionUser(SUPER);
      const stats = dom(renderToStaticMarkup(await StatsPage({ searchParams: Promise.resolve({}) }, { now: NOW, fetchSummary: failOf(reason), fetchTrends: failOf(reason) })));
      setSessionUser(SUPER);
      const list = dom(renderToStaticMarkup(await SessionsPage({ searchParams: Promise.resolve({}) }, { now: NOW, fetchSessions: failOf(reason) })));
      setSessionUser(SUPER);
      const detail = dom(renderToStaticMarkup(await TranscriptPage({ params: Promise.resolve({ sessionId: 'abc' }) }, { fetchSession: failOf(reason), recordView: () => assert.fail('a failed read must not be audited as a view') })));
      for (const [name, doc] of [['stats', stats], ['list', list], ['detail', detail]]) {
        const n = doc.querySelector(`[data-testid="panel-failure"][data-reason="${reason}"]`);
        assert.ok(n, `${name}: no notice for ${reason}`);
        assert.ok(text(n).length > 10, `${name}: empty notice for ${reason}`);
        seen.add(text(n));
      }
    }
    assert.equal(seen.size, reasons.length, 'seven reasons, seven distinct sentences');
  });

  // ── /admin/chat populated ─────────────────────────────────────────────────

  await t.test('/admin/chat: six totals, the daily table, the five ranked tables with public links', async () => {
    setSessionUser(SUPER);
    const doc = dom(renderToStaticMarkup(await StatsPage(
      { searchParams: Promise.resolve({ from: '2026-09-01', to: '2026-09-17' }) },
      { now: NOW, fetchSummary: okOf(SUMMARY), fetchTrends: okOf(TRENDS) },
    )));
    const totals = Object.fromEntries([...doc.querySelectorAll('[data-testid="panel-totals"] [data-total]')].map((el) => [el.getAttribute('data-total'), text(el.querySelector('dd'))]));
    assert.deepEqual(totals, { sessions: '12', user_messages: '40', assistant_messages: '39', error_messages: '2', votes_up: '5', votes_down: '1' });

    const dailyRows = [...doc.querySelectorAll('[data-testid="panel-daily"] tbody tr')];
    assert.equal(dailyRows.length, 2);
    assert.deepEqual([...dailyRows[1].querySelectorAll('td')].map(text), ['2026-09-02', '9', '30', '2', '3', '1']);

    const hrefs = (id) => [...doc.querySelectorAll(`[data-testid="${id}"] tbody a`)].map((a) => a.getAttribute('href'));
    assert.deepEqual(hrefs('trend-courses'), ['/power-apps-training-course', '/excel-adv-training-course'], 'courseHref on the lower-cased id — the path resolveCourse serves case-insensitively');
    assert.deepEqual(hrefs('trend-masterclasses'), ['/masterclass/mas-ai-dmc']);
    assert.deepEqual(hrefs('trend-career-paths'), ['/prompt-engineer-career-path'], 'careerPathHref adds the suffix to a bare slug');
    assert.deepEqual(hrefs('trend-queries'), [], 'queries are text, not links');
    assert.deepEqual(hrefs('trend-intents'), []);
    const q = doc.querySelector('[data-testid="trend-queries"] tbody tr td:nth-child(2)');
    assert.equal(text(q), 'excel <b>x</b>', 'a query is rendered as text');
    assert.equal(q.querySelector('b'), null, 'and never as markup');

    // The window in the URL is what the page shows, and the sessions link carries it.
    assert.match(text(doc.querySelector('[data-testid="panel-range"] p')), /2026-09-01 ถึง 2026-09-17/);
    const link = [...doc.querySelectorAll('a')].find((a) => a.getAttribute('href')?.startsWith('/admin/chat/sessions'));
    assert.equal(link?.getAttribute('href'), '/admin/chat/sessions?from=2026-09-01&to=2026-09-17');
  });

  await t.test('/admin/chat: the sessions link is drawn only for a caller who holds chat_transcripts', async () => {
    setSessionUser(STATS_ONLY);
    const doc = dom(renderToStaticMarkup(await StatsPage({ searchParams: Promise.resolve({}) }, { now: NOW, fetchSummary: okOf(SUMMARY), fetchTrends: okOf(TRENDS) })));
    assert.equal([...doc.querySelectorAll('a')].some((a) => a.getAttribute('href')?.startsWith('/admin/chat/sessions')), false);
    assert.ok(doc.querySelector('[data-testid="panel-totals"]'), 'the stats still render for the stats-only caller');
  });

  await t.test('/admin/chat: an invalid ?from/?to in the link is ignored and SAID so, and the default window is shown', async () => {
    setSessionUser(SUPER);
    const args = [];
    const doc = dom(renderToStaticMarkup(await StatsPage(
      { searchParams: Promise.resolve({ from: '2026-02-30', to: '2026-03-01' }) },
      { now: NOW, fetchSummary: async (a) => { args.push(a); return { ok: true, data: SUMMARY }; }, fetchTrends: okOf(TRENDS) },
    )));
    assert.deepEqual(args, [{ from: '2026-09-11', to: '2026-09-17' }], 'the reader received the default window, never the bad one');
    assert.match(text(doc.querySelector('[data-testid="panel-range"] p')), /ไม่ถูกต้อง/);
  });

  // ── /admin/chat/sessions populated ────────────────────────────────────────

  await t.test('/admin/chat/sessions: the table, the transcript link, text-not-markup, page_url, and the pager', async () => {
    setSessionUser(SUPER);
    const args = [];
    const doc = dom(renderToStaticMarkup(await SessionsPage(
      { searchParams: Promise.resolve({ from: '2026-09-01', to: '2026-09-17', vote: 'down', has_error: '1', page: '2' }) },
      { now: NOW, fetchSessions: async (a) => { args.push(a); return { ok: true, data: SESSIONS }; } },
    )));
    assert.deepEqual(args, [{ from: '2026-09-01', to: '2026-09-17', page: 2, pageSize: 50, vote: 'down', hasError: true }], 'every filter comes from the URL');

    const row = doc.querySelector('[data-testid="panel-sessions"] tbody tr');
    assert.ok(row);
    const cells = [...row.querySelectorAll('td')].map(text);
    assert.deepEqual(cells.slice(0, 5), ['2026-09-17 09:00', '2026-09-17 09:05', '4', '0 / 1', '1']);
    assert.equal(cells[5], 'สวัสดี <b>bold?</b> 081-234-5678', 'the preview is rendered as text');
    assert.equal(row.querySelector('b'), null);
    const pageLink = row.querySelector('td:nth-child(7) a');
    assert.equal(pageLink?.getAttribute('href'), 'https://www.9experttraining.com/excel');
    assert.equal(pageLink?.getAttribute('rel'), 'noopener noreferrer');
    const open = row.querySelector('td:nth-child(8) a');
    assert.equal(open?.getAttribute('href'), '/admin/chat/sessions/3f2a9c1e-7b4d-4e8a-9c21-0d5e6f7a8b9c');

    const pager = doc.querySelector('[data-testid="panel-pager"]');
    assert.match(text(pager), /หน้า 2 \/ 3/);
    const prev = pager.querySelector('a[rel="prev"]');
    const next = pager.querySelector('a[rel="next"]');
    for (const [a, p] of [[prev, '1'], [next, '3']]) {
      const u = new URL(a.getAttribute('href'), 'http://x');
      assert.equal(u.pathname, '/admin/chat/sessions');
      assert.deepEqual(Object.fromEntries(u.searchParams), { from: '2026-09-01', to: '2026-09-17', vote: 'down', has_error: '1', page: p }, 'paging carries every filter');
    }

    // The vote / has_error filters are plain links that keep the window.
    const filters = [...doc.querySelectorAll('[data-testid="session-filters"] a')].map((a) => [text(a), a.getAttribute('href'), a.getAttribute('aria-current')]);
    assert.deepEqual(filters.find(([l]) => l === '👍 เท่านั้น')?.slice(1), ['/admin/chat/sessions?from=2026-09-01&to=2026-09-17&vote=up&has_error=1', null]);
    assert.deepEqual(filters.find(([l]) => l === '👎 เท่านั้น')?.slice(1), ['/admin/chat/sessions?from=2026-09-01&to=2026-09-17&vote=down&has_error=1', 'true']);
    assert.deepEqual(filters.find(([l]) => l === 'ทั้งหมด')?.slice(1), ['/admin/chat/sessions?from=2026-09-01&to=2026-09-17&has_error=1', null], 'clearing the vote keeps has_error');
  });

  await t.test('/admin/chat/sessions: the pager has no links on a single page, and an empty window says so', async () => {
    setSessionUser(SUPER);
    const doc = dom(renderToStaticMarkup(await SessionsPage(
      { searchParams: Promise.resolve({}) },
      { now: NOW, fetchSessions: okOf({ page: 1, page_size: 50, total: 0, items: [] }) },
    )));
    assert.equal(doc.querySelector('[data-testid="panel-pager"] a'), null);
    assert.match(text(doc.querySelector('[data-testid="panel-sessions"] tbody')), /ไม่มีบทสนทนาในช่วงนี้/);
  });

  // ── the transcript ────────────────────────────────────────────────────────

  await t.test('transcript: in order, role + time + text as TEXT with line breaks kept, intent/error/vote/cards on the assistant turn, the truncated notice', async () => {
    setSessionUser(SUPER);
    const doc = dom(renderToStaticMarkup(await TranscriptPage(
      { params: Promise.resolve({ sessionId: TRANSCRIPT.session_id }) },
      { fetchSession: okOf(TRANSCRIPT), recordView: () => {} },
    )));
    const items = [...doc.querySelectorAll('[data-testid="transcript-messages"] > li')];
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((li) => li.getAttribute('data-role')), ['user', 'assistant']);

    const userText = items[0].querySelector('[data-testid="msg-text"]');
    assert.equal(userText.textContent, 'line one\nline two <b>bold?</b> <script>alert(1)</script>', 'the newline survives and the tags are characters');
    assert.equal(userText.querySelector('b'), null, '<b> did not become an element');
    assert.equal(doc.querySelector('script'), null, 'no script element exists anywhere in the page');
    assert.ok(/whitespace-pre-wrap/.test(userText.className), 'line breaks are rendered, not collapsed');
    assert.equal(items[0].querySelector('a[href="https://www.9experttraining.com/x"]')?.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(items[0].querySelector('[data-testid="msg-intent"]'), null, 'a user turn shows no intent');

    const a = items[1];
    assert.equal(text(a.querySelector('[data-testid="msg-intent"]')), 'intent: course_query');
    assert.equal(text(a.querySelector('[data-testid="msg-error"]')), 'ข้อผิดพลาด');
    assert.equal(a.getAttribute('data-error'), 'true');
    assert.equal(text(a.querySelector('[data-testid="msg-vote"]')), '👎 ไม่ถูกใจ — ไม่ตรงคำถาม');
    const cardLinks = [...a.querySelectorAll('[data-testid="msg-cards"] a')].map((l) => [text(l), l.getAttribute('href')]);
    assert.deepEqual(cardLinks, [
      ['EXCEL-ADV', '/excel-adv-training-course'],
      ['mas-ai-dmc', '/masterclass/mas-ai-dmc'],
      ['data-analyst', '/data-analyst-career-path'],
    ]);
    assert.ok(doc.querySelector('[data-testid="transcript-truncated"]'), 'truncated: true draws the notice');
    assert.match(text(doc.querySelector('[data-testid="transcript-meta"]')), /2026-09-17 09:00/);
  });

  await t.test('transcript: no truncated notice when the service says false, and no cards block when there are none', async () => {
    setSessionUser(SUPER);
    const doc = dom(renderToStaticMarkup(await TranscriptPage(
      { params: Promise.resolve({ sessionId: 'abc' }) },
      { fetchSession: okOf({ ...TRANSCRIPT, truncated: false, messages: [TRANSCRIPT.messages[0]] }), recordView: () => {} },
    )));
    assert.equal(doc.querySelector('[data-testid="transcript-truncated"]'), null);
    assert.equal(doc.querySelector('[data-testid="msg-cards"]'), null);
  });

  // ── the audit view ────────────────────────────────────────────────────────

  await t.test('transcript: the `view` row is written once, act_only-shaped, targeting the session id — and only on success', async () => {
    const rows = [];
    setSessionUser(SUPER);
    await TranscriptPage({ params: Promise.resolve({ sessionId: TRANSCRIPT.session_id }) }, { fetchSession: okOf(TRANSCRIPT), recordView: (e) => rows.push(e) });
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.menu, 'chat_transcripts');
    assert.equal(row.entity, 'transcript');
    assert.equal(row.action, 'view');
    assert.equal(row.recordId, TRANSCRIPT.session_id, 'the target is the session id');
    assert.deepEqual(row.actor, { id: 'u-super', name: 'Super' });
    assert.equal('before' in row, false, 'act_only: no before');
    assert.equal('after' in row, false, 'act_only: no after');
    assert.equal(JSON.stringify(row).includes('line one'), false, 'no message text rides along');

    for (const reason of ['not_found', 'timeout', 'not_configured']) {
      setSessionUser(SUPER);
      await TranscriptPage({ params: Promise.resolve({ sessionId: 'abc' }) }, { fetchSession: failOf(reason), recordView: (e) => rows.push(e) });
    }
    assert.equal(rows.length, 1, 'a failed read is not a view');
  });
});

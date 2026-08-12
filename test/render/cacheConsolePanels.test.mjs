import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MirrorPanel } from '@/app/admin/cache/_components/MirrorPanel';
import { WebhookTrailPanel } from '@/app/admin/cache/_components/WebhookTrailPanel';
import { RouteWindowPanel } from '@/app/admin/cache/_components/RouteWindowPanel';
import { InProcessPanel } from '@/app/admin/cache/_components/InProcessPanel';
import { SnapshotPanel } from '@/app/admin/cache/_components/SnapshotPanel';

/**
 * What the console PUTS ON SCREEN.
 *
 * The panels are synchronous presentational components precisely so they can be
 * driven here — the page does all the awaiting and hands plain data down. No
 * React root is mounted: renderToStaticMarkup only. The runner is
 * isolation:'none', one shared process, and a createRoot over jsdom leaks
 * globalThis.window/document into every other render test in the run.
 *
 * The subject is the COPY, because for this screen the copy is the feature. An
 * INFERRED number rendered without its limitation is the defect — "Synced
 * 08:36" alone is a lie of omission — so these assert that the qualifying text
 * is present, in the markup, as text.
 */

const strip = (html) => html.replace(/<[^>]*>/g, ' ');

// ── Panel 2: mirrors ────────────────────────────────────────────────────────

const MIRRORS_OK = {
  ok: true,
  data: [
    { key: 'career_paths', label: 'career_paths', sync: 'syncCareerPaths', count: 12, newest: '2026-08-12T03:00:00.000Z', staleRows: 2, neverSynced: 0 },
    { key: 'faqs', label: 'faqs', sync: 'syncFaqs', count: 40, newest: '2026-08-12T03:00:00.000Z', staleRows: 0, neverSynced: 0 },
  ],
};

test('the mirror panel says a failed run and a skipped run are indistinguishable', () => {
  // The binding requirement for an INFERRED value: the limitation is in the UI
  // text, not in a comment and not in a tooltip.
  const html = strip(renderToStaticMarkup(h(MirrorPanel, { mirrors: MIRRORS_OK })));
  assert.match(html, /รอบที่ล้มเหลวกับรอบที่ไม่ได้รันเลย แยกจากกันไม่ได้/);
  assert.match(html, /indistinguishable/);
});

test('the mirror panel says no sync deletes, so counts only grow', () => {
  const html = strip(renderToStaticMarkup(h(MirrorPanel, { mirrors: MIRRORS_OK })));
  assert.match(html, /ไม่มี sync ตัวไหนลบแถว/);
  assert.match(html, /counts only grow/);
  assert.match(html, /stays\s+forever/);
});

test('the mirror panel renders every collection and its three numbers', () => {
  const html = strip(renderToStaticMarkup(h(MirrorPanel, { mirrors: MIRRORS_OK })));
  assert.match(html, /career_paths/);
  assert.match(html, /faqs/);
  assert.match(html, /2026-08-12T03:00:00\.000Z/);
});

test('CONTROL: the caveat is absent from a panel that never rendered it', () => {
  // Proves the assertions above read THIS panel's output rather than matching
  // something present in every render (a layout wrapper, say).
  const html = strip(renderToStaticMarkup(h(InProcessPanel, { ttlMs: 1800000 })));
  assert.ok(!/รอบที่ล้มเหลวกับรอบที่ไม่ได้รันเลย/.test(html));
});

test('a failed mirror read says the numbers are absent, NOT zero', () => {
  // An empty panel and a broken one look identical, and the empty reading is
  // the reassuring one — which is the wrong way for this screen to fail.
  const html = strip(
    renderToStaticMarkup(h(MirrorPanel, { mirrors: { ok: false, error: 'no primary' } }))
  );
  assert.match(html, /absent, not zero/);
  assert.match(html, /no primary/, 'and the cause is named');
});

// ── Panel 3: the tagged union ───────────────────────────────────────────────

const WEBHOOKS = {
  ok: true,
  data: [
    {
      _id: 'w1',
      event: 'course.updated',
      status: 'ok',
      processed_at: '2026-08-12T04:00:00.000Z',
      revalidated: [
        { type: 'tag', target: 'public-courses', ok: true },
        { type: 'visibility', target: 'signup_url', ok: false, error: 'empty', value: '' },
        { type: 'visibility-uncertain', target: 'status', ok: false, error: 'case-folded', value: 'Open' },
      ],
    },
  ],
};

test('visibility entries are rendered apart from revalidations, and say so', () => {
  const html = strip(renderToStaticMarkup(h(WebhookTrailPanel, { webhooks: WEBHOOKS, limit: 15 })));
  assert.match(html, /ไม่ใช่การ revalidate ที่ล้มเหลว/,
    'a visibility finding is explicitly not a failed revalidation');
  assert.match(html, /signup_url/);
});

test('the two visibility kinds are rendered apart from EACH OTHER', () => {
  // WebhookLog.js:31-33 — definite and possible must not read as one claim.
  const html = strip(renderToStaticMarkup(h(WebhookTrailPanel, { webhooks: WEBHOOKS, limit: 15 })));
  assert.match(html, /มองไม่เห็นแน่นอน/, 'the definite heading');
  assert.match(html, /ตัดสินไม่ได้/, 'and the uncertain heading');
  assert.ok(
    html.indexOf('มองไม่เห็นแน่นอน') !== html.indexOf('ตัดสินไม่ได้'),
    'two distinct headings, not one reused'
  );
});

test('the trail counts calls ATTEMPTED, never successes', () => {
  const html = strip(renderToStaticMarkup(h(WebhookTrailPanel, { webhooks: WEBHOOKS, limit: 15 })));
  assert.match(html, /เรียก revalidate ไป 1 ครั้ง/);
  assert.match(html, /did not throw/, 'and explains what ok means');
  assert.ok(!/สำเร็จ \d+ ครั้ง/.test(html), 'no success count anywhere');
});

test('CONTROL: a delivery with ONLY revalidations shows no visibility headings', () => {
  // Otherwise the two assertions above would pass against a panel that printed
  // both headings unconditionally.
  const only = {
    ok: true,
    data: [{ _id: 'w2', event: 'course.updated', status: 'ok', processed_at: null,
      revalidated: [{ type: 'tag', target: 'public-courses', ok: true }] }],
  };
  const html = strip(renderToStaticMarkup(h(WebhookTrailPanel, { webhooks: only, limit: 15 })));
  assert.ok(!/มองไม่เห็นแน่นอน/.test(html));
  assert.ok(!/ตัดสินไม่ได้/.test(html));
  assert.match(html, /public-courses/, 'but the revalidation IS shown');
});

test('a null revalidated array is distinguished from "did nothing"', () => {
  const nullRow = {
    ok: true,
    data: [{ _id: 'w3', event: 'promotion.updated', status: 'ok', processed_at: null, revalidated: null }],
  };
  const html = strip(renderToStaticMarkup(h(WebhookTrailPanel, { webhooks: nullRow, limit: 15 })));
  assert.match(html, /ไม่ใช่ &quot;ไม่ได้ทำอะไร&quot;|ไม่ใช่ "ไม่ได้ทำอะไร"/);
});

// ── Panel 4: build-time facts ───────────────────────────────────────────────

test('the route panel is headed as build-time facts, not live state', () => {
  const html = strip(renderToStaticMarkup(h(RouteWindowPanel)));
  assert.match(html, /ข้อมูลจากตอน BUILD ไม่ใช่สถานะปัจจุบัน/);
});

test('/contact-us and /terms appear as displayed ROWS', () => {
  // Required to be rows rather than footnotes: they are the evidence that
  // reading route config is not enough.
  const html = strip(renderToStaticMarkup(h(RouteWindowPanel)));
  assert.match(html, /\/contact-us/);
  assert.match(html, /revalidate = 86400/, 'with the exported value that never took effect');
  assert.match(html, /\/terms/);
});

test('the route panel states that ISR state is unreadable, in words', () => {
  const html = strip(renderToStaticMarkup(h(RouteWindowPanel)));
  assert.match(html, /อ่านจากโค้ดแอปไม่ได้/);
});

// ── Panel 5: in-process ─────────────────────────────────────────────────────

test('the in-process panel says THIS instance only', () => {
  const html = strip(renderToStaticMarkup(h(InProcessPanel, { ttlMs: 1800000 })));
  assert.match(html, /instance ที่ render หน้านี้เท่านั้น/);
  assert.match(html, /Per-process, in-memory/);
});

test('the in-process panel shows the TTL it was given, in minutes', () => {
  const html = strip(renderToStaticMarkup(h(InProcessPanel, { ttlMs: 1800000 })));
  assert.match(html, /30 นาที/);
});

test('CONTROL: a different TTL renders differently', () => {
  // Pins that the number comes from the prop rather than being hardcoded copy.
  const html = strip(renderToStaticMarkup(h(InProcessPanel, { ttlMs: 600000 })));
  assert.match(html, /10 นาที/);
  assert.ok(!/30 นาที/.test(html));
});

// ── Panel 1: snapshots ──────────────────────────────────────────────────────

const SNAPSHOTS = {
  ok: true,
  data: {
    landing: {
      present: true, syncedAt: '2026-08-12T03:00:00.000Z', status: 'partial',
      schemaVersion: 1, updatedAt: '2026-08-12T03:00:01.000Z',
      sections: { banners: 3, programs: 8 },
      syncErrors: [
        'getCourseByCode(MSE-AI): 502 Bad Gateway',
        'listSchedulesByCourse(64f0): timeout after 10000ms',
      ],
    },
    navmenu: {
      present: true, syncedAt: '2026-08-12T03:00:00.000Z', status: 'ok',
      updatedAt: null,
      programs: { groups: 6, courses: 60, withoutCover: 1 },
      skills: { groups: 9, courses: 70, withoutCover: 0 },
    },
  },
};

test('syncErrors are rendered IN FULL — every line, not a count', () => {
  // The shape of a syncErrors line is what identifies which code produced the
  // snapshot. A count or a first-line preview throws away the only thing the
  // field is for.
  const html = strip(renderToStaticMarkup(h(SnapshotPanel, { snapshots: SNAPSHOTS })));
  assert.match(html, /getCourseByCode\(MSE-AI\): 502 Bad Gateway/);
  assert.match(html, /listSchedulesByCourse\(64f0\): timeout after 10000ms/);
});

test('the syncedAt caveat is on screen for the snapshots', () => {
  const html = strip(renderToStaticMarkup(h(SnapshotPanel, { snapshots: SNAPSHOTS })));
  assert.match(html, /ไม่ได้บอกว่าหน้าเว็บที่ผู้ใช้เห็นอยู่ตอนนี้ใช้ข้อมูลชุดนี้แล้วหรือยัง/);
  assert.match(html, /cached\s+separately/);
});

test('a missing landing_cache document says what that costs the home page', () => {
  const missing = {
    ok: true,
    data: {
      ...SNAPSHOTS.data,
      landing: { present: false, syncErrors: [], sections: null, status: null, syncedAt: null, schemaVersion: null, updatedAt: null },
    },
  };
  const html = strip(renderToStaticMarkup(h(SnapshotPanel, { snapshots: missing })));
  assert.match(html, /หน้าแรกจะ render เป็นค่าว่างทั้งหมด/);
});

test('a missing nav_menu_cache says the reader fails SILENTLY', () => {
  // getNavMenuData's bare `catch {}` is why this matters: missing, empty and
  // "Mongo threw" are one value with no log.
  const missing = {
    ok: true,
    data: {
      ...SNAPSHOTS.data,
      navmenu: { present: false, programs: { groups: 0, courses: 0, withoutCover: 0 }, skills: { groups: 0, courses: 0, withoutCover: 0 }, status: null, syncedAt: null, updatedAt: null },
    },
  };
  const html = strip(renderToStaticMarkup(h(SnapshotPanel, { snapshots: missing })));
  assert.match(html, /คืนค่าว่างแบบเงียบ ๆ/);
});

test('status is rendered as a WORD, never as a coloured dot alone', () => {
  // A green dot reads as "this cache is fine". `status` is what the last run
  // said about itself, and unwrap() can turn an unreadable 200 into an empty
  // section that is legitimately 'ok'.
  const html = renderToStaticMarkup(h(SnapshotPanel, { snapshots: SNAPSHOTS }));
  assert.match(strip(html), /partial/, 'the word itself is on screen');
  assert.match(strip(html), /รอบล่าสุดรายงานตัวเอง/, 'labelled as self-reported');
});

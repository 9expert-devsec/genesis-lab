import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseScheduleSection } from '@/components/pageBuilder/sections/course_schedule';
import { NEUTRAL_STATUS, SCHEDULE_STATUS } from '@/lib/scheduleStatus';

/**
 * `course_schedule` — A SOLD-OUT ROUND IS SHOWN, AND IS NOT A LINK (round 81).
 *
 * The sibling of test/render/scheduleFullRoundNotClickable, which makes this
 * claim for /schedule's two layouts. It is a separate file rather than more
 * cases in that one because the two renderers share only the BUILDER: /schedule
 * draws an `aria-disabled` span with a not-allowed cursor for an inert round,
 * this section draws a bare `<li>` with no anchor. Asserting both shapes in one
 * file would need every assertion to branch on which surface it was looking at.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 * This section built the wizard URL itself, in a copy of the shared builder
 * that predated its extraction and had never gained the `full` refusal. So a
 * full round rendered the red เต็ม chip INSIDE a working registration link —
 * the chip saying there are no seats, the row behaving as though there were.
 * Measured before the fix: `anchored=true`,
 * `href=/registration/public?course=mse-l1&class=r-full`.
 *
 * ── WHY THE FIXTURE HANDS THE ROW STRAIGHT TO THE COMPONENT ────────────────
 * `resolveSectionData` calls `listSchedulesByCourse` with no `status`, so
 * upstream auto-filters to the registerable statuses and a `full` round cannot
 * reach this renderer through the resolver TODAY. That is why round 64 could
 * see the defect only under a constructed round, and why a stored-page proof
 * would have come back green over a real behaviour change. Every sibling
 * surface has already widened its own fetch to PUBLIC_SCHEDULE_STATUSES so a
 * sold-out round can be SHOWN; this component draws what it is handed, so
 * handing it a full round is exactly the state the next fetch change creates.
 *
 * ── ALL FIVE STATES, IN ONE TABLE ──────────────────────────────────────────
 * `full` is only meaningful next to the other four. Three of them are
 * non-clickable and they are NOT non-clickable for the same reason — `full`
 * because the system KNOWS the round is full, `elapsed` because dates were
 * computed, `missing` because nothing is known — and the two that ARE clickable
 * are what stop every absence below from passing on an empty render.
 *
 * ── MATCHING WITH BOUNDARIES ───────────────────────────────────────────────
 * `includes('<a')` is true of `<article`. Every structural assertion here goes
 * through the row probe, which anchors on `<a` followed by whitespace, and the
 * probe has its own control.
 */

const R = (content, data) => renderToStaticMarkup(CourseScheduleSection({ content, data }));

const CODE = 'MSE-L1';

/**
 * One descriptor per rendered row: is the row itself a link, where to, and what
 * does its chip say.
 *
 * Scoped per `<li>` rather than swept over the whole markup, because the whole
 * point of the mixed-fixture tests below is that one row may be a link while its
 * neighbour is not — a document-wide `href` search cannot tell which row owns
 * the link it found.
 */
const rows = (html) =>
  (html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? []).map((li) => {
    const a = li.match(/<a\s+href="([^"]*)"/);
    const chip = li.match(/<span class="(shrink-0 rounded-full[^"]*)"[^>]*>([^<]*)</);
    return {
      anchored: Boolean(a),
      href: a ? a[1] : null,
      chipText: chip ? chip[2] : null,
      chipClasses: chip ? chip[1] : null,
    };
  });

const one = (html) => {
  const list = rows(html);
  assert.equal(list.length, 1, `expected exactly one row, got ${list.length}`);
  return list[0];
};

const liveRow = (id, status) => ({ _id: id, dates: ['2027-03-10'], type: 'classroom', status });

/** upcoming mode — the branch every stored section takes. */
const upcoming = (rowsIn) => R({ courseId: CODE }, rowsIn);

/** manual mode with one chosen round the feed no longer returns. */
const chosen = (id, dates) =>
  R(
    { courseId: CODE, source: 'manual', roundIds: [id], roundSnapshots: [{ id, dates, type: 'hybrid' }] },
    [liveRow('r-open', 'open')],
  );

// ── the defect ─────────────────────────────────────────────────────────────

test('a FULL round renders เต็ม and is not wrapped in an anchor', () => {
  const row = one(upcoming([liveRow('r-full', 'full')]));

  assert.equal(row.chipText, SCHEDULE_STATUS.full.action,
    'the round must be SHOWN, labelled เต็ม — this is not a re-filtering');
  assert.equal(row.anchored, false,
    'a full round was wrapped in an anchor: a red เต็ม chip inside a working '
    + 'registration link is the defect this file exists for');
  assert.equal(row.href, null);
});

test('a full round carries no registration URL anywhere in its markup', () => {
  // The anchor assertion above is about the row's WRAPPER. This is the wider
  // claim: nothing in the row navigates into the wizard, however it were nested.
  const html = upcoming([liveRow('r-full', 'full')]);
  assert.ok(!html.includes('/registration/public'),
    'a sold-out round leaked a wizard URL into its markup');
});

test('the local `closed` spelling is exactly as unclickable as MSDB `full`', () => {
  // src/models/ScheduleStatus.js spells the same state `closed`. The builder
  // normalises before refusing, so a round closed by an admin override is not a
  // link either — which a `=== 'full'` check here would have got wrong.
  const row = one(upcoming([liveRow('r-closed', 'closed')]));
  assert.equal(row.anchored, false, 'a `closed` round was clickable');
  assert.equal(row.chipText, SCHEDULE_STATUS.full.action, 'and it is still worded เต็ม');
});

// ── the other four states, so the table is complete ────────────────────────

test('CONTROL: an OPEN round in the same section DOES carry the link', () => {
  /**
   * Without this every assertion above is satisfied by a render that produced no
   * rows at all, or by a regression that stopped linking every round. Same
   * component, same fixture shape, only the status differs.
   */
  const row = one(upcoming([liveRow('r-open', 'open')]));
  assert.equal(row.anchored, true, 'the open round stopped being a link — the '
    + 'refusal above is no longer specific to `full`');
  assert.equal(row.href, '/registration/public?course=mse-l1&amp;class=r-open');
  assert.equal(row.chipText, SCHEDULE_STATUS.open.action);
});

test('a NEARLY_FULL round still links — it is registerable', () => {
  const row = one(upcoming([liveRow('r-near', 'nearly_full')]));
  assert.equal(row.anchored, true, 'ใกล้เต็ม means seats remain');
  assert.equal(row.href, '/registration/public?course=mse-l1&amp;class=r-near');
  assert.equal(row.chipText, SCHEDULE_STATUS.nearly_full.action);
});

test('ELAPSED and MISSING are still not links, and still tell themselves apart', () => {
  // Round 64's rule, re-asserted here only because this file is the five-state
  // table and an absent row would read as coverage. The words and the grey are
  // owned by test/render/courseScheduleChosenRounds; what is checked here is
  // that routing through the shared builder did not start linking them.
  const elapsed = one(chosen('r-gone', ['2026-01-05']));
  const missing = one(chosen('r-withdrawn', ['2027-05-04']));

  assert.equal(elapsed.anchored, false, 'an elapsed round became clickable');
  assert.equal(missing.anchored, false, 'a missing round became clickable');
  assert.equal(elapsed.chipText, 'จบไปแล้ว');
  assert.equal(missing.chipText, 'ไม่พบรอบนี้');
  assert.notEqual(elapsed.chipText, missing.chipText,
    'the two greys collapsed into one word');
});

test('the chip vocabulary is untouched — only the anchor changed', () => {
  /**
   * Round 81 is explicitly not a wording round. `lib/scheduleStatus` stays the
   * single source, and the proof that this change did not reach it is that the
   * full row still carries the SAME chip text and the SAME colour string it
   * carried while it was wrongly a link.
   */
  const full = one(upcoming([liveRow('r-full', 'full')]));
  assert.ok(full.chipClasses.includes(SCHEDULE_STATUS.full.soft),
    `the full chip is no longer the module's red: ${full.chipClasses}`);

  const elapsed = one(chosen('r-gone', ['2026-01-05']));
  assert.ok(elapsed.chipClasses.includes(NEUTRAL_STATUS.soft),
    `the elapsed chip is no longer the module's neutral grey: ${elapsed.chipClasses}`);
});

// ── the mixed render, which is where a per-row rule actually has to hold ───

test('full and open rounds sit in ONE list, and only the open one is a link', () => {
  const list = rows(upcoming([
    liveRow('a-open', 'open'),
    liveRow('b-full', 'full'),
    liveRow('c-near', 'nearly_full'),
  ]));

  assert.equal(list.length, 3, 'the full round was filtered out — it must be SHOWN');
  assert.deepEqual(list.map((r) => r.anchored), [true, false, true],
    'the link/no-link decision is not being made per row');
  assert.deepEqual(
    list.map((r) => r.chipText),
    [SCHEDULE_STATUS.open.action, SCHEDULE_STATUS.full.action, SCHEDULE_STATUS.nearly_full.action],
    'the rows moved, so the anchors above are describing different rounds',
  );
});

test('the same rule holds in MANUAL mode, where an author chose the full round', () => {
  // The two modes reach the href through the same line, but a reader should not
  // have to know that: chosen-rounds mode is the newer path and is where an
  // author can deliberately put a sold-out round on a page.
  const html = R(
    { courseId: CODE, source: 'manual', roundIds: ['b-full', 'a-open'] },
    [liveRow('a-open', 'open'), liveRow('b-full', 'full')],
  );
  const list = rows(html);
  assert.deepEqual(list.map((r) => r.chipText),
    [SCHEDULE_STATUS.full.action, SCHEDULE_STATUS.open.action],
    'the author\'s order was not honoured — this fixture is not testing what it says');
  assert.deepEqual(list.map((r) => r.anchored), [false, true],
    'a chosen full round was clickable');
});

// ── the probe's own control ────────────────────────────────────────────────

test('CONTROL: the row probe reports anchors, and <article> is not one', () => {
  /**
   * `anchored: false` and "the renderer never ran" are the same value. The
   * probe is therefore pointed at markup that does contain a link, and at the
   * bare-element trap this repo has hit five times.
   */
  assert.deepEqual(
    rows('<li><a href="/x">y</a></li>'),
    [{ anchored: true, href: '/x', chipText: null, chipClasses: null }],
  );
  assert.deepEqual(
    rows('<li><article><address>x</address></article></li>'),
    [{ anchored: false, href: null, chipText: null, chipClasses: null }],
    'the probe counted <article> as an anchor — match with boundaries',
  );
  assert.deepEqual(rows('<div>no rows here</div>'), [],
    'the probe invented a row');
});

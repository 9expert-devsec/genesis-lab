import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildScheduleJsonLd, scheduleGraphRows, SCHEDULE_TITLE } from '@/lib/seo/scheduleJsonLd';
import { buildCourseListJsonLd } from '@/lib/seo/courseListJsonLd';
import { courseListNode } from '@/lib/seo/courseNode';
import { buildHomeJsonLd, homeGraphIds } from '@/lib/seo/homeJsonLd';
import { joinCourseSchedules } from '@/lib/schedule/joinCourseSchedules';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { siteConfig } from '@/config/site';

/**
 * /schedule's `@graph`, and the Course node it shares with /training-course.
 *
 * Pure builders, so these invoke them for real. `now` is passed on every call:
 * the month window is ROLLING, so a test that let the builder read the clock
 * would assert something different every month and would pass in October for a
 * reason that has nothing to do with the code.
 */

/** An origin nothing in src could coincidentally contain. */
const OTHER = 'https://control.example.invalid';

/** A fixed instant, mid-month, so the six-month window is unambiguous. */
const NOW = new Date(2026, 9, 15); // 2026-10-15 local
/**
 * The RANGE END the page would pass in, pinned here as the server's answer.
 *
 * The window used to be a rolling six months derived inside the builder, so
 * NOW alone fixed it at 2026-10 .. 2027-03. The range is data-driven now and
 * arrives as `endKey`, so this file states it: 2026-10 .. 2027-12, i.e. the
 * rule's longer branch (an eligible round reaches past this year).
 *
 * Next December rather than this one so the range is 15 months and the
 * in-range / out-of-range cases below still have room on both sides of the
 * boundary — with a 3-month range there is barely an inside to test.
 */
const RANGE_END = '2027-12';

const nodesOf = (graph) => graph['@graph'];
const nodeOfType = (graph, type) => nodesOf(graph).find((n) => n['@type'] === type);
const itemsOf = (graph) => nodeOfType(graph, 'ItemList').itemListElement;
const instancesOf = (graph) => itemsOf(graph).flatMap((e) => e.item.hasCourseInstance);

/** Upstream sends each day as UTC midnight; reproduce that exactly. */
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString();

/** A round in the shape /schedules returns. */
const round = (dates, over = {}) => ({
  _id: `sched-${dates[0]}`,
  status: 'open',
  type: 'classroom',
  dates,
  ...over,
});

/** A course row in the shape joinCourseSchedules emits. */
const course = (i, schedules, over = {}) => ({
  _id: `69b25a3177e3680cba66${String(i).padStart(4, '0')}`,
  course_id: `COURSE-${i}`,
  course_name: `หลักสูตรที่ ${i}`,
  course_teaser: `คำโปรยของหลักสูตรที่ ${i}`,
  schedules,
  ...over,
});

const build = (courses, opts = {}) =>
  buildScheduleJsonLd(courses, { now: NOW, endKey: RANGE_END, ...opts });

// ── 1. the shared Course node is ONE node across both pages ─────────────────

/**
 * THE ASSERTION THE EXTRACTION EXISTS FOR.
 *
 * The same course listed on /training-course and on /schedule must be ONE
 * entity. Compared field by field against the OTHER BUILDER's actual output —
 * not against courseListNode, which both import and which would therefore agree
 * with itself even if one builder stopped using it.
 */
test('the Course node is identical between /schedule and /training-course', () => {
  const row = {
    course_id: 'PBI-101',
    course_name: 'Power BI Essentials',
    course_teaser: 'เริ่มต้นกับ Power BI',
    urlAlias: '/power-bi-essentials',
  };

  const fromSchedule = itemsOf(build([{ ...row, schedules: [round([day(2026, 10, 20)])] }]))[0].item;
  const fromCatalog = itemsOf(buildCourseListJsonLd([row]))[0].item;

  // /schedule's node is the catalog's node PLUS hasCourseInstance, and nothing
  // else may differ.
  const { hasCourseInstance, ...shared } = fromSchedule;
  assert.ok(Array.isArray(hasCourseInstance), '/schedule must add hasCourseInstance');
  assert.deepEqual(shared, fromCatalog);
});

test('so the @id and url are byte-identical on both pages', () => {
  const row = { course_id: 'X-1', course_name: 'X', urlAlias: '/x-alias' };
  const a = itemsOf(build([{ ...row, schedules: [round([day(2026, 10, 20)])] }]))[0].item;
  const b = itemsOf(buildCourseListJsonLd([row]))[0].item;
  assert.equal(a['@id'], b['@id']);
  assert.equal(a.url, b.url);
  assert.equal(a['@id'], `${SITE_URL}/x-alias`);
});

/**
 * THE REGRESSION THIS ROUND ACTUALLY FOUND, pinned end to end.
 *
 * The bug was not in either builder: `joinCourseSchedules` — the page's own
 * course↔schedule join — projected rows to a whitelist that omitted `urlAlias`,
 * so the canonical rule fell through to the derived `course_id` path. /schedule
 * then named all 44 courses with a URL that 308-redirects, and gave each a
 * different `@id` than /training-course for the same course.
 *
 * So this drives the REAL join rather than a hand-built row: a fixture course
 * carrying an alias must reach the graph AS its alias. A projection that drops
 * the field again passes every other test in this file.
 */
const UPSTREAM = [{
  _id: 'c1',
  course_id: 'CLAUDE-AI',
  course_name: 'Claude Cowork for Business',
  urlAlias: '/claude-cowork-training-course',
  course_teaser: 'เรียนรู้การใช้งาน Claude',
  program: { _id: 'p1', program_id: 'P1', program_name: 'AI' },
}];
const UPSTREAM_SCHEDULES = [
  { _id: 's1', course: 'c1', status: 'open', type: 'hybrid', dates: [day(2026, 10, 20)] },
];

/** The real pipeline: join → re-attach teaser → build. What page.jsx does. */
const fromRealPipeline = () => {
  const { rows } = joinCourseSchedules(UPSTREAM, UPSTREAM_SCHEDULES);
  return build(scheduleGraphRows(rows, UPSTREAM));
};

test('a row from the REAL join keeps its alias, so the @id is the canonical one', () => {
  const item = itemsOf(fromRealPipeline())[0].item;
  assert.equal(item.url, `${SITE_URL}/claude-cowork-training-course`);
  assert.notEqual(
    item.url,
    `${SITE_URL}/claude-ai-training-course`,
    'the derived code path is the pre-fix value — the alias must win'
  );
});

/**
 * THE SECOND HALF OF THE SAME LESSON.
 *
 * The first attempt at this round passed a parity test built from a hand-made
 * row and still shipped 44 Course nodes with no `description`, because
 * joinCourseSchedules strips `course_teaser` and the fixture did not. So parity
 * is asserted here against the REAL pipeline — join, re-attach, build — and
 * against /training-course's actual output, field for field.
 */
test('the REAL pipeline produces a node identical to /training-course\'s, description included', () => {
  const scheduleItem = itemsOf(fromRealPipeline())[0].item;
  const catalogItem = itemsOf(buildCourseListJsonLd(UPSTREAM))[0].item;

  const { hasCourseInstance, ...shared } = scheduleItem;
  assert.deepEqual(shared, catalogItem);
  assert.equal(shared.description, 'เรียนรู้การใช้งาน Claude', 'the teaser must survive to the graph');
});

test('scheduleGraphRows re-attaches the teaser the join stripped', () => {
  const { rows } = joinCourseSchedules(UPSTREAM, UPSTREAM_SCHEDULES);
  assert.ok(!('course_teaser' in rows[0]), 'the join must keep stripping it for the client');
  const [enriched] = scheduleGraphRows(rows, UPSTREAM);
  assert.equal(enriched.course_teaser, 'เรียนรู้การใช้งาน Claude');
  // and it does not invent one for a course upstream has no teaser for
  const [none] = scheduleGraphRows(rows, [{ _id: 'c1', course_name: 'x' }]);
  assert.equal(none.course_teaser, undefined);
});

test('scheduleGraphRows tolerates the shapes a failed fetch can hand over', () => {
  assert.deepEqual(scheduleGraphRows(null, null), []);
  assert.deepEqual(scheduleGraphRows(undefined, UPSTREAM), []);
  const rows = [{ _id: 'zz', course_name: 'kept' }];
  assert.deepEqual(scheduleGraphRows(rows, null), rows, 'no upstream match leaves the row alone');
});

test('courseListNode returns null for a row it cannot name, and both builders skip it', () => {
  const organizationId = homeGraphIds(SITE_URL).organization;
  assert.equal(courseListNode({ course_id: '', urlAlias: '' }, SITE_URL, organizationId), null);
  assert.equal(courseListNode({ course_id: 'A', course_name: '' }, SITE_URL, organizationId), null);
  assert.equal(courseListNode(null, SITE_URL, organizationId), null);
});

test('a course with no canonical path is omitted from /schedule', () => {
  const graph = build([
    course(1, [round([day(2026, 10, 20)])]),
    course(2, [round([day(2026, 10, 21)])], { course_id: '', urlAlias: '   ' }),
    course(3, [round([day(2026, 10, 22)])]),
  ]);
  assert.equal(itemsOf(graph).length, 2);
  assert.deepEqual(itemsOf(graph).map((e) => e.item.name), ['หลักสูตรที่ 1', 'หลักสูตรที่ 3']);
  assert.deepEqual(itemsOf(graph).map((e) => e.position), [1, 2]);
});

// ── 2. the shared @ids are Home's, byte for byte ────────────────────────────

test('isPartOf and about are the ids the home graph emits', () => {
  const home = buildHomeJsonLd();
  const collection = nodeOfType(build([course(1, [round([day(2026, 10, 20)])])]), 'CollectionPage');
  assert.equal(collection.isPartOf['@id'], nodeOfType(home, 'WebSite')['@id']);
  assert.equal(collection.about['@id'], nodeOfType(home, 'EducationalOrganization')['@id']);
});

test('changing the origin moves EVERY site URL — no literal host survives', () => {
  const moved = JSON.stringify(
    build([course(1, [round([day(2026, 10, 20)])])], { siteUrl: OTHER })
  );
  assert.ok(!moved.includes(SITE_URL), 'a URL still names the production origin — it is hardcoded');
});

test('CONTROL: the same scan DOES find the origin when it is the one in use', () => {
  const real = JSON.stringify(build([course(1, [round([day(2026, 10, 20)])])]));
  assert.ok(real.includes(SITE_URL), 'the scan must see the origin, or it proves nothing');
});

// ── 3. the three nodes and their links ─────────────────────────────────────

test('the graph is exactly CollectionPage + ItemList + BreadcrumbList', () => {
  const graph = build([course(1, [round([day(2026, 10, 20)])])]);
  assert.deepEqual(nodesOf(graph).map((n) => n['@type']), [
    'CollectionPage',
    'ItemList',
    'BreadcrumbList',
  ]);
});

test('mainEntity and breadcrumb point at the ids those nodes carry', () => {
  const graph = build([course(1, [round([day(2026, 10, 20)])])]);
  const collection = nodeOfType(graph, 'CollectionPage');
  assert.equal(collection.mainEntity['@id'], nodeOfType(graph, 'ItemList')['@id']);
  assert.equal(collection.breadcrumb['@id'], nodeOfType(graph, 'BreadcrumbList')['@id']);
  assert.equal(collection['@id'], `${SITE_URL}/schedule#webpage`);
  assert.equal(collection.url, `${SITE_URL}/schedule`);
});

test('the ItemList @id does not collide with /training-course\'s', () => {
  const schedule = nodeOfType(build([course(1, [round([day(2026, 10, 20)])])]), 'ItemList');
  const catalog = nodeOfType(buildCourseListJsonLd([course(1, [])]), 'ItemList');
  assert.notEqual(schedule['@id'], catalog['@id']);
});

test('CollectionPage.name is the full rendered <title>', () => {
  const collection = nodeOfType(build([course(1, [round([day(2026, 10, 20)])])]), 'CollectionPage');
  assert.equal(collection.name, `${SCHEDULE_TITLE} | ${siteConfig.name}`);
  assert.equal(collection.name, 'ตารางฝึกอบรม | 9Expert Training');
});

test('the breadcrumb is หน้าแรก then this page', () => {
  const crumbs = nodeOfType(build([course(1, [round([day(2026, 10, 20)])])]), 'BreadcrumbList')
    .itemListElement;
  assert.deepEqual(crumbs, [
    { '@type': 'ListItem', position: 1, name: 'หน้าแรก', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: SCHEDULE_TITLE, item: `${SITE_URL}/schedule` },
  ]);
});

// ── 4. dates: single, multi, cross-month, cross-year ───────────────────────

const datesOf = (graph, i = 0) => {
  const inst = itemsOf(graph)[i].item.hasCourseInstance[0];
  return [inst.startDate, inst.endDate];
};

test('a single-day round has startDate === endDate', () => {
  const graph = build([course(1, [round([day(2026, 10, 20)])])]);
  assert.deepEqual(datesOf(graph), ['2026-10-20', '2026-10-20']);
});

test('a two-day round spans its two days', () => {
  const graph = build([course(1, [round([day(2026, 10, 8), day(2026, 10, 9)])])]);
  assert.deepEqual(datesOf(graph), ['2026-10-08', '2026-10-09']);
});

test('a cross-month round spans the month boundary', () => {
  const graph = build([
    course(1, [round([day(2026, 10, 30), day(2026, 10, 31), day(2026, 11, 1)])]),
  ]);
  assert.deepEqual(datesOf(graph), ['2026-10-30', '2026-11-01']);
});

test('a cross-YEAR round spans the year boundary', () => {
  const graph = build([course(1, [round([day(2026, 12, 30), day(2027, 1, 2)])])]);
  assert.deepEqual(datesOf(graph), ['2026-12-30', '2027-01-02']);
});

test('dates are date-only — no time, no offset, no Z', () => {
  const graph = build([course(1, [round([day(2026, 10, 8), day(2026, 10, 9)])])]);
  for (const value of datesOf(graph)) {
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `not a bare calendar date: ${value}`);
  }
});

test('days out of order still yield first and last', () => {
  const graph = build([
    course(1, [round([day(2026, 10, 9), day(2026, 10, 7), day(2026, 10, 8)])]),
  ]);
  assert.deepEqual(datesOf(graph), ['2026-10-07', '2026-10-09']);
});

/**
 * A non-contiguous round collapses to its outer bounds — the documented
 * trade-off. `[20, 22, 24]` becomes 20→24, not three instances.
 */
test('a non-contiguous round becomes ONE instance spanning first to last', () => {
  const graph = build([
    course(1, [round([day(2026, 10, 20), day(2026, 10, 22), day(2026, 10, 24)])]),
  ]);
  assert.equal(itemsOf(graph)[0].item.hasCourseInstance.length, 1);
  assert.deepEqual(datesOf(graph), ['2026-10-20', '2026-10-24']);
});

test('a duplicated day does not widen or split the instance', () => {
  const graph = build([
    course(1, [round([day(2026, 10, 8), day(2026, 10, 8), day(2026, 10, 9)])]),
  ]);
  assert.equal(itemsOf(graph)[0].item.hasCourseInstance.length, 1);
  assert.deepEqual(datesOf(graph), ['2026-10-08', '2026-10-09']);
});

// ── 5. courseMode mapping, and the unknown value ───────────────────────────

const modeOf = (type) => {
  const graph = build([course(1, [round([day(2026, 10, 20)], { type })])]);
  return itemsOf(graph)[0].item.hasCourseInstance[0];
};

test('classroom maps to onsite', () => {
  assert.equal(modeOf('classroom').courseMode, 'onsite');
});

test('hybrid maps to blended', () => {
  assert.equal(modeOf('hybrid').courseMode, 'blended');
});

/**
 * `online` is a value lib/schedule/trainingTypeLabel knows and this map
 * deliberately does not. A plausible mapping exists, which is exactly why not
 * guessing it has to be asserted — otherwise someone adds it as an obvious
 * omission.
 */
test('online is NOT mapped — courseMode is omitted, not guessed', () => {
  const instance = modeOf('online');
  assert.ok(!('courseMode' in instance), `expected no courseMode, got ${instance.courseMode}`);
});

test('an unknown, absent or empty type omits courseMode entirely', () => {
  for (const type of ['livestream', '', undefined, null, 'CLASSROOM']) {
    const instance = modeOf(type);
    assert.ok(
      !('courseMode' in instance),
      `type ${JSON.stringify(type)} should omit courseMode, got ${instance.courseMode}`
    );
  }
});

test('a round with no courseMode still carries real dates', () => {
  const instance = modeOf('livestream');
  assert.equal(instance.startDate, '2026-10-20');
  assert.equal(instance.endDate, '2026-10-20');
});

// ── 6. the instance carries ONLY the agreed keys ───────────────────────────

test('a CourseInstance has exactly @type, startDate, endDate, courseMode', () => {
  const instance = modeOf('classroom');
  assert.deepEqual(Object.keys(instance).sort(), [
    '@type',
    'courseMode',
    'endDate',
    'startDate',
  ]);
});

test('no location, instructor, seats, offers, price or status anywhere in the graph', () => {
  const graph = build([
    course(1, [
      round([day(2026, 10, 8), day(2026, 10, 9)], {
        status: 'full',
        seats: 3,
        seats_remaining: 0,
        price_override: 9900,
        signup_url: 'https://example.invalid/x',
        location: 'บางกอก',
        instructor: 'someone',
      }),
    ], { course_price: 12900 }),
  ]);
  const serialised = JSON.stringify(graph);
  for (const forbidden of [
    'location', 'instructor', 'seats', 'offers', 'availability',
    'price', '9900', '12900', 'full', 'signup_url',
  ]) {
    assert.ok(!serialised.includes(forbidden), `${forbidden} leaked into the schedule graph`);
  }
});

// ── 7. rounds with no dates are omitted ───────────────────────────────────

test('a round with absent, empty or unparseable dates is omitted', () => {
  for (const dates of [undefined, null, [], ['', null, undefined], ['not a date']]) {
    const graph = build([
      course(1, [round([day(2026, 10, 20)]), { _id: 'bad', status: 'open', type: 'classroom', dates }]),
    ]);
    const instances = itemsOf(graph)[0].item.hasCourseInstance;
    assert.equal(instances.length, 1, `dates ${JSON.stringify(dates)} should have been dropped`);
    assert.equal(instances[0].startDate, '2026-10-20');
  }
});

/**
 * A `null` inside `dates` used to render as `1 ม.ค. 13` — new Date(null) is the
 * epoch, not an Invalid Date. Sharing calendarDays is what keeps that filtered.
 */
test('a null among real days does not become a 1970 training date', () => {
  const graph = build([
    course(1, [round([null, day(2026, 10, 8), day(2026, 10, 9)])]),
  ]);
  assert.deepEqual(datesOf(graph), ['2026-10-08', '2026-10-09']);
});

test('a course whose every in-window round has no dates is omitted entirely', () => {
  const graph = build([
    course(1, [{ _id: 'x', status: 'open', type: 'classroom', dates: [] }]),
    course(2, [round([day(2026, 10, 20)])]),
  ]);
  assert.equal(itemsOf(graph).length, 1);
  assert.equal(itemsOf(graph)[0].item.name, 'หลักสูตรที่ 2');
});

// ── 8. the month range is the page's default, and it is borrowed ───────────
//
// The section's claims are unchanged — a round past the end is excluded, one in
// the last month is included, the range follows `now`. What moved is the range
// itself: it was a rolling six months the builder derived, and it is now the
// current month through `endKey`. The month literals below follow it.

/**
 * NOW is 2026-10-15 and RANGE_END is 2027-12, so the range is 2026-10 .. 2027-12.
 * A round in January 2028 is one month past the end and must not be listed.
 */
test('a round beyond the range is excluded', () => {
  const graph = build([
    course(1, [round([day(2026, 10, 20)]), round([day(2028, 1, 5)])]),
  ]);
  assert.equal(itemsOf(graph)[0].item.hasCourseInstance.length, 1);
  assert.equal(datesOf(graph)[0], '2026-10-20');
});

test('a round in the LAST month of the range is included', () => {
  // December 2027 — the cap, and the month a six-month window could not reach.
  const graph = build([course(1, [round([day(2027, 12, 28)])])]);
  assert.deepEqual(datesOf(graph), ['2027-12-28', '2027-12-28']);
});

test('a round that the RETIRED six-month window would have hidden is now listed', () => {
  /**
   * The gap the change exists to close, in the one place that proves the graph
   * moved with the page. April 2027 is outside a six-month window opened in
   * October 2026 (which ended 2027-03) and inside the range — so this exact
   * round used to be fetched, joined, rendered, and described to nobody.
   */
  const graph = build([course(1, [round([day(2027, 4, 5)])])]);
  assert.ok(graph, 'the course is in the graph at all');
  assert.deepEqual(datesOf(graph), ['2027-04-05', '2027-04-05']);
});

test('a course whose only round is outside the range is omitted', () => {
  assert.equal(build([course(1, [round([day(2028, 1, 5)])])]), null);
});

/**
 * The cross-month rule roundInWindow exists for: a round starting BEFORE the
 * range but ending inside it is visible. With NOW mid-October the range opens
 * at 2026-10, so a 30 ก.ย. – 1 ต.ค. round must still be listed.
 */
test('a round starting before the range but ending inside it is included', () => {
  const graph = build([course(1, [round([day(2026, 9, 30), day(2026, 10, 1)])])]);
  assert.deepEqual(datesOf(graph), ['2026-09-30', '2026-10-01']);
});

test('the range START follows `now` — it is not pinned', () => {
  /**
   * The same claim as before, re-anchored. The END is an argument now, so what
   * `now` still decides is where the range OPENS — and a round before that
   * month is out of it. Held at one fixed `endKey` so only the start varies.
   */
  const rounds = [round([day(2026, 11, 5)])];
  assert.ok(build([course(1, rounds)]), 'November is inside a range opened in October');
  const later = buildScheduleJsonLd([course(1, rounds)], {
    now: new Date(2027, 0, 15),
    endKey: RANGE_END,
  });
  assert.equal(later, null, 'the same round is BEFORE a range opened in January 2027');
});

test('with NO endKey the range falls back to December of the start year', () => {
  /**
   * The floor, which is what a failed fetch renders. Not a bare one-month
   * range: with `now` in October the fallback still reaches 2026-12, so a
   * November round is described and a 2027 one is not.
   */
  const nov = buildScheduleJsonLd([course(1, [round([day(2026, 11, 5)])])], { now: NOW });
  assert.ok(nov, 'November is inside the fallback range');
  const next = buildScheduleJsonLd([course(1, [round([day(2027, 2, 5)])])], { now: NOW });
  assert.equal(next, null, 'February 2027 is past December 2026');
});

// ── 9. ordering, counts, and the empty cases ──────────────────────────────

test('courses keep the order they were handed in', () => {
  const graph = build([
    course(3, [round([day(2026, 10, 20)])]),
    course(1, [round([day(2026, 10, 21)])]),
    course(2, [round([day(2026, 10, 22)])]),
  ]);
  assert.deepEqual(itemsOf(graph).map((e) => e.item.name), [
    'หลักสูตรที่ 3',
    'หลักสูตรที่ 1',
    'หลักสูตรที่ 2',
  ]);
  assert.deepEqual(itemsOf(graph).map((e) => e.position), [1, 2, 3]);
});

test('numberOfItems equals the number of courses actually listed', () => {
  // Course 2 is deliberately OUT of range so the count cannot pass by simply
  // echoing the input length. Its round moved from 2027-04 to 2028-01 when the
  // range stopped being six months — April is inside the range now.
  const graph = build([
    course(1, [round([day(2026, 10, 20)])]),
    course(2, [round([day(2028, 1, 5)])]),
    course(3, [round([day(2026, 11, 3)])]),
  ]);
  const list = nodeOfType(graph, 'ItemList');
  assert.equal(list.numberOfItems, 2);
  assert.equal(list.numberOfItems, list.itemListElement.length);
});

test('a course lists every one of its in-window rounds', () => {
  const graph = build([
    course(1, [
      round([day(2026, 10, 8), day(2026, 10, 9)]),
      round([day(2026, 11, 12), day(2026, 11, 13)]),
      round([day(2026, 12, 8)]),
    ]),
  ]);
  assert.equal(instancesOf(graph).length, 3);
});

test('no rounds at all → null, so the page emits nothing', () => {
  assert.equal(build([]), null);
  assert.equal(build([course(1, [])]), null);
});

test('the shapes a failed fetch can hand over → null', () => {
  for (const input of [null, undefined, 'not an array', {}]) {
    assert.equal(build(input), null, `${JSON.stringify(input)} should yield null`);
  }
});

test('CONTROL: the graph never carries an empty string at any depth', () => {
  const graph = build([
    course(1, [round([day(2026, 10, 20)], { type: 'livestream' })], { course_teaser: '' }),
  ]);
  const walk = (value, path, out) => {
    if (typeof value === 'string') {
      if (value === '') out.push(path);
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, out);
    }
    return out;
  };
  assert.deepEqual(walk(JSON.parse(JSON.stringify(graph)), '$', []), []);
});

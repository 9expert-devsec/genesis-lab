import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ScheduleCard from '@/components/ScheduleCard';
import { ScheduleCarousel } from '@/components/registration/ScheduleCarousel';
import { CourseScheduleSection } from '@/components/pageBuilder/sections/course_schedule';
import { ScheduleClient } from '@/app/(public)/schedule/_components/ScheduleClient';
import { SearchResults } from '@/app/(public)/search/_components/SearchClient';
import { emptySearchCounts } from '@/lib/search/matchSearch';

/**
 * All FIVE schedule surfaces, rendered.
 *
 * The pure tier proves lib/scheduleStatus classifies correctly. It cannot prove
 * a surface actually consumes it — a call site that kept a local map, or that
 * re-introduced `?? STATUS.open`, passes every pure test. That is what this
 * tier is for, and why each assertion runs against real component output rather
 * than against the module.
 *
 * GREEN = #39b980 everywhere. เปิดรับ / ใกล้เต็ม / เต็ม everywhere.
 */

const GREEN = '#39b980';
const AMBER = '#ffc94a';
const R = (el) => renderToStaticMarkup(el);

const SCHEDS = [
  { _id: 'a', dates: ['2026-10-17', '2026-10-18'], type: 'classroom', status: 'open' },
  { _id: 'b', dates: ['2026-11-02'], type: 'online', status: 'nearly_full' },
  { _id: 'c', dates: ['2026-12-02'], type: 'classroom', status: 'full' },
];

/**
 * FIXTURE TRAP 1 — /schedule defaults its month filter to the CURRENT month
 * through December, so a fixture dated in a past month renders ZERO rows and
 * every "does it say เปิดรับ" assertion passes off the filter dropdown instead
 * of off a badge. Dates must be built relative to today.
 */
const now = new Date();
const inVisibleMonth = (offset) => {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
};
const COURSE = (statuses) => ({
  _id: 'c1',
  course_id: 'MSE-AI',
  course_name: 'AI course',
  course_price: 9000,
  course_trainingdays: 2,
  program: { program_name: 'AI' },
  schedules: statuses.map((status, i) => ({
    _id: `s${i}`, dates: [inVisibleMonth(i)], type: 'classroom', status,
  })),
});
const schedulePage = (statuses) => R(createElement(ScheduleClient, {
  courses: [COURSE(statuses)],
  programs: [{ _id: 'p1', program_name: 'AI' }],
  schedulePDF: null,
  earlyBirdMap: {},
}));

/**
 * FIXTURE TRAP 2 — /search's badge now lives in `SearchResults`, not in
 * `SearchClient`.
 *
 * Search moved to the server: `SearchClient` is a shell that fetches, so a
 * static render of it shows the "type at least 2 characters" prompt and no
 * results at all — which contains no status badge and therefore cannot fail a
 * "not green" assertion. The badge is rendered by the presentational half, fed
 * a ready payload, and that is what this exercises.
 *
 * The course of a round now travels with it as `course_ref` (resolved once in
 * the corpus builder) rather than being looked up through a client-side
 * courseMap — miss that and the row renders "(ไม่ทราบชื่อหลักสูตร)" with no
 * price and, again, nothing that can fail.
 */
const searchPage = (statuses) => R(createElement(SearchResults, {
  status: 'ready',
  term: 'AI course',
  data: {
    counts: { ...emptySearchCounts(), schedules: statuses.length },
    total: statuses.length,
    results: {
      schedules: statuses.map((status, i) => ({
        _id: `s${i}`,
        dates: ['2026-10-17'],
        type: 'classroom',
        status,
        course_ref: {
          _id: 'c1', course_id: 'MSE-AI', course_name: 'AI course', course_price: 9000,
        },
      })),
    },
  },
}));

// Both traps get an explicit guard, so a fixture that silently stops producing
// rows fails loudly instead of passing vacuously.
test('FIXTURE GUARD: the /schedule fixture actually renders schedule rows', () => {
  const html = schedulePage(['open']);
  assert.match(html, /registration\/public\?course=mse-ai/,
    '/schedule rendered no schedule cell — check the month-filter window');
});

test('FIXTURE GUARD: the search fixture actually renders schedule rows', () => {
  const html = searchPage(['open']);
  assert.match(html, /AI course/, 'search rendered no result row — check initialQ and courseMap');
  assert.ok(!html.includes('พิมพ์อย่างน้อย'), 'search fell back to its empty prompt');
});

// ── AC3 — every surface shows เปิดรับ in the one green ──────────────

const OPEN_SURFACES = {
  ScheduleCard: () => R(createElement(ScheduleCard, { status: 'open', dateLabel: '17-18\nOCT' })),
  ScheduleCarousel: () => R(createElement(ScheduleCarousel, { schedules: SCHEDS, onSelect() {} })),
  course_schedule: () => R(CourseScheduleSection({ content: { courseId: 'MSE-AI' }, data: SCHEDS })),
  ScheduleClient: () => schedulePage(['open']),
  SearchClient: () => searchPage(['open']),
};

for (const [name, render] of Object.entries(OPEN_SURFACES)) {
  test(`${name}: open renders เปิดรับ in ${GREEN}`, () => {
    const html = render();
    assert.ok(html.includes('เปิดรับ'), `${name} did not render เปิดรับ`);
    assert.ok(html.includes(GREEN), `${name} did not use ${GREEN}`);
  });
}

test('no surface reintroduces the pre-unification status colours', () => {
  // Scoped to the tokens each surface actually used for its STATUS badge —
  // `text-9e-action` for instance is still a legitimate icon colour in
  // course_schedule, so a blanket search would be a false positive.
  const stale = {
    ScheduleCarousel: ['bg-9e-brand/10'],          // the blue open pill
    course_schedule: ['9e-green-900', '9e-orange-900'], // the other green/amber
  };
  for (const [name, tokens] of Object.entries(stale)) {
    const html = OPEN_SURFACES[name]();
    for (const token of tokens) {
      assert.ok(!html.includes(token), `${name} still carries the pre-unification token ${token}`);
    }
  }
});

// ── AC4 — nearly_full, both spellings, amber and explicitly not green ──

for (const key of ['nearly_full', 'nearFull']) {
  test(`ScheduleCard: status="${key}" renders ใกล้เต็ม in amber, NOT green`, () => {
    const html = R(createElement(ScheduleCard, { status: key, dateLabel: '17-18\nOCT' }));
    assert.ok(html.includes('ใกล้เต็ม'), `${key} did not render ใกล้เต็ม`);
    assert.ok(html.includes(AMBER), `${key} did not use ${AMBER}`);
    assert.ok(!html.includes(GREEN), `${key} rendered the open green — it is not open`);
    assert.ok(!html.includes('เปิดรับ'), `${key} rendered the open label`);
  });
}

test('every surface renders ใกล้เต็ม for nearly_full', () => {
  const cases = {
    ScheduleCarousel: R(createElement(ScheduleCarousel, { schedules: SCHEDS, onSelect() {} })),
    course_schedule: R(CourseScheduleSection({ content: { courseId: 'MSE-AI' }, data: SCHEDS })),
    ScheduleClient: schedulePage(['nearly_full']),
    SearchClient: searchPage(['nearly_full']),
  };
  for (const [name, html] of Object.entries(cases)) {
    assert.ok(html.includes('ใกล้เต็ม'), `${name} did not render ใกล้เต็ม`);
    assert.ok(html.includes(AMBER), `${name} did not use ${AMBER}`);
  }
});

test('every surface renders เต็ม for full', () => {
  assert.ok(R(createElement(ScheduleCard, { status: 'full', dateLabel: '1\nJAN' })).includes('เต็ม'));
  assert.ok(R(createElement(ScheduleCarousel, { schedules: SCHEDS, onSelect() {} })).includes('เต็ม'));
  assert.ok(R(CourseScheduleSection({ content: { courseId: 'MSE-AI' }, data: SCHEDS })).includes('เต็ม'));
  assert.ok(schedulePage(['full']).includes('เต็ม'));
  assert.ok(searchPage(['full']).includes('เต็ม'));
});

/**
 * THE UNKNOWN-STATUS CONTROL.
 *
 * Four of the five surfaces used to end their lookup with `?? STATUS.open`, so
 * an unrecognised status advertised the session as taking bookings. These
 * assert on the ABSENCE of the open green and the open label — not on whatever
 * neutral treatment replaced them — so they fail for exactly one reason:
 * something unknown was rendered as open.
 *
 * Verified to fail when the resolver's null path is reverted to a green
 * default: all five cases below go red, plus the two pure-tier fallback tests.
 */
const UNKNOWN = 'totally_unknown_status';
const count = (haystack, needle) => haystack.split(needle).length - 1;

/**
 * Rendered twice per surface, once with a real `open` row and once with the
 * same fixture carrying an unrecognised status. The assertion is DIFFERENTIAL:
 * the unknown render must contain strictly fewer occurrences of the green and
 * of the open label than the open render.
 *
 * Differential rather than absolute because three of these surfaces render page
 * chrome that legitimately contains both — the /schedule status filter has an
 * `<option>เปิดรับ`, and SearchClient has `title="…เปิดรับสมัคร"`. Chrome
 * contributes equally to both renders and cancels out; only the badge moves.
 */
const UNKNOWN_SURFACES = {
  ScheduleCard: (status) => R(createElement(ScheduleCard, { status, dateLabel: '1\nJAN' })),
  ScheduleCarousel: (status) => R(createElement(ScheduleCarousel, {
    schedules: [{ _id: 'x', dates: ['2026-10-17'], type: 'classroom', status }],
    onSelect() {},
  })),
  course_schedule: (status) => R(CourseScheduleSection({
    content: { courseId: 'MSE-AI' },
    data: [{ _id: 'x', dates: ['2026-10-17'], type: 'classroom', status }],
  })),
  ScheduleClient: (status) => schedulePage([status]),
  SearchClient: (status) => searchPage([status]),
};

for (const [name, render] of Object.entries(UNKNOWN_SURFACES)) {
  test(`${name}: an unrecognised status is NOT rendered as open`, () => {
    const openHtml = render('open');
    const unknownHtml = render(UNKNOWN);

    // Sanity: the open render must actually contain a green badge, or the
    // comparison below is vacuous.
    assert.ok(count(openHtml, GREEN) > 0, `${name}: the open fixture produced no green badge`);
    assert.ok(count(openHtml, 'เปิดรับ') > 0, `${name}: the open fixture produced no เปิดรับ`);

    assert.ok(
      count(unknownHtml, GREEN) < count(openHtml, GREEN),
      `${name} painted an unrecognised status with the open green ${GREEN} `
      + `(${count(unknownHtml, GREEN)} vs ${count(openHtml, GREEN)} occurrences)`
    );
    assert.ok(
      count(unknownHtml, 'เปิดรับ') < count(openHtml, 'เปิดรับ'),
      `${name} labelled an unrecognised status as open `
      + `(${count(unknownHtml, 'เปิดรับ')} vs ${count(openHtml, 'เปิดรับ')} occurrences)`
    );
  });
}

test('CONTROL: those same surfaces DO render green for a genuinely open row', () => {
  // Without this, neutralising every badge everywhere would pass the block
  // above. The unknown-status tests must fail for the right reason.
  for (const [name, render] of Object.entries(OPEN_SURFACES)) {
    const html = render();
    assert.ok(html.includes(GREEN) && html.includes('เปิดรับ'),
      `${name} lost its open treatment`);
  }
});

test('an unrecognised status is shown verbatim rather than hidden', () => {
  // Hiding is how the original defect stayed invisible; the raw value surfaces.
  const html = R(createElement(ScheduleCard, { status: UNKNOWN, dateLabel: '1\nJAN' }));
  assert.ok(html.includes(UNKNOWN), 'the unrecognised value should be visible for debugging');
});

// ── AC5 — the filter dropdown is generated from the badge source ────

test('/schedule filter options match the badge labels exactly', () => {
  const html = schedulePage(['open']);
  assert.match(html, /<option value="open">เปิดรับ<\/option>/);
  assert.match(html, /<option value="nearly_full">ใกล้เต็ม<\/option>/);
  assert.match(html, /<option value="full">เต็ม<\/option>/);
});

test('the filter offers exactly the three states, plus "all"', () => {
  const html = schedulePage(['open']);
  const statusOptions = [...html.matchAll(/<option value="(open|nearly_full|full)">/g)];
  assert.equal(statusOptions.length, 3, 'the status filter must offer exactly three states');
});

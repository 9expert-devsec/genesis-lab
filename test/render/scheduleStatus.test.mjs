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
import { SCHEDULE_STATUS } from '@/lib/scheduleStatus';

/**
 * All FIVE schedule surfaces, rendered.
 *
 * The pure tier proves lib/scheduleStatus classifies correctly. It cannot prove
 * a surface actually consumes it — a call site that kept a local map, or that
 * re-introduced `?? STATUS.open`, passes every pure test. That is what this
 * tier is for, and why each assertion runs against real component output rather
 * than against the module.
 *
 * GREEN = #39b980 everywhere.
 *
 * ── TWO REGISTERS SINCE THE STATE/ACTION SPLIT ─────────────────────────────
 * A status has a `state` word (what the round IS — the /schedule filter reads
 * this) and an `action` word (what a visitor can DO — every BADGE reads this).
 * For `open` they differ: เปิดรับ vs ลงทะเบียน. For nearly_full and full they
 * are equal on purpose, `full`'s load-bearingly so.
 *
 * The words below are taken FROM the module rather than hard-coded, because
 * this tier's whole job is proving a surface CONSUMES the module — a literal
 * here would still pass against a component that kept a local copy.
 */

const GREEN = '#39b980';
const AMBER = '#ffc94a';
const OPEN_STATE = SCHEDULE_STATUS.open.state;    // เปิดรับ — filter only
const OPEN_ACTION = SCHEDULE_STATUS.open.action;  // ลงทะเบียน — badges only
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

// ── AC3 — every surface shows the open ACTION word in the one green ──

const OPEN_SURFACES = {
  ScheduleCard: () => R(createElement(ScheduleCard, { status: 'open', dateLabel: '17-18\nOCT' })),
  ScheduleCarousel: () => R(createElement(ScheduleCarousel, { schedules: SCHEDS, onSelect() {}, currentYear: 2026 })),
  course_schedule: () => R(CourseScheduleSection({ content: { courseId: 'MSE-AI' }, data: SCHEDS })),
  ScheduleClient: () => schedulePage(['open']),
  SearchClient: () => searchPage(['open']),
};

for (const [name, render] of Object.entries(OPEN_SURFACES)) {
  test(`${name}: open renders ${OPEN_ACTION} in ${GREEN}`, () => {
    /**
     * The ACTION word, and this is the assertion that stopped being vacuous.
     *
     * It used to look for เปิดรับ over the whole page. Once the split landed,
     * ScheduleClient went green on this WITHOUT ITS BADGE SAYING ANYTHING —
     * /schedule renders a status filter whose `<option>` carries เปิดรับ, and
     * `html.includes` cannot tell a dropdown from a badge. That is FIXTURE
     * TRAP 1 in this file's own header, arriving through a different door.
     *
     * ลงทะเบียน appears in no chrome on any of these five surfaces (verified),
     * so a hit can only have come from a badge.
     */
    const html = render();
    assert.ok(html.includes(OPEN_ACTION), `${name} did not render ${OPEN_ACTION}`);
    assert.ok(html.includes(GREEN), `${name} did not use ${GREEN}`);
  });
}

test('the open STATE word appears only where a state belongs — the filter', () => {
  /**
   * The other half of the split, asserted where it can actually be seen. Four
   * of the five surfaces render no filter, so เปิดรับ must not appear in them
   * at all; if it does, a badge has gone back to reading the state word.
   */
  for (const name of ['ScheduleCard', 'ScheduleCarousel', 'course_schedule']) {
    const html = OPEN_SURFACES[name]();
    assert.ok(
      !html.includes(OPEN_STATE),
      `${name} rendered the STATE word ${OPEN_STATE} — badges carry the action word`
    );
    assert.ok(html.includes(OPEN_ACTION), `${name} lost its badge entirely`);
  }
  // /schedule DOES carry it, in its status filter and nowhere else.
  assert.ok(schedulePage(['open']).includes(OPEN_STATE), '/schedule lost its status filter wording');
});

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
    // The open BADGE word. Checking the state word here would be vacuous:
    // เปิดรับ never appears in a ScheduleCard at all any more.
    assert.ok(!html.includes(OPEN_ACTION), `${key} rendered the open action word`);
  });
}

test('every surface renders ใกล้เต็ม for nearly_full', () => {
  const cases = {
    ScheduleCarousel: R(createElement(ScheduleCarousel, { schedules: SCHEDS, onSelect() {}, currentYear: 2026 })),
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
  assert.ok(R(createElement(ScheduleCarousel, { schedules: SCHEDS, onSelect() {}, currentYear: 2026 })).includes('เต็ม'));
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
 * Differential rather than absolute, and the reason has CHANGED with the
 * state/action split — recorded rather than left as prose describing the old
 * shape.
 *
 * It used to be that chrome legitimately carried the same word as the badge:
 * /schedule's status filter had an `<option>เปิดรับ` and SearchClient a
 * `title="…เปิดรับสมัคร"`, both of which a badge assertion could pass off.
 * The needle is now the ACTION word, which no chrome on any of these five
 * surfaces carries — so today an absolute count would work.
 *
 * It stays differential anyway. The property being tested is "the badge
 * MOVED", and a differential says exactly that regardless of what else the
 * page happens to contain; an absolute count silently becomes a chrome
 * assertion the first time someone adds a ลงทะเบียน button to the page.
 */
const UNKNOWN_SURFACES = {
  ScheduleCard: (status) => R(createElement(ScheduleCard, { status, dateLabel: '1\nJAN' })),
  ScheduleCarousel: (status) => R(createElement(ScheduleCarousel, {
    schedules: [{ _id: 'x', dates: ['2026-10-17'], type: 'classroom', status }],
    onSelect() {},
    currentYear: 2026,
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
    assert.ok(count(openHtml, OPEN_ACTION) > 0, `${name}: the open fixture produced no ${OPEN_ACTION}`);

    assert.ok(
      count(unknownHtml, GREEN) < count(openHtml, GREEN),
      `${name} painted an unrecognised status with the open green ${GREEN} `
      + `(${count(unknownHtml, GREEN)} vs ${count(openHtml, GREEN)} occurrences)`
    );
    assert.ok(
      count(unknownHtml, OPEN_ACTION) < count(openHtml, OPEN_ACTION),
      `${name} labelled an unrecognised status as open `
      + `(${count(unknownHtml, OPEN_ACTION)} vs ${count(openHtml, OPEN_ACTION)} occurrences)`
    );
  });
}

test('CONTROL: those same surfaces DO render green for a genuinely open row', () => {
  // Without this, neutralising every badge everywhere would pass the block
  // above. The unknown-status tests must fail for the right reason.
  for (const [name, render] of Object.entries(OPEN_SURFACES)) {
    const html = render();
    assert.ok(html.includes(GREEN) && html.includes(OPEN_ACTION),
      `${name} lost its open treatment`);
  }
});

test('an unrecognised status is shown verbatim rather than hidden', () => {
  // Hiding is how the original defect stayed invisible; the raw value surfaces.
  const html = R(createElement(ScheduleCard, { status: UNKNOWN, dateLabel: '1\nJAN' }));
  assert.ok(html.includes(UNKNOWN), 'the unrecognised value should be visible for debugging');
});

// ── AC5 — the filter dropdown is generated from the status source ───

test('/schedule filter options are the STATE words, not the action words', () => {
  /**
   * The filter is the ONE surface that reads `state`, and the only place the
   * open state word is allowed to appear. It offered
   * `<option value="open">ลงทะเบียน</option>` for as long as a single constant
   * served both registers — a command where the reader is picking a state to
   * filter by.
   *
   * Spelled as literals rather than interpolated from the module on purpose:
   * this is the assertion that should DISAGREE if the module's vocabulary moves,
   * rather than following it silently.
   */
  const html = schedulePage(['open']);
  assert.ok(
    !html.includes('<option value="open">ลงทะเบียน'),
    'the status filter is carrying the ACTION word again'
  );
  assert.match(html, /<option value="open">เปิดรับ<\/option>/);
  assert.match(html, /<option value="nearly_full">ใกล้เต็ม<\/option>/);
  assert.match(html, /<option value="full">เต็ม<\/option>/);
});

test('the filter offers exactly the three states, plus "all"', () => {
  const html = schedulePage(['open']);
  const statusOptions = [...html.matchAll(/<option value="(open|nearly_full|full)">/g)];
  assert.equal(statusOptions.length, 3, 'the status filter must offer exactly three states');
});

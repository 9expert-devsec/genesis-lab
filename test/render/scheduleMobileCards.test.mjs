import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ScheduleBoard,
  courseRounds,
} from '@/app/(public)/schedule/_components/ScheduleClient';
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  addMonths,
  monthLabel,
  monthLabelWithYear,
  rollingWindow,
  windowBetween,
} from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters } from '@/lib/schedule/scheduleFilters';
import { siteDateParts } from '@/lib/articlePublishTime';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { scrollTrackInset } from '@/lib/schedule/scheduleTableLayout';

/**
 * /schedule's MOBILE CARD layout, rendered.
 *
 * Below `lg` the table is replaced by one card per course. Everything the table
 * cell carried has to survive the port — the type dot, the status badge and its
 * blank-status omission, Early Bird, the cross-month date label, the registration
 * href — and each of those is a SILENT loss: no error, no blank space, just a
 * fact that stopped being on the phone. So each gets its own assertion here.
 *
 * ── WHY THE FIXTURE IS BUILT RELATIVE TO TODAY ──────────────────────────────
 * Same reason as scheduleMonthColumns.test.mjs: the default month window rolls
 * from the current month and nothing in this suite can move the clock. A fixture
 * dated in a fixed month renders zero rounds for most of the year, and every
 * "does the card show X" assertion then passes off page chrome instead of off a
 * card. Every date below is derived from the window.
 *
 * ── WHY `ScheduleBoard` AND NOT `ScheduleClient` ────────────────────────────
 * ScheduleClient owns the filter state; ScheduleBoard renders both layouts as a
 * pure function of it. Driving the board directly is what lets a static render
 * ask "what does the page look like with the type filter set to hybrid" without
 * a DOM to click in. It is the same component tree the page renders — the shell
 * adds state and nothing else.
 */

const now = new Date();
const WINDOW = rollingWindow(now, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
const OPTIONS = rollingWindow(now, PUBLIC_SCHEDULE_FILTER_HORIZON);
const DEFAULTS = defaultScheduleFilters(now);

// The year the card measures `showYear: 'auto'` against, in Asia/Bangkok — the
// same derivation the page itself does, off the same instant WINDOW came from.
// `formatRoundDays` THROWS rather than reading a clock, so ScheduleBoard has to
// be handed one; a harness that omitted it would fail loudly here rather than
// render the wrong year in production. That is the intended failure mode.
const CURRENT_YEAR = siteDateParts(now).year;

const BEFORE = addMonths(WINDOW[0], -1);
const AFTER = addMonths(WINDOW[WINDOW.length - 1], 1);

const dayIn = (key, day) => `${key}-${String(day).padStart(2, '0')}`;

/** The last day of the month a `YYYY-MM` key names. */
const lastDayOf = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/**
 * A round that STARTS in WINDOW[1] and ENDS in WINDOW[2] — the cross-month case
 * `formatDateLabel` has its own branch for, and the case a card cannot render
 * by appending the bucket's month.
 */
const CROSS_START = lastDayOf(WINDOW[1]);
const CROSS = {
  _id: 's-cross',
  dates: [dayIn(WINDOW[1], CROSS_START), dayIn(WINDOW[2], 2)],
  type: 'classroom',
  status: 'open',
};

const COURSE = {
  _id: 'c1',
  course_id: 'POWER-BI',
  course_name: 'Power BI Desktop for Business Analytics',
  course_price: 8500,
  course_trainingdays: 2,
  program: { program_name: 'Data' },
  schedules: [
    // Deliberately NOT in date order: the card must sort, the buckets do not.
    CROSS,
    { _id: 's-in-2', dates: [dayIn(WINDOW[1], 3), dayIn(WINDOW[1], 4)], type: 'classroom', status: 'open' },
    { _id: 's-in-1', dates: [dayIn(WINDOW[0], 3), dayIn(WINDOW[0], 4)], type: 'classroom', status: 'open' },
    { _id: 's-hybrid', dates: [dayIn(WINDOW[2], 1)], type: 'hybrid', status: 'nearly_full' },
    { _id: 's-blank', dates: [dayIn(WINDOW[3], 9)], type: 'classroom', status: '' },
    { _id: 's-past', dates: [dayIn(BEFORE, 15)], type: 'classroom', status: 'open' },
    { _id: 's-after', dates: [dayIn(AFTER, 15)], type: 'classroom', status: 'open' },
  ],
};

const PROGRAMS = [{ _id: 'p1', program_name: 'Data' }];

const renderBoard = (overrides = {}) =>
  renderToStaticMarkup(
    createElement(ScheduleBoard, {
      courses: [COURSE],
      programs: PROGRAMS,
      schedulePDF: null,
      earlyBirdMap: {},
      filters: DEFAULTS,
      defaults: DEFAULTS,
      currentYear: CURRENT_YEAR,
      monthOptions: OPTIONS,
      onFilterChange() {},
      onReset() {},
      sheetOpen: false,
      onSheetOpenChange() {},
      ...overrides,
    }),
  );

/** The desktop table's markup only — `<table>` does not nest. */
const tableRegion = (html) => (html.match(/<table[\s\S]*?<\/table>/g) ?? []).join('');
/** The mobile cards' markup only — `<article>` does not nest here either. */
const cardRegion = (html) => (html.match(/<article[\s\S]*?<\/article>/g) ?? []).join('');

/** The schedule ids reachable from a region, in document order. */
const roundIds = (region) =>
  [...region.matchAll(/&amp;class=([^"&]+)/g)].map((m) => m[1]);

/** schedule id → the registration href built for it, per region. */
const hrefById = (region) => {
  const out = {};
  for (const m of region.matchAll(/href="(\/registration\/public[^"]*class=([^"&]+))"/g)) {
    out[m[2]] = m[1];
  }
  return out;
};

// ── THE TEST THIS BATCH EXISTS FOR ──────────────────────────────────────────

test('a card lists exactly the windowed rounds that pass sessionMatches', () => {
  /**
   * The whole risk of a second layout: it can silently disagree with the first.
   * The table renders one cell per visible month and filters each through
   * `sessionMatches`; a card that walked `course.schedules` would additionally
   * show the round before the window, the round after it, and the hybrid round
   * the type filter excluded — on a viewport where nothing else is on screen to
   * contradict it.
   */
  const html = renderBoard({ filters: { ...DEFAULTS, type: 'classroom' } });
  const cards = roundIds(cardRegion(html));

  assert.deepEqual(
    cards,
    ['s-in-1', 's-in-2', 's-cross', 's-blank'],
    'the card must list the in-window classroom rounds, in date order',
  );
});

test('the card and the table agree, round for round', () => {
  // Stated as an EQUALITY between the two layouts rather than as two literals:
  // a change to the window or the matcher must move both or fail here.
  const html = renderBoard({ filters: { ...DEFAULTS, type: 'classroom' } });
  const fromTable = roundIds(tableRegion(html));
  const fromCard = roundIds(cardRegion(html));

  assert.ok(fromTable.length > 0, 'the table rendered no rounds — fixture is out of window');
  assert.deepEqual(
    [...fromCard].sort(),
    [...fromTable].sort(),
    'the two layouts must show the same set of rounds',
  );
});

test('CONTROL: an unfiltered card WOULD show more rounds than the table does', () => {
  /**
   * Without this the agreement above is satisfiable by a card that renders
   * nothing at all, and by a fixture whose every round happens to be visible.
   * `courseRounds` is called here the way a careless card would call it — every
   * month the course touches, no matcher — and must come out strictly larger.
   *
   * It takes a FLAT LIST now, not per-month buckets. The buckets were only ever
   * safe because a round lived in exactly one of them (the month of its first
   * date), which is the bucketing defect this commit removes: under a span-based
   * rule a cross-month round appears in two buckets and a bucket walk would
   * emit it twice.
   *
   * The window goes through `windowBetween` rather than being a SET of the
   * months the fixture happens to mention. `roundSpanIndices` — which is what
   * decides "is this round in view" — maps a month key to a column INDEX by
   * arithmetic, so it requires a CONTIGUOUS list. Handed a set with a hole in
   * it, it computes an index past the end and silently drops the round beyond
   * the gap, which is what this control caught on its first run.
   */
  const touched = COURSE.schedules
    .flatMap((s) => s.dates.map((d) => d.slice(0, 7)))
    .sort();
  const everyMonth = windowBetween(touched[0], touched[touched.length - 1]);
  const naive = courseRounds(COURSE.schedules, everyMonth, () => true).map((s) => s._id);

  const html = renderBoard({ filters: { ...DEFAULTS, type: 'classroom' } });
  const shown = roundIds(cardRegion(html));

  assert.ok(
    naive.length > shown.length,
    `an unfiltered card would show ${naive.length} rounds; the real one shows ${shown.length}`,
  );
  for (const id of ['s-past', 's-after', 's-hybrid']) {
    assert.ok(naive.includes(id), `the naive list must contain ${id}`);
    assert.equal(shown.includes(id), false, `${id} must NOT be on the card`);
  }
});

test('the type filter moves the card, not just the table', () => {
  // The other direction of the same claim: switch to hybrid and the card must
  // follow. A card wired to an unfiltered list passes every assertion above
  // except this one.
  const html = renderBoard({ filters: { ...DEFAULTS, type: 'hybrid' } });
  assert.deepEqual(roundIds(cardRegion(html)), ['s-hybrid']);
  assert.deepEqual(roundIds(tableRegion(html)), ['s-hybrid']);
});

test('the status filter moves the card too', () => {
  const html = renderBoard({ filters: { ...DEFAULTS, status: 'nearly_full' } });
  assert.deepEqual(roundIds(cardRegion(html)), ['s-hybrid']);
});

test('a narrowed month window narrows the card', () => {
  const html = renderBoard({
    filters: { ...DEFAULTS, monthFrom: WINDOW[0], monthTo: WINDOW[0] },
  });
  assert.deepEqual(roundIds(cardRegion(html)), ['s-in-1']);
});

// ── The href is built once, so both layouts must produce the same string ────

test('the round row href equals the table cell href for the same schedule', () => {
  const html = renderBoard();
  const fromTable = hrefById(tableRegion(html));
  const fromCard = hrefById(cardRegion(html));

  assert.ok(Object.keys(fromTable).length >= 4, 'the table produced too few links to compare');
  assert.deepEqual(
    fromCard,
    fromTable,
    'the two layouts must build byte-identical registration links',
  );
  // …and the link really is the round-specific one, not a bare course link.
  for (const href of Object.values(fromCard)) {
    assert.match(href, /^\/registration\/public\?course=power-bi&amp;class=/);
  }
});

test('a round with no _id falls back to signup_url on BOTH layouts', () => {
  const course = {
    ...COURSE,
    _id: 'c2',
    schedules: [
      { dates: [dayIn(WINDOW[0], 8)], type: 'classroom', status: 'open', signup_url: 'https://example.com/x' },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(ScheduleBoard, {
      courses: [course],
      programs: PROGRAMS,
      schedulePDF: null,
      earlyBirdMap: {},
      filters: DEFAULTS,
      defaults: DEFAULTS,
      currentYear: CURRENT_YEAR,
      monthOptions: OPTIONS,
      onFilterChange() {},
      onReset() {},
      sheetOpen: false,
      onSheetOpenChange() {},
    }),
  );
  const count = (s) => s.split('https://example.com/x').length - 1;
  assert.equal(count(tableRegion(html)), 1, 'the table cell links to signup_url');
  assert.equal(count(cardRegion(html)), 1, 'and so does the card row');
});

// ── What had to survive the port ────────────────────────────────────────────

test('the type dot renders on a card round, in the legend colours', () => {
  const html = renderBoard();
  const cards = cardRegion(html);
  assert.match(cards, /background-color:#00CCFF/, 'classroom dot missing from the card');
  assert.match(cards, /background-color:#8B5CF6/, 'hybrid dot missing from the card');
});

test('CONTROL: the dot probe distinguishes the two type colours', () => {
  // A card rendering every round in one colour would pass a single-colour probe.
  const onlyHybrid = cardRegion(renderBoard({ filters: { ...DEFAULTS, type: 'hybrid' } }));
  assert.match(onlyHybrid, /background-color:#8B5CF6/);
  assert.equal(/background-color:#00CCFF/.test(onlyHybrid), false, 'no classroom dot should remain');
});

test('the status badge renders on a card round', () => {
  const cards = cardRegion(renderBoard());
  assert.ok(cards.includes('เปิดรับ'), 'open badge missing from the card');
  assert.ok(cards.includes('ใกล้เต็ม'), 'nearly_full badge missing from the card');
  assert.ok(cards.includes('text-[#39b980]'), 'the open green is not the badge colour');
});

test('a BLANK status renders no badge at all — not a default label', () => {
  /**
   * `resolveScheduleBadge` returns null for a missing status and the table omits
   * the element entirely. Substituting "เปิดรับ" would advertise a session as
   * taking bookings on no evidence — the exact defect lib/scheduleStatus exists
   * to prevent — and on a card it would be the most prominent thing in the row.
   *
   * Scoped to the ROW for s-blank, so the other rounds' badges cannot satisfy it.
   */
  const cards = cardRegion(renderBoard());
  const rows = cards.match(/<li[\s\S]*?<\/li>/g) ?? [];
  const blankRow = rows.find((r) => r.includes('class=s-blank'));
  assert.ok(blankRow, 'the blank-status round did not render a row');
  for (const label of ['เปิดรับ', 'ใกล้เต็ม', 'เต็ม']) {
    assert.equal(blankRow.includes(label), false, `a blank status must not be labelled ${label}`);
  }
});

test('CONTROL: the same row-scoped probe DOES see a badge on a real status', () => {
  // Without this, a card that dropped every badge would pass the test above.
  const cards = cardRegion(renderBoard());
  const rows = cards.match(/<li[\s\S]*?<\/li>/g) ?? [];
  const openRow = rows.find((r) => r.includes('class=s-in-1'));
  assert.ok(openRow, 'the open round did not render a row');
  assert.ok(openRow.includes('เปิดรับ'), 'the row-scoped probe cannot see a badge that is there');
});

test('Early Bird marks exactly the one schedule the map names', () => {
  const html = renderBoard({ earlyBirdMap: { 'POWER-BI': 's-in-2' } });
  const cards = cardRegion(html);
  const rows = cards.match(/<li[\s\S]*?<\/li>/g) ?? [];

  assert.equal(
    cards.split('Early Bird').length - 1,
    1,
    'exactly one card round may carry the pill',
  );
  const marked = rows.filter((r) => r.includes('Early Bird'));
  assert.equal(marked.length, 1);
  assert.ok(marked[0].includes('class=s-in-2'), 'the pill is on the wrong round');
  assert.ok(marked[0].includes('#D4F73F'), 'the pill lost its colour');
});

test('an empty earlyBirdMap marks nothing — the condition is unchanged', () => {
  // `!!ebScheduleId && s._id === ebScheduleId`: a map with no entry for this
  // course must not make the first round early-bird by accident.
  assert.equal(cardRegion(renderBoard()).includes('Early Bird'), false);
  assert.equal(
    cardRegion(renderBoard({ earlyBirdMap: { 'OTHER-COURSE': 's-in-2' } })).includes('Early Bird'),
    false,
    'another course’s early bird must not leak onto this card',
  );
});

/** Escape a string for use inside a RegExp — the Thai month abbreviations have dots. */
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('a cross-month round LISTS both its months on the card', () => {
  /**
   * The card has no column header to lean on, so the months travel with the row.
   * Two traps, and this round walks into both:
   *
   *   · appending the BUCKET month — the month the round is filed under, which
   *     is its first date — would render it as "30 ต.ค. - 2 ต.ค." and move a
   *     November session into October;
   *   · joining the two days with a RANGE would claim training on every day
   *     between them. This round is the last day of one month and the 2nd of the
   *     next — TWO days with a gap, not a span — and the old formatter printed
   *     exactly that range. It is now a comma list.
   *
   * ── WHY A REGEX AND NOT A LITERAL ───────────────────────────────────────────
   * WINDOW rolls off the real clock. When WINDOW[1] is December the two months
   * are in different YEARS, and `showYear: 'auto'` then puts a 2-digit year on
   * BOTH tokens — `31 ธ.ค. 69, 2 ม.ค. 70` — because each one's neighbour is in
   * another year. So the year is optional between the tokens, and matching it as
   * optional is what makes this assertion mean the same thing in every month.
   */
  const cards = cardRegion(renderBoard());
  const first = `${CROSS_START} ${monthLabel(WINDOW[1])}`;
  const second = `2 ${monthLabel(WINDOW[2])}`;
  const optionalYear = String.raw`(?: \d{2})?`;

  assert.match(
    cards,
    new RegExp(`${rx(first)}${optionalYear}, ${rx(second)}`),
    `expected the cross-month round to read "${first}, ${second}" (year optional)`,
  );
  assert.equal(
    cards.includes(`${first} - `),
    false,
    'a range here claims training on the days between — the defect this replaced',
  );
});

test('a same-month round carries its month ONCE, and no year in the current year', () => {
  const cards = cardRegion(renderBoard());

  // WINDOW[0] is the CURRENT month, so this round is always in the current year.
  assert.ok(
    cards.includes(`3-4 ${monthLabel(WINDOW[0])}`),
    'a same-month range must carry the month once, after the days',
  );
  assert.equal(
    cards.includes(`3-4 ${monthLabelWithYear(WINDOW[0])}`),
    false,
    "showYear:'auto' must NOT print the year for a round in the current year",
  );

  // A single day, three months out. `includes` rather than an equality, because
  // WINDOW[3] may be in the next year, in which case a year follows the month.
  assert.ok(
    cards.includes(`9 ${monthLabel(WINDOW[3])}`),
    'a single-day round must carry its month too',
  );
});

test("CONTROL: the year probes DO tell 'auto' from a constant", () => {
  /**
   * The assertion above is `equal(includes(month + year), false)`, which passes
   * for free if `monthLabelWithYear` returned something no label could contain.
   * So: the two labels must differ, the year form must extend the bare one, and
   * a round that IS in another year must actually show its year somewhere on the
   * page — otherwise 'auto' could be a hardcoded `false` and nothing would say.
   */
  const bare = monthLabel(WINDOW[0]);
  const withYear = monthLabelWithYear(WINDOW[0]);
  assert.notEqual(bare, withYear, 'the two month labels must differ');
  assert.ok(withYear.startsWith(bare), 'the year form extends the bare one');
  assert.match(withYear, /\d{2}$/, 'and ends in a 2-digit Buddhist year');

  // The other direction: force a next-year round through the same card and it
  // must gain a year. Rendered, not reasoned about.
  const nextYear = new Date(CURRENT_YEAR + 1, 5, 16);
  const label = formatRoundDays([nextYear], {
    showMonth: true,
    showYear: 'auto',
    currentYear: CURRENT_YEAR,
  });
  assert.match(label, /\d{2}$/, "a round outside currentYear MUST carry a year under 'auto'");
});

test('CONTROL: the card label is NOT the table label', () => {
  /**
   * The table renders bare day numbers because its header supplies the month.
   * If the card simply reused that string, every assertion above about "3-4"
   * would still find a substring — so the discriminating claim is that the card
   * adds a month the table cell does not have.
   */
  const html = renderBoard();
  const cell = tableRegion(html);
  const cards = cardRegion(html);
  assert.ok(cell.includes('>3-4<'), 'the table cell still shows bare days');
  assert.equal(
    cell.includes(`3-4 ${monthLabelWithYear(WINDOW[0])}`),
    false,
    'the table cell must NOT have grown a month',
  );
  assert.equal(cards.includes('>3-4<'), false, 'the card must not show a bare day range');
});

test('the card carries the course identity the frozen columns used to', () => {
  const cards = cardRegion(renderBoard());
  assert.ok(cards.includes('POWER-BI'), 'course code missing');
  assert.ok(cards.includes('Power BI Desktop for Business Analytics'), 'course name missing');
  assert.ok(cards.includes('2 วัน'), 'training days missing');
  assert.ok(cards.includes('8,500 ฿'), 'price missing');
  assert.ok(cards.includes('ดูรายละเอียดคอร์ส'), 'the course link is missing');
});

test('the program heading sits above the group, once, outside both layouts', () => {
  const html = renderBoard();
  assert.equal(html.split('>Data</h2>').length - 1, 1, 'the heading must not be duplicated');
  assert.equal(tableRegion(html).includes('</h2>'), false, 'the heading is not inside the table');
  assert.equal(cardRegion(html).includes('</h2>'), false, 'nor inside a card');
});

// ── Collapsing a long round list ────────────────────────────────────────────

const manyRounds = (count) => ({
  ...COURSE,
  _id: 'c3',
  schedules: Array.from({ length: count }, (_, i) => ({
    _id: `m${i}`,
    // Two per month, so a long list does not need a long window.
    dates: [dayIn(WINDOW[i % WINDOW.length], 5 + Math.floor(i / WINDOW.length))],
    type: 'classroom',
    status: 'open',
  })),
});

const renderCourse = (course, overrides = {}) =>
  renderToStaticMarkup(
    createElement(ScheduleBoard, {
      courses: [course],
      programs: PROGRAMS,
      schedulePDF: null,
      earlyBirdMap: {},
      filters: DEFAULTS,
      defaults: DEFAULTS,
      currentYear: CURRENT_YEAR,
      monthOptions: OPTIONS,
      onFilterChange() {},
      onReset() {},
      sheetOpen: false,
      onSheetOpenChange() {},
      ...overrides,
    }),
  );

test('a card at the threshold shows every round and no toggle', () => {
  const html = renderCourse(manyRounds(PUBLIC_SCHEDULE_DEFAULT_MONTHS));
  assert.equal(roundIds(cardRegion(html)).length, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
  assert.equal(html.includes('ดูรอบทั้งหมด'), false, 'no toggle is warranted yet');
});

test('a longer card collapses to the threshold behind ดูรอบทั้งหมด (N)', () => {
  const total = PUBLIC_SCHEDULE_DEFAULT_MONTHS + 4;
  const html = renderCourse(manyRounds(total));
  const shown = roundIds(cardRegion(html));
  assert.equal(shown.length, PUBLIC_SCHEDULE_DEFAULT_MONTHS, 'collapsed to the threshold');
  assert.ok(
    html.includes(`ดูรอบทั้งหมด (${total})`),
    'the toggle must name the FULL count, not the hidden remainder',
  );
  // The table is unaffected — it has columns, not a list.
  assert.equal(roundIds(tableRegion(html)).length, total);
});

test('the collapse toggle is a real disclosure, not a link', () => {
  const html = renderCourse(manyRounds(PUBLIC_SCHEDULE_DEFAULT_MONTHS + 4));
  assert.match(html, /aria-expanded="false" aria-controls="[^"]+"/, 'the toggle must be a disclosure button');
});

// ── The two layouts coexist ─────────────────────────────────────────────────

test('the table is hidden below lg and the cards are hidden above it', () => {
  // Matched on the WHOLE class attribute: `hidden` is a substring of `lg:hidden`
  // and would make either assertion pass against the other element.
  const html = renderBoard();
  assert.ok(html.includes('class="hidden lg:block"'), 'the table wrapper must be hidden below lg');
  assert.ok(html.includes('class="flex flex-col gap-4 lg:hidden"'), 'the card list must be hidden from lg up');
});

test('both layouts are in the DOM at once, and nothing keys off a hand-written id', () => {
  /**
   * The cost of the CSS toggle is a duplicated subtree. That is only safe while
   * every id in it is generated: a hand-authored `id="rounds"` would appear
   * twice the moment a second course renders, and `aria-controls` would then
   * point at whichever one the browser found first.
   */
  const long = manyRounds(PUBLIC_SCHEDULE_DEFAULT_MONTHS + 4);
  const html = renderToStaticMarkup(
    createElement(ScheduleBoard, {
      courses: [long, { ...long, _id: 'c4', course_id: 'POWER-BI-2' }],
      programs: PROGRAMS,
      schedulePDF: null,
      earlyBirdMap: {},
      filters: DEFAULTS,
      defaults: DEFAULTS,
      currentYear: CURRENT_YEAR,
      monthOptions: OPTIONS,
      onFilterChange() {},
      onReset() {},
      sheetOpen: false,
      onSheetOpenChange() {},
    }),
  );
  const ids = [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 2, 'the fixture must render at least two generated ids');
  assert.ok(ids.length > 0, 'no ids rendered at all — this guard lost its subject');
  assert.equal(new Set(ids).size, ids.length, `duplicate id in the doubled subtree: ${ids.join(', ')}`);
});

test('CONTROL: the duplicate-id probe DOES fire on a repeated id', () => {
  const collide = '<ul id="rounds"></ul><ul id="rounds"></ul>';
  const ids = [...collide.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(new Set(ids).size, ids.length);
});

test('the hidden table renders no custom scrollbar, and zero width is safe', () => {
  /**
   * Below `lg` the table sits inside `display: none`, so `measure()` reads
   * clientWidth 0 / scrollWidth 0. `overflow` is 0, `needsScroll` stays false,
   * and the track never renders — which is correct, because a scrollbar for an
   * invisible table controls nothing.
   *
   * The arithmetic that would be reached first is pinned here so a future edit
   * to `measure()` that drops the early return produces a number rather than a
   * NaN-width thumb: the inset CLAMPS at a zero-width container.
   */
  const html = renderBoard();
  assert.equal(
    html.includes('cursor-pointer rounded-full bg-gray-200'),
    false,
    'the custom scrollbar track must not render before a measurement',
  );
  assert.equal(scrollTrackInset(0), 0, 'a zero-width container must not produce a negative inset');
  assert.ok(Number.isFinite(scrollTrackInset(0)));
});

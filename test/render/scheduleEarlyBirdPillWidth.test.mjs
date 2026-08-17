import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleBoard } from '@/app/(public)/schedule/_components/ScheduleClient';
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  monthLabel,
  monthLabelWithYear,
  rollingWindow,
} from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters } from '@/lib/schedule/scheduleFilters';
import { siteDateParts } from '@/lib/articlePublishTime';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import {
  FROZEN_COLUMNS,
  MONTH_MIN_WIDTH,
} from '@/lib/schedule/scheduleTableLayout';

/**
 * THE CLIPPED EARLY BIRD PILL — `arly Bir`.
 *
 * ── THE CAUSE ───────────────────────────────────────────────────────────────
 * The month `<td>` stacked its schedules in `flex flex-col items-center`. On a
 * COLUMN flex container `align-items` is the CROSS axis, so `items-center`
 * shrink-wrapped every child to its content width. `ScheduleCell`'s `<a>` has
 * almost no intrinsic content: the dot is 8px, the date is ~30px, and the pill
 * — the one wide thing in there — is `position: absolute` and so contributes
 * NOTHING to intrinsic width. The anchor therefore measured ~35px.
 *
 * `EarlyBirdPill` is `absolute left-0 right-0` against that anchor, so a chip
 * with a ~49px min-content width was laid out in a ~35px containing block, and
 * `overflow-hidden` on the anchor cropped the surplus symmetrically — the
 * leading `E` and the trailing `d`. The pill was being measured against the
 * DATE rather than against the column, which has a 90px floor.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE ───────────────────────────────────────
 * There is no layout engine here, so nothing can observe the clipping itself —
 * the full string is in the SSR markup either way. What IS observable, and what
 * these tests pin, is the mechanism: the wrapper no longer shrink-wraps, so the
 * pill's containing block is the cell rather than the date label. The mutation
 * sweep closes the loop by reverting the wrapper and watching this go red.
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

/**
 * The properties EARLY_BIRD_CHIP owns — word, lime, padding, type, shadow.
 * Corners and flex behaviour are set LOCALLY by each treatment, which is what
 * makes a corner change on one layout unable to move the other.
 */
const EARLY_BIRD_SHARED =
  'whitespace-nowrap bg-[#D4F73F] px-1.5 py-[2px] text-[0.5rem] font-black leading-none text-9e-navy shadow-sm';

const lastDayOf = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const CROSS_START = lastDayOf(WINDOW[0]);

const COURSE = {
  _id: 'c1',
  course_id: 'POWER-BI',
  course_name: 'Power BI',
  course_price: 8500,
  course_trainingdays: 2,
  program: { program_name: 'Data' },
  schedules: [
    { _id: 's-cross', dates: [`${WINDOW[0]}-${CROSS_START}`, `${WINDOW[1]}-02`], type: 'classroom', status: 'open' },
    { _id: 's-near', dates: [`${WINDOW[1]}-08`], type: 'hybrid', status: 'nearly_full' },
  ],
};

const render = (overrides = {}) =>
  renderToStaticMarkup(
    createElement(ScheduleBoard, {
      courses: [COURSE],
      programs: [{ _id: 'p1', program_name: 'Data' }],
      schedulePDF: null,
      earlyBirdMap: { 'POWER-BI': 's-cross' },
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

const tableRegion = (html) => (html.match(/<table[\s\S]*?<\/table>/g) ?? []).join('');
const cardRegion = (html) => (html.match(/<article[\s\S]*?<\/article>/g) ?? []).join('');

/**
 * Every populated month `<td>` of the desktop table, inner markup only.
 *
 * `col[Ss]pan` is OPTIONAL and both spellings are accepted. A cross-month round
 * now renders `<td colSpan="2">`, so the old literal silently skipped the very
 * cell this file is about — `filledCells()[0]` quietly became the round with NO
 * early bird, and the chip assertions failed as "the chip is gone". (React
 * 18.3.1 emits `colSpan` camel-cased while emitting `rowspan` lowercase; HTML
 * attribute names are case-insensitive, so both are correct and both are
 * matched.)
 */
const filledCells = (html) =>
  [...tableRegion(html).matchAll(
    /<td(?: col[Ss]pan="\d+")? class="px-2 py-2 text-center align-middle">([\s\S]*?)<\/td>/g,
  )]
    .map((m) => m[1])
    .filter((c) => c.includes('<a '));

/**
 * The same cells keyed by schedule id.
 *
 * Positional indexing stopped being safe when the table began packing rounds
 * into LANES: document order is lane order, so a cross-month round's neighbour
 * moves to the end of the markup. Every test below that means "the early-bird
 * cell" now says so by name.
 */
const cellById = (html) => {
  const out = {};
  for (const cell of filledCells(html)) {
    const id = cell.match(/&amp;class=([^"&]+)/)?.[1] ?? 'no-link';
    out[id] = cell;
  }
  return out;
};

/**
 * The stacking wrapper's class attribute, matched on the WHOLE value.
 *
 * Scoped deliberately: `items-center` also lives on the inner
 * `flex flex-col items-center gap-0.5` span INSIDE ScheduleCell, which is what
 * centres the dot / date / status and must stay. A whole-document search for
 * `items-center` would report the fix as absent forever.
 */
const wrapperClasses = (cell) => cell.match(/^<div class="([^"]*)">/)?.[1] ?? null;

// ── The wrapper no longer measures the pill against the date ────────────────

test('the month cell stacks its rounds WITHOUT shrink-wrapping them', () => {
  const cells = filledCells(render());
  assert.ok(cells.length > 0, 'no populated month cell rendered — the fixture is out of window');

  const classes = wrapperClasses(cells[0]);
  assert.ok(classes, 'the stacking wrapper is gone');
  assert.equal(
    /\bitems-center\b/.test(classes),
    false,
    `the wrapper shrink-wraps its children again ("${classes}") — the pill is back to `
    + 'being measured against the date label',
  );
  assert.match(classes, /\bflex-col\b/, 'rounds still stack vertically');
  assert.match(classes, /\bgap-2\b/, 'and keep their gap');
});

test('CONTROL: the wrapper probe DOES fire on a shrink-to-content wrapper', () => {
  /**
   * Without this, `items-center` could be absent because the matcher never
   * looks at the wrapper at all — and the assertion above would hold forever.
   * Run against the exact markup this change replaced.
   */
  const before = '<div class="flex flex-col items-center gap-2"><a href="#"></a></div>';
  assert.equal(wrapperClasses(before), 'flex flex-col items-center gap-2');
  assert.ok(/\bitems-center\b/.test(wrapperClasses(before)), 'the probe sees the old wrapper');
  // …and it is reading the live cell, not only a fixture.
  assert.ok(wrapperClasses(filledCells(render())[0]));
});

test('the centring the cell actually relies on is untouched', () => {
  /**
   * The date and the status were never centred by the wrapper — the inner span
   * centres them itself, which is why removing the wrapper rule moves nothing
   * visually. Asserted so a future "simplify" does not delete the rule that IS
   * load-bearing along with the one that was not.
   */
  const cell = cellById(render())['s-cross'];
  // The column moved ONTO the anchor: the round is a bordered box now, so the
  // box and the column are one element instead of an <a> wrapping a <span>.
  // The centring classes are unchanged, which is the claim.
  assert.match(
    cell,
    /<a [^>]*class="[^"]*flex flex-col items-center gap-0\.5/,
    'ScheduleCell must still centre its own dot, date and status',
  );
  // `filledCells` strips the <td>, so the cell's own text-align is checked on
  // the table markup rather than on the extracted inner HTML.
  assert.match(
    tableRegion(render()),
    /<td(?: col[Ss]pan="\d+")? class="px-2 py-2 text-center align-middle">/,
    'and the cell is still text-centred',
  );
});

test('THE PILL IS IN FLOW — it cannot be excluded from its own width again', () => {
  /**
   * The structural end of this bug. An out-of-flow child contributes nothing to
   * its parent's intrinsic width, which is exactly why the anchor could measure
   * ~35px while containing a ~49px chip. As an ordinary child the chip is part
   * of that measurement, so the anchor can never again be narrower than the pill
   * inside it — with or without the wrapper stretch that fixed the symptom.
   *
   * Asserted as the ABSENCE of positioning on the chip, plus the absence of the
   * whole overlay apparatus that only existed to support it.
   */
  const cell = cellById(render())['s-cross'];
  const chip = cell.match(/<span class="([^"]*)">Early Bird<\/span>/)?.[1];
  assert.ok(chip, 'the chip is gone');
  assert.equal(/\babsolute\b/.test(chip), false, `the chip is positioned again: "${chip}"`);
  assert.equal(/\bfixed\b/.test(chip), false);

  assert.equal(
    /pointer-events-none absolute top-0 left-0 right-0/.test(cell),
    false,
    'the overlay wrapper is back',
  );
  assert.equal(
    /justify-center/.test(cell),
    false,
    'the justify-center wrapper — what made the clipping symmetrical — is back',
  );
  assert.equal(/\bpt-3\b/.test(cell), false, 'the hand-kept 12px reservation is back');
  assert.equal(/\bz-10\b/.test(cell), false, 'nothing in the cell needs a stacking order now');

  // Nothing on the anchor caps its width either.
  const anchorClasses = cell.match(/<a href="[^"]*" class="([^"]*)"/)?.[1] ?? '';
  assert.equal(/\bw-\[/.test(anchorClasses), false, 'no hardcoded anchor width');
  assert.equal(/\bmax-w-/.test(anchorClasses), false, 'and no max-width cap');
});

test('CONTROL: the in-flow probes DO fire on the overlay this replaced', () => {
  /**
   * Every assertion above is an absence, and an absence probe that can never
   * match passes forever. Run against the exact markup this change retired.
   */
  const overlay =
    '<a class="group relative block overflow-hidden rounded-sm">'
    + '<span class="pointer-events-none absolute top-0 left-0 right-0 z-10 flex justify-center">'
    + '<span class="rounded-b-sm whitespace-nowrap bg-[#D4F73F]">Early Bird</span></span>'
    + '<span class="flex flex-col items-center gap-0.5 pt-3"></span></a>';
  assert.ok(/pointer-events-none absolute top-0 left-0 right-0/.test(overlay));
  assert.ok(/justify-center/.test(overlay));
  assert.ok(/\bpt-3\b/.test(overlay));
  assert.ok(/\bz-10\b/.test(overlay));
  // …and the live cell really is the thing being read, not a fixture.
  assert.ok(cellById(render())['s-cross'].includes('Early Bird'));
});

test('the chip comes AFTER the status, last in the cell’s column', () => {
  /**
   * dot → date → status → Early Bird. Document order is the whole claim: the
   * pill used to precede the dot (it was painted at the top by position, not by
   * order), and an in-flow chip that stayed first in the markup would render at
   * the top of the column and look like nothing had moved.
   */
  const cell = cellById(render())['s-cross'];
  // The anchor IS the column now — see the centring test above. Its children are
  // everything between the opening <a …> and its </a>.
  const column = cell.match(/<a [^>]*>([\s\S]*?)<\/a>/)?.[1];
  assert.ok(column, 'the cell’s column is gone');

  const dotAt = column.indexOf('background-color:#00CCFF');
  // RE-POINTED with the cell's type scale (date label -> text-sm). This
  // assertion fails on a MISSING ANCHOR, not on ordering, so a stale or
  // mistyped string here would make the four ordering checks below vacuously
  // pass rather than red. Confirmed present in real rendered output at index
  // 107 of the column before this line was changed.
  const dateAt = column.indexOf('text-sm font-bold');
  const statusAt = column.indexOf('ลงทะเบียน');
  const chipAt = column.indexOf('Early Bird');
  for (const [name, at] of [['dot', dotAt], ['date', dateAt], ['status', statusAt], ['chip', chipAt]]) {
    assert.notEqual(at, -1, `${name} is missing from the column`);
  }
  assert.ok(dotAt < dateAt, 'dot before date');
  assert.ok(dateAt < statusAt, 'date before status');
  assert.ok(statusAt < chipAt, 'the Early Bird chip must come LAST, after the status');
});

test('CONTROL: the order probe DOES catch a chip put back at the top', () => {
  // Without this, the ordering assertions would hold against any markup the
  // extractor happened to return, including one where the chip leads.
  const topFirst = '<span>Early Bird</span><span>background-color:#00CCFF</span><span>ลงทะเบียน</span>';
  assert.ok(topFirst.indexOf('Early Bird') < topFirst.indexOf('ลงทะเบียน'), 'the probe can see a leading chip');
  const cell = cellById(render())['s-cross'];
  assert.ok(
    cell.indexOf('ลงทะเบียน') < cell.indexOf('Early Bird'),
    'and the live cell puts the status first',
  );
});

test('the complete label renders — the whole string, not a prefix', () => {
  /**
   * MATCHED AS AN EQUALITY, not as `includes`. The clipped forms this bug
   * produced — `arly Bir`, `Early Bir` — are SUBSTRINGS of the correct label,
   * so an `includes` sweep for them fires on a perfectly good render. Same trap
   * as the Thai labels elsewhere in this suite, wearing Latin letters.
   */
  const cell = cellById(render())['s-cross'];
  const chipText = cell.match(/shadow-sm">([^<]*)<\/span>/)?.[1];
  assert.equal(chipText, 'Early Bird', 'the pill must carry the whole label');
  assert.ok(cell.includes('>Early Bird</span>'), 'and render it as its own text node');
  // `whitespace-nowrap` still keeps it one line; the corner is now fully
  // rounded, because `rounded-b-sm` was a consequence of hanging off an edge.
  assert.match(cell, /rounded-sm whitespace-nowrap bg-\[#D4F73F\]/);
  assert.equal(
    /rounded-b-sm whitespace-nowrap bg-\[#D4F73F\]/.test(cell),
    false,
    'the chip no longer hangs off the cell’s top edge',
  );
});

test('a cell with NO early bird is unchanged by the move', () => {
  /**
   * The common case, and the reason the inner column's className is now a plain
   * literal rather than a template: a cell without a pill never rendered the
   * `pt-3` branch, so removing that branch left its markup byte for byte the
   * same. Pinned against the same golden the affordance suite carries.
   */
  const plain = cellById(render({ earlyBirdMap: {} }))['s-cross'];
  assert.match(plain, /<a [^>]*class="[^"]*flex flex-col items-center gap-0\.5 /,
    'the column classes must be the same literal a plain cell always had');
  assert.equal(plain.includes('Early Bird'), false);
  assert.equal(/\bpt-3\b/.test(plain), false);
  assert.equal(/\babsolute\b/.test(plain), false);
});

// ── Two rounds in one month ─────────────────────────────────────────────────

const twoInOneMonth = {
  ...COURSE,
  _id: 'c2',
  schedules: [
    { _id: 't1', dates: [`${WINDOW[0]}-05`], type: 'classroom', status: 'open' },
    { _id: 't2', dates: [`${WINDOW[0]}-19`], type: 'hybrid', status: 'nearly_full' },
  ],
};

test('two rounds in one month still stack, gapped, with one pill between them', () => {
  const cell = filledCells(render({ courses: [twoInOneMonth], earlyBirdMap: { 'POWER-BI': 't2' } }))[0];
  assert.equal((cell.match(/<a /g) ?? []).length, 2, 'both rounds must survive in the cell');
  assert.match(wrapperClasses(cell), /\bgap-2\b/, 'and stay separated by the existing gap');
  assert.equal(cell.split('Early Bird').length - 1, 1, 'exactly one of them carries the pill');

  // The pill is on t2, not on whichever anchor came first.
  const anchors = cell.match(/<a [\s\S]*?<\/a>/g) ?? [];
  const marked = anchors.filter((a) => a.includes('Early Bird'));
  assert.equal(marked.length, 1);
  assert.ok(marked[0].includes('class=t2'), 'the pill is on the wrong round');
});

test('CONTROL: the one-pill probe DOES notice two', () => {
  // Without this, a cell that rendered no pill at all would pass the count.
  const both = '<div><a>Early Bird</a><a>Early Bird</a></div>';
  assert.equal(both.split('Early Bird').length - 1, 2);
  const cell = filledCells(render({ courses: [twoInOneMonth], earlyBirdMap: { 'POWER-BI': 't2' } }))[0];
  assert.ok(cell.includes('Early Bird'), 'the live cell really does carry one');
});

// ── The columns did not get wider to make room ──────────────────────────────

test('the fix bought the width from layout, not from the column geometry', () => {
  /**
   * The rejected alternative was raising MONTH_MIN_WIDTH, which widens EVERY
   * column on the page to serve the minority of cells that carry a pill. Pinned
   * so that a later "it still looks tight" does not quietly take that route.
   */
  assert.equal(MONTH_MIN_WIDTH, 90, 'the month column floor must not have moved');
  assert.deepEqual(
    FROZEN_COLUMNS.map((c) => c.width),
    [120, 360, 60, 100],
    'nor may the frozen columns have been re-cut',
  );
});

// ── The mobile card is untouched ────────────────────────────────────────────

/**
 * The mobile early-bird row, frozen BEFORE this change.
 *
 * `EarlyBirdPill` and `EarlyBirdTag` share `EARLY_BIRD_CHIP`, so the obvious
 * wrong fix — shrinking or re-padding the chip until it fits the 35px anchor —
 * would have moved the card's inline tag too, on a layout settled one round
 * ago. The fix touched neither the chip nor the tag, and this is how that is
 * known rather than assumed.
 *
 * ── RE-BASELINED: THE DATE LABEL ────────────────────────────────────────────
 * The date moved to the shared formatter (lib/schedule/roundDateLabel). This
 * fixture round is the last day of one month and the 2nd of the next — TWO
 * days with a gap — and the retired formatter printed it as a RANGE,
 * `31 ส.ค. - 2 ก.ย. 69`, claiming training on every day between. It now reads
 * `31 ส.ค., 2 ก.ย.`, and the year is gone because `showYear: 'auto'` omits it
 * for a round in the current year.
 *
 * RE-CAPTURED FROM RENDERED OUTPUT. The full row was printed from a real
 * ScheduleBoard render and diffed against this constant; the ONLY delta was the
 * text inside the date `<span>`. Every class, the inline `style`, the attribute
 * order, the chip and the chevron `<svg>` were unchanged — which is exactly the
 * claim this golden exists to make.
 *
 * The date is interpolated through the formatter rather than written out for
 * the same reason as in scheduleRoundRowAffordance: WINDOW rolls off the real
 * clock, so in November these two months straddle a year and 'auto' adds a year
 * to BOTH tokens. No literal survives that. The label's CONTENT is pinned by
 * test/pure/roundDateLabel against fixed dates; what this constant pins is
 * everything around it.
 */
const CARD_DATE_LABEL = formatRoundDays(
  [`${WINDOW[0]}-${CROSS_START}`, `${WINDOW[1]}-02`],
  { showMonth: true, showYear: 'auto', currentYear: CURRENT_YEAR },
);

const CARD_EARLY_BIRD_ROW =
  '<li><a href="/registration/public?course=power-bi&amp;class=s-cross" '
  + 'class="flex min-h-[44px] w-full items-center gap-3 rounded-9e-md border border-[var(--surface-border)] '
  + 'bg-9e-ice px-3 py-2 dark:bg-[#0f1e30] transition-all duration-9e-micro ease-9e active:scale-[0.99] '
  + 'active:bg-9e-air/20">'
  + '<span class="h-2.5 w-2.5 flex-none rounded-full" style="background-color:#00CCFF" aria-hidden="true"></span>'
  + '<span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">'
  + `<span class="text-sm font-medium text-9e-navy dark:text-white">${CARD_DATE_LABEL}</span>`
  + '<span class="flex-none rounded-sm whitespace-nowrap bg-[#D4F73F] px-1.5 py-[2px] text-[0.5rem] '
  + 'font-black leading-none text-9e-navy shadow-sm">Early Bird</span></span>'
  + '<span class="flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold '
  + 'bg-[#39b980]/10 text-[#39b980] dark:bg-[#39b980]/20">ลงทะเบียน</span>'
  + '<span aria-hidden="true" class="flex h-6 w-6 flex-none items-center justify-center rounded-full '
  + 'bg-9e-air/20 text-9e-action dark:text-9e-air">'
  + '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" '
  + 'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" '
  + 'class="lucide lucide-chevron-right h-3.5 w-3.5"><path d="m9 18 6-6-6-6"></path></svg></span></a></li>';

test('the mobile card’s early-bird row is byte-identical to before this change', () => {
  const rows = cardRegion(render()).match(/<li>[\s\S]*?<\/li>/g) ?? [];
  assert.ok(rows.length > 0, 'no card rows rendered — the row extractor requires a classless <li>');
  const marked = rows.filter((r) => r.includes('Early Bird'));
  assert.equal(marked.length, 1, 'exactly one card row carries the tag');
  assert.equal(marked[0], CARD_EARLY_BIRD_ROW, 'the card’s early-bird row moved');
});

test('CONTROL: the card golden DOES fail on a one-class edit to the shared chip', () => {
  /**
   * The specific coupling this file exists to watch. If someone shrinks
   * EARLY_BIRD_CHIP to make the desktop pill fit, the card's tag changes with
   * it and this comparison is what says so.
   */
  const mutated = CARD_EARLY_BIRD_ROW.replace('px-1.5 py-[2px]', 'px-1 py-0');
  assert.notEqual(mutated, CARD_EARLY_BIRD_ROW, 'the mutation is real');
  const marked = (cardRegion(render()).match(/<li>[\s\S]*?<\/li>/g) ?? [])
    .filter((r) => r.includes('Early Bird'));
  assert.notEqual(marked[0], mutated, 'a chip edit must break the card golden');
  assert.ok(marked[0].includes('px-1.5 py-[2px]'), 'the live chip really carries the padding');
});

test('the two layouts still render the shared chip identically', () => {
  /**
   * Same wording, same lime, same padding, same type. What is NOT shared is the
   * corner and the flex behaviour, and that separation is what let the table's
   * pill go from `rounded-b-sm` to `rounded-sm` without the card noticing.
   */
  const html = render();
  const cell = cellById(html)['s-cross'];
  const row = (cardRegion(html).match(/<li>[\s\S]*?<\/li>/g) ?? []).find((r) => r.includes('Early Bird'));
  const chip = /whitespace-nowrap bg-\[#D4F73F\] px-1\.5 py-\[2px\] text-\[0\.5rem\] font-black leading-none text-9e-navy shadow-sm/;
  assert.match(cell, chip, 'desktop pill lost the shared chip');
  assert.match(row, chip, 'mobile tag lost the shared chip');

  // The two class strings now differ by exactly `flex-none`, which the card's
  // wrapping row needs and the table's column does not.
  const cellChip = cell.match(/<span class="([^"]*)">Early Bird<\/span>/)?.[1];
  const rowChip = row.match(/<span class="([^"]*)">Early Bird<\/span>/)?.[1];
  assert.equal(cellChip, `rounded-sm ${EARLY_BIRD_SHARED}`);
  assert.equal(rowChip, `flex-none rounded-sm ${EARLY_BIRD_SHARED}`);
  assert.equal(
    rowChip.replace('flex-none ', ''),
    cellChip,
    'one class apart — see the note on merging in ScheduleClient.jsx',
  );
});

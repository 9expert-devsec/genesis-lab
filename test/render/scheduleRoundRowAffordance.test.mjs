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
import { SCHEDULE_STATUS, NEUTRAL_STATUS } from '@/lib/scheduleStatus';

/**
 * The mobile round row as an AFFORDANCE.
 *
 * The row is the registration link — the primary action of the whole page — and
 * it used to render as a line of text on the card's own background while
 * ดูรายละเอียดคอร์ส sat beneath it in brand blue. The affordance and the
 * importance were inverted. None of that is catchable by a layout test (jsdom
 * does no layout and there is none here anyway), so what is pinned is the
 * markup that carries each decision: the surface, the declared tap height, the
 * pill, the circled chevron, the press state, and the fact that the desktop
 * table did not move while all of it happened.
 *
 * Dates are derived from the rolling window for the same reason as the other
 * /schedule render tests: nothing here can move the clock, and a fixture dated
 * in a fixed month renders no rounds for most of the year.
 */

const now = new Date();
const WINDOW = rollingWindow(now, PUBLIC_SCHEDULE_DEFAULT_MONTHS);
const OPTIONS = rollingWindow(now, PUBLIC_SCHEDULE_FILTER_HORIZON);
const DEFAULTS = defaultScheduleFilters(now);

/**
 * The year the card's `showYear: 'auto'` measures against, in Asia/Bangkok —
 * the same derivation the page itself does, off the same instant the WINDOW
 * above came from. It has to be passed: `formatRoundDays` THROWS rather than
 * reading a clock, so a render harness that omitted it would fail loudly here
 * instead of quietly rendering the wrong year in production. That is the
 * intended failure mode.
 */
const CURRENT_YEAR = siteDateParts(now).year;

const lastDayOf = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const CROSS_START = lastDayOf(WINDOW[0]);

/**
 * The worst row this layout has to render at 360px: a cross-month date, an
 * Early Bird tag AND a status pill, all in one row.
 */
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
    { _id: 's-blank', dates: [`${WINDOW[2]}-09`], type: 'classroom', status: '' },
  ],
};

/**
 * The card labels for the two fixture rounds.
 *
 * ── WHY THESE ARE DERIVED AND NOT LITERAL ───────────────────────────────────
 * They used to be written out as `8 ${monthLabelWithYear(WINDOW[1])}` and
 * `${CROSS_START} ${monthLabel(WINDOW[0])} - 2 ${monthLabelWithYear(WINDOW[1])}`
 * — literal, because the card's year was UNCONDITIONAL. It no longer is: under
 * `showYear: 'auto'` the year appears only when the round is not in
 * CURRENT_YEAR, and WINDOW rolls off the real clock, so whether these fixture
 * months land in the next year depends on the day the suite runs. In December,
 * WINDOW[1] is January and the year appears — mid-string, between the two
 * tokens of the crossing round. No literal survives that.
 *
 * So the label is derived, with the SAME options and the SAME CURRENT_YEAR the
 * component is rendered with. That is deliberately not a pin on the label's
 * CONTENT — the content is pinned by test/pure/roundDateLabel (45 tests against
 * a fixed table) and by the byte-identical golden further down, both of which
 * use fixed dates and a fixed year. What these three tests claim is only that
 * the row CARRIES its date alongside its pill and its chevron, which is a
 * layout claim; the control below stops the derivation going vacuous.
 */
const cardLabel = (dates) =>
  formatRoundDays(dates, { showMonth: true, showYear: 'auto', currentYear: CURRENT_YEAR });
const CROSS_CARD_LABEL = cardLabel(COURSE.schedules[0].dates);
const NEAR_CARD_LABEL = cardLabel(COURSE.schedules[1].dates);

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

const cardRegion = (html) => (html.match(/<article[\s\S]*?<\/article>/g) ?? []).join('');
const tableRegion = (html) => (html.match(/<table[\s\S]*?<\/table>/g) ?? []).join('');

/**
 * The `<li>` rows of the mobile card, keyed by the schedule they link to.
 *
 * DEPENDS ON THE `<li>` BEING BARE. The row's surface lives on the `<a>`, so the
 * list item carries no attributes; the moment one is added this matcher returns
 * nothing and every row assertion in this file has no subject. The assertion
 * below turns that into one loud failure instead of a file full of vacuous
 * passes — if it fires, fix the pattern here rather than routing around it.
 */
const rowsById = (html) => {
  const out = {};
  for (const li of cardRegion(html).match(/<li>[\s\S]*?<\/li>/g) ?? []) {
    const id = li.match(/&amp;class=([^"&]+)/)?.[1] ?? 'no-link';
    out[id] = li;
  }
  assert.ok(
    Object.keys(out).length > 0,
    'no <li> matched — the row extractor requires a CLASSLESS <li>; if the list '
    + 'item gained an attribute, widen the pattern in rowsById',
  );
  return out;
};

// ── The row is a filled, bounded object ─────────────────────────────────────

test('a round row renders its own surface, not the card background', () => {
  const row = rowsById(render())['s-near'];
  assert.ok(row, 'the fixture rendered no row for s-near');
  assert.ok(row.includes('bg-9e-ice'), 'the row needs a fill a step off the white card');
  assert.ok(row.includes('border-[var(--surface-border)]'), 'and a hairline in the existing border token');
  assert.ok(row.includes('rounded-9e-md'), 'and rounded corners');
});

test('the row declares a tap height of at least 44px', () => {
  /**
   * THE assertion this change exists for. The old row was ~36px of padding,
   * under the iOS and Android minimum, with the next round directly beneath —
   * so a mis-tap did not miss, it opened the wrong round's registration page.
   * Parsed rather than string-matched so a later trim to 40px goes red with a
   * message that says why.
   */
  const row = rowsById(render())['s-near'];
  const declared = row.match(/min-h-\[(\d+)px\]/);
  assert.ok(declared, 'the row must declare a minimum height, not rely on padding');
  assert.ok(
    Number(declared[1]) >= 44,
    `tap target is ${declared[1]}px — below the 44px minimum`,
  );
});

test('rows are separated by a gap, not stacked flush', () => {
  const html = render();
  const list = cardRegion(html).match(/<ul id="[^"]*" class="([^"]*)"/)?.[1] ?? '';
  assert.ok(list.includes('gap-2'), `the round list must gap its rows: "${list}"`);
  assert.ok(list.includes('flex-col'));
  const row = rowsById(html)['s-near'];
  assert.equal(
    /border-t\b/.test(row),
    false,
    'a row that is its own object needs no divider above it',
  );
});

test('the row keeps its press feedback, since touch has no hover', () => {
  const row = rowsById(render())['s-near'];
  assert.match(row, /\bactive:/, 'no active: state — a tap gives no feedback on a phone');
  assert.ok(row.includes('active:bg-9e-air/20'), 'the press tint');
  assert.ok(row.includes('active:scale-'), 'and the press itself');
});

test('every new surface carries a dark variant', () => {
  /**
   * On a near-black page the row must still read as a step off the card
   * (#111d2c). `--surface-border` needs no variant — it is redefined under
   * `.dark` in globals.css — so the assertion is scoped to the fill.
   */
  const row = rowsById(render())['s-near'];
  assert.match(row, /dark:bg-\[#0f1e30\]/, 'the row fill needs its dark counterpart');
  assert.match(row, /dark:text-9e-air/, 'and the accent circle its dark foreground');
});

// ── The status pill ─────────────────────────────────────────────────────────

test('the status renders as a tinted pill, in the shared soft tokens', () => {
  /**
   * `soft` is the treatment lib/scheduleStatus already declares for a tinted
   * pill, dark variants included — so the pill introduces no colour of its own
   * and cannot drift from the other pill surfaces in the app.
   */
  const rows = rowsById(render());
  const open = rows['s-cross'];
  const near = rows['s-near'];

  assert.ok(open.includes(SCHEDULE_STATUS.open.soft), 'the open pill must use the soft tokens');
  assert.ok(open.includes('>ลงทะเบียน<'), 'and say ลงทะเบียน');
  assert.ok(near.includes(SCHEDULE_STATUS.nearly_full.soft), 'and amber for nearly_full');
  assert.ok(near.includes('>ใกล้เต็ม<'));

  // Pill, not bare text: a radius and horizontal padding around the label.
  assert.match(open, /rounded-full px-2 py-0\.5 text-\[11px\] font-bold [^"]*#39b980/);
});

test('the soft tokens carry their own dark variants', () => {
  // The mental test the brief asks for, expressed on the token: the tint must
  // change under .dark or the label sits on a light chip on a dark card.
  assert.match(SCHEDULE_STATUS.open.soft, /dark:/);
  assert.match(SCHEDULE_STATUS.nearly_full.soft, /dark:/);
  assert.match(SCHEDULE_STATUS.full.soft, /dark:/);
  assert.match(NEUTRAL_STATUS.soft, /dark:/);
});

test('a blank status renders NO pill — not an empty one, not a default', () => {
  /**
   * The behaviour M3 exists to protect, re-asserted against the new shape: a
   * pill is more prominent than the old text was, so a default "ลงทะเบียน"
   * here would advertise a session as taking bookings more loudly than
   * before — and since the state/action split that default would be an
   * IMPERATIVE on a round we know nothing about.
   */
  const row = rowsById(render())['s-blank'];
  assert.ok(row, 'the blank-status round did not render a row');
  for (const label of ['ลงทะเบียน', 'ใกล้เต็ม', 'เต็ม']) {
    assert.equal(row.includes(label), false, `a blank status must not be labelled ${label}`);
  }
  assert.equal(
    /rounded-full px-2 py-0\.5/.test(row),
    false,
    'no empty pill element either — the whole span is omitted',
  );
});

test('CONTROL: the pill probe DOES see a pill on a real status', () => {
  // Without this, a card that dropped every pill would pass the test above.
  const row = rowsById(render())['s-near'];
  assert.match(row, /rounded-full px-2 py-0\.5/, 'the probe cannot see a pill that is there');
  assert.ok(row.includes('ใกล้เต็ม'));
});

// ── Early Bird: inline when it fits, wrapped when it does not ───────────────

/**
 * The flexible middle column of a row — the container the date and the Early
 * Bird tag share. Anchored on `flex min-w-0 flex-1`, which are the classes that
 * make it the thing that absorbs overflow rather than a thing that pushes.
 */
const middleColumn = (row) => {
  const m = row.match(/<span class="(flex min-w-0 flex-1[^"]*)">([\s\S]*?)<\/span><\/span>/);
  assert.ok(
    m,
    'the flexible middle column is gone — RoundRow’s date/tag container changed shape',
  );
  return { classes: m[1], inside: m[2] };
};

test('a SHORT date and its Early Bird tag share one wrapping line', () => {
  /**
   * The reason this column is no longer a fixed `flex-col`. Forcing the tag onto
   * its own line spends a whole extra line on `8 ก.ย. 69` and makes the
   * early-bird row visibly taller than every neighbour for no information — the
   * row reads as inconsistent rather than as informative.
   *
   * Nothing here can measure a line box, so what is pinned is the mechanism: one
   * wrapping container, centred, NOT a column. The browser decides per row.
   */
  const row = rowsById(render({ earlyBirdMap: { 'POWER-BI': 's-near' } }))['s-near'];
  const { classes, inside } = middleColumn(row);

  assert.match(classes, /\bflex-wrap\b/, 'the tag must be able to sit beside the date');
  assert.match(classes, /\bitems-center\b/, 'without which they sit on different baselines');
  assert.equal(
    /\bflex-col\b/.test(classes),
    false,
    'a fixed column forces the tag onto a second line even when there is room',
  );

  const dateAt = inside.indexOf(NEAR_CARD_LABEL);
  const tagAt = inside.indexOf('Early Bird');
  assert.notEqual(dateAt, -1, 'the date is not in the column');
  assert.notEqual(tagAt, -1, 'the Early Bird tag is not in the column');
  assert.ok(dateAt < tagAt, 'the tag follows the date, it does not precede it');
  assert.ok(inside.includes('#D4F73F'), 'and keeps its lime colour');
});

test('CONTROL: the column probe DOES tell a wrapping row from a fixed column', () => {
  /**
   * Without this, `flex-col` could be absent because the matcher cannot see any
   * class at all, and the assertion above would pass against nothing.
   */
  const asColumn = '<span class="flex min-w-0 flex-1 flex-col items-start gap-1"><span>x</span></span></span>';
  const probe = middleColumn(asColumn);
  assert.match(probe.classes, /\bflex-col\b/, 'the probe reads a real flex-col container');
  assert.equal(/\bflex-wrap\b/.test(probe.classes), false);
  // …and it is reading the live row, not only fixtures.
  assert.match(middleColumn(rowsById(render())['s-near']).classes, /\bflex-wrap\b/);
});

test('the LONG cross-month row still carries everything, overflow staying inside', () => {
  /**
   * The case the wrap exists for, and the one that rots silently if someone
   * later tidies this column: at ~360px the date alone fills the middle column,
   * so the tag falls below it. What must survive is that the OVERFLOW IS
   * ABSORBED HERE — `min-w-0` on this column, `flex-none` on the pill and the
   * chevron — so the date can never push either of them out of the row. Flex
   * sacrificing the date, the one thing the row is about, is the inversion this
   * layout was written to avoid.
   */
  const row = rowsById(render())['s-cross'];
  const { classes, inside } = middleColumn(row);

  assert.ok(inside.includes(CROSS_CARD_LABEL), 'the cross-month date is gone');
  assert.ok(inside.includes('Early Bird'), 'the tag is gone');
  assert.match(classes, /\bmin-w-0\b/, 'the column must be the thing that can shrink');
  assert.match(classes, /\bflex-1\b/, 'and the thing that takes the slack');

  // The two neighbours it must never displace, each still unshrinkable.
  // s-cross is the `open` round, so its pill reads the ACTION word ลงทะเบียน —
  // badges take `action`, never `state`. Matched as `>label<` because a Thai
  // label can be a substring of another (เต็ม inside ใกล้เต็ม).
  const pill = row.match(/<span class="(flex-none[^"]*)">ลงทะเบียน<\/span>/);
  assert.ok(pill, 'the status pill left the row');
  assert.match(pill[1], /\bflex-none\b/, 'the pill must not shrink to make room for a date');
  const circle = row.match(/<span aria-hidden="true" class="([^"]*)">/);
  assert.ok(circle, 'the chevron circle left the row');
  assert.match(circle[1], /\bflex-none\b/, 'nor may the chevron');
});

test('CONTROL: the flex-none probes DO distinguish a shrinkable neighbour', () => {
  // A pill that lost `flex-none` is exactly the regression the test above
  // guards, and it is invisible until a long date renders on a narrow phone.
  assert.equal(
    /<span class="(flex-none[^"]*)">ลงทะเบียน<\/span>/.test(
      '<span class="whitespace-nowrap rounded-full">ลงทะเบียน</span>',
    ),
    false,
    'the probe must not match a pill that dropped flex-none',
  );
  assert.ok(
    /<span class="(flex-none[^"]*)">ลงทะเบียน<\/span>/.test(
      '<span class="flex-none whitespace-nowrap rounded-full">ลงทะเบียน</span>',
    ),
    '…but it must match one that kept it',
  );
  assert.equal(/\bflex-none\b/.test('flex-1 min-w-0'), false);
  assert.ok(/\bflex-none\b/.test('flex-none whitespace-nowrap'));
});

test('the row is still one 44px-minimum object however the column wraps', () => {
  // The wrap changes the column, not the row. Asserted on both cases so a
  // "tidy" that moved the surface onto the column goes red.
  for (const [id, map] of [['s-near', { 'POWER-BI': 's-near' }], ['s-cross', { 'POWER-BI': 's-cross' }]]) {
    const row = rowsById(render({ earlyBirdMap: map }))[id];
    assert.match(row, /min-h-\[44px\]/, `${id}: lost its tap-target floor`);
    assert.ok(row.includes('bg-9e-ice'), `${id}: lost its fill`);
    assert.ok(row.includes('active:scale-'), `${id}: lost its press state`);
  }
});

test('the same row still carries its date AND its pill AND the chevron', () => {
  // The regression the second line could cause: moving the tag out of the main
  // line must not push anything else out of the row.
  const row = rowsById(render())['s-cross'];
  assert.ok(row.includes(CROSS_CARD_LABEL));
  assert.ok(row.includes(SCHEDULE_STATUS.open.soft), 'the pill survived');
  assert.ok(row.includes('bg-9e-air/20'), 'and the accent circle');
});

test('CONTROL: the derived card labels are real labels, not empty or "-"', () => {
  /**
   * The three tests above search the rendered row for a string this file
   * computed. If that computation ever returned `''`, `includes('')` is true for
   * every row and all three pass while guarding nothing — the exact vacuity the
   * derivation risks. So the labels are checked for the parts they must have.
   *
   * The DAY numbers are literal here (8, and the 2 of the cross-month round's
   * second month), because those are the one part of the label the clock cannot
   * move — the fixture pins them.
   */
  for (const [name, label] of [['near', NEAR_CARD_LABEL], ['cross', CROSS_CARD_LABEL]]) {
    assert.notEqual(label, '', `${name}: empty label`);
    assert.notEqual(label, '-', `${name}: the no-dates fallback — the fixture is not reaching the formatter`);
    assert.match(label, /[ก-ฮ]/, `${name}: a card label always carries a Thai month`);
  }
  assert.match(NEAR_CARD_LABEL, /^8 /, 'the single-day round starts with its day');
  assert.match(CROSS_CARD_LABEL, new RegExp(`^${CROSS_START} `), 'the crossing round starts on its first day');
  assert.match(CROSS_CARD_LABEL, /, 2 /, 'and LISTS its second day rather than ranging to it');
  assert.equal(
    CROSS_CARD_LABEL.includes(' - '),
    false,
    'a range would claim training on every day between the two — the defect this replaced',
  );
});

test('a row with no Early Bird has no second line to grow', () => {
  const row = rowsById(render())['s-near'];
  assert.equal(row.includes('Early Bird'), false);
  assert.equal(row.includes('#D4F73F'), false);
});

// ── The circled chevron ─────────────────────────────────────────────────────

test('the chevron is a circled accent affordance, and it is decorative', () => {
  const row = rowsById(render())['s-near'];
  const circle = row.match(/<span aria-hidden="true" class="([^"]*)">\s*<svg/);
  assert.ok(circle, 'the chevron wrapper must be aria-hidden — the link text is what is announced');
  assert.match(circle[1], /rounded-full/, 'a circle');
  assert.match(circle[1], /bg-9e-air\/20/, 'filled with the accent tint');
  assert.match(circle[1], /text-9e-action/, 'and an accent-coloured icon');
  assert.match(circle[1], /\bh-6 w-6\b/, 'sized as a small button, not a bare glyph');
});

test('the row is exactly one link, with nothing interactive nested inside', () => {
  const rows = rowsById(render());
  for (const [id, row] of Object.entries(rows)) {
    assert.equal((row.match(/<a\s/g) ?? []).length, 1, `${id}: the row must be one <a>`);
    assert.equal((row.match(/<button/g) ?? []).length, 0, `${id}: no nested control`);
  }
});

test('no "สมัคร" label was added to the row', () => {
  // Considered and rejected: the word costs the horizontal room the long date
  // labels need, and the fill + pill + circle already carry the affordance.
  assert.equal(cardRegion(render()).includes('สมัคร'), false);
});

test('a round with no link renders the same object, minus the affordances', () => {
  const html = render({
    courses: [{ ...COURSE, schedules: [{ dates: [`${WINDOW[0]}-08`], type: 'classroom', status: 'open' }] }],
  });
  const row = (cardRegion(html).match(/<li>[\s\S]*?<\/li>/g) ?? [])[0];
  assert.ok(row, 'no row rendered');
  assert.equal((row.match(/<a\s/g) ?? []).length, 0, 'nothing to link to');
  assert.ok(row.includes('bg-9e-ice'), 'but it is still the same surface');
  assert.match(row, /min-h-\[44px\]/, 'and still a full-height row');
  assert.equal(/active:/.test(row), false, 'with no press state, because there is no press');
  assert.equal(/bg-9e-air\/20/.test(row), false, 'and no chevron promising a destination');
});

// ── The course-detail link is demoted ───────────────────────────────────────

test('ดูรายละเอียดคอร์ส drops to secondary text', () => {
  const card = cardRegion(render());
  const link = card.match(/<a[^>]*class="([^"]*)"[^>]*>ดูรายละเอียดคอร์ส/)
    ?? card.match(/<a[^>]*class="([^"]*)"[^>]*>\s*ดูรายละเอียดคอร์ส/);
  assert.ok(link, 'the course link is gone');
  assert.match(link[1], /text-xs/, 'smaller than the round rows');
  assert.match(link[1], /text-9e-slate-dp-50/, 'and muted, not brand blue');
  assert.equal(
    /\btext-sm font-medium text-9e-action\b/.test(link[1]),
    false,
    'it must no longer be the most prominent thing on the card',
  );
});

test('…but it is still a link to the same place', () => {
  const card = cardRegion(render());
  assert.match(card, /<a[^>]*href="[^"]*power-bi[^"]*"[^>]*>\s*ดูรายละเอียดคอร์ส/);
});

// ── The desktop table did not move ──────────────────────────────────────────

/**
 * The rendered `ScheduleCell`s, frozen BEFORE this change.
 *
 * A golden, not a set of class assertions, and deliberately so: the risk here is
 * not that a named class disappeared, it is that a shared helper edited for the
 * card (the status style, the early-bird chip, the href builder, the date label)
 * quietly changed the table too — and nobody would look at 1024px while working
 * on a phone layout. A byte comparison is the only probe that catches ALL of
 * those at once, including ones nobody thought to name.
 *
 * If this goes red because the desktop table was changed ON PURPOSE, re-capture
 * these two strings in the same commit — that is the review moment it exists to
 * force.
 *
 * ── RE-BASELINED TWICE, EACH TIME DELIBERATELY ──────────────────────────────
 * 1. The month-cell wrapper lost `items-center` to fix the clipped Early Bird
 *    pill (see scheduleEarlyBirdPillWidth.test.mjs). The diff was exactly that:
 *    the enclosing `<div class="flex flex-col items-center gap-2">` became
 *    `<div class="flex flex-col gap-2">`, with everything inside `ScheduleCell`
 *    unchanged byte for byte — the fix was to the cell's layout context, not to
 *    the cell.
 * 2. The pill moved from an out-of-flow overlay on the TOP edge to an ordinary
 *    last child at the BOTTOM of the cell's column. Only CELL_EARLY_BIRD_OPEN
 *    moved; CELL_BLANK_STATUS is untouched, because a cell with no early bird
 *    never rendered any of the retired markup.
 * 3. The cell's type scale was raised for legibility: the date label
 *    `text-[11px]` -> `text-sm` and the status label `text-[9px]` ->
 *    `text-[10px]`. The status DOT was not touched, so `h-2 w-2` still stands.
 *    BOTH constants moved this time — CELL_BLANK_STATUS carries the date label
 *    too, which is easy to miss because it has no status line.
 *
 *    RE-CAPTURED FROM RENDERED OUTPUT, not retyped. The markup was printed from
 *    a real ScheduleBoard render and compared against these constants; the only
 *    deltas were the two size tokens, with attribute and class ORDER unchanged.
 *    That distinction matters: hand-typing a believed-correct string is how a
 *    byte-identical guard ends up pinning something the component never emits
 *    and passing while guarding nothing.
 * 4. The date LABEL moved to the shared formatter, lib/schedule/roundDateLabel.
 *    The `s-cross` fixture is the last day of one month and the 2nd of the next
 *    — TWO days, not consecutive — and the retired formatter printed it as a
 *    RANGE, `31 ส.ค. - 2`, which claims training on every day between. It now
 *    renders as the list it is: `31 ส.ค., 2 ก.ย.`, with the crossing rule
 *    supplying both months.
 *
 *    Only CELL_EARLY_BIRD_OPEN moved. CELL_BLANK_STATUS is a single day (`9`),
 *    which the old and new formatters spell identically — worth stating,
 *    because item 3 above is the reminder that this constant carries the date
 *    label too and can move without a status line to draw the eye.
 *
 *    RE-CAPTURED FROM RENDERED OUTPUT, again. The full markup was printed from
 *    a real ScheduleBoard render and diffed against these constants; the ONLY
 *    delta was the date string. Attribute order, class order, the inline
 *    `style`, `aria-hidden`, the anchor's class list and the early-bird chip
 *    were unchanged.
 * 5. THE ROUND BECAME A BORDERED BOX. This is the one re-baseline so far that
 *    is a real redesign rather than a token swap, so the deltas are listed:
 *
 *      · the anchor absorbed the inner wrapper. `<a class="…rounded-sm">` +
 *        `<span class="flex flex-col items-center gap-0.5">` are now ONE
 *        element carrying both jobs — the box and the column;
 *      · `relative` and `overflow-hidden` are gone. Both were documented as
 *        inert in item 2 above, and `overflow-hidden` on a box that may now
 *        WRAP TO TWO LINES is a clipping question nobody should have to think
 *        about;
 *      · `rounded-sm` → `rounded-9e-md`, plus `border px-1 py-1.5` and a
 *        `transition-colors` / `hover:bg-9e-air/10` pair;
 *      · a new inline `style="border-color:#00CCFF"` — the DELIVERY TYPE, from
 *        the same `TYPE_COLOR` map the dot beneath it reads. Inline because
 *        those are hex values and Tailwind never evaluates a template literal.
 *
 *    The INTERNAL ORDER is untouched: type colour, then the dates, then the
 *    status, then the Early Bird chip as an in-flow last child. That last point
 *    is not incidental — an absolutely-positioned pill is what once rendered as
 *    `arly Bir`, and scheduleEarlyBirdPillWidth exists because of it.
 *
 *    RE-CAPTURED FROM RENDERED OUTPUT. Both constants were printed from a real
 *    ScheduleBoard render and replaced wholesale; the class ORDER below is the
 *    order React emitted, not a tidied version of it.
 * 6. `border` -> `border-2`, and the hover moved to the round's OWN type colour
 *    at 10%. Three deltas, all captured from a real render:
 *
 *      · `border` -> `border-2` in the class list;
 *      · `hover:bg-9e-air/10 dark:hover:bg-9e-air/10` -> the single static
 *        `hover:bg-[var(--round-hover-bg)]`. One declaration now covers both
 *        themes: an rgba at 10% composites over whatever is beneath it, so the
 *        dark duplicate had nothing left to say;
 *      · the inline `style` gained the custom property that class reads, so its
 *        serialisation changed — `border-color:#00CCFF` became
 *        `border-color:#00CCFF;--round-hover-bg:rgba(0, 204, 255, 0.1)`.
 *
 *    The class had to become a variable reference rather than
 *    `hover:bg-[${color}]/10`: Tailwind scans source TEXT and never evaluates
 *    it, so a template literal compiles to no class at all and fails silently as
 *    a box that does not react to the pointer.
 *
 *    Class order was checked against the capture and did not shift for any other
 *    reason. Both constants moved — CELL_BLANK_STATUS carries the box class and
 *    the style too.
 * 7. `border-2` -> `border`, and the emphasis moved to a HOVER RING. Item 6
 *    above thickened the border; this reverts that half and spends the emphasis
 *    somewhere that costs no layout. Three deltas, all captured from a real
 *    render:
 *
 *      · `border-2` -> `border` in the class list;
 *      · `transition-colors` -> the explicit property list plus `box-shadow`,
 *        and `hover:ring-2` appended after the existing hover background.
 *        `transition-colors` does not cover `box-shadow`, so without the wider
 *        list the tint would fade over 200ms while the ring appeared and
 *        vanished instantly. The list is `transition-colors`'s own six
 *        properties VERBATIM plus `box-shadow` — purely additive;
 *      · the inline `style` gained a THIRD property and its serialisation
 *        changed again — `border-color:#00CCFF;--round-hover-bg:rgba(0, 204,
 *        255, 0.1)` became `border-color:#00CCFF;--round-ring:#00CCFF;
 *        --round-hover-bg:rgba(0, 204, 255, 0.1)`. Note the ORDER: React
 *        serialises in insertion order, and the ring colour was inserted second.
 *
 *    ── THE RING IS TWO CLASSES, AND THE COLOUR VARIABLE IS OURS ─────────────
 *    `hover:ring-2` paints and `hover:ring-[color:var(--round-ring)]` colours;
 *    in Tailwind the width utility is what composes the box-shadow, so a
 *    ring-colour class alone emits a valid declaration and draws nothing.
 *
 *    The obvious shortcut — set Tailwind's own `--tw-ring-color` inline and drop
 *    the second class — was tried and REJECTED, and it is worth recording why,
 *    because it works perfectly under a mouse. An inline custom property
 *    outranks every author rule, including globals.css's app-wide
 *    `*:focus-visible { … ring-9e-brand ring-offset-2 }`, so it repaints the
 *    KEYBOARD FOCUS ring in the round's type colour: 1.90:1 for a classroom
 *    round against a white page, under WCAG 1.4.11's 3:1 floor, where the brand
 *    blue it replaced was 3.54:1. Only the light theme is affected. A variable
 *    of our own is read by one selector under `:hover` and reaches nothing else.
 *    scheduleFullRoundNotClickable pins the absence directly.
 *
 *    RE-CAPTURED FROM RENDERED OUTPUT, not retyped. Both constants were printed
 *    from a real ScheduleBoard render; the only deltas were the three above.
 *    Attribute order, class order, the dot, the date span, the status span and
 *    the early-bird chip were unchanged byte for byte.
 */
const CELL_BOX_CLASS =
  'group cursor-pointer flex flex-col items-center gap-0.5 rounded-9e-md border px-1 py-1.5 '
  + 'transition-[color,background-color,border-color,text-decoration-color,fill,stroke,box-shadow] '
  + 'duration-9e-micro ease-9e hover:bg-[var(--round-hover-bg)] hover:ring-2 '
  + 'hover:ring-[color:var(--round-ring)]';

/**
 * The cell's inline style, INCLUDING both custom properties.
 *
 * Both fixture rounds are `classroom`, so one string serves both goldens — but
 * it is named rather than inlined twice because the custom properties are the
 * part most likely to be edited, and a golden that carried them in only one of
 * the two constants is exactly the CELL_BLANK_STATUS trap this file has fallen
 * into before (that constant carries the DATE LABEL too, which is easy to miss
 * because it has no status line).
 *
 * Note the serialisation: React emits the three declarations semicolon-joined
 * with no space after the property colon, while the rgba keeps its own spaced
 * commas — and it emits them in INSERTION ORDER, which is why the ring colour
 * sits between the border and the tint rather than at the end. That is React's
 * style serialisation, not a formatting choice here, which is why this was
 * CAPTURED from a real render rather than written out.
 *
 * The two variables are deliberately different SHAPES: `--round-ring` is the
 * full type hex, because the ring restates the border, and `--round-hover-bg`
 * is the 10% rgba, because the background washes behind it. A ring at 10% on a
 * 1px border would be invisible — scheduleFullRoundNotClickable asserts the
 * distinction directly.
 *
 * And neither of them is `--tw-ring-color`. That absence is load-bearing, not
 * incidental: see the focus-ring note in item 7 above.
 */
const CELL_BOX_STYLE =
  'border-color:#00CCFF;--round-ring:#00CCFF;--round-hover-bg:rgba(0, 204, 255, 0.1)';

/**
 * ── RE-BASELINED ON TWO AXES, AND ONLY TWO ─────────────────────────────────
 *
 * 807f6a0 made two changes to ScheduleCell and re-baselined neither, so this
 * golden had been failing on a difference that has nothing to do with the
 * status label it also changed:
 *
 *   1. the dot and the date are now wrapped in `<span class="flex items-center
 *      gap-1">`, so they sit on one line inside the column
 *   2. the dot gained `flex-none`, so it cannot be squeezed by a long
 *      cross-month date
 *
 * Both are hand-applied from ScheduleClient's source, NOT pasted from the
 * current render. Pasting is how an unrelated regression gets absorbed into a
 * golden and stops being visible ever again — the whole point of this file.
 *
 * The wrapper is unconditional in the component, so it applies to the
 * blank-status cell too even though that cell has no status span to separate.
 *
 * `flex-none` here is the same property the sibling probe test asserts
 * independently ("the flex-none probes DO distinguish a shrinkable
 * neighbour"), which is why that one has been passing throughout: it reads the
 * live class list rather than a captured string. Two views of one fact, and
 * only one of them had gone stale.
 */
const CELL_EARLY_BIRD_OPEN =
  `<a href="/registration/public?course=power-bi&amp;class=s-cross" class="${CELL_BOX_CLASS}" style="${CELL_BOX_STYLE}">`
  + '<span class="flex items-center gap-1">'
  + '<span class="h-2 w-2 flex-none rounded-full" style="background-color:#00CCFF" aria-hidden="true"></span>'
  + '<span class="text-sm font-bold leading-none text-9e-navy transition-colors group-hover:text-9e-action dark:text-white dark:group-hover:text-9e-air">'
  + `${CROSS_START} ${monthLabel(WINDOW[0])}, 2 ${monthLabel(WINDOW[1])}</span>`
  + '</span>'
  + '<span class="text-[10px] font-bold leading-none text-[#39b980]">ลงทะเบียน</span>'
  + '<span class="rounded-sm whitespace-nowrap bg-[#D4F73F] px-1.5 py-[2px] text-[0.5rem] font-black leading-none text-9e-navy shadow-sm">Early Bird</span>'
  + '</a>';

const CELL_BLANK_STATUS =
  `<a href="/registration/public?course=power-bi&amp;class=s-blank" class="${CELL_BOX_CLASS}" style="${CELL_BOX_STYLE}">`
  + '<span class="flex items-center gap-1">'
  + '<span class="h-2 w-2 flex-none rounded-full" style="background-color:#00CCFF" aria-hidden="true"></span>'
  + '<span class="text-sm font-bold leading-none text-9e-navy transition-colors group-hover:text-9e-action dark:text-white dark:group-hover:text-9e-air">9</span></span></a>';

/**
 * Every non-empty schedule cell of the desktop table, in document order.
 *
 * ── THE PATTERN HAD TO WIDEN, AND THE FAILURE IT PRODUCED WAS MISLEADING ────
 * It used to match the literal `<td class="px-2 py-2 text-center align-middle">`.
 * A cross-month round now renders `<td colspan="2" class="…">`, so that literal
 * stopped matching the very cell this file's golden is about — and the test did
 * NOT fail as a diff. It failed as `expected three linked cells — the fixture
 * moved`, which points at the fixture rather than at the extractor and is
 * exactly the kind of failure that gets "fixed" by editing the count.
 *
 * The attribute is OPTIONAL in the pattern rather than required, because a
 * single-month cell genuinely does not emit one: `colSpan={1}` would render
 * `colspan="1"`, a no-op that would change the markup of every cell on the page,
 * so the component passes `undefined` instead. Both forms are real and both
 * must be extracted.
 *
 * ── AND THE CASE IS `col[Ss]pan` ON PURPOSE ─────────────────────────────────
 * React 18.3.1 emits `colSpan="2"` — CAMEL CASE — while emitting `rowspan="2"`
 * lowercase from the identically-shaped `rowSpan` prop. That is React's own
 * attribute table, not this component: verified by rendering a bare `<td>` with
 * each prop. It is valid either way, because HTML attribute names are
 * ASCII case-insensitive at parse time, so the browser applies the span
 * regardless. Matching both spellings means a React upgrade that normalises it
 * does not silently empty this extractor and vacate the golden.
 */
const tableCells = (html) =>
  [...tableRegion(html).matchAll(
    /<td(?: col[Ss]pan="\d+")? class="px-2 py-2 text-center align-middle">([\s\S]*?)<\/td>/g,
  )]
    .map((m) => m[1])
    .filter((c) => c.includes('<a '));

/**
 * The same cells, keyed by the schedule they link to.
 *
 * Positional indexing was fine while every course was one `<tr>` in column
 * order. It is not any more: the table packs rounds into LANES, so document
 * order is lane order — a cross-month round spanning columns 0-1 pushes the
 * round at column 1 into a second lane and therefore to the END of the markup.
 * `cells[2]` silently became a different round, which a golden would report as
 * a diff in the wrong cell.
 */
const cellsById = (html) => {
  const out = {};
  for (const cell of tableCells(html)) {
    const id = cell.match(/&amp;class=([^"&]+)/)?.[1] ?? 'no-link';
    out[id] = cell;
  }
  return out;
};

test('the desktop ScheduleCell markup is byte-identical to before this change', () => {
  const html = render();
  assert.equal(tableCells(html).length, 3, 'expected three linked cells — the fixture moved');
  // Keyed, not indexed: lane packing makes document order lane order, so the
  // cross-month round's neighbour is now LAST in the markup rather than second.
  const cells = cellsById(html);
  assert.equal(
    cells['s-cross'],
    `<div class="flex flex-col gap-2">${CELL_EARLY_BIRD_OPEN}</div>`,
    'the early-bird / open cell changed',
  );
  assert.equal(
    cells['s-blank'],
    `<div class="flex flex-col gap-2">${CELL_BLANK_STATUS}</div>`,
    'the blank-status cell changed',
  );
});

test('the table cell kept the OLD status treatment, not the card’s pill', () => {
  // The specific way the desktop could have been dragged along: `soft` is a
  // shared token, and swapping `text` for it in the wrong component would move
  // both surfaces at once.
  const cells = cellsById(render());
  assert.ok(cells['s-cross'].includes(`text-[10px] font-bold leading-none ${SCHEDULE_STATUS.open.text}`));
  assert.equal(cells['s-cross'].includes(SCHEDULE_STATUS.open.soft), false, 'the table has no pill');
  assert.equal(cells['s-cross'].includes('min-h-[44px]'), false, 'nor a tap-target floor');
  assert.equal(cells['s-cross'].includes('bg-9e-ice'), false, 'nor a row fill');
});

test('CONTROL: the golden comparison DOES fail on a one-class edit', () => {
  /**
   * Without this, the byte comparison above is only as strong as the extractor:
   * if `tableCells` returned [] the length assertion would fire, but if the
   * golden were somehow equal to everything the test would pass vacuously.
   * Mutating a single class in the captured string must break equality.
   */
  const mutated = CELL_EARLY_BIRD_OPEN.replace('gap-0.5', 'gap-1');
  assert.notEqual(mutated, CELL_EARLY_BIRD_OPEN, 'the mutation is real');
  const cells = cellsById(render());
  assert.equal(
    cells['s-cross'] === `<div class="flex flex-col gap-2">${mutated}</div>`,
    false,
    'a one-class edit to ScheduleCell must break the golden',
  );
  // …and the extractor really is reading the live table.
  assert.ok(cells['s-cross'].includes('registration/public?course=power-bi'));
});

test('CONTROL: the card and the table render DIFFERENT markup for one round', () => {
  // The two treatments must have actually diverged; if RoundRow were still the
  // old text row, every "byte-identical" claim above would hold trivially.
  const html = render();
  const cardRow = rowsById(html)['s-cross'];
  const cell = cellsById(html)['s-cross'];
  assert.notEqual(cardRow, cell);
  assert.ok(cardRow.includes('min-h-[44px]') && !cell.includes('min-h-[44px]'));
});

test('the card carries a month the table cell does not — on a SAME-MONTH round', () => {
  /**
   * ── WHY THIS MOVED OFF `s-cross` ────────────────────────────────────────────
   * It used to make this claim about the cross-month round, and that claim is
   * now FALSE there — correctly so. A round crossing a month keeps its months on
   * every surface, table included, because `31 - 2` under a single ก.ย. heading
   * is a date that does not exist. So the cross-month cell legitimately carries
   * a month now and cannot demonstrate the difference.
   *
   * `s-near` is a single day inside one month, which is where the two surfaces
   * genuinely differ: the table cell shows the bare day because its column
   * header supplies the month, and the card shows `8 ก.ย.` because it has no
   * header to lean on. Same formatter, different options — which is the whole
   * point of the consolidation.
   *
   * The year is deliberately NOT asserted here: under `showYear: 'auto'` it
   * appears only when the round is not in `CURRENT_YEAR`, and WINDOW rolls off
   * the real clock, so whether these fixture months land in the next year
   * depends on the date the suite is run. The MONTH is unconditional.
   */
  const html = render();
  const cardRow = rowsById(html)['s-near'];
  const cell = cellsById(html)['s-near'];
  const month = monthLabel(WINDOW[1]);
  assert.ok(cardRow.includes(month), `the card row must carry ${month}`);
  assert.equal(cell.includes(month), false, 'the table cell must not repeat its header');
  // And the day itself is on both, so the difference above is the month alone.
  assert.ok(cardRow.includes('>8') && cell.includes('>8'));
});

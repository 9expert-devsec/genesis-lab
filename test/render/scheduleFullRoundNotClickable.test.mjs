import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleBoard } from '@/app/(public)/schedule/_components/ScheduleClient';
import {
  PUBLIC_SCHEDULE_DEFAULT_MONTHS,
  PUBLIC_SCHEDULE_FILTER_HORIZON,
  rollingWindow,
} from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters } from '@/lib/schedule/scheduleFilters';
import { siteDateParts } from '@/lib/articlePublishTime';
import { SCHEDULE_STATUS } from '@/lib/scheduleStatus';

/**
 * A SOLD-OUT ROUND IS SHOWN, AND IS NOT A LINK.
 *
 * Upstream used to withhold `full` rounds from every public feed, so "this
 * round is not registerable" and "this round is not in the response" were the
 * same fact and no surface had to draw the difference. The public pages now ask
 * for open+nearly_full+full precisely so a full round ARRIVES — and the moment
 * it is on screen, the failure mode inverts: instead of a missing row, the risk
 * is a red เต็ม row that still navigates into a booking form.
 *
 * ── WHY THE CONTROL IS HALF THE TEST ────────────────────────────────────────
 * "No href for the full round" is satisfied by a render that produced no rows
 * at all — a filter mistake, a fixture dated outside the rolling window, an
 * early return. So the open round is in the SAME fixture and the SAME render,
 * and it must carry the link the full one is denied. One assertion says the
 * link is withheld; the other says withholding it was a decision rather than an
 * empty page.
 *
 * Both /schedule layouts read one builder (lib/schedule/scheduleRegistrationHref),
 * so this render covers the desktop cell and the mobile card together. Dates
 * come from the rolling window because nothing here can move the clock and a
 * fixed month renders no rounds for most of the year.
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

const FULL_ID = 's-full';
const OPEN_ID = 's-open';

const COURSE = {
  _id: 'c1',
  course_id: 'GEN-AI-L1',
  course_name: 'Generative AI for Business Transformation',
  course_price: 14900,
  course_trainingdays: 2,
  program: { program_name: 'Generative AI' },
  schedules: [
    { _id: FULL_ID, dates: [`${WINDOW[0]}-10`, `${WINDOW[0]}-11`], type: 'hybrid', status: 'full' },
    { _id: OPEN_ID, dates: [`${WINDOW[1]}-08`], type: 'classroom', status: 'open' },
  ],
};

const html = renderToStaticMarkup(
  createElement(ScheduleBoard, {
    courses: [COURSE],
    programs: [{ _id: 'p1', program_name: 'Generative AI' }],
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

/**
 * Every `&class=<id>` that appears inside an `href`, and nothing else.
 *
 * Scoped to `href="..."` deliberately: the id is also emitted as a React key
 * and could appear in ordinary text, and a bare substring search for the id
 * would call either of those a link. What this test is about is navigability,
 * so only an href counts. `&amp;` because this is serialised markup.
 */
const linkedRoundIds = (markup) =>
  (markup.match(/href="[^"]*&amp;class=([^"&]+)/g) ?? []).map(
    (m) => m.split('class=')[1],
  );

test('a full round renders เต็ม and carries no navigable href', () => {
  assert.ok(
    // `.action`, which is what a BADGE renders. For `full` that is the state
    // word — deliberately, because scheduleRegistrationHref returns null here
    // and an unclickable sold-out round must not be labelled with a call to
    // action. This assertion is therefore also the one that would notice if
    // `full.action` were ever given a verb of its own.
    html.includes(SCHEDULE_STATUS.full.action),
    'the round is on the page, labelled เต็ม — it must be SHOWN, not filtered out again',
  );
  assert.ok(
    !linkedRoundIds(html).includes(FULL_ID),
    'a full round must not be linked: greying a link that still navigates is the failure this prevents',
  );
});

test('CONTROL: an open round in the same fixture DOES carry one', () => {
  // Without this the assertion above passes on an empty render, on a broken
  // fixture, and on a regression that stops linking every round.
  assert.ok(
    linkedRoundIds(html).includes(OPEN_ID),
    'the open round is still a registration link — the absence above is specific to `full`',
  );
});

/**
 * The inert element for a given round, on either layout.
 *
 * A full round renders NO anchor at all — that is the contract, and it is what
 * makes the disabling real rather than cosmetic — so it is located by its
 * `aria-disabled` span, not by an href it deliberately does not have.
 */
const inertBlocks = (markup) =>
  markup.match(/<span aria-disabled="true"[\s\S]*?<\/span><\/span>/g) ?? [];

/**
 * The DESKTOP CELL anchors only — matched by `group cursor-pointer`, the
 * opening of ScheduleCell's class list.
 *
 * ── WHY THE MOBILE ROW IS EXCLUDED, AND IT IS NOT AN OVERSIGHT ──────────────
 * The first draft of the hover test swept every `<a>` carrying a `&class=` and
 * failed on the mobile RoundRow, correctly. That row's feedback is
 * `active:scale-[0.99] active:bg-9e-air/20` — a PRESS, not a hover — because it
 * is the touch layout and touch has no hover state to give. It is a different
 * treatment for a different input, deliberately left alone this round.
 *
 * So the type-coloured hover is a claim about the desktop cell, and this is what
 * keeps the claim from silently widening to a surface that cannot honour it.
 */
const cellAnchors = (markup) =>
  (markup.match(/<a href="[^"]*&amp;class=[^"]*"[^>]*>/g) ?? [])
    .filter((a) => a.includes('group cursor-pointer'));

test('the full round SAYS it is unavailable to a pointer, on both layouts', () => {
  /**
   * The disabling was already structural — no anchor, no focus stop — but the
   * cursor did not follow. A user moving the mouse over a sold-out round got the
   * default arrow, which is the same feedback as the whitespace beside it: the
   * one channel that still behaved as though nothing was there.
   *
   * Both layouts, because both render from this one page and only one of them
   * is on screen at a time — a regression on either would be invisible to
   * whoever was testing the other.
   */
  const inert = inertBlocks(html);
  assert.ok(inert.length >= 2, `expected the table cell AND the card row, got ${inert.length}`);
  for (const block of inert) {
    assert.ok(
      block.includes('cursor-not-allowed'),
      `an inert round renders no not-allowed cursor: ${block.slice(0, 140)}`,
    );
  }
});

test('the hover tint is the round’s OWN type colour, via a STATIC class', () => {
  /**
   * ── WHY THE CLASS MUST BE STATIC ────────────────────────────────────────────
   * Tailwind scans source TEXT and never evaluates it, so `hover:bg-[${color}]/10`
   * compiles to NO CLASS AT ALL. It does not render a wrong colour — it renders
   * nothing, and fails silently as a box that simply does not react to the
   * pointer. Nobody notices until they hover, and nothing in the suite would
   * have said so.
   *
   * The value therefore travels as a CSS custom property in the inline style
   * (inline styles are not scanned, so a computed value is fine there) and the
   * class is the fixed string below, which the JIT can see.
   */
  const anchors = cellAnchors(html);
  assert.ok(anchors.length > 0, 'no linked desktop cell rendered — the fixture moved');

  for (const a of anchors) {
    assert.ok(
      a.includes('hover:bg-[var(--round-hover-bg)]'),
      `a linked round has no hover class: ${a}`,
    );
    assert.match(
      a,
      /--round-hover-bg:rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0\.1\)/,
      `the hover variable is missing or not a 10% rgba: ${a}`,
    );
    // The class must not be a computed one — that is the silent failure.
    assert.equal(
      /hover:bg-\[#/.test(a),
      false,
      'a bracket-hex hover class would compile to nothing',
    );
  }
});

test('the hover tint MATCHES the border, so the two cannot contradict', () => {
  /**
   * The defect the flat `bg-9e-air/10` had: it was the same pale blue for every
   * delivery type, so hovering a HYBRID round tinted it classroom-blue — two
   * pixels from a violet border saying the opposite.
   *
   * Asserted as a relationship: for each round, the rgba in the hover variable
   * must be the channel-for-channel decomposition of that round's own border hex.
   */
  const anchors = cellAnchors(html);
  let checked = 0;
  for (const a of anchors) {
    const hex = a.match(/border-color:(#[0-9a-fA-F]{6})/)?.[1];
    const rgba = a.match(/--round-hover-bg:rgba\((\d{1,3}), (\d{1,3}), (\d{1,3}), 0\.1\)/);
    if (!hex || !rgba) continue;
    const expected = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.deepEqual(rgba.slice(1, 4).map(Number), expected, `hover ≠ border for ${hex}`);
    checked += 1;
  }
  assert.ok(checked > 0, 'no round carried both a border and a hover tint — nothing was checked');
});

test('CONTROL: the fixture really contains TWO different type colours', () => {
  /**
   * The match-the-border assertion above passes trivially if every round in the
   * fixture is the same type. It is not — and that is the case the flat token
   * got wrong.
   */
  const hexes = new Set(
    (html.match(/border-color:(#[0-9a-fA-F]{6})/g) ?? []).map((m) => m.split(':')[1]),
  );
  assert.ok(hexes.size >= 2, `expected at least two type colours, got: ${[...hexes].join(', ')}`);
});

test('a WRAPPED label is not clipped — the box has no fixed height and no overflow', () => {
  /**
   * ── THE MEASUREMENT BEHIND THIS ─────────────────────────────────────────────
   * The widest real label is a 4-day non-consecutive round: `8, 10, 12, 14`, 13
   * characters. The month column floor is MONTH_MIN_WIDTH = 90px; the `<td>`
   * spends 16px on `px-2`, the box 2px on `border` and 8px on `px-1`, leaving a
   * 64px content box. At `text-sm` that label is ~91-109px, so IT WRAPS TO TWO
   * LINES.
   *
   * ── THE SECOND BORDER PIXEL WENT BACK, AND THE EMPHASIS MOVED TO A RING ─────
   * This briefly read `border-2`, which took the content box to 62px. The
   * thickness is 1px again and the emphasis it was after now arrives on hover as
   * a RING — a box-shadow, painted outside the box and outside layout, so it
   * costs this measurement nothing at all. That is the point of preferring a
   * ring here: the 90px column never has to pay for a hover state.
   *
   * Wrapping is accepted: every day of the round is shown, which is the whole
   * point of the label. A CLIP is not, and this is what rules it out — no fixed
   * height, no `overflow-hidden`, no `whitespace-nowrap`, no truncation. `py-1.5`
   * is padding, so a second line grows the cell rather than being cut off.
   */
  for (const a of cellAnchors(html)) {
    const cls = a.match(/class="([^"]*)"/)?.[1] ?? '';
    assert.equal(/\boverflow-hidden\b/.test(cls), false, 'the box must not clip its own label');
    assert.equal(/\bh-\[/.test(cls), false, 'no fixed height');
    assert.equal(/\bmax-h-/.test(cls), false, 'no height cap');
    assert.equal(/\bwhitespace-nowrap\b/.test(cls), false, 'the label must be allowed to wrap');
    assert.equal(/\btruncate\b/.test(cls), false, 'and must never be truncated');
    // 1px, and specifically NOT the `border-2` this replaced — the measurement
    // above depends on which one is here.
    assert.match(cls, /\bborder\b/, 'the box still has a border to carry the type colour');
    assert.equal(/\bborder-2\b/.test(cls), false, 'and it is 1px — the second pixel became the hover ring');
    // The ring is what took the emphasis over, so its absence is a regression
    // even though nothing about the label would look wrong.
    assert.match(cls, /\bhover:ring-2\b/, 'the hover emphasis moved to a ring and must still be here');
  }
});

test('CONTROL: the clip probes DO fire on a box that would clip', () => {
  // Every assertion above is an absence; run them against the shape they ban.
  const clipping = 'group cursor-pointer overflow-hidden h-[70px] whitespace-nowrap truncate border-2';
  assert.ok(/\boverflow-hidden\b/.test(clipping));
  assert.ok(/\bh-\[/.test(clipping));
  assert.ok(/\bwhitespace-nowrap\b/.test(clipping));
  assert.ok(/\btruncate\b/.test(clipping));
  // …and `border-2` is really distinguishable from the `border` that replaced
  // it. `\bborder\b` matches BOTH, which is why the test above pairs it with an
  // explicit negation rather than relying on the positive alone.
  assert.ok(/\bborder-2\b/.test('rounded-9e-md border-2 px-1'), 'the probe sees a 2px border');
  assert.equal(/\bborder-2\b/.test('rounded-9e-md border px-1'), false, 'and does not see one in a 1px box');
  assert.ok(/\bborder\b/.test('rounded-9e-md border px-1'), 'while the 1px box does still have a border');
  assert.ok(/\bborder\b/.test('rounded-9e-md border-2 px-1'), 'and `\\bborder\\b` alone cannot tell them apart');
  // The ring probe, against a box that has none.
  assert.equal(/\bhover:ring-2\b/.test('group cursor-pointer border px-1'), false);
  assert.ok(/\bhover:ring-2\b/.test('border px-1 hover:ring-2'));
});

test('the hover RING is the round’s own type colour, at full strength', () => {
  /**
   * The ring restates the border it sits against, so it takes the SAME hex —
   * not the 10% tint, which belongs to the background alone. Asserted as a
   * relationship for the same reason the tint is: a literal would pass on a
   * fixture of one type and say nothing about the mapping.
   *
   * ── IT TAKES TWO CLASSES, AND THE COLOUR NAME IS OURS ───────────────────────
   * `hover:ring-2` paints the ring and `hover:ring-[color:var(--round-ring)]`
   * colours it — in Tailwind the WIDTH utility is what composes the box-shadow,
   * so a ring-colour class on its own emits a valid declaration and draws
   * nothing. Both are asserted, because either one alone is a silent no-op.
   *
   * The `color:` hint is mandatory: `ring-[…]` is contested by a width utility
   * and a colour utility, unlike `bg-[…]`, so a bare `var()` has to be guessed
   * at. test/fs/tailwindArbitraryValueRules compiles both classes and pins what
   * each actually emits.
   */
  const anchors = cellAnchors(html);
  assert.ok(anchors.length > 0, 'no linked desktop cell rendered — the fixture moved');

  let checked = 0;
  for (const a of anchors) {
    assert.match(a, /\bhover:ring-2\b/, `a linked round has no ring WIDTH class: ${a}`);
    assert.ok(
      a.includes('hover:ring-[color:var(--round-ring)]'),
      `a linked round has no ring COLOUR class: ${a}`,
    );
    const border = a.match(/border-color:(#[0-9a-fA-F]{6})/)?.[1];
    const ring = a.match(/--round-ring:(#[0-9a-fA-F]{6})/)?.[1];
    assert.ok(border, `no border colour to compare against: ${a}`);
    assert.ok(ring, `the ring colour variable is missing: ${a}`);
    assert.equal(ring, border, 'the ring must restate the border, not a tint of it');
    checked += 1;
  }
  assert.ok(checked > 0, 'no round carried both a border and a ring colour — nothing was checked');
});

test('the cell does NOT set --tw-ring-color inline — the focus ring stays brand blue', () => {
  /**
   * ── A REGRESSION THAT WOULD LOOK LIKE A SIMPLIFICATION ──────────────────────
   * `hover:ring-2` reads Tailwind's own `--tw-ring-color`, so setting THAT
   * variable in the inline style colours the ring with one fewer class and
   * deletes the arbitrary-value class entirely. It compiles, it renders, and
   * under a mouse it is indistinguishable from what ships. It is very likely to
   * be proposed as a tidy-up.
   *
   * It also breaks the KEYBOARD FOCUS RING. globals.css sets an app-wide
   * `*:focus-visible { … ring-2 ring-9e-brand ring-offset-2 }`, and an inline
   * custom property outranks every author rule no matter its specificity — so
   * `--tw-ring-color` set inline wins on :focus-visible too and repaints the
   * focus indicator in the round's delivery-type colour. Against
   * `--tw-ring-offset-color: var(--page-bg)` on the LIGHT theme:
   *
   *     #2486FF brand      3.54:1   passes WCAG 1.4.11 (floor 3:1)
   *     #00CCFF classroom  1.90:1   FAILS
   *     #22C55E online     2.28:1   FAILS
   *     #8B5CF6 hybrid     4.23:1   passes
   *
   * Classroom is the fallback for a round with no `type`, so the common case is
   * the failing one — and the dark theme passes on all four, so testing there
   * would show nothing. Hence a test rather than a comment.
   *
   * Asserted on EVERY anchor in the render, not just the cells, because the
   * shortcut is equally available to the mobile row.
   */
  for (const a of (html.match(/<a [^>]*>/g) ?? [])) {
    assert.equal(
      a.includes('--tw-ring-color'),
      false,
      'an inline --tw-ring-color hijacks the app-wide focus ring: ' + a.slice(0, 200),
    );
  }
  // And the same for the inert spans, which carry an inline style too.
  for (const block of inertBlocks(html)) {
    assert.equal(block.includes('--tw-ring-color'), false, 'the inert round must not set it either');
  }
});

test('CONTROL: the --tw-ring-color probe DOES fire on the shortcut it bans', () => {
  /**
   * The assertion above is an absence over a matcher that must really be
   * reading the anchors. Both halves are checked: the probe sees the banned
   * property when it is present, and the extractor is finding real anchors.
   */
  const shortcut = '<a href="/x" class="hover:ring-2" style="border-color:#00CCFF;--tw-ring-color:#00CCFF">';
  assert.ok(shortcut.includes('--tw-ring-color'), 'the probe sees the shortcut');
  assert.equal(
    '<a href="/x" style="border-color:#00CCFF;--round-ring:#00CCFF">'.includes('--tw-ring-color'),
    false,
    'and does not confuse our own variable for it',
  );
  const anchors = html.match(/<a [^>]*>/g) ?? [];
  assert.ok(anchors.length > 0, 'the extractor found no anchors at all — the test above was vacuous');
  assert.ok(
    anchors.some((a) => a.includes('--round-ring')),
    'and at least one really does carry the ring colour, under our own name',
  );
});

test('CONTROL: the ring colour is NOT the 10% tint the background uses', () => {
  /**
   * The two custom properties on this element are one hex apart in intent and
   * would both "match the border" under a loose enough reading. If the ring ever
   * took `trainingTypeTint(type, 0.1)` it would be a 10% wash of a 1px line —
   * effectively invisible — and an assertion that only checked the CHANNELS
   * would still pass. So the shapes are asserted as distinct.
   */
  for (const a of cellAnchors(html)) {
    assert.match(a, /--round-ring:#[0-9a-fA-F]{6}/, 'the ring is a plain hex');
    assert.equal(
      /--round-ring:rgba/.test(a),
      false,
      'a tinted ring on a 1px border is invisible — the ring takes the full colour',
    );
    assert.match(a, /--round-hover-bg:rgba/, 'while the background is still the rgba tint');
  }
});

test('the INERT round gets no hover class and neither hover variable', () => {
  /**
   * A round nobody can book does not light up. The inert branch sets neither the
   * classes nor the custom properties, so there is nothing for a pointer to
   * trigger even if a stylesheet somewhere defined the variables.
   *
   * The RING is held to the same rule as the background, and it is the easier of
   * the two to leak: `hover:ring-2` carries no value, so a copy-paste onto the
   * inert branch would compile and paint perfectly — a sold-out round that
   * lights up under the pointer, which is exactly the button-appearance /
   * button-affordance confusion this whole file exists to prevent.
   */
  for (const block of inertBlocks(html)) {
    assert.equal(block.includes('hover:bg-'), false, `an inert round declares a hover: ${block.slice(0, 120)}`);
    assert.equal(block.includes('--round-hover-bg'), false, 'and must not carry the hover variable');
    assert.equal(block.includes('ring'), false, `an inert round must not ring: ${block.slice(0, 120)}`);
    assert.equal(block.includes('--round-ring'), false, 'nor carry a ring colour it can never use');
  }
});

test('CONTROL: the ring probes DO see the ring on the LINKED round', () => {
  /**
   * The assertions above are absences, and an absence is satisfied by a matcher
   * that can no longer see anything. `inertBlocks` and `cellAnchors` are
   * different extractors over the same render, so this is what says the ring
   * really is present on one branch while genuinely absent from the other.
   */
  const anchors = cellAnchors(html);
  assert.ok(anchors.length > 0, 'no linked cell to check');
  assert.ok(anchors.every((a) => a.includes('ring')), 'the linked rounds do ring');
  assert.ok(anchors.every((a) => a.includes('--round-ring')), 'and do carry the colour');
  assert.ok(inertBlocks(html).length >= 2, 'and there really were inert blocks to find nothing in');
});

test('CONTROL: the LINKED rounds carry no not-allowed cursor', () => {
  /**
   * The other half. `cursor-not-allowed` slapped on every round would satisfy
   * the assertion above and break the page — an open round must still look
   * clickable, and on the desktop cell it must still say `cursor-pointer`.
   */
  const anchors = html.match(/<a href="[^"]*&amp;class=[^"]*"[^>]*>/g) ?? [];
  assert.ok(anchors.length > 0, 'no linked round rendered — the fixture moved');
  for (const a of anchors) {
    assert.equal(
      a.includes('cursor-not-allowed'),
      false,
      `a bookable round is marked not-allowed: ${a}`,
    );
  }
  assert.ok(
    anchors.some((a) => a.includes('cursor-pointer')),
    'the desktop cell must still declare a pointer cursor',
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleCarousel } from '@/components/registration/ScheduleCarousel';
import { TRAINING_TYPE_COLOR, trainingTypeTint } from '@/lib/schedule/trainingTypeColor';

/**
 * The round PICKER, rendered on the two screens a visitor books from:
 * the course detail page's "ตารางอบรม Public Training" and registration step 1's
 * "เลือกรอบการอบรม". One component, both screens.
 *
 * ── THE TWO DEFECTS THIS PINS ───────────────────────────────────────────────
 * 1. ENGLISH MONTHS on a Thai screen (`17-18 SEP`), from a local `MONTHS_EN`
 *    array — and a first-date-to-last-date label, so a round on 8, 10 and 12
 *    ต.ค. rendered `8-12 OCT`: three days advertised as five, on the very
 *    screen where the round is chosen.
 * 2. NO TAG ON CLASSROOM. The tag was gated on `type !== 'classroom'`, so the
 *    most common delivery type was the one with no label, and its absence had
 *    to be read as meaning something.
 *
 * ── THE CLOCK IS PINNED ─────────────────────────────────────────────────────
 * Every date is fixed and CURRENT_YEAR is a constant. The card takes the year as
 * a PROP precisely so a test can pin it; reading the real clock would make this
 * file mean something different every January.
 */

const CURRENT_YEAR = 2026;

const round = (id, dates, type = 'classroom', status = 'open') => ({
  _id: id, dates, type, status,
});

const render = (schedules, props = {}) =>
  renderToStaticMarkup(
    createElement(ScheduleCarousel, {
      schedules,
      selectedId: null,
      onSelect() {},
      currentYear: CURRENT_YEAR,
      ...props,
    }),
  );

/** Each round card, as its own markup. */
const cards = (html) => html.match(/<button[\s\S]*?<\/button>/g) ?? [];
/** The big date line inside a card. */
const dateOf = (card) => card.match(/<div class="text-xl font-bold[^"]*">([^<]*)<\/div>/)?.[1];

// ── Thai dates ──────────────────────────────────────────────────────────────

test('the card shows a THAI month, not an English one', () => {
  const html = render([round('s1', ['2026-09-17', '2026-09-18'])]);
  const label = dateOf(cards(html)[0]);
  assert.equal(label, '17-18 ก.ย.');
  assert.equal(/SEP|OCT|NOV|JAN/.test(html), false, 'an English month is still being rendered');
});

test('CONTROL: the English probe DOES fire on the label this replaced', () => {
  /**
   * The assertion above is partly an absence, and an absence probe that can
   * never match passes forever. Run against the exact string the old
   * `MONTHS_EN` branch produced.
   */
  assert.ok(/SEP|OCT|NOV|JAN/.test('17-18 SEP'), 'the probe sees the old label');
  assert.equal(/SEP|OCT|NOV|JAN/.test('17-18 ก.ย.'), false, 'and not the new one');
});

test('a NON-CONSECUTIVE round is comma-joined, not hyphenated', () => {
  /**
   * THE defect. 8, 10 and 12 ต.ค. are three separate days. The old label read
   * `8-12 OCT`, which claims training on the 9th and the 11th — on the screen
   * where the visitor picks the round they are about to pay for.
   */
  const html = render([round('s1', ['2026-10-08', '2026-10-10', '2026-10-12'])]);
  const label = dateOf(cards(html)[0]);
  assert.equal(label, '8, 10, 12 ต.ค.');
  assert.equal(label.includes('8-12'), false, 'a range would invent two training days');
});

test('a CONSECUTIVE round still collapses to a range', () => {
  // The other half: the comma rule must not turn every round into a list.
  assert.equal(dateOf(cards(render([round('s1', ['2026-09-17', '2026-09-18'])]))[0]), '17-18 ก.ย.');
});

test('a round crossing a month carries BOTH months', () => {
  const html = render([round('s1', ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])]);
  assert.equal(dateOf(cards(html)[0]), '30 ต.ค. - 2 พ.ย.');
});

test("showYear:'auto' — a current-year round has no year, a next-year one does", () => {
  /**
   * Why `'auto'` and not `false`: these rounds come from listSchedulesByCourse
   * with NO time horizon, so a low-frequency course viewed in Q4 lists next-year
   * rounds, and a bare `16-17 ก.พ.` on a card you can book from reads as a date
   * that has already passed.
   */
  const thisYear = render([round('s1', ['2026-02-16', '2026-02-17'])]);
  const nextYear = render([round('s1', ['2027-02-16', '2027-02-17'])]);
  assert.equal(dateOf(cards(thisYear)[0]), '16-17 ก.พ.');
  assert.equal(dateOf(cards(nextYear)[0]), '16-17 ก.พ. 70');
  assert.notEqual(dateOf(cards(thisYear)[0]), dateOf(cards(nextYear)[0]));
});

test('THE THROW: a caller that forgets currentYear fails loudly', () => {
  /**
   * The intended failure mode. formatRoundDays refuses to read a clock, because
   * this component renders during SSR too and Vercel (UTC) disagrees with a
   * Bangkok visitor about the year for seven hours every 31 December.
   */
  assert.throws(
    () => renderToStaticMarkup(createElement(ScheduleCarousel, {
      schedules: [round('s1', ['2026-09-17'])],
      selectedId: null,
      onSelect() {},
    })),
    /currentYear/,
  );
});

test('CONTROL: the throw is the YEAR, not a broken fixture', () => {
  assert.doesNotThrow(() => render([round('s1', ['2026-09-17'])]));
  // An empty carousel needs no year — it never reaches a label.
  assert.doesNotThrow(() => renderToStaticMarkup(createElement(ScheduleCarousel, {
    schedules: [], selectedId: null, onSelect() {},
  })));
});

// ── The type tag ────────────────────────────────────────────────────────────

test('CLASSROOM gets a tag too', () => {
  /**
   * It was gated on `type !== 'classroom'`, so the commonest type was the one
   * with no label — and a visitor comparing two cards saw a labelled Hybrid
   * beside an unlabelled card with no way to tell whether that meant Classroom
   * or "not recorded".
   */
  const html = render([round('s1', ['2026-09-17'], 'classroom')]);
  assert.ok(html.includes('>Classroom</span>'), 'the classroom tag is missing');
});

test('CONTROL: a `!== classroom` mutant DOES redden the tag test', () => {
  /**
   * Stated as the condition rather than run as a mutation, because the mutation
   * lives in the component: with the gate restored, the classroom card renders
   * no tag and the assertion above has nothing to find. The other two types are
   * asserted alongside so the probe is shown to distinguish them.
   */
  const html = render([
    round('s1', ['2026-09-17'], 'classroom'),
    round('s2', ['2026-09-24'], 'hybrid'),
  ]);
  assert.ok(html.includes('>Classroom</span>'), 'classroom tagged');
  assert.ok(html.includes('>Hybrid</span>'), 'hybrid tagged');
  // Under the old gate only ONE of these two would be present, so the pair is
  // what makes the claim "every round shows its type" rather than "some do".
  assert.equal(cards(html).length, 2);
  for (const card of cards(html)) {
    assert.match(card, /rounded-full px-2 py-0\.5 text-\[10px\] font-semibold/, 'a card has no type tag');
  }
});

test('every type is tagged, and an unknown one echoes its raw value', () => {
  const html = render([
    round('a', ['2026-09-01'], 'classroom'),
    round('b', ['2026-09-02'], 'hybrid'),
    round('c', ['2026-09-03'], 'online'),
    round('d', ['2026-09-04'], 'workshop'),
  ]);
  for (const label of ['Classroom', 'Hybrid', 'Online']) {
    assert.ok(html.includes(`>${label}</span>`), `${label} tag missing`);
  }
  // An unrecognised type is echoed rather than relabelled — the same policy the
  // status badge uses for an unknown status.
  assert.ok(html.includes('>workshop</span>'), 'an unknown type must echo its raw value');
});

test('a round with NO type renders no tag at all', () => {
  /**
   * Distinct from the COLOUR fallback, which does default to classroom: a
   * missing colour still has to paint something, a missing label does not have
   * to say anything. Claiming "Classroom" for a round upstream never typed would
   * be inventing data.
   */
  // NOT `round('s1', dates, undefined)` — that hits the helper's `= 'classroom'`
  // parameter default and tests the opposite of what it says. The round is built
  // literally, with no `type` key at all, which is what upstream actually sends.
  const html = render([{ _id: 's1', dates: ['2026-09-17'], status: 'open' }]);
  assert.equal(html.includes('>Classroom</span>'), false);
  assert.equal(/rounded-full px-2 py-0\.5 text-\[10px\] font-semibold/.test(html), false);

  // …and the card itself still rendered, so the absence above is the TAG being
  // withheld rather than the whole round vanishing.
  assert.equal(cards(html).length, 1);
  assert.equal(dateOf(cards(html)[0]), '17 ก.ย.');
});

test('the tag is a DOT plus dark text plus a 12% tint — never coloured text', () => {
  /**
   * `#00CCFF` as text on white is about 1.9:1, far short of WCAG AA's 4.5:1 for
   * body text, and this repo has paid for contrast fixes before. The colour is
   * carried by the dot and the tint; the label keeps the dark token, which
   * already has its dark-mode variant. That also mirrors how /schedule expresses
   * a type — a dot plus a border in the same hue.
   */
  const html = render([round('s1', ['2026-09-17'], 'hybrid')]);
  const tag = html.match(/<span class="mt-1\.5[^"]*"[^>]*>[\s\S]*?Hybrid<\/span>/)?.[0];
  assert.ok(tag, 'the tag is gone');

  assert.ok(
    tag.includes(`background-color:${trainingTypeTint('hybrid', 0.12)}`),
    `the tint is not the 12% type colour: ${tag}`,
  );
  assert.ok(tag.includes(`background-color:${TRAINING_TYPE_COLOR.hybrid}`), 'the dot is not the type colour');
  assert.match(tag, /text-\[var\(--text-primary\)\]/, 'the label must use the dark text token');
  /*
    `(?<!-)color:` and not a bare `color:` — `background-color:#8B5CF6` ENDS IN
    "color:#8B5CF6", so the loose probe matched the tint this test just asserted
    must be there and reported the correct component as a contrast failure. The
    lookbehind is what separates the CSS property `color` from the tail of
    `background-color`.
  */
  assert.equal(
    /(?<!-)color:#8B5CF6|text-violet-700|text-sky-700/.test(tag),
    false,
    'the type colour must not become the TEXT colour — it fails contrast',
  );
});

test('CONTROL: the coloured-text probe DOES fire on the shape it bans', () => {
  /**
   * The lookbehind above is doing real work, so both sides are shown: it must
   * catch an actual `color:` declaration and must NOT catch a
   * `background-color:` one. Without this the assertion is either vacuous or, as
   * it was on first run, a false alarm on correct markup.
   */
  const bad = '<span style="color:#8B5CF6">Hybrid</span>';
  const good = '<span style="background-color:#8B5CF6">Hybrid</span>';
  assert.ok(/(?<!-)color:#8B5CF6/.test(bad), 'the probe must see coloured TEXT');
  assert.equal(/(?<!-)color:#8B5CF6/.test(good), false, 'and must ignore a background');
  // The bare version everyone writes first, shown to be the wrong probe.
  assert.ok(/color:#8B5CF6/.test(good), 'a bare `color:` matches the background too');
});

test('the light-only Tailwind pill is gone', () => {
  const html = render([
    round('a', ['2026-09-01'], 'classroom'),
    round('b', ['2026-09-02'], 'hybrid'),
    round('c', ['2026-09-03'], 'online'),
  ]);
  for (const cls of ['bg-sky-100', 'bg-violet-100', 'bg-emerald-100', 'text-sky-700']) {
    assert.equal(html.includes(cls), false, `${cls} survived — it has no dark: variant`);
  }
});

test('CONTROL: the tint probe DOES distinguish the three types', () => {
  // Otherwise the tint assertion passes for a component that paints one colour.
  const html = render([
    round('a', ['2026-09-01'], 'classroom'),
    round('b', ['2026-09-02'], 'hybrid'),
    round('c', ['2026-09-03'], 'online'),
  ]);
  const tints = [...html.matchAll(/background-color:rgba\(([^)]*)\)/g)].map((m) => m[1]);
  assert.equal(new Set(tints).size, 3, `expected three distinct tints, got: ${tints.join(' | ')}`);
});

// ── The full round stays unbookable ─────────────────────────────────────────

test('a FULL round is disabled, not-allowed and dimmed', () => {
  /**
   * MSDB spells this `full`; the local override collection spells the same state
   * `closed`. Both must disable, which is why the component normalises rather
   * than comparing literals.
   */
  const html = render([round('s1', ['2026-09-17'], 'classroom', 'full')]);
  const card = cards(html)[0];
  // `disabled=""`, not a bare /\bdisabled\b/ — that matches inside
  // `disabled:opacity-30` because `:` is a non-word character.
  assert.match(card, /disabled=""/, 'the card must be a disabled button');
  assert.match(card, /aria-disabled="true"/);
  assert.ok(card.includes('cursor-not-allowed'), 'and say so with the cursor');
  assert.ok(card.includes('opacity-60'));
});

test('CONTROL: an OPEN round is none of those things', () => {
  const card = cards(render([round('s1', ['2026-09-17'], 'classroom', 'open')]))[0];
  assert.equal(/disabled=""/.test(card), false);
  assert.equal(card.includes('cursor-not-allowed'), false);
  assert.equal(card.includes('opacity-60'), false);
});

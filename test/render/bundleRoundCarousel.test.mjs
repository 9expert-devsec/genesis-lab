import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import {
  BundleRoundCarousel,
  clampStart,
  roundWindow,
} from '@/components/pageBuilder/sections/BundleRoundCarousel';
import { readSource } from '../sourceScan.mjs';
import { PICK_REASON_TEXT } from '@/lib/pageBuilder/bundleRegistration';

/**
 * THE ROUNDS OF ONE BUNDLE COURSE TILE, TWO AT A TIME.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * The chips filled a grid track whose width was the longest date label in the
 * whole bundle — about 5.2rem for a Thai round, which fits ONE column in a
 * ~200-230px tile. A five-round course therefore stacked `12-13 พ.ย. 69`,
 * `8-9 ธ.ค. 69`, `27-28 ม.ค. 70`, `24-25 ก.พ. 70` and `18-19 มี.ค. 70` one per
 * row, and the tile grew to roughly three times the height of its neighbours:
 * a row of cards in which the course with the most choice looked like the most
 * important thing on the page.
 *
 * ── WHAT A STATIC RENDER CAN AND CANNOT SAY ─────────────────────────────────
 * `renderToStaticMarkup` runs no effects and lays nothing out, so what is
 * asserted here is the carousel's INITIAL state — which is the state that
 * matters most, because it is what the server sends and what a visitor sees
 * before touching anything: two boxes in view, the left arrow already dead, the
 * position line reading 1–2.
 *
 * NOT COVERED, said plainly: that pressing an arrow scrolls (it calls
 * `scrollTo`, which jsdom does not implement), and that a swipe moves the
 * position line (that is the `scroll` listener, and there is no layout for it
 * to read). Both are verified in a browser, and the arrows and the line are
 * derived from ONE piece of state read off `scrollLeft` precisely so that
 * there is no second source of truth for them to disagree about.
 */

const row = (key, dateLabel, { pickable = true, reason = 'closed', type = 'classroom' } = {}) => ({
  key,
  dateLabel,
  pickable,
  reason: pickable ? null : reason,
  reasonLabel: pickable ? '' : PICK_REASON_TEXT[reason],
  type,
});

const FIVE = [
  row('r1', '12-13 พ.ย. 69'),
  row('r2', '8-9 ธ.ค. 69'),
  row('r3', '27-28 ม.ค. 70'),
  row('r4', '24-25 ก.พ. 70'),
  row('r5', '18-19 มี.ค. 70'),
];

const dom = (rows) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(BundleRoundCarousel, { rows }),
    )}</body>`,
  ).window.document;

const text = (n) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const boxes = (d) => [...d.querySelectorAll('[data-testid="bundle-round-box"]')];
const sel = (d, id) => d.querySelector(`[data-testid="${id}"]`);

// ── the heading carries the count ─────────────────────────────────────────

test('the heading is รอบอบรมที่เข้าร่วม (N รอบ), counting every offered round', () => {
  assert.equal(text(sel(dom(FIVE), 'bundle-round-heading')), 'รอบอบรมที่เข้าร่วม (5 รอบ)');
  assert.equal(text(sel(dom(FIVE.slice(0, 1)), 'bundle-round-heading')), 'รอบอบรมที่เข้าร่วม (1 รอบ)');
});

test('the count is the ROUNDS, not what is on screen', () => {
  // The whole reason the number is there: two boxes are visible and five exist,
  // so a count of the visible ones would say the opposite of "scroll for more".
  const d = dom(FIVE);
  assert.match(text(sel(d, 'bundle-round-heading')), /\(5 รอบ\)/);
  assert.equal(boxes(d).length, 5, 'every round is in the track, scrolled or not');
});

// ── two at a time, equal width ────────────────────────────────────────────

test('every box is half the track and is labelled รอบที่ k in author order', () => {
  const d = dom(FIVE);
  const list = boxes(d);
  assert.equal(list.length, 5);

  assert.deepEqual(
    list.map((b) => text(b.querySelector('[data-testid="bundle-round-ordinal"]'))),
    ['รอบที่ 1', 'รอบที่ 2', 'รอบที่ 3', 'รอบที่ 4', 'รอบที่ 5'],
  );

  for (const b of list) {
    assert.equal(
      b.getAttribute('style'),
      'flex-basis:calc(50% - 0.5rem)',
      `a box is not half the track: ${b.getAttribute('style')}`,
    );
    const cls = b.getAttribute('class') ?? '';
    assert.match(cls, /\bshrink-0\b/, `a box can shrink below half the track: ${cls}`);
    assert.match(cls, /\bgrow-0\b/, `a box can grow past half the track: ${cls}`);
    assert.match(cls, /\bsnap-start\b/, `a box is not a snap point: ${cls}`);
  }
});

test('the ordinal sits ABOVE the date, not beside it', () => {
  // The target shape: `รอบที่ 1` as its own line over the date. Asserted as
  // document order inside the box, which is what a column layout renders.
  const box = boxes(dom(FIVE))[0];
  const kids = [...box.children];
  assert.equal(kids[0].getAttribute('data-testid'), 'bundle-round-ordinal');
  assert.equal(kids[1].getAttribute('data-schedule-card'), '');
  assert.match(box.getAttribute('class') ?? '', /\bflex-col\b/);
});

test('the TRACK is what scrolls, with scroll-snap and no drag library', () => {
  const cls = sel(dom(FIVE), 'bundle-round-track').getAttribute('class') ?? '';
  assert.match(cls, /\boverflow-x-auto\b/, `the track does not scroll: ${cls}`);
  assert.match(cls, /\bsnap-x\b/);
  assert.match(cls, /\bsnap-mandatory\b/);
  // The page must never scroll sideways for this: the overflow is on the track.
  assert.equal(/overflow-x-visible|overflow-visible/.test(cls), false);
});

// ── where the controls sit: BELOW the chips, never beside the heading ─────

test('the heading row holds the heading and NOTHING else, in every tile', () => {
  /**
   * THE DEFECT THIS PINS, and it is a measurement rather than a preference.
   * The arrows sat at the heading row's right. They are `h-6` — 24px — against
   * an 11px label, so a tile with three or more rounds had a TALLER heading row
   * than its two-round neighbour and `items-center` pushed the text down inside
   * it. MEASURED in Chrome on one card holding a five-round and a two-round
   * course side by side, BEFORE the move:
   *
   *     tile        headingTop    chip-row top
   *     5 rounds        385.8          413.3
   *     2 rounds        381.3          404.3
   *
   * 4.5px of heading and 9px of chip row, so neighbouring tiles drew their
   * rounds at different heights because of how many rounds each course happened
   * to offer. AFTER: 381.3 / 404.3 for the five-round tile, the two-round tile
   * and the one-round tile alike.
   *
   * A static render cannot measure a top, so what is asserted here is the CAUSE
   * that measurement found: nothing of variable height may share a row with the
   * heading. The heading sits directly in the list, and its next sibling is the
   * track itself.
   */
  for (const n of [1, 2, 3, 5]) {
    const d = dom(FIVE.slice(0, n));
    const heading = sel(d, 'bundle-round-heading');
    assert.equal(
      heading.parentElement.getAttribute('data-testid'), 'bundle-round-list',
      'N=' + n + ': the heading is wrapped in a row of its own again',
    );
    assert.equal(
      heading.nextElementSibling?.getAttribute('data-testid'), 'bundle-round-track',
      'N=' + n + ': something sits between the heading and the chips',
    );
    assert.equal(heading.querySelector('button'), null, 'N=' + n + ': a button is inside the heading');
  }
});

test('the footer carries the position text LEFT and the arrows RIGHT, after the chips', () => {
  const d = dom(FIVE);
  const track = sel(d, 'bundle-round-track');
  const footer = sel(d, 'bundle-round-position').parentElement;

  // AFTER the track in document order, which is what keeps it from pushing the
  // chips down however tall its contents are.
  assert.equal(track.nextElementSibling, footer, 'the footer is not the element after the track');
  assert.match(footer.getAttribute('class') ?? '', /justify-between/);

  // Text first, arrows second — left and right under justify-between.
  const kids = [...footer.children];
  assert.equal(kids.length, 2, 'the footer holds ' + kids.length + ' things');
  assert.equal(kids[0].getAttribute('data-testid'), 'bundle-round-position');
  assert.deepEqual(
    [...kids[1].querySelectorAll('button')].map((b) => b.getAttribute('data-testid')),
    ['bundle-round-prev', 'bundle-round-next'],
  );
});

test('a tile with two rounds or fewer draws NO footer row at all', () => {
  // Both halves of the footer describe scrolling, so they are absent together.
  for (const n of [1, 2]) {
    const d = dom(FIVE.slice(0, n));
    const heading = sel(d, 'bundle-round-heading');
    const track = sel(d, 'bundle-round-track');
    assert.equal(sel(d, 'bundle-round-position'), null, 'N=' + n + ' drew a position line');
    assert.equal(track.nextElementSibling, null, 'N=' + n + ' drew a row after the chips');
    // …and the heading-to-chips relationship is identical to the paged case,
    // which is the whole point: the chips start at the same height either way.
    assert.equal(heading.nextElementSibling, track);
  }
});

test('CONTROL: the probes DO fire on the shape that misaligned', () => {
  /**
   * The assertions above are absences, and an absence probe that can never
   * match passes forever. Run the same three selectors over markup shaped the
   * way this component used to be — heading and arrows in one justify-between
   * row — and each must report the difference.
   */
  const old = new JSDOM(
    '<!doctype html><body><div data-testid="bundle-round-list">'
    + '<div class="flex items-center justify-between">'
    + '<span data-testid="bundle-round-heading">h</span>'
    + '<span><button data-testid="bundle-round-prev"></button></span>'
    + '</div><div data-testid="bundle-round-track"></div></div></body>',
  ).window.document;
  const heading = old.querySelector('[data-testid="bundle-round-heading"]');
  assert.notEqual(
    heading.parentElement.getAttribute('data-testid'), 'bundle-round-list',
    'the wrapper probe cannot tell the old shape apart',
  );
  assert.notEqual(
    heading.nextElementSibling?.getAttribute('data-testid'), 'bundle-round-track',
    'the sibling probe cannot tell the old shape apart',
  );
  assert.notEqual(
    heading.parentElement.querySelector('button'), null,
    'the button probe cannot tell the old shape apart',
  );
});

// ── the arrows step ONE round, not one page ───────────────────────────────

test('ARROWS STEP BY ONE: five rounds give 1-2, 2-3, 3-4, 4-5 and back', () => {
  /**
   * THE DEFECT THIS PINS. The arrows moved by `PER_VIEW`, so on five rounds the
   * sequence was 1-2 -> 3-4 -> 4-5: the third press asks for index 4, the clamp
   * pulls it to `total - PER_VIEW` = 3, and ROUND 4 IS SHOWN TWICE while round 3
   * is skipped on the way back. A visitor pressing ไปรอบถัดไป twice sees a round
   * they have already seen and never sees the one between.
   *
   * ── WHY THE ARITHMETIC AND NOT A CLICK ──────────────────────────────────
   * `goTo` measures a box with `getBoundingClientRect` to turn an index into a
   * scroll offset, and that is 0 in jsdom — so a simulated press moves nothing
   * and a click-driven test would pass against any step size at all. The
   * sequence of POSITIONS is the requirement, and `clampStart` / `roundWindow`
   * are exported so it can be asserted where it is actually decided. The arrows
   * are tied to them by the source scan below.
   */
  const total = 5;
  const seen = [];
  let start = 0;
  seen.push(roundWindow(start, total));
  for (let i = 0; i < 4; i += 1) {
    start = clampStart(start + 1, total);
    seen.push(roundWindow(start, total));
  }
  assert.deepEqual(
    seen.map((w) => w.from + '-' + w.to),
    ['1-2', '2-3', '3-4', '4-5', '4-5'],
    'the window did not slide one round at a time',
  );

  // And the same four positions in reverse, with no round skipped.
  const back = [];
  for (let i = 0; i < 4; i += 1) {
    start = clampStart(start - 1, total);
    back.push(roundWindow(start, total).from + '-' + roundWindow(start, total).to);
  }
  assert.deepEqual(back, ['3-4', '2-3', '1-2', '1-2']);
});

test('CONTROL: stepping by PER_VIEW reproduces the repeat this replaced', () => {
  /**
   * Without this the test above would pass against any step that happens to
   * reach 4-5 eventually. Two is the old step, and it must still produce the
   * reported sequence — round 4 twice, round 3 never first.
   */
  const total = 5;
  const seen = [];
  let start = 0;
  seen.push(roundWindow(start, total));
  for (let i = 0; i < 2; i += 1) {
    start = clampStart(start + 2, total);
    seen.push(roundWindow(start, total));
  }
  assert.deepEqual(seen.map((w) => w.from + '-' + w.to), ['1-2', '3-4', '4-5']);
});

test('the last position is always a FULL pair, never a lone box', () => {
  for (const total of [3, 4, 5, 9]) {
    const last = clampStart(999, total);
    const w = roundWindow(last, total);
    assert.equal(w.to - w.from, 1, 'N=' + total + ' ends on a single box: ' + JSON.stringify(w));
    assert.equal(w.to, total, 'N=' + total + ' does not end on the last round');
  }
  // A list shorter than the window cannot scroll at all.
  for (const total of [0, 1, 2]) {
    assert.equal(clampStart(999, total), 0, 'N=' + total + ' scrolled');
  }
});

test('three rounds give exactly two positions', () => {
  const total = 3;
  assert.deepEqual(roundWindow(clampStart(0, total), total), { from: 1, to: 2 });
  assert.deepEqual(roundWindow(clampStart(1, total), total), { from: 2, to: 3 });
  assert.deepEqual(roundWindow(clampStart(2, total), total), { from: 2, to: 3 });
});

test('the arrows are WIRED to the one-round step, and the clamp is shared', () => {
  /**
   * The arithmetic above is only the requirement if the buttons use it. And the
   * clamp has to be the SAME one the scroll reader applies, or a swipe and an
   * arrow press would disagree about which round is first — the position line
   * reads `1-2 จาก 5` while the track shows 3 and 4.
   */
  const { code } = readSource('src/components/pageBuilder/sections/BundleRoundCarousel.jsx');
  assert.match(code, /const STEP = 1;/, 'the arrow step is no longer one round');
  assert.match(code, /onClick=\{\(\) => goTo\(start - STEP\)\}/, 'the back arrow does not step by STEP');
  assert.match(code, /onClick=\{\(\) => goTo\(start \+ STEP\)\}/, 'the next arrow does not step by STEP');
  assert.equal(
    /goTo\(start [-+] PER_VIEW\)/.test(code), false,
    'an arrow still pages by PER_VIEW',
  );
  // One clamp, three readers: goTo, the scroll reader, and the position line.
  assert.equal(
    (code.match(/clampStart\(/g) ?? []).length, 3,
    'the clamp is not shared by goTo, the scroll reader and the window helper',
  );
  assert.match(code, /const \{ from, to \} = roundWindow\(start, total\)/);
});

// ── no chip may sit on the clipping edge ──────────────────────────────────

test('a box subtracts a FULL gap, so the pair does not fill the track exactly', () => {
  /**
   * THE CLIPPING, AND ITS CAUSE. The box width was `calc(50% - 0.25rem)`
   * against `gap-2` (0.5rem), so two boxes plus one gap totalled EXACTLY 100%
   * of the track. MEASURED in Chrome, the second box's right edge against the
   * track's end: -0.02px at 1440, 0.00px at 768, 0.00px at 640, 0.00px at 375.
   * Flush at every width, with a 2px border on it and the third box beginning
   * on the same pixel — which is what read as "8-9 ธ.ค. 6…".
   *
   * It was NOT the chip and NOT its text: no date overflowed its chip at any
   * width (scrollWidth === clientWidth throughout). It was not the viewport
   * either (documentElement.scrollWidth === clientWidth at every width). It was
   * this subtraction.
   *
   * A full gap is subtracted now — measured at -8px clear at every width — and
   * the 8px it frees shows a sliver of the third box, which is the ordinary
   * carousel affordance for "there is more this way".
   *
   * A static render has no layout, so the ARITHMETIC is what is pinned: the gap
   * the track declares and the amount a box subtracts must be the SAME number.
   * Equal means the pair spans 100% minus one gap and the clip edge falls a
   * whole gap clear of the second box; half of it means they span the track
   * exactly, which is the state that clipped.
   */
  const d = dom(FIVE);
  const trackCls = sel(d, 'bundle-round-track').getAttribute('class') ?? '';
  const gapMatch = /\bgap-(\d+)\b/.exec(trackCls);
  assert.notEqual(gapMatch, null, 'the track declares no gap: ' + trackCls);
  const gapRem = Number(gapMatch[1]) * 0.25;

  const style = boxes(d)[0].getAttribute('style') ?? '';
  const subMatch = /calc\(50% - ([\d.]+)rem\)/.exec(style);
  assert.notEqual(subMatch, null, 'the box width is not a 50% calc: ' + style);
  const subRem = Number(subMatch[1]);

  assert.equal(
    subRem, gapRem,
    'a box subtracts ' + subRem + 'rem against a ' + gapRem + 'rem gap. Equal is the rule: '
    + 'at half the gap the two boxes plus the gap between them span the track exactly, '
    + 'and the second chip sits on the overflow clip edge',
  );
});

test('CONTROL: the arithmetic probe rejects the spelling that clipped', () => {
  // gap-2 is 0.5rem. Half of it — what a box used to subtract — must not
  // satisfy the equality above, or that check could not have caught this.
  const gapRem = 2 * 0.25;
  assert.notEqual(0.25, gapRem, 'the half-gap value that clipped would now pass');
  assert.equal(0.5, gapRem, 'the full-gap value does not match the gap');
});

// ── the arrows ────────────────────────────────────────────────────────────

test('the arrows are real buttons with Thai labels and a visible focus ring', () => {
  const d = dom(FIVE);
  const prev = sel(d, 'bundle-round-prev');
  const next = sel(d, 'bundle-round-next');

  for (const [el, label] of [[prev, 'เลื่อนไปรอบก่อนหน้า'], [next, 'เลื่อนไปรอบถัดไป']]) {
    // A <button> is keyboard-operable by being a button — Tab reaches it and
    // Enter/Space fire its click. A div with an onClick would not be.
    assert.equal(el.tagName, 'BUTTON');
    assert.equal(el.getAttribute('type'), 'button');
    assert.equal(el.getAttribute('aria-label'), label);
    assert.match(
      el.getAttribute('class') ?? '',
      /focus-visible:ring-2/,
      'a keyboard user following the arrows has nothing to see',
    );
  }

  // And they say what they move.
  const trackId = sel(d, 'bundle-round-track').getAttribute('id');
  assert.ok(trackId, 'the track has no id for the arrows to name');
  assert.equal(prev.getAttribute('aria-controls'), trackId);
  assert.equal(next.getAttribute('aria-controls'), trackId);
});

test('the arrows DISABLE at the ends rather than disappearing', () => {
  /**
   * The initial state is the start of the track, so ไปรอบก่อนหน้า is dead and
   * ไปรอบถัดไป is live. Disabled rather than hidden: a control that vanishes
   * at the end of a track takes its own width with it, and the heading row
   * then shifts as a visitor reaches the last round.
   */
  const d = dom(FIVE);
  assert.equal(sel(d, 'bundle-round-prev').hasAttribute('disabled'), true);
  assert.equal(sel(d, 'bundle-round-next').hasAttribute('disabled'), false);
  assert.match(
    sel(d, 'bundle-round-prev').getAttribute('class') ?? '',
    /disabled:opacity-40/,
    'a dead arrow looks live',
  );
});

test('three rounds get arrows; two get none, and no กำลังแสดง line either', () => {
  const three = dom(FIVE.slice(0, 3));
  assert.notEqual(sel(three, 'bundle-round-next'), null);
  assert.notEqual(sel(three, 'bundle-round-position'), null);

  for (const n of [1, 2]) {
    const d = dom(FIVE.slice(0, n));
    assert.equal(sel(d, 'bundle-round-prev'), null, `${n} round(s) drew a dead arrow`);
    assert.equal(sel(d, 'bundle-round-next'), null, `${n} round(s) drew a dead arrow`);
    assert.equal(
      sel(d, 'bundle-round-position'), null,
      `${n} round(s) got a line about scrolling with nothing to scroll`,
    );
    // The boxes themselves are still drawn, and still half the track.
    assert.equal(boxes(d).length, n);
  }
});

// ── the position line ─────────────────────────────────────────────────────

test('the position line reads กำลังแสดงรอบ 1–2 จาก N, and announces changes', () => {
  const d = dom(FIVE);
  const line = sel(d, 'bundle-round-position');
  assert.equal(text(line), 'กำลังแสดงรอบ 1–2 จาก 5');
  // An en dash, which is what the design shows — not a hyphen, and not the
  // minus sign a copy-paste from a spreadsheet would bring.
  assert.ok(text(line).includes('–'), 'the range is not an en dash');
  assert.equal(
    line.getAttribute('aria-live'), 'polite',
    'the arrows change this without moving focus, so nothing would be announced',
  );
});

test('an ODD tail still reads a real range, not 4–5 of 5 shifted off the end', () => {
  // Three rounds: the last page shows 2–3, never 3–4. Asserted here at the
  // start of the track, where the arithmetic that could run past N is the `to`
  // clamp.
  assert.equal(text(sel(dom(FIVE.slice(0, 3)), 'bundle-round-position')), 'กำลังแสดงรอบ 1–2 จาก 3');
});

// ── the chip's existing rules survive ─────────────────────────────────────

test('a non-pickable round keeps the faded look and says why only to a screen reader', () => {
  const d = dom([row('r1', '12-13 พ.ย. 69'), row('r2', '8-9 ธ.ค. 69', { pickable: false, reason: 'full' })]);
  const [open, closed] = boxes(d);

  assert.equal(open.getAttribute('data-pickable'), 'yes');
  assert.equal(closed.getAttribute('data-pickable'), 'no');
  assert.equal(closed.getAttribute('data-reason'), 'full');

  assert.equal(open.querySelector('[data-schedule-card]').getAttribute('data-tone'), 'scoped');
  assert.equal(closed.querySelector('[data-schedule-card]').getAttribute('data-tone'), 'muted');

  // The word is IN the chip for assistive technology — greying is a colour and
  // WCAG 1.4.1 does not let colour be the only carrier — and nowhere on screen.
  assert.equal(text(closed.querySelector('.sr-only')), 'เต็ม');
  const visible = [...closed.querySelectorAll('*')]
    .filter((el) => !el.classList.contains('sr-only') && el.children.length === 0)
    .map((el) => text(el))
    .filter(Boolean);
  assert.deepEqual(visible, ['รอบที่ 2', '8-9 ธ.ค. 69'], `visible box content: ${visible}`);
});

test('no dot, no status pill, no pick deadline — the card rules are unchanged', () => {
  const d = dom(FIVE);
  for (const b of boxes(d)) {
    assert.equal(b.querySelector('[data-schedule-card]').getAttribute('data-dot'), 'none');
  }
  const body = text(d.body);
  assert.equal(/ลงทะเบียน/.test(body), false, 'a round is offering registration of its own');
  assert.equal(/เลือกได้ถึง/.test(body), false, 'the pick deadline is back on the public card');
  for (const word of Object.values(PICK_REASON_TEXT)) {
    assert.equal(
      d.querySelectorAll(`[data-testid="bundle-round-box"] > :not(.sr-only)`).length > 0 &&
        [...d.querySelectorAll('[data-testid="bundle-round-box"]')].some((b) =>
          [...b.querySelectorAll(':scope *:not(.sr-only)')].some((el) => text(el) === word),
        ),
      false,
      `the refusal word "${word}" is visible on a chip`,
    );
  }
});

test('nothing renders for no rounds at all', () => {
  for (const rows of [undefined, null, []]) {
    assert.equal(dom(rows).querySelector('[data-testid="bundle-round-list"]'), null);
  }
});

// ── tokens only, so a light tile inside a Navy card stays light ───────────

test('no `dark:` colour anywhere in the carousel', () => {
  /**
   * A bundle course tile can carry `.pb-bundle-tile-light`, which re-declares
   * the semantic tokens so the tile stays light inside a Navy card. Tailwind's
   * `dark:` compiles to `:is(.dark *)` — it matches a descendant of ANY `.dark`
   * ancestor and cannot be cancelled by nesting — so a single `dark:` utility
   * in here would paint its dark form on the deliberately light tile.
   */
  const html = renderToStaticMarkup(createElement(BundleRoundCarousel, { rows: FIVE }));
  const classes = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]).join(' ');
  const dark = classes.split(/\s+/).filter((c) => c.startsWith('dark:'));
  assert.deepEqual(dark, [], `dark: utilities inside the tile: ${dark.join(' ')}`);
});

test('CONTROL: the dark: probe DOES fire on a class string that has one', () => {
  const classes = 'text-9e-navy dark:text-white';
  assert.deepEqual(classes.split(/\s+/).filter((c) => c.startsWith('dark:')), ['dark:text-white']);
});

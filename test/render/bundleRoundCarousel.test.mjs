import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { BundleRoundCarousel } from '@/components/pageBuilder/sections/BundleRoundCarousel';
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
      'flex-basis:calc(50% - 0.25rem)',
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

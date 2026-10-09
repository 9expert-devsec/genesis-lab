import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { BundleRoundPicks, initialBundlePicks } from '@/components/registration/BundleRoundPicks';

/**
 * The per-course pick control.
 *
 * ── IT IS CHIPS NOW, AND THAT IS WHAT CHANGED IN THIS FILE ───────────────
 * Every assertion that used to read `<option disabled>` reads a chip instead.
 * The CLAIMS are the same ones — a non-pickable round stays visible and says
 * why, a locked course cannot be chosen from, a cleared pick is named on the
 * course it was cleared from — because none of them was ever about a
 * `<select>`; they were about what an applicant can see and reach.
 *
 * Two are NEW and belong to the chips specifically:
 *   · the control is the SHARED one, pinned by `data-round-pick-card` /
 *     `data-round-pick-chip` rather than by a class string a copy could also
 *     satisfy;
 *   · the reason is NOT VISIBLE on a chip. It used to be appended to the
 *     option's own label (`12-13 พ.ย. 69 — เต็ม`), and the rule now is the
 *     public bundle card's: greyed, with the word in `sr-only` and in the
 *     tooltip, and no status word on screen.
 *
 * ── IT IS RENDERED, NOT CLICKED ──────────────────────────────────────────
 * `renderToStaticMarkup` produces no event handlers, so what is asserted here
 * is the control's STATE for a given set of picks: which chips are disabled,
 * which rows are locked, what reason each one gives. The transitions — choosing
 * a round, the pruning that follows — are asserted by calling the same pure
 * functions the component calls, in test/pure/bundleRoundChoice, so neither
 * side is tested through a simulated click that proves nothing about the other.
 */

const TODAY = '2026-10-08';

const offer = (id, dates, pickUntil) => ({
  id,
  snapshot: { id, dates, type: 'onsite' },
  ...(pickUntil === undefined ? {} : { pickUntil }),
});
const item = (id, rounds) => ({ id, courseId: `C-${id}`, rounds });
const liveOf = (...pairs) => Object.fromEntries(pairs);
const live = (id, dates, status = 'open') => [id, { status, dates }];

const dom = (props) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(BundleRoundPicks, {
        today: TODAY,
        picks: {},
        onChange: () => {},
        ...props,
      }),
    )}</body>`,
  ).window.document;

const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const rowsOf = (d) => [...d.querySelectorAll('[data-testid="bundle-pick-row"]')];
/** The chips of one row (or of the whole document), keyed by round id. */
const chipsOf = (el) =>
  Object.fromEntries(
    [...el.querySelectorAll('[data-round-pick-chip]')].map((c) => [c.getAttribute('data-round-id'), c]),
  );

// ── the control is the SHARED one ──────────────────────────────────────────

test('the step draws the SHARED career-path picker, not a bundle-shaped copy', () => {
  /**
   * Pinned by the shared component's own markers. A class-string assertion
   * would go green against a hand-rolled div that copied the classes, which is
   * exactly the drift sharing the component exists to prevent — and it is how
   * this repo already pins ScheduleCard.
   *
   * The absence probe matters as much: a `<select>` left anywhere in this
   * control is the old dropdown surviving beside the chips.
   */
  const d = dom({
    items: [item('i1', [offer('a1', ['2026-11-02'])])],
    liveStatusById: liveOf(live('a1', ['2026-11-02'])),
  });
  assert.equal(d.querySelectorAll('[data-round-pick-card]').length, 1);
  assert.equal(d.querySelectorAll('[data-round-pick-chip]').length, 1);
  assert.equal(d.querySelectorAll('select').length, 0, 'a dropdown is still being rendered');
});

test('CONTROL: the dropdown probe DOES fire on markup that has one', () => {
  // An absence probe that can never match passes forever.
  const probe = new JSDOM('<!doctype html><body><select><option></option></select></body>');
  assert.equal(probe.window.document.querySelectorAll('select').length, 1);
});

// ── one card per course, every offered round present ──────────────────────

test('one card per course, in item order, with every offered round as a chip', () => {
  const d = dom({
    items: [
      item('i1', [offer('a1', ['2026-11-02']), offer('a2', ['2026-12-10'])]),
      item('i2', [offer('b1', ['2026-11-20'])]),
    ],
    liveStatusById: liveOf(live('a1', ['2026-11-02']), live('a2', ['2026-12-10']), live('b1', ['2026-11-20'])),
  });
  const rows = rowsOf(d);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.getAttribute('data-item-id')), ['i1', 'i2']);

  // No placeholder row to count any more — the chips ARE the options.
  assert.deepEqual(Object.keys(chipsOf(rows[0])), ['a1', 'a2']);
  assert.deepEqual(Object.keys(chipsOf(rows[1])), ['b1']);
});

test('a non-pickable round stays visible, is not selectable, and says why OFF-SCREEN', () => {
  const d = dom({
    items: [item('i1', [offer('a1', ['2026-11-02']), offer('a2', ['2026-12-10']), offer('a3', ['2026-12-20'])])],
    liveStatusById: liveOf(
      live('a1', ['2026-11-02']),
      live('a2', ['2026-12-10'], 'full'),
      live('a3', ['2026-12-20'], 'closed'),
    ),
  });
  const by = chipsOf(d);

  assert.equal(by.a1.hasAttribute('disabled'), false);
  assert.equal(by.a2.hasAttribute('disabled'), true);
  assert.equal(by.a3.hasAttribute('disabled'), true);
  assert.equal(by.a2.getAttribute('data-pickable'), 'no');

  // The reason reaches assistive technology and the tooltip…
  assert.equal(text(by.a2.querySelector('.sr-only')), 'เต็ม');
  assert.equal(by.a2.getAttribute('title'), 'เต็ม');
  assert.equal(text(by.a3.querySelector('.sr-only')), 'ปิดรับ');

  // …and NOT the visible label, which is the date and the delivery type only.
  const visible = [...by.a2.children]
    .filter((el) => !el.classList.contains('sr-only'))
    .map((el) => text(el));
  assert.deepEqual(visible, ['10 ธ.ค. 69', 'onsite'], `visible chip content: ${visible}`);
});

test('a round past its pick deadline is not selectable and says หมดเวลาเลือก', () => {
  const d = dom({
    items: [item('i1', [offer('a1', ['2026-12-10'], '2026-10-01')])],
    liveStatusById: liveOf(live('a1', ['2026-12-10'])),
  });
  const chip = chipsOf(d).a1;
  assert.equal(chip.hasAttribute('disabled'), true);
  assert.equal(chip.getAttribute('title'), 'หมดเวลาเลือก');
});

test('the PICKED round is marked as such and shows NO pick deadline', () => {
  /**
   * ── THE DEADLINE LINE IS GONE, AND THIS IS THE SAME TEST INVERTED ───────
   * It read `shows its confirm-by deadline` and asserted
   * `ยืนยันรอบนี้ได้ถึง 9 ธ.ค. 2569` under the picked chip. The standing
   * ruling the public bundle card already follows applies here: the pick
   * deadline is NOT shown to applicants.
   *
   * THE FIXTURE IS UNCHANGED — one course, one round picked, `pickUntil`
   * unset so the effective deadline is the day before the round starts and
   * the line WOULD render under the old code. That matters: asserting the
   * absence of an element on a fixture that never produced it is a pass for
   * the wrong reason, and this fixture is exactly the one that produced it.
   * The day the line showed (9 ธ.ค. 2569) is named below for the same reason —
   * the string that must not appear is the string this fixture would have
   * rendered.
   *
   * `data-selected` SURVIVES from the old test. Removing the line must not
   * also remove the only on-screen confirmation that a round was chosen.
   */
  const d = dom({
    items: [item('i1', [offer('a1', ['2026-12-10'])])],
    liveStatusById: liveOf(live('a1', ['2026-12-10'])),
    picks: { i1: 'a1' },
  });
  assert.equal(chipsOf(d).a1.getAttribute('data-selected'), 'yes');
  assert.equal(
    d.querySelector('[data-testid="bundle-pick-deadline"]'),
    null,
    'the confirm-by line is back on the pick step',
  );
  const body = text(d.querySelector('[data-testid="bundle-picks"]'));
  assert.equal(body.includes('ยืนยันรอบนี้ได้ถึง'), false, `pick step text: ${body}`);
  assert.equal(
    body.includes('9 ธ.ค. 2569'),
    false,
    'the deadline this fixture WOULD have shown is on screen in some other wording',
  );
});

// ── sequential ─────────────────────────────────────────────────────────────

const SEQ = [
  item('i1', [offer('a1', ['2026-11-02', '2026-11-03'])]),
  item('i2', [offer('b1', ['2026-11-03']), offer('b2', ['2026-11-04'])]),
];
const SEQ_LIVE = liveOf(
  live('a1', ['2026-11-02', '2026-11-03']),
  live('b1', ['2026-11-03']),
  live('b2', ['2026-11-04']),
);

test('SEQUENTIAL: the second course is LOCKED, and its lock line NAMES the first', () => {
  const d = dom({
    items: SEQ,
    sequential: true,
    liveStatusById: SEQ_LIVE,
    courseTitleByItemId: { i1: 'Excel Level 1', i2: 'Excel Level 2' },
  });
  const rows = rowsOf(d);
  assert.equal(rows[0].getAttribute('data-locked'), 'no');
  assert.equal(rows[1].getAttribute('data-locked'), 'yes');

  /**
   * NAMING THE COURSE, not "the previous one". The shared vocabulary's
   * `previous_not_picked` reads ต้องเลือกรอบของหลักสูตรก่อนหน้าก่อน, which is
   * true and makes the applicant count backwards; the career-path picker names
   * the course, and this follows it.
   */
  assert.equal(
    text(rows[1].querySelector('[data-round-pick-lock]')),
    'กรุณาเลือก Excel Level 1 ก่อน',
  );

  // EVERY chip on the locked card is greyed and unreachable.
  const chips = Object.values(chipsOf(rows[1]));
  assert.equal(chips.length, 2);
  for (const chip of chips) {
    assert.equal(chip.hasAttribute('disabled'), true, 'a locked course must not be choosable');
    assert.equal(chip.getAttribute('data-pickable'), 'no');
    assert.equal(chip.getAttribute('title'), 'กรุณาเลือก Excel Level 1 ก่อน');
  }
});

test('SEQUENTIAL: with no resolved name the lock line falls back to the shared wording', () => {
  // The first course's title is the code when nothing resolved it, and that is
  // still a name; the fallback below is for the unreachable no-previous case.
  const d = dom({ items: SEQ, sequential: true, liveStatusById: SEQ_LIVE });
  assert.equal(
    text(rowsOf(d)[1].querySelector('[data-round-pick-lock]')),
    'กรุณาเลือก C-i1 ก่อน',
  );
});

test('SEQUENTIAL: once the first is picked, the same-day round is not selectable and the next is', () => {
  const d = dom({ items: SEQ, sequential: true, liveStatusById: SEQ_LIVE, picks: { i1: 'a1' } });
  const rows = rowsOf(d);
  assert.equal(rows[1].getAttribute('data-locked'), 'no');
  assert.equal(rows[1].querySelector('[data-round-pick-lock]'), null);

  const by = chipsOf(rows[1]);
  assert.equal(by.b1.hasAttribute('disabled'), true, 'b1 starts the day a1 ends');
  assert.equal(by.b1.getAttribute('title'), 'เริ่มก่อนหลักสูตรก่อนหน้าจบ');
  assert.equal(text(by.b1.querySelector('.sr-only')), 'เริ่มก่อนหลักสูตรก่อนหน้าจบ');
  assert.equal(by.b2.hasAttribute('disabled'), false);
});

test('SEQUENTIAL: the rule is stated once, above the controls', () => {
  const on = dom({ items: SEQ, sequential: true, liveStatusById: SEQ_LIVE });
  assert.match(text(on.querySelector('[data-testid="bundle-picks-sequential-note"]')), /เลือกรอบตามลำดับ/);

  const off = dom({ items: SEQ, sequential: false, liveStatusById: SEQ_LIVE });
  assert.equal(off.querySelector('[data-testid="bundle-picks-sequential-note"]'), null);
});

test('a cleared pick is named on the course it was cleared from', () => {
  const d = dom({
    items: SEQ, sequential: true, liveStatusById: SEQ_LIVE,
    picks: { i1: 'a1' }, cleared: ['i2'],
  });
  const rows = rowsOf(d);
  assert.equal(rows[0].querySelector('[data-testid="bundle-pick-cleared"]'), null);
  assert.match(text(rows[1].querySelector('[data-testid="bundle-pick-cleared"]')), /เลือกรอบใหม่/);
});

// ── the server's refusal, shown on the course that caused it ──────────────

test("a 409 reason is shown on the affected course, in the server's words", () => {
  const d = dom({
    items: SEQ, sequential: true, liveStatusById: SEQ_LIVE,
    picks: { i1: 'a1', i2: 'b2' },
    serverErrors: { i2: 'full' },
  });
  const rows = rowsOf(d);
  assert.equal(rows[0].querySelector('[data-testid="bundle-pick-server-error"]'), null);
  const err = rows[1].querySelector('[data-testid="bundle-pick-server-error"]');
  assert.match(text(err), /เต็ม/);
  // And the card itself is marked, so the refusal is findable on a long step.
  assert.match(rows[1].getAttribute('class'), /border-red-300/);
});

test('an UNKNOWN server reason still says something actionable', () => {
  // A reason word the UI has no text for must not render an empty line.
  const d = dom({
    items: [item('i1', [offer('a1', ['2026-11-02'])])],
    liveStatusById: liveOf(live('a1', ['2026-11-02'])),
    serverErrors: { i1: 'not_offered' },
  });
  assert.match(
    text(d.querySelector('[data-testid="bundle-pick-server-error"]')),
    /เลือกรอบใหม่/,
  );
});

// ── labels ─────────────────────────────────────────────────────────────────

test('the card is labelled with the resolved course NAME, falling back to the code', () => {
  const items = [item('i1', [offer('a1', ['2026-11-02'])])];
  const liveStatusById = liveOf(live('a1', ['2026-11-02']));

  const named = dom({ items, liveStatusById, courseTitleByItemId: { i1: 'Microsoft Excel Level 1' } });
  assert.match(text(named.querySelector('[data-testid="bundle-pick-row"] h3')), /Microsoft Excel Level 1/);

  const bare = dom({ items, liveStatusById });
  assert.match(text(bare.querySelector('[data-testid="bundle-pick-row"] h3')), /C-i1/);
});

test('SEQUENTIAL numbers the courses; free choice does not', () => {
  const on = dom({ items: SEQ, sequential: true, liveStatusById: SEQ_LIVE });
  assert.match(text(on.querySelector('[data-testid="bundle-pick-row"] h3')), /^1\./);

  const off = dom({ items: SEQ, sequential: false, liveStatusById: SEQ_LIVE });
  assert.doesNotMatch(text(off.querySelector('[data-testid="bundle-pick-row"] h3')), /^1\./);
});

test('nothing renders when there is nothing to pick', () => {
  for (const items of [undefined, null, []]) {
    assert.equal(dom({ items, liveStatusById: {} }).querySelector('[data-testid="bundle-picks"]'), null);
  }
});

// ── the preselection rule ─────────────────────────────────────────────────

test('a course with ONE pickable round is preselected; the chips still render', () => {
  const items = [item('i1', [offer('a1', ['2026-11-02'])])];
  const liveStatusById = liveOf(live('a1', ['2026-11-02']));
  const picks = initialBundlePicks({ items, liveStatusById, today: TODAY });
  assert.deepEqual(picks, { i1: 'a1' });

  // Visible, not hidden: the review step must never show a round the applicant
  // was not shown choosing.
  const d = dom({ items, liveStatusById, picks });
  assert.equal(chipsOf(d).a1.getAttribute('data-selected'), 'yes');
});

test('a course with TWO pickable rounds is NOT preselected', () => {
  const items = [item('i1', [offer('a1', ['2026-11-02']), offer('a2', ['2026-12-10'])])];
  assert.deepEqual(
    initialBundlePicks({
      items,
      liveStatusById: liveOf(live('a1', ['2026-11-02']), live('a2', ['2026-12-10'])),
      today: TODAY,
    }),
    {},
  );
});

test('a single round that is NOT pickable is not preselected', () => {
  // The case where a stale page would otherwise pre-fill something the server
  // refuses — a full round must be shown greyed out, not chosen for them.
  const items = [item('i1', [offer('a1', ['2026-11-02'])])];
  assert.deepEqual(
    initialBundlePicks({ items, liveStatusById: liveOf(live('a1', ['2026-11-02'], 'full')), today: TODAY }),
    {},
  );
});

test('SEQUENTIAL preselection runs in order and drops what cannot fit', () => {
  // i1 has one pickable round ending 11-03; i2's only round starts 11-03, so
  // the chain cannot be completed and i2 must NOT be preselected.
  const picks = initialBundlePicks({
    items: [
      item('i1', [offer('a1', ['2026-11-02', '2026-11-03'])]),
      item('i2', [offer('b1', ['2026-11-03'])]),
    ],
    sequential: true,
    liveStatusById: liveOf(live('a1', ['2026-11-02', '2026-11-03']), live('b1', ['2026-11-03'])),
    today: TODAY,
  });
  assert.deepEqual(picks, { i1: 'a1' });
});

// ── the label never degrades to a raw id ──────────────────────────────────

test('the WIZARD dates a round from its snapshot when the fetch lost it', () => {
  // Same defect as the editor had, same fixture: the offered round has no live
  // row (the map is empty) but its snapshot can date it.
  const d = dom({
    items: [item('i1', [offer('6a0578e52cf974910f88cdf8', ['2026-09-24', '2026-09-25'])])],
    liveStatusById: {},
  });
  const chip = chipsOf(d)['6a0578e52cf974910f88cdf8'];
  assert.notEqual(chip, undefined, 'the round vanished from the picker');
  assert.doesNotMatch(text(chip), /6a0578e52cf974910f88cdf8/, 'an applicant is being shown a raw id');
  assert.match(text(chip), /24\s*-\s*25 ก\.ย\./);
  // And it is not pickable, because nothing live backs it.
  assert.equal(chip.hasAttribute('disabled'), true);
});

test('the WIZARD shows the Thai sentence when nothing can date a round', () => {
  const d = dom({
    items: [item('i1', [{ id: '6a0578e52cf974910f88cdf8' }])],
    liveStatusById: {},
  });
  const chip = chipsOf(d)['6a0578e52cf974910f88cdf8'];
  assert.doesNotMatch(text(chip), /6a0578e52cf974910f88cdf8/);
  assert.match(text(chip), /ไม่พบในตารางแล้ว/);
});

test('CONTROL: no chip anywhere in the picker is labelled with an ObjectId', () => {
  const d = dom({
    items: [
      item('i1', [offer('aaaaaaaaaaaaaaaaaaaaaaaa', ['2026-11-02']), { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' }]),
    ],
    liveStatusById: liveOf(live('aaaaaaaaaaaaaaaaaaaaaaaa', ['2026-11-02'])),
  });
  for (const chip of d.querySelectorAll('[data-round-pick-chip]')) {
    assert.doesNotMatch(text(chip) ?? '', /[0-9a-f]{24}/, `id-shaped label: ${text(chip)}`);
  }
});

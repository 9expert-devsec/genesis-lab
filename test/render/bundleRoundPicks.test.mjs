import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { BundleRoundPicks, initialBundlePicks } from '@/components/registration/BundleRoundPicks';

/**
 * The per-course pick control.
 *
 * ── IT IS RENDERED, NOT CLICKED ──────────────────────────────────────────
 * `renderToStaticMarkup` produces no event handlers, so what is asserted here
 * is the control's STATE for a given set of picks: which options are disabled,
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

// ── one control per course, every offered round present ────────────────────

test('one select per course, in item order, with every offered round listed', () => {
  const d = dom({
    items: [
      item('i1', [offer('a1', ['2026-11-02']), offer('a2', ['2026-12-10'])]),
      item('i2', [offer('b1', ['2026-11-20'])]),
    ],
    liveStatusById: liveOf(live('a1', ['2026-11-02']), live('a2', ['2026-12-10']), live('b1', ['2026-11-20'])),
  });
  const rows = [...d.querySelectorAll('[data-testid="bundle-pick-row"]')];
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.getAttribute('data-item-id')), ['i1', 'i2']);

  // Two offered rounds plus the placeholder.
  const opts = [...rows[0].querySelectorAll('option')].map((o) => o.getAttribute('value'));
  assert.deepEqual(opts, ['', 'a1', 'a2']);
});

test('a non-pickable round stays in the list, disabled, with its Thai reason', () => {
  const d = dom({
    items: [item('i1', [offer('a1', ['2026-11-02']), offer('a2', ['2026-12-10']), offer('a3', ['2026-12-20'])])],
    liveStatusById: liveOf(
      live('a1', ['2026-11-02']),
      live('a2', ['2026-12-10'], 'full'),
      live('a3', ['2026-12-20'], 'closed'),
    ),
  });
  const opts = [...d.querySelectorAll('option')];
  const by = Object.fromEntries(opts.map((o) => [o.getAttribute('value'), o]));

  assert.equal(by.a1.hasAttribute('disabled'), false);
  assert.equal(by.a2.hasAttribute('disabled'), true);
  assert.equal(by.a3.hasAttribute('disabled'), true);
  assert.match(text(by.a2), /เต็ม/);
  assert.match(text(by.a3), /ปิดรับ/);
  assert.equal(by.a2.getAttribute('data-reason'), 'full');
});

test('a round past its pick deadline is disabled and says หมดเวลาเลือก', () => {
  const d = dom({
    items: [item('i1', [offer('a1', ['2026-12-10'], '2026-10-01')])],
    liveStatusById: liveOf(live('a1', ['2026-12-10'])),
  });
  const opt = d.querySelector('option[value="a1"]');
  assert.equal(opt.hasAttribute('disabled'), true);
  assert.match(text(opt), /หมดเวลาเลือก/);
});

test('the PICKED round shows its confirm-by deadline', () => {
  const d = dom({
    items: [item('i1', [offer('a1', ['2026-12-10'])])],
    liveStatusById: liveOf(live('a1', ['2026-12-10'])),
    picks: { i1: 'a1' },
  });
  const line = d.querySelector('[data-testid="bundle-pick-deadline"]');
  assert.notEqual(line, null);
  assert.match(text(line), /9 ธ\.ค\. 2569/, 'the day before the round starts, Thai Buddhist year');
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

test('SEQUENTIAL: the second course is LOCKED until the first is picked', () => {
  const d = dom({ items: SEQ, sequential: true, liveStatusById: SEQ_LIVE });
  const rows = [...d.querySelectorAll('[data-testid="bundle-pick-row"]')];
  assert.equal(rows[0].getAttribute('data-locked'), 'no');
  assert.equal(rows[1].getAttribute('data-locked'), 'yes');

  const select = rows[1].querySelector('[data-testid="bundle-pick-select"]');
  assert.equal(select.hasAttribute('disabled'), true, 'a locked course must not be choosable');
  assert.match(text(rows[1].querySelector('[data-testid="bundle-pick-locked"]')), /ต้องเลือกรอบของหลักสูตรก่อนหน้าก่อน/);
});

test('SEQUENTIAL: once the first is picked, the same-day round is disabled and the next is not', () => {
  const d = dom({ items: SEQ, sequential: true, liveStatusById: SEQ_LIVE, picks: { i1: 'a1' } });
  const rows = [...d.querySelectorAll('[data-testid="bundle-pick-row"]')];
  assert.equal(rows[1].getAttribute('data-locked'), 'no');

  const by = Object.fromEntries(
    [...rows[1].querySelectorAll('option')].map((o) => [o.getAttribute('value'), o]),
  );
  assert.equal(by.b1.hasAttribute('disabled'), true, 'b1 starts the day a1 ends');
  assert.match(text(by.b1), /เริ่มก่อนหลักสูตรก่อนหน้าจบ/);
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
  const rows = [...d.querySelectorAll('[data-testid="bundle-pick-row"]')];
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
  const rows = [...d.querySelectorAll('[data-testid="bundle-pick-row"]')];
  assert.equal(rows[0].querySelector('[data-testid="bundle-pick-server-error"]'), null);
  const err = rows[1].querySelector('[data-testid="bundle-pick-server-error"]');
  assert.match(text(err), /เต็ม/);
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

test('the row is labelled with the resolved course NAME, falling back to the code', () => {
  const items = [item('i1', [offer('a1', ['2026-11-02'])])];
  const liveStatusById = liveOf(live('a1', ['2026-11-02']));

  const named = dom({ items, liveStatusById, courseTitleByItemId: { i1: 'Microsoft Excel Level 1' } });
  assert.match(text(named.querySelector('[data-testid="bundle-pick-row"]')), /Microsoft Excel Level 1/);

  const bare = dom({ items, liveStatusById });
  assert.match(text(bare.querySelector('[data-testid="bundle-pick-row"]')), /C-i1/);
});

test('SEQUENTIAL numbers the courses; free choice does not', () => {
  const on = dom({ items: SEQ, sequential: true, liveStatusById: SEQ_LIVE });
  assert.match(text(on.querySelector('[data-testid="bundle-pick-row"]')), /^1\./);

  const off = dom({ items: SEQ, sequential: false, liveStatusById: SEQ_LIVE });
  assert.doesNotMatch(text(off.querySelector('[data-testid="bundle-pick-row"]')), /^1\./);
});

test('nothing renders when there is nothing to pick', () => {
  for (const items of [undefined, null, []]) {
    assert.equal(dom({ items, liveStatusById: {} }).querySelector('[data-testid="bundle-picks"]'), null);
  }
});

// ── the preselection rule ─────────────────────────────────────────────────

test('a course with ONE pickable round is preselected; the control still renders', () => {
  const items = [item('i1', [offer('a1', ['2026-11-02'])])];
  const liveStatusById = liveOf(live('a1', ['2026-11-02']));
  const picks = initialBundlePicks({ items, liveStatusById, today: TODAY });
  assert.deepEqual(picks, { i1: 'a1' });

  // Visible, not hidden: the review step must never show a round the applicant
  // was not shown choosing.
  const d = dom({ items, liveStatusById, picks });
  assert.notEqual(d.querySelector('[data-testid="bundle-pick-select"]'), null);
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
  const opt = d.querySelector('option[value="6a0578e52cf974910f88cdf8"]');
  assert.notEqual(opt, null, 'the round vanished from the picker');
  assert.doesNotMatch(text(opt), /6a0578e52cf974910f88cdf8/, 'an applicant is being shown a raw id');
  assert.match(text(opt), /24\s*-\s*25 ก\.ย\./);
  // And it is not pickable, because nothing live backs it.
  assert.equal(opt.hasAttribute('disabled'), true);
});

test('the WIZARD shows the Thai sentence when nothing can date a round', () => {
  const d = dom({
    items: [item('i1', [{ id: '6a0578e52cf974910f88cdf8' }])],
    liveStatusById: {},
  });
  const opt = d.querySelector('option[value="6a0578e52cf974910f88cdf8"]');
  assert.doesNotMatch(text(opt), /6a0578e52cf974910f88cdf8/);
  assert.match(text(opt), /ไม่พบในตารางแล้ว/);
});

test('CONTROL: no option anywhere in the picker is labelled with an ObjectId', () => {
  const d = dom({
    items: [
      item('i1', [offer('aaaaaaaaaaaaaaaaaaaaaaaa', ['2026-11-02']), { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' }]),
    ],
    liveStatusById: liveOf(live('aaaaaaaaaaaaaaaaaaaaaaaa', ['2026-11-02'])),
  });
  for (const opt of d.querySelectorAll('option')) {
    assert.doesNotMatch(text(opt) ?? '', /[0-9a-f]{24}/, `id-shaped label: ${text(opt)}`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RenameStateReport } from '@/app/admin/courses/rename/_components/RenameExecutePanel';
import { detectRenameState, RENAME_STATE, RENAME_WRITE_STORES } from '@/lib/courses/renameCoursePlan';

/**
 * Every two-sided state, as an admin sees it.
 *
 * Driven through the REAL detector rather than hand-written state objects, so
 * the component is rendering the shape `inspectRenameState` returns. None of
 * these can be produced on demand in production — the interval lasts minutes,
 * the reverse divergence needs someone to rename MSDB by hand, and a conflict
 * needs two courses — which is exactly why they are fixtures.
 */

const counts = (over = {}) => ({
  ...Object.fromEntries(RENAME_WRITE_STORES.map((k) => [k, 0])),
  ...over,
});
const state = (o, n, hasOldCode, hasNewCode) =>
  detectRenameState({
    oldCounts: counts(o),
    newCounts: counts(n),
    upstream: { hasOldCode, hasNewCode },
  });

const render = (s) =>
  renderToStaticMarkup(
    createElement(RenameStateReport, { state: s, from: 'ZZTEST-EXCEL-01', to: 'EXCEL-HR-01' })
  );
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const stateAttr = (html) => /data-state="([^"]*)"/.exec(html)?.[1] ?? null;

// ── Nothing to report ───────────────────────────────────────────────────────

test('no state → nothing rendered', () => {
  assert.equal(renderToStaticMarkup(createElement(RenameStateReport, { state: null })), '');
});

// ── Each state is distinguishable in the markup ─────────────────────────────

const CASES = [
  { name: 'not started',     s: () => state({ article: 1 }, {}, true, false),               expect: RENAME_STATE.NOT_STARTED },
  { name: 'the interval',    s: () => state({}, { article: 1 }, true, false),               expect: RENAME_STATE.UPSTREAM_PENDING },
  { name: 'complete',        s: () => state({}, { article: 1 }, false, true),               expect: RENAME_STATE.COMPLETE },
  { name: 'upstream only',   s: () => state({ article: 1 }, {}, false, true),               expect: RENAME_STATE.UPSTREAM_ONLY },
  { name: 'conflict',        s: () => state({ article: 1 }, {}, true, true),                expect: RENAME_STATE.UPSTREAM_CONFLICT },
  { name: 'unknown',         s: () => state({ article: 1 }, {}, false, false),              expect: RENAME_STATE.UNKNOWN },
];

for (const { name, s, expect } of CASES) {
  test(`${name} renders as its own state`, () => {
    const html = render(s());
    assert.equal(stateAttr(html), expect, `${name} did not render as ${expect}`);
    // and it says something specific, not the bare key
    assert.ok(!text(html).includes(expect), `${name} rendered its raw state key as the label`);
    assert.ok(text(html).length > 60, `${name} rendered almost nothing`);
  });
}

test('the six states produce six DIFFERENT documents', () => {
  const docs = CASES.map(({ s }) => render(s()));
  assert.equal(new Set(docs).size, CASES.length, 'two states render identically');
});

// ── `complete` requires upstream agreement ──────────────────────────────────

/**
 * THE REGRESSION THIS ROUND EXISTS FOR.
 *
 * Before upstream was consulted, a genesis-done rename returned `complete` and
 * the screen said "finished" while MSDB still carried the old code — success
 * reported on exactly the failure the state report is for.
 */
test('GENESIS DONE + UPSTREAM PENDING DOES NOT SAY COMPLETE', () => {
  const html = render(state({}, { article: 1 }, true, false));
  assert.equal(stateAttr(html), RENAME_STATE.UPSTREAM_PENDING);
  assert.notEqual(stateAttr(html), RENAME_STATE.COMPLETE);
  assert.ok(!/เสร็จแล้ว/.test(text(html)), 'the interval rendered as finished');
  assert.match(text(html), /MSDB ยังเป็นรหัสเดิม/);
  assert.match(text(html), /หลักสูตรซ่อนอาจกลับมาแสดง/, 'the hidden-course risk is not named');
});

test('only BOTH SIDES AGREEING renders as complete', () => {
  const html = render(state({}, { article: 1 }, false, true));
  assert.equal(stateAttr(html), RENAME_STATE.COMPLETE);
  assert.match(text(html), /ทั้งสองฝั่งตรงกัน/);
});

// ── The reverse divergence, and its advice ──────────────────────────────────

/**
 * The state observed on the real site: MSDB renamed, genesis untouched. Its
 * advice is the OPPOSITE of the interval's — go back, not forward — so
 * rendering it as anything else would send the admin the wrong way.
 */
test('UPSTREAM-ONLY offers the undo, and does not read as an interrupted phase 1', () => {
  const html = render(state({ article: 1 }, {}, false, true));
  assert.equal(stateAttr(html), RENAME_STATE.UPSTREAM_ONLY);
  const t = text(html);
  assert.match(t, /MSDB เปลี่ยนแล้ว/);
  assert.match(t, /กลับเป็นรหัสเดิม/, 'the undo is not offered');
  assert.ok(!/ค้างอยู่กลางทาง/.test(t), 'the reverse divergence rendered as a half-finished phase 1');
});

// ── Reversibility is rendered, in every state ───────────────────────────────

test('EVERY state renders the reversibility fact', () => {
  // Including the partial branch, which returns early — the place an
  // "every state says so" rule quietly stops holding.
  const partial = state({ article: 1 }, { promotion: 1 }, true, false);
  for (const s of [...CASES.map((c) => c.s()), partial]) {
    assert.match(render(s), /data-testid="rename-reversibility"/, `${s.state} omits the reversibility line`);
  }
});

test('a state where genesis has NOT written says it can be undone by MSDB alone', () => {
  for (const s of [state({ article: 1 }, {}, false, true), state({ article: 1 }, {}, true, false)]) {
    assert.equal(s.reversible, true);
    assert.match(text(render(s)), /ย้อนกลับได้ทั้งหมดโดยแก้ที่ MSDB อย่างเดียว/);
  }
});

test('a state where genesis HAS written says the tool cannot undo it', () => {
  for (const s of [
    state({}, { article: 1 }, true, false),
    state({}, { article: 1 }, false, true),
    state({ article: 1 }, { promotion: 1 }, true, false),
  ]) {
    assert.equal(s.reversible, false);
    assert.match(text(render(s)), /ย้อนกลับด้วยเครื่องมือนี้ไม่ได้/);
  }
});

// ── The partial branch still works ──────────────────────────────────────────

test('a partial rename still names its unfinished stores and offers the re-run', () => {
  const html = render(state({ article: 1, scheduleLocal: 2 }, { courseExtension: 1 }, true, false));
  const t = text(html);
  assert.match(t, /ค้างอยู่กลางทาง/);
  assert.match(t, /article/);
  assert.match(t, /scheduleLocal/);
  assert.match(t, /ทำซ้ำแล้วได้ผลเดิม/, 'the re-run is offered without saying it is safe');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the state attribute really varies, and is not a constant', () => {
  const seen = new Set(CASES.map(({ s }) => stateAttr(render(s()))));
  assert.equal(seen.size, CASES.length);
  assert.equal(stateAttr('<div></div>'), null);
});

test('CONTROL: every declared state has a rendered label', () => {
  // A state added to RENAME_STATE with no entry in the component would fall
  // through to rendering its raw key, which reads as a bug to an admin.
  const covered = new Set(CASES.map((c) => c.expect));
  covered.add(RENAME_STATE.GENESIS_PARTIAL); // its own branch, asserted above
  for (const s of Object.values(RENAME_STATE)) {
    assert.ok(covered.has(s), `${s} has no rendering case in this file`);
  }
});

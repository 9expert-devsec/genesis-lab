import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIT_COLLAPSIBLE_ACTIONS, AUDIT_ACTION_VALUES,
  isCollapsibleAction, groupAuditRows, auditGroupLine, auditSpanText, auditRowLine,
} from '@/lib/pageBuilder/auditTrail';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 41, commit 1 — consecutive autosave rows collapse.
 *
 * The rule is a pure function over the rows the server already returned, so
 * every claim below is testable without a database and without a React root.
 * What the RENDER does with it is test/render/activityCollapse.
 */

const row = (over = {}) => ({
  _id: 'x', action: 'draft.save', actor: { id: 'u1', name: 'Yanisa P.' },
  createdAt: '2026-08-25T04:25:00.000Z', ...over,
});

/** N consecutive autosave ticks by one actor, newest first. */
const run = (n, over = {}) => Array.from({ length: n }, (_, i) => row({
  _id: `s${n - i}`,
  createdAt: new Date(Date.UTC(2026, 7, 25, 4, 25 + (n - 1 - i))).toISOString(),
  ...over,
}));

// ── which actions collapse ──────────────────────────────────────────────────

test('exactly one action collapses, and it is the machine-paced one', () => {
  assert.deepEqual([...AUDIT_COLLAPSIBLE_ACTIONS], ['draft.save']);
  assert.equal(isCollapsibleAction('draft.save'), true);
});

/**
 * The twelve actions round 38 measured as having a live caller, each with the
 * reason it stays one row per event. Named individually so a failure says WHICH
 * one started folding — a set assertion alone would report "the set changed".
 */
const NEVER_COLLAPSE = Object.freeze({
  publish:
    'every publish mints a PageVersion and changes what the public reads; two publishes are two '
    + 'public states, and this trail is the only record of when each happened',
  update:
    'records {slug,status} — an authored change to page IDENTITY, and a slug edit moves the URL '
    + 'and writes a 301',
  status: 'each one is a transition the public sees',
  create: 'cannot repeat consecutively on one page',
  delete: 'cannot repeat consecutively on one page',
  'draft.discard': 'each one destroyed unpublished work',
  'draft.backup':
    'each one IS a restorable row in page_versions — folding three hides that three artefacts exist',
  'preview.enable': 'a credential operation',
  'preview.regenerate': 'legitimately repeats, and each repeat invalidates a code somebody holds',
  'preview.expiry': 'a credential operation',
  'preview.revoke': 'a credential operation',
});

test('no other live action folds — publish first among them', () => {
  for (const [action, why] of Object.entries(NEVER_COLLAPSE)) {
    assert.equal(isCollapsibleAction(action), false,
      `'${action}' now collapses. It must not, because ${why}. `
      + 'See AUDIT_COLLAPSIBLE_ACTIONS in lib/pageBuilder/auditTrail.js.');
  }
  // …and the same claim at the level of the set the module exports, so a reader
  // adding a value there is met by a named failure rather than a behavioural one.
  assert.equal(AUDIT_COLLAPSIBLE_ACTIONS.includes('publish'), false,
    'publish was added to the collapsible set');
});

test('CONTROL: the same checker DOES catch a planted publish', () => {
  // Without this, the sweep above passes for a checker that inspects nothing.
  // This is the script-file break, run in-process: a collapsible set that
  // contained `publish` would fold a run of publishes into one row.
  const planted = new Set([...AUDIT_COLLAPSIBLE_ACTIONS, 'publish']);
  const caught = Object.keys(NEVER_COLLAPSE).filter((a) => planted.has(a));
  assert.deepEqual(caught, ['publish'],
    'the checker cannot see a publish added to the collapsible set');
});

test('every collapsible value is an action the module can actually name', () => {
  // A typo here would be silent: the set would simply never match a stored row,
  // and the list would look exactly as it did before this round.
  for (const a of AUDIT_COLLAPSIBLE_ACTIONS) {
    assert.ok(AUDIT_ACTION_VALUES.includes(a), `'${a}' is not an action this module labels`);
  }
});

test('an unknown or empty action never collapses', () => {
  for (const a of ['', null, undefined, 'section.add', 'invented.verb']) {
    assert.equal(isCollapsibleAction(a), false, `'${String(a)}' collapsed`);
  }
});

// ── the grouping ────────────────────────────────────────────────────────────

test('a run of N consecutive autosaves becomes ONE group of N', () => {
  const groups = groupAuditRows(run(20));
  assert.equal(groups.length, 1, 'the run did not fold into one group');
  assert.equal(groups[0].count, 20);
  assert.equal(groups[0].action, 'draft.save');
  // Newest-first in, newest-first out: the head is the newest tick and the tail
  // is the oldest, which is what the span is built from.
  assert.equal(groups[0].newest._id, 's20');
  assert.equal(groups[0].oldest._id, 's1');
});

test('a single autosave is a group of one, and reads as itself', () => {
  const groups = groupAuditRows([row({ _id: 'only' })]);
  assert.deepEqual([groups.length, groups[0].count], [1, 1]);
  // The sentence is round 38's, unchanged — no count, no run vocabulary.
  const line = auditGroupLine(groups[0], '25 ส.ค. 2569 11:25');
  assert.equal(line, 'บันทึกฉบับร่าง โดย Yanisa P. เมื่อ 25 ส.ค. 2569 11:25');
  assert.equal(line, auditRowLine(row({ _id: 'only' }), '25 ส.ค. 2569 11:25'),
    'a group of one no longer renders identically to the row it holds');
  for (const runWord of ['ครั้ง', 'อย่างน้อย']) {
    assert.equal(line.includes(runWord), false, `a group of one says "${runWord}"`);
  }
});

test('a run is BROKEN by a different action and by a different actor', () => {
  const interleaved = [
    ...run(3),
    row({ _id: 'pub', action: 'publish', createdAt: '2026-08-25T04:20:00.000Z' }),
    ...run(2).map((r) => ({ ...r, _id: `b${r._id}`, createdAt: '2026-08-25T04:10:00.000Z' })),
  ];
  assert.deepEqual(groupAuditRows(interleaved).map((g) => [g.action, g.count]),
    [['draft.save', 3], ['publish', 1], ['draft.save', 2]]);

  // Same action, two people: two groups. The autosaver's run must not absorb
  // somebody else's save.
  const twoPeople = [
    row({ _id: 'a', actor: { id: 'u1', name: 'Yanisa P.' } }),
    row({ _id: 'b', actor: { id: 'u2', name: 'Pirasak S.' } }),
    row({ _id: 'c', actor: { id: 'u2', name: 'Pirasak S.' } }),
  ];
  assert.deepEqual(groupAuditRows(twoPeople).map((g) => [g.actorName, g.count]),
    [['Yanisa P.', 1], ['Pirasak S.', 2]]);
});

test('two people sharing a display name do NOT merge', () => {
  // The key is the id first. A name collision is the one way a fold could
  // attribute one person's saves to another, and it is the only failure of this
  // kind that would look completely plausible on screen.
  const sameName = [
    row({ _id: 'a', actor: { id: 'u1', name: 'Somchai' } }),
    row({ _id: 'b', actor: { id: 'u2', name: 'Somchai' } }),
  ];
  assert.deepEqual(groupAuditRows(sameName).map((g) => g.count), [1, 1]);
});

test('anonymous rows DO merge with one another', () => {
  // actor defaults to { id: '', name: '' }. These are one page's autosave ticks
  // with nobody named on either, and splitting them would print a wall of
  // identical unattributed rows — the exact thing this round is removing.
  const anon = [row({ _id: 'a', actor: { id: '', name: '' } }), row({ _id: 'b', actor: undefined })];
  const [g] = groupAuditRows(anon);
  assert.deepEqual([groupAuditRows(anon).length, g.count, g.actorName], [1, 2, '']);
});

test('a publish run stays one row per publish', () => {
  const publishes = [
    row({ _id: 'p3', action: 'publish', createdAt: '2026-08-25T04:30:00.000Z' }),
    row({ _id: 'p2', action: 'publish', createdAt: '2026-08-25T04:20:00.000Z' }),
    row({ _id: 'p1', action: 'publish', createdAt: '2026-08-25T04:10:00.000Z' }),
  ];
  assert.deepEqual(groupAuditRows(publishes).map((g) => g.count), [1, 1, 1],
    'consecutive publishes folded — three public states reported as fewer events');
});

test('the group key is the NEWEST row’s id, so it survives a merge', () => {
  // A React key that changed as older rows merged in would remount the row on
  // every "load more" — and would do it silently.
  const first = groupAuditRows(run(3).slice(0, 2));
  const merged = groupAuditRows(run(3));
  assert.equal(first[0].key, merged[0].key);
  assert.equal(merged[0].key, 's3');
});

test('grouping is total: no rows, junk rows, a non-array', () => {
  assert.deepEqual(groupAuditRows([]), []);
  assert.deepEqual(groupAuditRows(null), []);
  assert.deepEqual(groupAuditRows(undefined), []);
  assert.deepEqual(groupAuditRows([null, undefined]), []);
});

// ── C: the page boundary ────────────────────────────────────────────────────

/**
 * The seam has two halves and only the second can lie. The first — a run split
 * across two fetches — is made unrepresentable by grouping the ACCUMULATED rows
 * rather than each page; the second — a run that continues into rows nobody has
 * fetched — is stated as a lower bound.
 */
test('a run split across a fetch boundary re-merges with the TRUE total', () => {
  const all = run(30);
  const page1 = all.slice(0, 25);
  const page2 = all.slice(25);

  const loadedOnce = groupAuditRows(page1, { more: true });
  assert.equal(loadedOnce.length, 1);
  assert.equal(loadedOnce[0].count, 25);

  // What the component holds after "ดูรายการก่อนหน้า": page 1 THEN page 2, in
  // one array. The count grows; it does not restart.
  const accumulated = groupAuditRows([...page1, ...page2], { more: false });
  assert.equal(accumulated.length, 1, 'the boundary split one run into two groups');
  assert.equal(accumulated[0].count, 30);
  assert.equal(accumulated[0].oldest._id, 's1', 'the merged group lost the older half');
});

test('CONTROL: grouping each page SEPARATELY is the lie, and differs', () => {
  // Without this, "30" above could be read as arithmetic that happens to work.
  // This is what per-page grouping produces: two groups, the second restarting
  // its count at 5 as though a fresh run had begun at the boundary.
  const all = run(30);
  const perPage = [
    ...groupAuditRows(all.slice(0, 25), { more: true }),
    ...groupAuditRows(all.slice(25), { more: false }),
  ];
  assert.deepEqual(perPage.map((g) => g.count), [25, 5]);
  assert.notDeepEqual(perPage.map((g) => g.count),
    groupAuditRows(all, { more: false }).map((g) => g.count));
});

test('while a cursor exists the OLDEST group is a lower bound, not a total', () => {
  const groups = groupAuditRows(run(25), { more: true });
  assert.equal(groups[groups.length - 1].openEnded, true);
  assert.equal(auditGroupLine(groups[0], 'ช่วงเวลา'),
    'บันทึกฉบับร่าง อย่างน้อย 25 ครั้ง โดย Yanisa P. เมื่อ ช่วงเวลา');
});

test('with no cursor nothing is open-ended — the list is complete', () => {
  const groups = groupAuditRows(run(25), { more: false });
  assert.equal(groups[groups.length - 1].openEnded, false);
  assert.equal(auditGroupLine(groups[0], 'ช่วงเวลา').includes('อย่างน้อย'), false,
    'a fully loaded run still hedges its count');
});

test('only the LAST group is open-ended, however many there are', () => {
  const mixed = [
    ...run(4),
    row({ _id: 'pub', action: 'publish', createdAt: '2026-08-25T03:00:00.000Z' }),
    ...run(6).map((r) => ({ ...r, _id: `z${r._id}`, createdAt: '2026-08-25T02:00:00.000Z' })),
  ];
  const groups = groupAuditRows(mixed, { more: true });
  assert.deepEqual(groups.map((g) => g.openEnded), [false, false, true],
    'a group that is fully bracketed by newer and older loaded rows hedged its count');
});

test('an open-ended group of ONE makes no claim it could fall short of', () => {
  // The tail row is a publish: openEnded is set, and there is simply no count
  // to qualify. It must not grow an "อย่างน้อย" without a number.
  const groups = groupAuditRows([row({ _id: 'p', action: 'publish' })], { more: true });
  assert.equal(groups[0].openEnded, true);
  const line = auditGroupLine(groups[0], '25 ส.ค. 2569 11:25');
  assert.equal(line, 'เผยแพร่ โดย Yanisa P. เมื่อ 25 ส.ค. 2569 11:25');
  assert.equal(line.includes('อย่างน้อย'), false);
});

// ── the sentence ────────────────────────────────────────────────────────────

test('the collapsed sentence names the action, the count, the actor and the span', () => {
  const [g] = groupAuditRows(run(20));
  assert.equal(auditGroupLine(g, '25 ส.ค. 2569 11:25 – 25 ส.ค. 2569 12:02'),
    'บันทึกฉบับร่าง 20 ครั้ง โดย Yanisa P. เมื่อ 25 ส.ค. 2569 11:25 – 25 ส.ค. 2569 12:02');
});

test('an anonymous run drops the actor clause rather than inventing one', () => {
  const [g] = groupAuditRows(run(3, { actor: { id: '', name: '' } }));
  assert.equal(auditGroupLine(g, 'ช่วง'), 'บันทึกฉบับร่าง 3 ครั้ง เมื่อ ช่วง');
  assert.equal(auditGroupLine(g, 'ช่วง').includes('โดย'), false);
});

test('the span reads oldest first, and folds when both halves format alike', () => {
  assert.equal(auditSpanText('11:25', '12:02'), '11:25 – 12:02');
  // A run inside one displayed minute: repeating the string either side of a
  // dash reads as a rendering fault rather than as a short run.
  assert.equal(auditSpanText('11:25', '11:25'), '11:25');
  assert.equal(auditSpanText('', '12:02'), '12:02');
  assert.equal(auditSpanText('11:25', ''), '11:25');
  assert.equal(auditSpanText(null, undefined), '');
});

test('auditGroupLine is total against junk', () => {
  assert.equal(auditGroupLine(null, 'x'), '');
  assert.equal(auditGroupLine({ count: 4, action: '', actorName: 'A' }, 'x'), '');
});

// ── it is a DISPLAY transform, and the read did not move ───────────────────

test('the read path is untouched — no grouping reached the server', () => {
  const { withImports } = readSource('src/lib/actions/pageBuilder.js');
  for (const name of ['groupAuditRows', 'auditGroupLine', 'isCollapsibleAction', 'auditSpanText']) {
    assert.equal(withImports.includes(name), false,
      `the action layer reaches for ${name}. Grouping is a display transform over the rows the `
      + 'read already returns; a server that grouped would have to paginate over groups, and the '
      + 'compound cursor addresses stored rows.');
  }
  // …and the three things round 38 pinned are still what the read uses.
  for (const pin of ['AUDIT_TRAIL_FIELDS', 'AUDIT_TRAIL_PAGE_SIZE', 'AUDIT_TRAIL_SORT']) {
    assert.ok(withImports.includes(pin), `the read no longer uses ${pin}`);
  }
});

test('CONTROL: the same reader DOES see a name that is present', () => {
  const { withImports } = readSource('src/lib/actions/pageBuilder.js');
  assert.equal(withImports.includes('buildPageAuditQuery'), true,
    'the scanner is reading the wrong file — round 38’s query builder is not in it');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import { isDualKeySpace } from '@/lib/audit/auditContract';
import { SWEPT_MENUS, SWEPT_FILES, SWEPT, isMenuSwept } from '@/lib/audit/sweptMenus';
import {
  buildRecordHistoryQuery,
  buildLastEditedQuery,
  newestPerRecord,
  LAST_EDITED_SORT,
  RECORD_HISTORY_SORT,
  AUDIT_SORT,
  HISTORY_STATE,
} from '@/lib/audit/auditQuery';

// The inline history widget's query, and the list-page "edited last" query.
//
// Both are PURE and both carry a permission decision, which is why they are
// tested here rather than left to the runner. The widget renders inside a
// screen the user has already passed requirePage for — and that is NOT the
// check. Every export in a 'use server' module is a POST endpoint.
//
// WHAT THIS FILE CANNOT SEE: that the mount points pass the right menu, or that
// Mongo serves the $in from {recordId:1, createdAt:-1} — the second needs
// explain() against a real collection.

const SWEPT_MENU = SWEPT_MENUS[0];
const UNSWEPT_MENU = ALL_PAGE_KEYS.find((k) => !SWEPT_MENUS.includes(k));

const superadmin = { isSuperadmin: true, pages: [] };
const holder = { isSuperadmin: false, pages: [...SWEPT_MENUS] };
const outsider = { isSuperadmin: false, pages: [] };

test('CONTROL: the fixtures this file needs are real and distinct', () => {
  // Everything below is meaningless if these collapsed — an "unswept" menu that
  // is actually swept would make the not-instrumented assertions pass for the
  // wrong reason.
  assert.ok(SWEPT_MENU, 'at least one menu must be swept');
  assert.ok(UNSWEPT_MENU, 'and at least one registered menu must NOT be');
  assert.equal(isMenuSwept(SWEPT_MENU), true);
  assert.equal(isMenuSwept(UNSWEPT_MENU), false);
});

// ── the swept registry itself ──────────────────────────────────────

test('SWEPT_FILES and SWEPT_MENUS are DERIVED from one list', () => {
  // The whole reason this moved out of the test file. Two hand-kept copies is
  // how the two classifiers in §8.9 drifted, and how refNo reached fourteen.
  assert.deepEqual(SWEPT_FILES, SWEPT.map((s) => s.file));
  assert.deepEqual(SWEPT_MENUS, [...new Set(SWEPT.flatMap((s) => s.menus))]);
});

test('every swept menu is a real page key, and every file is under actions/', () => {
  for (const menu of SWEPT_MENUS) {
    assert.ok(ALL_PAGE_KEYS.includes(menu), `${menu} is not a registered page key`);
  }
  for (const file of SWEPT_FILES) {
    assert.match(file, /^src\/lib\/actions\/[\w-]+\.js$/, `${file} is not an action module path`);
  }
});

test('CONTROL: the derivation collapses duplicates rather than repeating them', () => {
  // courses.js and course-extensions.js both write under `courses`. If the menu
  // list were a flat map rather than a set, `courses` would appear twice and any
  // consumer counting menus would be wrong.
  const raw = SWEPT.flatMap((s) => s.menus);
  assert.ok(raw.length > SWEPT_MENUS.length, 'the raw mapping really does contain a duplicate');
  assert.equal(new Set(SWEPT_MENUS).size, SWEPT_MENUS.length, 'and the export has none');
});

// ── permission ─────────────────────────────────────────────────────

test('a user who cannot access the menu is DENIED, not merely given no rows', () => {
  // Denied and empty must be different answers. Returning an empty list would
  // let the widget render "ยังไม่มีประวัติ" to someone who is not allowed to
  // know whether history exists.
  const { state, filter } = buildRecordHistoryQuery({
    user: outsider, menu: SWEPT_MENU, recordId: 'abc',
  });
  assert.equal(state, HISTORY_STATE.DENIED);
  assert.equal(filter, null, 'and no query is built at all');
});

test('CONTROL: a holder of that same menu is NOT denied', () => {
  // Without this, a builder that denied everything would pass above while the
  // widget never worked for anyone.
  const { state, filter } = buildRecordHistoryQuery({
    user: holder, menu: SWEPT_MENU, recordId: 'abc',
  });
  assert.equal(state, HISTORY_STATE.OK);
  assert.ok(filter, 'and a real query is built');
});

test('superadmin is allowed every swept menu', () => {
  for (const menu of SWEPT_MENUS) {
    assert.equal(buildRecordHistoryQuery({ user: superadmin, menu, recordId: 'x' }).state,
      HISTORY_STATE.OK, `${menu} must be readable by superadmin`);
  }
});

test('a missing menu is denied rather than defaulting to something', () => {
  for (const menu of [undefined, null, '', 0]) {
    assert.equal(buildRecordHistoryQuery({ user: superadmin, menu, recordId: 'x' }).state,
      HISTORY_STATE.DENIED);
  }
});

// ── the third empty state ──────────────────────────────────────────

test('an UNSWEPT menu reports not_instrumented — not "no history"', () => {
  // During the sweep most screens are here. A widget that says "no history"
  // when it means "not wired up yet" teaches people the feature is broken, and
  // they stop looking at it before it has anything to show.
  const { state, filter } = buildRecordHistoryQuery({
    user: superadmin, menu: UNSWEPT_MENU, recordId: 'abc',
  });
  assert.equal(state, HISTORY_STATE.NOT_INSTRUMENTED);
  assert.equal(filter, null);
});

test('CONTROL: the three states are genuinely distinct values', () => {
  // If any two collapsed the widget would render the wrong empty message, and
  // nothing would throw.
  const seen = new Set(Object.values(HISTORY_STATE));
  assert.equal(seen.size, 3);
  const denied = buildRecordHistoryQuery({ user: outsider, menu: SWEPT_MENU, recordId: 'x' }).state;
  const unswept = buildRecordHistoryQuery({ user: superadmin, menu: UNSWEPT_MENU, recordId: 'x' }).state;
  const ok = buildRecordHistoryQuery({ user: superadmin, menu: SWEPT_MENU, recordId: 'x' }).state;
  assert.equal(new Set([denied, unswept, ok]).size, 3, 'all three paths differ');
});

test('permission is checked BEFORE swept-ness', () => {
  // An outsider asking about an unswept menu must be told DENIED, not
  // NOT_INSTRUMENTED — the latter confirms the menu exists and is on the
  // roadmap, which is information they have not earned.
  assert.equal(
    buildRecordHistoryQuery({ user: outsider, menu: UNSWEPT_MENU, recordId: 'x' }).state,
    HISTORY_STATE.DENIED
  );
});

// ── the dual key space ─────────────────────────────────────────────

test('a dual-key menu builds an $in over BOTH key spaces', () => {
  // `courses|course` carries an MSDB ObjectId; `courses|extension` carries the
  // course_id CODE. A course screen holds both, so one query covers both.
  const dual = SWEPT_MENUS.find((m) => isDualKeySpace(m));
  assert.ok(dual, 'a swept dual-key menu must exist — courses, as of round 3');
  const { filter } = buildRecordHistoryQuery({
    user: superadmin, menu: dual, recordId: ['692d39b52ee07293c9131fd8', 'COPILOT-STU'],
  });
  assert.deepEqual(filter.recordId, { $in: ['692d39b52ee07293c9131fd8', 'COPILOT-STU'] });
  assert.equal(filter.menu, dual);
});

test('a dual-key menu keeps the $in form even for a single id', () => {
  // The screen may only know one of the two values. Keeping $in means the
  // caller never has to reason about which form it is getting back.
  const dual = SWEPT_MENUS.find((m) => isDualKeySpace(m));
  const { filter } = buildRecordHistoryQuery({ user: superadmin, menu: dual, recordId: 'COPILOT-STU' });
  assert.deepEqual(filter.recordId, { $in: ['COPILOT-STU'] });
});

test('CONTROL: a NON-dual menu builds a plain equality', () => {
  // Pairs with the two above: proves the $in comes from the contract flag and
  // not from the builder always emitting $in.
  const single = SWEPT_MENUS.find((m) => !isDualKeySpace(m));
  assert.ok(single, 'a swept single-key menu must exist');
  const { filter } = buildRecordHistoryQuery({ user: superadmin, menu: single, recordId: 'abc' });
  assert.equal(filter.recordId, 'abc', 'an equality, not { $in: [...] }');
});

test('CONTROL: dual-key-ness is read from the contract, not from the menu NAME', () => {
  // If the builder hardcoded 'courses', a second dual-key menu added to the
  // contract later would silently get the wrong query shape.
  const dual = SWEPT_MENUS.filter((m) => isDualKeySpace(m));
  const single = SWEPT_MENUS.filter((m) => !isDualKeySpace(m));
  assert.ok(dual.length >= 1 && single.length >= 1);
  for (const m of dual) {
    assert.ok(buildRecordHistoryQuery({ user: superadmin, menu: m, recordId: 'x' }).filter.recordId.$in);
  }
  for (const m of single) {
    assert.equal(typeof buildRecordHistoryQuery({ user: superadmin, menu: m, recordId: 'x' }).filter.recordId, 'string');
  }
});

test('empty and blank ids are dropped, and an all-empty list builds no query', () => {
  const { state, filter } = buildRecordHistoryQuery({
    user: superadmin, menu: SWEPT_MENU, recordId: ['', null, undefined],
  });
  assert.equal(state, HISTORY_STATE.OK, 'not an error — just nothing to ask about');
  assert.equal(filter, null);
});

test('entity narrows the query when supplied, and is absent when not', () => {
  const withEntity = buildRecordHistoryQuery({
    user: superadmin, menu: SWEPT_MENU, entity: 'role', recordId: 'x',
  }).filter;
  assert.equal(withEntity.entity, 'role');
  const without = buildRecordHistoryQuery({ user: superadmin, menu: SWEPT_MENU, recordId: 'x' }).filter;
  assert.equal('entity' in without, false, 'no entity key at all, rather than undefined');
});

// ── the two sorts are deliberately different ───────────────────────

test('the widget sort drops the _id tie-break that the paginated sort needs', () => {
  // MEASURED: sort({createdAt:-1,_id:-1}) plans a blocking SORT stage;
  // sort({createdAt:-1}) plans LIMIT ← FETCH ← IXSCAN with no sort at all.
  //
  // Safe here and NOT on the central page, because the tie-break exists for
  // CURSOR pagination — without it a row sharing the boundary millisecond can
  // be ordered past the page edge and then excluded forever by the next cursor.
  // The widget has no cursor: it takes the newest five and a count.
  assert.deepEqual(RECORD_HISTORY_SORT, { createdAt: -1 });
  assert.deepEqual(AUDIT_SORT, { createdAt: -1, _id: -1 });
  assert.notDeepEqual(
    RECORD_HISTORY_SORT, AUDIT_SORT,
    'if these ever converge, one of the two requirements has been forgotten'
  );
});

test('CONTROL: the difference is exactly the tie-break, not a direction flip', () => {
  // A widget sort of {createdAt:1} would also differ from AUDIT_SORT while
  // being wrong — it would show the OLDEST five edits, which is the opposite of
  // what "who touched this last" asks.
  assert.equal(RECORD_HISTORY_SORT.createdAt, -1, 'newest first');
  assert.equal('_id' in RECORD_HISTORY_SORT, false, 'and no tie-break key');
});

// ── the list-page query ────────────────────────────────────────────

test('the list query is ONE $in over every id on the page', () => {
  const ids = ['a', 'b', 'c'];
  const { state, filter, sort } = buildLastEditedQuery({
    user: superadmin, menu: SWEPT_MENU, entity: 'role', recordIds: ids,
  });
  assert.equal(state, HISTORY_STATE.OK);
  assert.deepEqual(filter, { menu: SWEPT_MENU, recordId: { $in: ids }, entity: 'role' });
  assert.deepEqual(sort, { recordId: 1, createdAt: -1 });
});

test('the list sort groups each record together, newest first', () => {
  // {recordId:1, createdAt:-1} is what makes the single-pass reduction below
  // correct. Any other order and "first row per recordId" is not the newest.
  assert.deepEqual(LAST_EDITED_SORT, { recordId: 1, createdAt: -1 });
});

test('an empty page builds no query rather than an $in over nothing', () => {
  const { filter } = buildLastEditedQuery({ user: superadmin, menu: SWEPT_MENU, recordIds: [] });
  assert.equal(filter, null);
});

test('the list query is denied and gated exactly like the widget', () => {
  assert.equal(buildLastEditedQuery({ user: outsider, menu: SWEPT_MENU, recordIds: ['a'] }).state,
    HISTORY_STATE.DENIED);
  assert.equal(buildLastEditedQuery({ user: superadmin, menu: UNSWEPT_MENU, recordIds: ['a'] }).state,
    HISTORY_STATE.NOT_INSTRUMENTED);
});

// ── the reduction ──────────────────────────────────────────────────

test('newestPerRecord keeps the FIRST row seen per record', () => {
  // Given LAST_EDITED_SORT, the first row per recordId is the newest.
  const rows = [
    { recordId: 'a', action: 'update', createdAt: '2026-07-31T10:00:00Z' },
    { recordId: 'a', action: 'create', createdAt: '2026-07-01T10:00:00Z' },
    { recordId: 'b', action: 'delete', createdAt: '2026-07-30T10:00:00Z' },
  ];
  const out = newestPerRecord(rows);
  assert.equal(out.size, 2);
  assert.equal(out.get('a').action, 'update', 'the newer row won');
  assert.equal(out.get('b').action, 'delete');
});

test('CONTROL: it really keeps the first, not the last', () => {
  // A reduction written as a plain object assignment would keep the LAST row —
  // the oldest — and every list page would show the creation event forever.
  const rows = [
    { recordId: 'a', action: 'newest' },
    { recordId: 'a', action: 'oldest' },
  ];
  assert.equal(newestPerRecord(rows).get('a').action, 'newest');
});

test('records with NO history are ABSENT from the map, not null', () => {
  // The UI depends on this: absent means render nothing. Most rows predate the
  // log, and a list full of "ไม่ทราบ" reads as data loss rather than as a
  // feature that started recording last week.
  const out = newestPerRecord([{ recordId: 'a', action: 'update' }]);
  assert.equal(out.has('b'), false);
  assert.equal(out.get('b'), undefined);
});

test('newestPerRecord tolerates junk rows', () => {
  assert.doesNotThrow(() => newestPerRecord([null, undefined, {}, { recordId: '' }]));
  assert.equal(newestPerRecord([{ recordId: '' }]).size, 0, 'a blank id is not a record');
});

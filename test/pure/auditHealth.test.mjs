import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_CONTRACT_ENTRIES } from '@/lib/audit/auditContract';
import { rowHealth, summariseHealth, HEALTH, HEALTH_LEVEL, HEALTH_LABEL } from '@/lib/audit/auditHealth';

// The row-level health checks the audit-log page runs on every render.
//
// These replace a verification script nobody would run twice. Two of them
// cannot be a unit test of the writer at all — SAME_BEFORE_AFTER catches a
// defect no text guard can see, and POLICY_VIOLATION is the only continuous
// check that round 2's PII reduction holds against real writes. What IS
// testable here is that each detector fires on the shape it is for and stays
// quiet on the shape next to it.

const FULL = AUDIT_CONTRACT_ENTRIES.find((e) => e.diff === 'full');
const STATUS = AUDIT_CONTRACT_ENTRIES.find((e) => e.diff === 'status_only');
const ACT = AUDIT_CONTRACT_ENTRIES.find((e) => e.diff === 'act_only');

const row = (over = {}) => ({
  menu: FULL.menu, entity: FULL.entity, menuRaw: '',
  before: null, after: null, meta: null, ...over,
});

test('CONTROL: the contract supplies the three policies these tests rely on', () => {
  // Every assertion below is meaningless if find() returned undefined — the
  // property access would throw rather than the claim failing.
  assert.ok(FULL && STATUS && ACT, 'full, status_only and act_only pairs must all exist');
  assert.notEqual(FULL.diff, STATUS.diff);
  assert.notEqual(STATUS.diff, ACT.diff);
});

test('a clean row raises nothing', () => {
  assert.deepEqual(rowHealth(row()), []);
  assert.deepEqual(rowHealth(row({ before: { a: 1 }, after: { a: 2 } })), []);
});

// ── bad menu ───────────────────────────────────────────────────────

test('BAD_MENU fires on the unknown bucket and on a preserved menuRaw', () => {
  assert.ok(rowHealth(row({ menu: 'unknown' })).includes(HEALTH.BAD_MENU));
  assert.ok(rowHealth(row({ menuRaw: 'artcles' })).includes(HEALTH.BAD_MENU));
});

test('CONTROL: a registered menu with an empty menuRaw does NOT fire', () => {
  // Without this, a detector returning true unconditionally would pass above
  // and flag every row on the page red.
  assert.equal(rowHealth(row()).includes(HEALTH.BAD_MENU), false);
  assert.equal(rowHealth(row({ menuRaw: '' })).includes(HEALTH.BAD_MENU), false);
});

// ── before deep-equals after ───────────────────────────────────────

test('SAME_BEFORE_AFTER fires when the row records that nothing changed', () => {
  // The new:false → new:true defect. Reverting that flag reddens nothing in the
  // suite; this is what catches it, on real rows, forever.
  assert.ok(rowHealth(row({ before: { status: 'paid' }, after: { status: 'paid' } }))
    .includes(HEALTH.SAME_BEFORE_AFTER));
  // Structural, not referential — these came through JSON.
  assert.ok(rowHealth(row({ before: { a: 1, b: [2, 3] }, after: { b: [2, 3], a: 1 } }))
    .includes(HEALTH.SAME_BEFORE_AFTER));
});

test('CONTROL: a REAL transition does not fire', () => {
  assert.equal(
    rowHealth(row({ before: { status: 'pending' }, after: { status: 'paid' } }))
      .includes(HEALTH.SAME_BEFORE_AFTER), false
  );
  assert.equal(
    rowHealth(row({ before: { a: 1 }, after: { a: 1, b: 2 } }))
      .includes(HEALTH.SAME_BEFORE_AFTER), false
  );
});

test('CONTROL: two nulls are an act_only row doing its job, not a no-op change', () => {
  // Most rows in this trail carry no payload at all. Flagging them would bury
  // the real signal under every delete and every act_only action.
  assert.equal(rowHealth(row({ before: null, after: null }))
    .includes(HEALTH.SAME_BEFORE_AFTER), false);
  assert.equal(rowHealth(row({ menu: ACT.menu, entity: ACT.entity }))
    .includes(HEALTH.SAME_BEFORE_AFTER), false);
});

// ── diff policy ────────────────────────────────────────────────────

test('POLICY_VIOLATION fires when a PII pair carries a full field diff', () => {
  // The check that matters: proof the round-2 reduction held against real
  // writes. A status_only pair may carry {status} and nothing else.
  const leaked = {
    menu: STATUS.menu, entity: STATUS.entity, menuRaw: '',
    before: null,
    after: { status: 'cancelled', email: 'somchai@example.com', phone: '0812345678' },
    meta: null,
  };
  assert.ok(rowHealth(leaked).includes(HEALTH.POLICY_VIOLATION));
});

test('CONTROL: the SAME pair carrying only {status} does not fire', () => {
  // Without this, a detector that flagged every status_only row would pass
  // above while making the page permanently red on correct data.
  const ok = {
    menu: STATUS.menu, entity: STATUS.entity, menuRaw: '',
    before: { status: 'pending' }, after: { status: 'paid' }, meta: null,
  };
  assert.deepEqual(rowHealth(ok), []);
});

test('CONTROL: the same payload under a `full` pair is fine', () => {
  // Proves the check reads the CONTRACT rather than pattern-matching on field
  // names — an email in a course diff is not a violation.
  const ok = row({ after: { status: 'x', email: 'a@b.c', phone: '08' } });
  assert.equal(rowHealth(ok).includes(HEALTH.POLICY_VIOLATION), false);
});

test('POLICY_VIOLATION fires on an act_only pair that carries anything', () => {
  assert.ok(rowHealth({
    menu: ACT.menu, entity: ACT.entity, menuRaw: '',
    before: null, after: { anything: 1 }, meta: null,
  }).includes(HEALTH.POLICY_VIOLATION));
});

test('an UNREGISTERED pair carrying a payload is a violation — fail closed', () => {
  // The writer caps unknown pairs at act_only, so a payload on one means the
  // reduction was bypassed. It is also the visible symptom a typo'd free-form
  // `entity` otherwise never gets.
  assert.ok(rowHealth({
    menu: FULL.menu, entity: 'definitely_not_a_real_entity', menuRaw: '',
    before: null, after: { a: 1 }, meta: null,
  }).includes(HEALTH.POLICY_VIOLATION));
});

test('CONTROL: an unregistered pair carrying NOTHING is not flagged as a violation', () => {
  // act_only is exactly what the writer reduces it to, so a payload-free row on
  // an unknown pair is the system working. It still trips no policy flag — the
  // bad-entity signal is the coverage panel's job, not this one's.
  assert.equal(rowHealth({
    menu: FULL.menu, entity: 'definitely_not_a_real_entity', menuRaw: '',
    before: null, after: null, meta: null,
  }).includes(HEALTH.POLICY_VIOLATION), false);
});

test('a reorder row is CLEAN — before is legitimately null under ordered_ids', () => {
  // The shape round 5 will write 16 times: action 'reorder', recordId '',
  // before null, after {orderedIds}. `null` must count as "carries nothing" for
  // an ordered_ids pair too, or every reorder row on the page turns red the day
  // that round lands — and a page that is red on correct data gets ignored.
  const ORDERED = AUDIT_CONTRACT_ENTRIES.find((e) => e.diff === 'ordered_ids');
  assert.ok(ORDERED, 'the contract must declare an ordered_ids pair');
  assert.deepEqual(rowHealth({
    menu: ORDERED.menu, entity: ORDERED.entity, menuRaw: '',
    before: null, after: { orderedIds: ['a', 'b', 'c'] }, meta: null,
  }), []);
});

test('CONTROL: an ordered_ids pair carrying a field diff IS a violation', () => {
  // Pairs with the test above — proves the leniency is about the null, not
  // about ordered_ids being unchecked.
  const ORDERED = AUDIT_CONTRACT_ENTRIES.find((e) => e.diff === 'ordered_ids');
  assert.ok(rowHealth({
    menu: ORDERED.menu, entity: ORDERED.entity, menuRaw: '',
    before: null, after: { orderedIds: ['a'], name: 'leaked' }, meta: null,
  }).includes(HEALTH.POLICY_VIOLATION));
});

// ── meta-carried flags ─────────────────────────────────────────────

test('LABEL_READ_FAILED and ORPHAN_SIDECAR fire from meta', () => {
  assert.ok(rowHealth(row({ meta: { labelReadFailed: true } })).includes(HEALTH.LABEL_READ_FAILED));
  assert.ok(rowHealth(row({ meta: { sidecarDeleted: false } })).includes(HEALTH.ORPHAN_SIDECAR));
});

test('CONTROL: the healthy values of those same meta keys do not fire', () => {
  // sidecarDeleted: true is the NORMAL case and appears on every schedule
  // delete — flagging it would make the page cry wolf on correct data.
  assert.deepEqual(rowHealth(row({ meta: { sidecarDeleted: true } })), []);
  assert.deepEqual(rowHealth(row({ meta: { labelReadFailed: false } })), []);
  assert.deepEqual(rowHealth(row({ meta: { attendeesCount: 12 } })), []);
});

// ── the summary strip ──────────────────────────────────────────────

test('summariseHealth counts flags and flagged rows separately', () => {
  // A row can carry two flags; the strip needs both numbers or "3 problems"
  // across 1 row reads as 3 broken rows.
  const rows = [
    row(),
    row({ menu: 'unknown', meta: { labelReadFailed: true } }),
    row({ before: { a: 1 }, after: { a: 1 } }),
  ];
  const { counts, flaggedRows, total } = summariseHealth(rows);
  assert.equal(total, 3);
  assert.equal(flaggedRows, 2, 'two ROWS are flagged');
  assert.equal(counts[HEALTH.BAD_MENU], 1);
  assert.equal(counts[HEALTH.LABEL_READ_FAILED], 1);
  assert.equal(counts[HEALTH.SAME_BEFORE_AFTER], 1);
});

test('CONTROL: an all-clean page summarises to zero, not to empty', () => {
  const { counts, flaggedRows } = summariseHealth([row(), row()]);
  assert.equal(flaggedRows, 0);
  for (const key of Object.values(HEALTH)) {
    assert.equal(counts[key], 0, `${key} must be present and zero, not missing`);
  }
});

test('every flag has a level and a Thai label', () => {
  for (const key of Object.values(HEALTH)) {
    assert.ok(['red', 'amber'].includes(HEALTH_LEVEL[key]), `${key} needs a level`);
    assert.match(HEALTH_LABEL[key] ?? '', /[฀-๿]/, `${key} needs a Thai label`);
  }
});

test('summariseHealth tolerates junk rows without throwing', () => {
  assert.doesNotThrow(() => summariseHealth([null, undefined, {}, { meta: null }]));
  assert.deepEqual(rowHealth(null), []);
});

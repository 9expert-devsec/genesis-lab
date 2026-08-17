import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { isValidPair, pairContract, ORDERED_IDS_POLICY } from '@/lib/audit/auditContract';
import { SWEPT, SWEPT_FILES, isMenuSwept } from '@/lib/audit/sweptMenus';
import { buildAuditRow, MAX_PAYLOAD_CHARS } from '@/lib/audit/recordAdminAction';

/**
 * Every ordering write is on the trail, and each is on the RIGHT series.
 *
 * ── WHAT THIS ADDS OVER test/fs/auditCoverage ──────────────────────────────
 * That file asks the generic questions of every swept file — does each
 * mutating export call the writer, does the recorded menu match its
 * requireAdmin literal, is the (menu, entity) pair legal. All three now cover
 * program-order.js by virtue of it being swept, and that is the point of adding
 * it there rather than hand-rolling equivalents here.
 *
 * What the generic guard CANNOT ask is whether each export picked the right
 * entity and the right record id. `saveSkillProgramOrder` recording
 * `skill_order` would be a legal pair, a matching menu, and a real row — and it
 * would interleave two different questions onto one record's history. That
 * mapping is what this file pins.
 */

const REL = 'src/lib/actions/program-order.js';

/**
 * The intended shape of every write in the file, one row per export.
 *
 * `recordIdFrom` names WHERE the id comes from, because that is the half that
 * decides whether a row is findable later. Two shapes here:
 *   · a per-record id — the programme or skill code, which is what the changed
 *     document is keyed by, and which a COURSE rename does not touch;
 *   · a singleton — for the two collection-wide writes, which rewrite the whole
 *     set and have no single record to file under. Same shape /admin/cache
 *     already uses for `navmenu_v1`.
 */
const EXPECTED = [
  { fn: 'syncProgramsFromAPI',    menu: 'programs', entity: 'program_sync',        action: 'sync',    recordId: 'PROGRAM_ORDER_RECORD', recordIdFrom: 'singleton', payload: 'meta' },
  { fn: 'saveProgramOrder',       menu: 'programs', entity: 'program_order',       action: 'reorder', recordId: 'PROGRAM_ORDER_RECORD', recordIdFrom: 'singleton', payload: 'orderedIds' },
  { fn: 'toggleProgramHidden',    menu: 'programs', entity: 'program',             action: 'toggle',  recordId: 'id',                   recordIdFrom: 'programId', payload: 'after' },
  { fn: 'syncSkillsFromAPI',      menu: 'programs', entity: 'skill_sync',          action: 'sync',    recordId: 'SKILL_ORDER_RECORD',   recordIdFrom: 'singleton', payload: 'meta' },
  { fn: 'saveSkillOrder',         menu: 'programs', entity: 'skill_order',         action: 'reorder', recordId: 'SKILL_ORDER_RECORD',   recordIdFrom: 'singleton', payload: 'orderedIds' },
  { fn: 'saveSkillProgramOrder',  menu: 'programs', entity: 'skill_program_order', action: 'reorder', recordId: 'id',                   recordIdFrom: 'skillId',   payload: 'orderedIds' },
  { fn: 'toggleSkillHidden',      menu: 'programs', entity: 'skill',               action: 'toggle',  recordId: 'id',                   recordIdFrom: 'skillId',   payload: 'after' },
  { fn: 'saveProgramCourseOrder', menu: 'courses',  entity: 'course_order',        action: 'reorder', recordId: 'id',                   recordIdFrom: 'programId', payload: 'orderedIds' },
];

/** One export's body, sliced to the next top-level export. */
function body(fn) {
  const { code } = readSource(REL);
  const start = code.indexOf(`export async function ${fn}(`);
  assert.notEqual(start, -1, `${fn} not found in ${REL}`);
  const next = code.indexOf('\nexport async function', start + 10);
  return code.slice(start, next === -1 ? code.length : next);
}

/** The single `recordAdminActionAfter({...})` call inside a body. */
function auditCall(fn) {
  const b = body(fn);
  const at = b.indexOf('recordAdminActionAfter({');
  return at === -1 ? null : b.slice(at, b.indexOf('});', at));
}

// ── The file is swept ───────────────────────────────────────────────────────

test('program-order.js is in SWEPT_FILES, under both of its menus', () => {
  assert.ok(SWEPT_FILES.includes(REL), `${REL} is not swept`);
  const entryRow = SWEPT.find((s) => s.file === REL);
  assert.deepEqual([...entryRow.menus].sort(), ['courses', 'programs']);
  assert.equal(isMenuSwept('programs'), true, 'the programs menu should now report as instrumented');
});

// ── Every write records a row ───────────────────────────────────────────────

for (const { fn } of EXPECTED) {
  test(`${fn}: records an audit row`, () => {
    assert.ok(auditCall(fn), `${fn} performs a write and records nothing`);
  });
}

test('every write also captures the session actor — no synthetic one', () => {
  /**
   * The log is only evidence because every row is a real person's action. All
   * eight of these are reached from an admin button and from nowhere else — no
   * cron route imports this module — so every one carries the session's actor
   * and none invents a system attribution.
   */
  for (const { fn } of EXPECTED) {
    const call = auditCall(fn);
    assert.match(call, /actor:\s*\{ id: session\.user\?\.id, name: session\.user\?\.name \}/,
      `${fn} does not record the session actor`);
  }
  const { code } = readSource(REL);
  for (const fake of ['system:', "'system'", 'actor: null', 'SYSTEM_ACTOR']) {
    assert.ok(!code.includes(fake), `a synthetic actor (${fake}) appeared`);
  }
});

test('nothing in this file is reachable from a cron route', () => {
  // The premise the actor rule rests on. If a job ever calls one of these, the
  // row has to move to the human call site — the shape /api/admin/navmenu/sync
  // already uses — rather than gain a fake actor.
  for (const rel of [
    'src/app/api/cron/navmenu-sync/route.js',
    'src/app/api/cron/landing-sync/route.js',
    'src/app/api/cron/promotions-sync/route.js',
  ]) {
    assert.ok(
      !readSource(rel).withImports.includes('actions/program-order'),
      `${rel} reaches program-order.js — the actor rule needs revisiting`
    );
  }
});

// ── Each write is on the RIGHT series ───────────────────────────────────────

for (const { fn, menu, entity, action, recordId } of EXPECTED) {
  test(`${fn}: files under ${menu}|${entity} as '${action}', keyed on ${recordId}`, () => {
    const call = auditCall(fn);
    assert.match(call, new RegExp(`menu:\\s*'${menu}'`), 'wrong menu');
    assert.match(call, new RegExp(`entity:\\s*'${entity}'`), 'wrong entity');
    assert.match(call, new RegExp(`action:\\s*'${action}'`), 'wrong action');
    assert.match(call, new RegExp(`recordId:\\s*${recordId}[,\\s]`), 'wrong recordId');
    assert.ok(isValidPair(menu, entity), `${menu}|${entity} is not a contract pair`);
  });
}

test('the two collection-wide writes share a singleton id, and per-record ones do not', () => {
  // A reorder of the whole set has no single record to file under; a toggle
  // does. Mixing the two would make one series unreadable.
  const singletons = EXPECTED.filter((e) => e.recordIdFrom === 'singleton').map((e) => e.fn).sort();
  assert.deepEqual(singletons, ['saveProgramOrder', 'saveSkillOrder', 'syncProgramsFromAPI', 'syncSkillsFromAPI'].sort());
  const { code } = readSource(REL);
  assert.match(code, /const PROGRAM_ORDER_RECORD = 'program_order_all';/);
  assert.match(code, /const SKILL_ORDER_RECORD = 'skill_order_all';/);
});

// ── The contract ────────────────────────────────────────────────────────────

test('the two ORDERING pairs added this round carry the ordered_ids policy', () => {
  // Not `full`: a reorder rewrites a set and the set is the event, which is
  // exactly what ORDERED_IDS_POLICY exists for. `full` would let a future
  // caller attach a whole document to a reorder row.
  for (const [menu, entity] of [['courses', 'course_order'], ['programs', 'skill_program_order']]) {
    const contract = pairContract(menu, entity);
    assert.ok(contract, `${menu}|${entity} is not a contract pair`);
    assert.equal(contract.diff, ORDERED_IDS_POLICY, `${menu}|${entity} is not ordered_ids`);
    assert.ok(contract.label && contract.label.length > 4, `${menu}|${entity} has no usable label`);
  }
});

test('the four pairs this round REUSES were already in the contract', () => {
  // They were written when the contract was drafted and never wired up. Reusing
  // them rather than minting near-duplicates is the whole "do not invent a
  // second convention" rule; this pins that they are the ones being used.
  for (const [menu, entity, diff] of [
    ['programs', 'program_order', ORDERED_IDS_POLICY],
    ['programs', 'skill_order', ORDERED_IDS_POLICY],
    ['programs', 'program_sync', 'count_only'],
    ['programs', 'skill_sync', 'count_only'],
  ]) {
    assert.equal(pairContract(menu, entity)?.diff, diff, `${menu}|${entity} changed policy`);
  }
});

// ── The large payload ───────────────────────────────────────────────────────

/**
 * A LIST TOO BIG FOR THE CAP STILL LEAVES ITS COUNT BEHIND.
 *
 * Measured 2026-08-15, every real ordering payload fits: the largest programme
 * group is SQL at 16 codes / 236 chars against a 2000-char cap, and all 27
 * programme ids come to 220. So `ordered_ids` records the real list today —
 * the "79 courses" figure is the WHOLE CATALOGUE, not one group.
 *
 * The cap is still a runtime property of data that grows, so `meta.count` rides
 * alongside every ordered list. This drives the writer for real with a list
 * past the ceiling and asserts what survives.
 */
test('every ordered-list write carries meta.count alongside the list', () => {
  // The half a source scan can see, and the half that makes the writer test
  // below mean something at the call sites rather than only in the abstract.
  for (const { fn, payload } of EXPECTED.filter((e) => e.payload === 'orderedIds')) {
    const call = auditCall(fn);
    assert.match(call, /after:\s*\{ orderedIds:/, `${fn} does not record the list`);
    assert.match(call, /meta:\s*\{ count:/,
      `${fn} records a list with no meta.count — if it ever outgrows the ${MAX_PAYLOAD_CHARS}-char `
      + 'cap, `after` becomes a truncation marker and nothing says how big the change was');
    void payload;
  }
});

test('an oversized ordered list truncates `after` but KEEPS the count in meta', () => {
  const huge = Array.from({ length: 400 }, (_, i) => `COURSE-CODE-${i}`);
  assert.ok(
    JSON.stringify({ orderedIds: huge }).length > MAX_PAYLOAD_CHARS,
    'the fixture is not actually over the cap — the test would prove nothing'
  );

  const row = buildAuditRow({
    menu: 'courses', action: 'reorder', entity: 'course_order',
    recordId: 'SQL', after: { orderedIds: huge }, meta: { count: huge.length },
    actor: { id: 'a1', name: 'Someone' },
  });

  assert.equal(row.after.__truncated, true, 'the oversized list was not capped');
  assert.ok(row.after.chars > MAX_PAYLOAD_CHARS);
  assert.equal(row.meta.count, 400, 'the count did not survive the truncation');
  assert.equal(row.actor.id, 'a1', 'the actor did not survive');
});

test('a real-sized ordered list is recorded IN FULL, not as a count', () => {
  const real = ['SQL-01', 'SQL-02', 'SQL-PG-Query', 'SQL-ADM-Tuning'];
  const row = buildAuditRow({
    menu: 'courses', action: 'reorder', entity: 'course_order',
    recordId: 'SQL', after: { orderedIds: real }, meta: { count: real.length },
  });
  assert.deepEqual(row.after, { orderedIds: real }, 'a list that fits must be kept whole');
  assert.equal(row.meta.count, 4);
});

test('a sync row carries counts and NO list — the policy nulls the payload', () => {
  const row = buildAuditRow({
    menu: 'programs', action: 'sync', entity: 'program_sync',
    recordId: 'program_order_all',
    after: { orderedIds: ['SHOULD', 'NOT', 'SURVIVE'] },
    meta: { synced: 27, errors: 0, rows: 27 },
  });
  assert.equal(row.after, null, 'count_only must null the payload');
  assert.deepEqual(row.meta, { synced: 27, errors: 0, rows: 27 });
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the body slicer returns one export, not the file', () => {
  const b = body('saveSkillOrder');
  assert.ok(b.includes('saveSkillOrder'));
  assert.ok(!b.includes('saveSkillProgramOrder'), 'the slice ran into the next export');
  assert.ok(!b.includes('toggleProgramHidden'), 'the slice swallowed an earlier export');
  assert.ok(b.length > 200 && b.length < 3000, `slice is ${b.length} chars`);
});

test('CONTROL: the audit-call extractor returns null when there is none', () => {
  // Eight assertions above are "this export records a row". A extractor that
  // returned a truthy constant would satisfy all of them.
  assert.equal(auditCall('getOrderedPrograms'), null, 'a read-only export appears to record a row');
  assert.equal(auditCall('getOrderedSkills'), null);
  assert.ok(auditCall('saveProgramOrder'), 'the extractor found nothing in a real writer');
});

test('CONTROL: every EXPECTED export actually exists in the file', () => {
  // A renamed export would make its assertions vanish rather than fail.
  const { code } = readSource(REL);
  for (const { fn } of EXPECTED) {
    assert.match(code, new RegExp(`export async function ${fn}\\(`), `${fn} no longer exists`);
  }
  assert.equal(EXPECTED.length, 8, 'the write count changed — reconcile this list');
});

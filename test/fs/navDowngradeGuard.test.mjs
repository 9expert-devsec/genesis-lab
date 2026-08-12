import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites, walkSources, blankStringBodies } from '../sourceScan.mjs';
import {
  NAV_SECTION_SHRINK_RATIO,
  SNAPSHOT_SECTION_SHRINK_RATIO,
  assessDowngrade,
  DOWNGRADE_VERDICT,
} from '@/lib/cache-console/downgradeGuard';
import { COLLAPSE_SHRINK_RATIO } from '@/lib/cache-console/resetPlan';

/**
 * nav_menu_cache under the downgrade guard, with its OWN threshold.
 *
 * The measurements these assertions rest on, taken from the live snapshot
 * rather than assumed:
 *   data.programs  25 groups (1-16 courses each)
 *   data.skills     6 groups (9-29 courses each)
 *   no `sections` counter field at all
 */

const NAV_SYNC = 'src/lib/navmenu/syncNavMenuData.js';

// ══ THE THRESHOLD IS ITS OWN NUMBER ════════════════════════════════════════

test('nav has its own constant — three thresholds, none consolidated', () => {
  /**
   * Three different quantities now: mirror ROW counts (round 3), landing
   * SECTION counts, and nav GROUP counts. Pinned as mutual differences so that
   * "someone tidied these into one constant" fails here rather than silently
   * changing what each guard blocks.
   */
  const all = [COLLAPSE_SHRINK_RATIO, SNAPSHOT_SECTION_SHRINK_RATIO, NAV_SECTION_SHRINK_RATIO];
  assert.equal(new Set(all).size, 3, 'all three thresholds are distinct values');
  for (const r of all) assert.ok(r > 0 && r < 1);
});

test('nav is TIGHTER than landing, and the six-group arithmetic is why', () => {
  /**
   * `skills` holds SIX groups. At landing's 50% it would have to lose FOUR
   * before anything stopped it — two-thirds of the mega menu, on every public
   * page. These are the concrete boundaries the constant was chosen for.
   */
  assert.ok(NAV_SECTION_SHRINK_RATIO < SNAPSHOT_SECTION_SHRINK_RATIO);

  const at = (before, after) =>
    assessDowngrade({
      storedCounts: { skills: before },
      incomingCounts: { skills: after },
      shrinkRatio: NAV_SECTION_SHRINK_RATIO,
    }).verdict;

  // 1 of 6 = 17% — a skill genuinely retired upstream. Must NOT need a click,
  // or the guard gets raised until it is inert.
  assert.equal(at(6, 5), DOWNGRADE_VERDICT.OK);
  // 2 of 6 = 33% — two whole mega-menu columns at once.
  assert.equal(at(6, 4), DOWNGRADE_VERDICT.REFUSE_DOWNGRADE);
});

test('the programs boundary is pinned on both sides', () => {
  const at = (before, after) =>
    assessDowngrade({
      storedCounts: { programs: before },
      incomingCounts: { programs: after },
      shrinkRatio: NAV_SECTION_SHRINK_RATIO,
    }).verdict;
  assert.equal(at(25, 19), DOWNGRADE_VERDICT.OK, '6 of 25 = 24%, allowed');
  assert.equal(at(25, 18), DOWNGRADE_VERDICT.REFUSE_DOWNGRADE, '7 of 25 = 28%, gated');
});

test('CONTROL: the same nav shrink WOULD pass under landing\'s number', () => {
  // The concrete reason the constants differ, asserted rather than argued. If
  // this ever stops being true the two numbers have converged and the nav
  // docstring's arithmetic is stale.
  const args = { storedCounts: { skills: 6 }, incomingCounts: { skills: 4 } };
  assert.equal(
    assessDowngrade({ ...args, shrinkRatio: SNAPSHOT_SECTION_SHRINK_RATIO }).verdict,
    DOWNGRADE_VERDICT.OK,
    'landing\'s 50% would wave through losing a third of the mega menu'
  );
  assert.equal(
    assessDowngrade({ ...args, shrinkRatio: NAV_SECTION_SHRINK_RATIO }).verdict,
    DOWNGRADE_VERDICT.REFUSE_DOWNGRADE
  );
});

test('the default threshold is still LANDING\'s, so existing callers are unchanged', () => {
  // The parameter was added without moving any behaviour: a call that passes no
  // shrinkRatio must behave exactly as it did before nav existed.
  const args = { storedCounts: { s: 6 }, incomingCounts: { s: 4 } };
  assert.equal(assessDowngrade(args).verdict, DOWNGRADE_VERDICT.OK);
  assert.equal(
    assessDowngrade({ ...args, shrinkRatio: SNAPSHOT_SECTION_SHRINK_RATIO }).verdict,
    DOWNGRADE_VERDICT.OK,
    'the default and landing\'s explicit value agree'
  );
});

// ══ THE WIRING ═════════════════════════════════════════════════════════════

test('the guard is in the nav SYNC, and uses NAV\'s constant', () => {
  const { code, withImports } = readSource(NAV_SYNC);
  assert.match(withImports, /from '@\/lib\/cache-console\/downgradeGuard'/);
  assert.equal(countCallSites(code, 'assessDowngrade'), 1);
  assert.equal(countCallSites(code, 'permitsSnapshotWrite'), 1);
  assert.match(
    code,
    /shrinkRatio:\s*NAV_SECTION_SHRINK_RATIO/,
    'nav must pass its own threshold, not inherit landing\'s default'
  );
  assert.ok(
    !/SNAPSHOT_SECTION_SHRINK_RATIO/.test(code),
    'landing\'s constant must not appear in the nav sync'
  );
});

test('nav counts the PAYLOAD — and has no `sections` field to be tempted by', () => {
  /**
   * MEASURED: nav_menu_cache carries no `sections` counter, so landing's
   * payload-vs-counter divergence has no analogue here. The counts still come
   * from `data`, which is what getNavMenuData serves.
   */
  const { code } = readSource(NAV_SYNC);
  assert.match(code, /sectionCountsOf\(previousDoc\?\.data\)/);
  assert.match(code, /sectionCountsOf\(\{ programs: programsData, skills: skillsData \}\)/);

  const { code: model } = readSource('src/models/NavMenuCache.js');
  assert.ok(!/\bsections:/.test(model), 'the model still has no sections counter');
  assert.match(model, /lastRefusal/, 'but it does have somewhere to record a refusal');
});

test('the nav refusal write touches ONLY the refusal record', () => {
  const { code } = readSource(NAV_SYNC);
  const branch = /if \(!permitsSnapshotWrite\(downgrade\.verdict\)\) \{([\s\S]*?)\n  \}/.exec(code);
  assert.ok(branch, 'the refusal branch is where it is expected');
  const write = /NavMenuCache\.updateOne\(([\s\S]*?)\n    \);/.exec(branch[1]);
  assert.ok(write, 'exactly one updateOne');
  assert.match(write[1], /\$set:\s*\{\s*lastRefusal:/);

  /**
   * Asserted on the $set's KEYS, not on substrings of the write.
   *
   * The first version banned the token `status,` and went red on correct code:
   * the refusal record legitimately carries `syncStatus: status,` — the VALUE
   * `status` being passed into a differently-named field. Matching field
   * assignments (`name:`) instead of bare identifiers is the difference between
   * "this write sets status" and "the word status appears somewhere in it".
   */
  for (const assignment of [/'data\.programs':/, /'data\.skills':/, /\bsyncedAt:/, /\bstatus:/]) {
    assert.ok(
      !assignment.test(write[1]),
      `the refusal write must not assign ${assignment} — that is the snapshot it protects`
    );
  }
  // And the record it DOES write carries the sync's status under its own name,
  // which is what made the naive substring check ambiguous.
  assert.match(write[1], /syncStatus: status,/);
});

test('a nav write CLEARS the refusal, and the refusal path does not revalidate', () => {
  const { code } = readSource(NAV_SYNC);
  assert.match(code, /lastRefusal: null/);
  const returnAt = code.indexOf('refused: true');
  const revalidateAt = code.indexOf("revalidatePath('/', 'layout')");
  assert.ok(returnAt > -1 && revalidateAt > returnAt, 'the widest bust in the codebase is downstream of the early return');
});

test('allowShrink on nav is a parameter with no persisted form either', () => {
  const code = blankStringBodies(readSource(NAV_SYNC).code);
  assert.match(code, /allowShrink = false/);
  for (const banned of [/allowShrink\s*:\s*\{\s*type/, /\$set[\s\S]{0,80}allowShrink/, /shrinkAllowedUntil/]) {
    assert.ok(!banned.test(code), `nav persists allowShrink (${banned})`);
  }
  const model = blankStringBodies(readSource('src/models/NavMenuCache.js').code);
  assert.ok(!/allowShrink/.test(model), 'and the model has no such field');
});

test('still exactly ONE caller passes allowShrink: true anywhere', () => {
  // Extending the guard to a second writer must not have opened a second
  // bypass. The override action remains the only place the flag is set.
  const hits = walkSources('src')
    .filter((f) => /allowShrink:\s*true/.test(blankStringBodies(f.code)))
    .map((f) => f.rel);
  assert.deepEqual(hits, ['src/lib/actions/cache-console.js']);
});

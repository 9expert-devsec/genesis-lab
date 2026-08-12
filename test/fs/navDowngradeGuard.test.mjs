import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites, walkSources, blankStringBodies } from '../sourceScan.mjs';
import {
  NAV_SECTION_SHRINK_RATIO,
  SNAPSHOT_SECTION_SHRINK_RATIO,
  assessDowngrade,
  assessNavDowngrade,
  sectionCountsOf,
  leafCountsOf,
  emptiedGroups,
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

/**
 * THE ONE PLACE THE THRESHOLDS ARE PINNED.
 *
 * Table-driven, and deliberately not a set of pairwise assertions. There were
 * two of those — one here and one in test/pure/downgradeGuard comparing landing
 * against the mirror constant — and pairwise checks scale badly in exactly the
 * wrong way: a fourth threshold needs three new assertions and nobody writes
 * all three, so the first pair to converge is the one nobody compared.
 *
 * Each row carries the QUANTITY it governs, because that is the argument for
 * keeping them apart. If two ever hold the same number, this fails and names
 * both — which is the moment to ask whether the quantities really are the same,
 * not to delete one entry.
 */
const THRESHOLDS = [
  {
    name: 'COLLAPSE_SHRINK_RATIO',
    value: COLLAPSE_SHRINK_RATIO,
    governs: 'mirror ROW counts — collections of 10-31 rows, changed only by an upstream create or delete',
  },
  {
    name: 'SNAPSHOT_SECTION_SHRINK_RATIO',
    value: SNAPSHOT_SECTION_SHRINK_RATIO,
    governs: 'landing SECTION counts — admin-edited content (banners, featured, reviews) that moves weekly',
  },
  {
    name: 'NAV_SECTION_SHRINK_RATIO',
    value: NAV_SECTION_SHRINK_RATIO,
    governs: 'nav GROUP and LEAF counts — upstream taxonomy, changed rarely and never by an editor',
  },
];

test('every shrink threshold is distinct — none has converged with another', () => {
  const seen = new Map();
  for (const t of THRESHOLDS) {
    const clash = seen.get(t.value);
    assert.ok(
      !clash,
      `${t.name} and ${clash?.name} are both ${t.value}. They govern different `
      + `quantities (${t.governs} vs ${clash?.governs}) — if that is no longer `
      + 'true, argue it here rather than letting the numbers merge silently.'
    );
    seen.set(t.value, t);
  }
  assert.equal(seen.size, THRESHOLDS.length);
});

test('every threshold is a usable ratio, and each governs a stated quantity', () => {
  // The second half of the table's job: an entry with no `governs` is an entry
  // nobody can argue with, which is how a number survives past its reason.
  for (const t of THRESHOLDS) {
    assert.equal(typeof t.value, 'number', t.name);
    assert.ok(t.value > 0 && t.value < 1, `${t.name} = ${t.value} is not a ratio`);
    assert.ok(t.governs && t.governs.length > 30, `${t.name} does not say what it governs`);
  }
});

test('CONTROL: the table detects a convergence it is given', () => {
  // Without this, "all distinct" passes for a loop that never compares anything.
  const converged = [...THRESHOLDS, { name: 'FAKE', value: THRESHOLDS[0].value, governs: 'x' }];
  const values = converged.map((t) => t.value);
  assert.notEqual(new Set(values).size, values.length, 'the duplicate is visible to the check');
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

test('the guard is in the nav SYNC, through the nav-specific assessor', () => {
  /**
   * The threshold is no longer passed at this call site — `assessNavDowngrade`
   * owns it, applying NAV_SECTION_SHRINK_RATIO to BOTH measures. That is where
   * the constant is now pinned (see the leaf tests below); what this asserts is
   * that the sync goes through the nav assessor rather than the generic one,
   * which would silently drop the leaf measure and the emptied-group rule.
   */
  const { code, withImports } = readSource(NAV_SYNC);
  assert.match(withImports, /from '@\/lib\/cache-console\/downgradeGuard'/);
  assert.equal(countCallSites(code, 'assessNavDowngrade'), 1);
  assert.equal(countCallSites(code, 'permitsSnapshotWrite'), 1);
  assert.equal(
    countCallSites(code, 'assessDowngrade'), 0,
    'the generic assessor would apply only the group measure'
  );
  assert.ok(
    !/SNAPSHOT_SECTION_SHRINK_RATIO/.test(code),
    'landing\'s constant must not appear in the nav sync'
  );
});

test('assessNavDowngrade applies NAV\'s constant to BOTH measures', () => {
  // The constant moved from the call site into the assessor, so this is where
  // "nav uses its own number" is now pinned — and it must hold for leaves as
  // well as groups, or the second measure silently runs at landing's 50%.
  const { code } = readSource('src/lib/cache-console/downgradeGuard.js');
  const fn = /export function assessNavDowngrade[\s\S]*?\n\}/.exec(code);
  assert.ok(fn, 'the assessor is where it is expected');
  assert.equal(
    (fn[0].match(/shrinkRatio: NAV_SECTION_SHRINK_RATIO/g) ?? []).length, 2,
    'both the group and the leaf assessment pass nav\'s threshold'
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
  assert.match(code, /const incomingData = \{ programs: programsData, skills: skillsData \}/);
  assert.match(code, /sectionCountsOf\(incomingData\)/);

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

// ══ THE LEAF MEASURE ═══════════════════════════════════════════════════════

test('leafCountsOf counts COURSES INSIDE groups, per section', () => {
  // Live totals this was built against: programs 25 groups / 78 leaves,
  // skills 6 groups / 107 leaves.
  const data = {
    programs: { p1: { items: [1, 2, 3] }, p2: { items: [4] } },
    skills: { s1: { items: [1, 2] } },
  };
  assert.deepEqual(leafCountsOf(data), { programs: 4, skills: 2 });
  assert.deepEqual(sectionCountsOf(data), { programs: 2, skills: 1 });
});

test('THE HOLE: a skill kept with items:[] is invisible to GROUPS, caught by LEAVES', () => {
  /**
   * syncNavMenuData's skills arm writes `{ items: [], firstCover: null }` when
   * a group's upstream read throws, so the group survives empty. Programs drop
   * theirs instead. This is the exact shape the second measure exists for.
   */
  const stored = {
    skills: { a: { items: new Array(29).fill(0) }, b: { items: new Array(78).fill(0) } },
  };
  const incoming = { skills: { a: { items: [] }, b: { items: new Array(78).fill(0) } } };

  // Groups: 2 → 2. Nothing to see.
  assert.deepEqual(sectionCountsOf(stored), sectionCountsOf(incoming));

  const nav = assessNavDowngrade({ storedData: stored, incomingData: incoming });
  assert.equal(nav.verdict, DOWNGRADE_VERDICT.REFUSE_DOWNGRADE);
  assert.deepEqual(nav.emptied, ['skills/a']);
});

test('the EMPTIED-GROUP rule catches what no ratio can', () => {
  /**
   * The smallest live skill is 9 of 107 leaves — 8.4%. If it collapses to
   * empty, leaves fall well under any sane threshold while its menu column goes
   * blank. Tightening the ratio until that trips would fire on ordinary churn
   * everywhere else, so the shape is named directly instead.
   */
  const stored = { skills: { small: { items: new Array(9).fill(0) }, big: { items: new Array(98).fill(0) } } };
  const incoming = { skills: { small: { items: [] }, big: { items: new Array(98).fill(0) } } };

  const leafRatio = (107 - 98) / 107;
  assert.ok(leafRatio < NAV_SECTION_SHRINK_RATIO, 'the loss is under the threshold — 8.4%');

  const nav = assessNavDowngrade({ storedData: stored, incomingData: incoming });
  assert.equal(nav.verdict, DOWNGRADE_VERDICT.REFUSE_DOWNGRADE, 'and it is still refused');
  assert.deepEqual(nav.emptied, ['skills/small']);
});

test('a group that DISAPPEARS is not double-counted as emptied', () => {
  // Its loss belongs to the group measure. Counting it twice would report one
  // event as two and inflate every refusal message.
  const stored = { skills: { gone: { items: [1, 2] }, kept: { items: [1, 2] } } };
  const incoming = { skills: { kept: { items: [1, 2] } } };
  assert.deepEqual(emptiedGroups(stored, incoming), []);
});

test('CONTROL: a healthy nav snapshot passes BOTH measures', () => {
  // Without this, every assertion above passes against an assessor that
  // refuses everything.
  const data = {
    programs: { p1: { items: [1, 2, 3] } },
    skills: { s1: { items: [1, 2, 3, 4] } },
  };
  const nav = assessNavDowngrade({ storedData: data, incomingData: data });
  assert.equal(nav.verdict, DOWNGRADE_VERDICT.OK);
  assert.deepEqual(nav.emptied, []);
});

test('growth on both measures still writes', () => {
  const stored = { skills: { s1: { items: [1, 2] } } };
  const incoming = { skills: { s1: { items: [1, 2, 3] }, s2: { items: [4] } } };
  assert.equal(assessNavDowngrade({ storedData: stored, incomingData: incoming }).verdict, DOWNGRADE_VERDICT.OK);
});

test('allowShrink overrides ALL THREE — measures and the emptied rule alike', () => {
  // An override that cleared two of three objections would leave the sync
  // still blocked with no further click available.
  const stored = { skills: { a: { items: new Array(29).fill(0) } } };
  const incoming = { skills: { a: { items: [] } } };
  const nav = assessNavDowngrade({ storedData: stored, incomingData: incoming, allowShrink: true });
  assert.equal(nav.verdict, DOWNGRADE_VERDICT.OK);
  assert.deepEqual(nav.emptied, ['skills/a'], 'but it still REPORTS what was let through');
});

test('the refusal says WHICH measure objected', () => {
  const stored = { skills: { a: { items: new Array(29).fill(0) } } };
  const incoming = { skills: { a: { items: [] } } };
  const nav = assessNavDowngrade({ storedData: stored, incomingData: incoming });
  assert.match(nav.reason, /skills\/a/, 'names the group');
  assert.ok(
    nav.shrunk.every((s) => s.measure === 'groups' || s.measure === 'leaves'),
    'every shrink entry is labelled with the measure that produced it'
  );
});

test('the nav sync feeds the assessor PAYLOADS, and records both measures', () => {
  const { code } = readSource(NAV_SYNC);
  assert.equal(countCallSites(code, 'assessNavDowngrade'), 1);
  assert.match(code, /storedData: previousDoc\?\.data/);
  assert.match(code, /incomingData,/);
  assert.match(code, /storedLeaves: leafCountsOf\(previousDoc\?\.data\)/);
  assert.match(code, /incomingLeaves: leafCountsOf\(incomingData\)/);
  assert.match(code, /emptied: downgrade\.emptied/);
});

test('the LEAF measure alone catches a group that shrinks hard without emptying', () => {
  /**
   * The case that isolates the second measure. A control-break blinding the
   * leaf assessment did NOT redden at first, because the only test exercising
   * it used a group that collapsed to EMPTY — where the emptied-group rule
   * fires too and covers for it. That is the runner's documented case (3):
   * redundancy hiding the claim.
   *
   * Here group `a` keeps two courses, so `emptied` is empty and the group count
   * is unchanged at 2 → 2. Leaves fall 107 → 80, which is 25.2% and just past
   * nav's threshold. Nothing but the leaf measure can object.
   */
  const stored = {
    skills: { a: { items: new Array(29).fill(0) }, b: { items: new Array(78).fill(0) } },
  };
  const incoming = {
    skills: { a: { items: [1, 2] }, b: { items: new Array(78).fill(0) } },
  };

  assert.deepEqual(sectionCountsOf(stored), sectionCountsOf(incoming), 'groups are unchanged');
  assert.deepEqual(emptiedGroups(stored, incoming), [], 'and nothing emptied');
  assert.ok((107 - 80) / 107 > NAV_SECTION_SHRINK_RATIO, 'but the leaves fell past the threshold');

  const nav = assessNavDowngrade({ storedData: stored, incomingData: incoming });
  assert.equal(nav.verdict, DOWNGRADE_VERDICT.REFUSE_DOWNGRADE);
  assert.ok(
    nav.shrunk.some((s) => s.measure === 'leaves'),
    'and the refusal names the leaf measure as the objector'
  );
});

test('CONTROL: the same shape just UNDER the leaf threshold writes', () => {
  // 107 → 81 is 24.3%. One course either side of the boundary, so the test
  // above is about the threshold and not about any shrink at all.
  const stored = {
    skills: { a: { items: new Array(29).fill(0) }, b: { items: new Array(78).fill(0) } },
  };
  const incoming = {
    skills: { a: { items: [1, 2, 3] }, b: { items: new Array(78).fill(0) } },
  };
  assert.ok((107 - 81) / 107 < NAV_SECTION_SHRINK_RATIO);
  assert.equal(
    assessNavDowngrade({ storedData: stored, incomingData: incoming }).verdict,
    DOWNGRADE_VERDICT.OK
  );
});

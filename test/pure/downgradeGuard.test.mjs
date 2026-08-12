import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_SECTION_SHRINK_RATIO,
  DOWNGRADE_VERDICT,
  assessDowngrade,
  sectionCountsOf,
  permitsSnapshotWrite,
} from '@/lib/cache-console/downgradeGuard';
import { COLLAPSE_SHRINK_RATIO } from '@/lib/cache-console/resetPlan';

/**
 * THE DOWNGRADE RULING AND THE OVERRIDE RULING, each with the assertion that
 * goes red if it is REVERSED.
 *
 * Written before the wiring, per the standing instruction — that ordering has
 * caught these four rounds running and code review has caught none.
 */

// ══ THE DOWNGRADE RULING ═══════════════════════════════════════════════════

const HEALTHY = { banners: 4, programs: 27, skills: 9, newCourses: 8, reviews: 6 };

test('RULING REVERSED: a materially smaller snapshot does NOT write', () => {
  // The incident: 22 of 27 programs, 81%.
  const a = assessDowngrade({
    storedCounts: HEALTHY,
    incomingCounts: { ...HEALTHY, programs: 5 },
  });
  assert.equal(a.verdict, DOWNGRADE_VERDICT.REFUSE_DOWNGRADE);
  assert.equal(permitsSnapshotWrite(a.verdict), false);
  assert.deepEqual(a.shrunk.map((s) => s.section), ['programs']);
  assert.equal(a.shrunk[0].lost, 22);
  assert.match(a.reason, /27/, 'the refusal names both counts');
  assert.match(a.reason, /5/);
});

test('RULING REVERSED: a section collapsing to EMPTY is refused', () => {
  // 100% shrink, and the shape that puts the homepage failure string on a live
  // public page.
  const a = assessDowngrade({
    storedCounts: HEALTHY,
    incomingCounts: { ...HEALTHY, banners: 0 },
  });
  assert.equal(a.verdict, DOWNGRADE_VERDICT.REFUSE_DOWNGRADE);
  assert.equal(a.shrunk[0].section, 'banners');
});

test('GROWTH ALWAYS WRITES — this is the repair path, not leniency', () => {
  /**
   * A bad snapshot republishes itself every cycle, so only a fully healthy run
   * can fix one. A guard that blocked writes generally would lock the bad
   * snapshot in permanently — which is a worse failure than the one being
   * fixed, and is the reason this assertion is not merely a control.
   */
  const repair = assessDowngrade({
    storedCounts: { ...HEALTHY, programs: 5 }, // today's damaged snapshot
    incomingCounts: HEALTHY,                    // a healthy run
  });
  assert.equal(repair.verdict, DOWNGRADE_VERDICT.OK);
  assert.equal(permitsSnapshotWrite(repair.verdict), true);
});

test('an unchanged snapshot writes — the common case is never blocked', () => {
  const a = assessDowngrade({ storedCounts: HEALTHY, incomingCounts: { ...HEALTHY } });
  assert.equal(a.verdict, DOWNGRADE_VERDICT.OK);
  assert.deepEqual(a.shrunk, []);
});

test('ordinary editing does NOT trip the guard', () => {
  // One banner deactivated (4 → 3) and one review removed (6 → 5). Both are
  // routine content edits and both must write.
  const a = assessDowngrade({
    storedCounts: HEALTHY,
    incomingCounts: { ...HEALTHY, banners: 3, reviews: 5 },
  });
  assert.equal(a.verdict, DOWNGRADE_VERDICT.OK);
});

test('the boundary is exclusive, and both sides are pinned', () => {
  // 50% of 8 is exactly 4. At the threshold: writes. Past it: refused.
  const at = assessDowngrade({ storedCounts: { s: 8 }, incomingCounts: { s: 4 } });
  assert.equal(at.verdict, DOWNGRADE_VERDICT.OK, 'exactly 50% still writes');

  const past = assessDowngrade({ storedCounts: { s: 8 }, incomingCounts: { s: 3 } });
  assert.equal(past.verdict, DOWNGRADE_VERDICT.REFUSE_DOWNGRADE, 'one past it refuses');
});

test('THE THRESHOLD IS ITS OWN CONSTANT, not round 3 reused', () => {
  /**
   * Snapshot sections and mirror row counts are different quantities. Sections
   * are small and legitimately volatile — one banner off moves a 5-item section
   * by 20% — so at round 3's threshold this guard would refuse after ordinary
   * content edits, and a guard that refuses constantly gets raised until it
   * does nothing.
   *
   * Pinned as a DIFFERENCE so that "someone tidied these into one constant"
   * fails here rather than silently changing what the guard blocks.
   */
  assert.notEqual(
    SNAPSHOT_SECTION_SHRINK_RATIO, COLLAPSE_SHRINK_RATIO,
    'the two thresholds govern different quantities and must stay separate'
  );
  assert.ok(SNAPSHOT_SECTION_SHRINK_RATIO > COLLAPSE_SHRINK_RATIO);
  assert.ok(SNAPSHOT_SECTION_SHRINK_RATIO > 0 && SNAPSHOT_SECTION_SHRINK_RATIO < 1);
});

test('CONTROL: at round 3\'s 20% an ordinary banner edit WOULD be refused', () => {
  /**
   * The concrete reason the numbers differ, asserted rather than argued — using
   * the fixture's own banner count so the arithmetic is about real data.
   *
   * 4 → 3 is 25%: past round 3's threshold, well short of this one. Both
   * comparisons are exclusive, so a 5 → 4 edit (exactly 20%) would NOT have
   * fired even at round 3's number — the first draft of this control claimed it
   * would and was wrong. Picking a case that straddles both thresholds is the
   * point; picking one that straddles neither proves nothing.
   */
  const before = HEALTHY.banners, after = HEALTHY.banners - 1;
  const ratio = (before - after) / before;
  assert.equal(ratio, 0.25);
  assert.ok(ratio > COLLAPSE_SHRINK_RATIO, 'round 3\'s 20% WOULD fire on one banner of four');
  assert.ok(ratio <= SNAPSHOT_SECTION_SHRINK_RATIO, 'and this guard\'s 50% does not');
});

test('NO STORED SNAPSHOT means no refusal — Ruling 1 still holds', () => {
  // The first run, or one after the document was lost. Refusing here would
  // leave the site with no snapshot, which is forbidden outright.
  for (const stored of [null, undefined, {}]) {
    const a = assessDowngrade({ storedCounts: stored, incomingCounts: { programs: 1 } });
    assert.equal(a.verdict, DOWNGRADE_VERDICT.OK);
    assert.equal(a.hadStoredSnapshot, false);
  }
});

test('a section ABSENT from the incoming shape is not treated as a shrink to zero', () => {
  // A renamed or removed section is a shape change, not a downgrade. Treating
  // an absent key as 0 would refuse every run after such a change.
  const a = assessDowngrade({
    storedCounts: { programs: 27, retiredSection: 10 },
    incomingCounts: { programs: 27 },
  });
  assert.equal(a.verdict, DOWNGRADE_VERDICT.OK);
  assert.deepEqual(a.vanished, ['retiredSection'], 'but it is reported, not ignored');
});

test('EVERY shrunken section is reported, not just the first', () => {
  const a = assessDowngrade({
    storedCounts: HEALTHY,
    incomingCounts: { ...HEALTHY, programs: 2, skills: 1 },
  });
  assert.deepEqual(a.shrunk.map((s) => s.section).sort(), ['programs', 'skills']);
});

// ══ COUNTING FROM THE PAYLOAD, NOT FROM `sections` ═════════════════════════

test('counts come from the PAYLOAD — the stored `sections` field can lie', () => {
  /**
   * MEASURED in syncLandingData: on a total failure it preserves
   * `previousDoc.data` but writes the NEW zeroed `sections` alongside it, so a
   * stored snapshot can hold 27 programs while `sections.programs` says 0.
   *
   * A guard reading `sections` would compare against zeros, find nothing that
   * could shrink, and wave through exactly the run it exists to stop. This
   * pins that the counter reads arrays in `data`.
   */
  const data = { programs: [1, 2, 3], banners: [1], reviews: [] };
  assert.deepEqual(sectionCountsOf(data), { programs: 3, banners: 1, reviews: 0 });
});

test('sectionCountsOf handles the nav_menu_cache map shape too', () => {
  // One guard, two snapshots. nav_menu_cache stores `{ [id]: {...} }` maps
  // rather than arrays; the number of groups is the comparable quantity.
  const navData = { programs: { p1: {}, p2: {} }, skills: { s1: {} } };
  assert.deepEqual(sectionCountsOf(navData), { programs: 2, skills: 1 });
});

test('a non-array, non-object value is not counted as a section', () => {
  // Counting a scalar as 1 would invent a section that can never shrink and
  // would quietly dilute the comparison.
  assert.deepEqual(sectionCountsOf({ n: 5, s: 'x', arr: [1] }), { arr: 1 });
});

test('sectionCountsOf survives a null or non-object payload', () => {
  for (const bad of [null, undefined, 'x', 7]) {
    assert.deepEqual(sectionCountsOf(bad), {});
  }
});

// ══ THE OVERRIDE RULING ════════════════════════════════════════════════════

test('OVERRIDE RULING: allowShrink lets a legitimate shrinkage through', () => {
  // An admin unticking เผยแพร่ on twenty courses produces exactly the shape the
  // guard blocks, so the guard must be overridable or it becomes the bug.
  const a = assessDowngrade({
    storedCounts: HEALTHY,
    incomingCounts: { ...HEALTHY, programs: 5 },
    allowShrink: true,
  });
  assert.equal(a.verdict, DOWNGRADE_VERDICT.OK);
  assert.equal(a.overridden, true);
});

test('OVERRIDE RULING REVERSED: the override still REPORTS what it let through', () => {
  /**
   * An override that discarded the numbers would make the audit row say a write
   * happened and nothing about what it cost. `shrunk` survives the override so
   * the caller can log both counts — which is the whole reason the override is
   * an audited admin action rather than a config flag.
   */
  const a = assessDowngrade({
    storedCounts: HEALTHY,
    incomingCounts: { ...HEALTHY, programs: 5 },
    allowShrink: true,
  });
  assert.equal(a.shrunk.length, 1);
  assert.equal(a.shrunk[0].before, 27);
  assert.equal(a.shrunk[0].after, 5);
});

test('the override is NOT sticky — it applies to the call that passed it', () => {
  // A flag that persisted would be a permanently disabled guard. The same
  // inputs without the flag must refuse again.
  const args = { storedCounts: HEALTHY, incomingCounts: { ...HEALTHY, programs: 5 } };
  assert.equal(assessDowngrade({ ...args, allowShrink: true }).verdict, DOWNGRADE_VERDICT.OK);
  assert.equal(assessDowngrade(args).verdict, DOWNGRADE_VERDICT.REFUSE_DOWNGRADE);
});

test('permitsSnapshotWrite is an allow-list of exactly one verdict', () => {
  assert.equal(permitsSnapshotWrite(DOWNGRADE_VERDICT.OK), true);
  assert.equal(permitsSnapshotWrite(DOWNGRADE_VERDICT.REFUSE_DOWNGRADE), false);
  assert.equal(permitsSnapshotWrite('anything-else'), false);
});

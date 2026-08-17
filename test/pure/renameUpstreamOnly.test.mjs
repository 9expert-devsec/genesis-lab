import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRenamePreview,
  detachedGenesisCodes,
  RENAME_STORES,
} from '@/lib/courses/renameCoursePreview';
import { buildRenamePreviewView } from '@/lib/courses/renamePreviewView';
import {
  detectRenameState,
  countsFromPreview,
  RENAME_STATE,
} from '@/lib/courses/renameCoursePlan';

/**
 * THE UPSTREAM-ONLY STATE, FROM THE SCREEN'S SIDE.
 *
 * ── THE WORLD THESE FIXTURES ARE ────────────────────────────────────────────
 * Produced by hand on 2026-08-16: `course_id` renamed at MSDB from
 * ZZTEST-EXCEL-01 to EXCEL-HR-01, genesis untouched, eleven genesis rows still
 * on the old code. Upstream is therefore the side that MOVED, and every course
 * list on this screen is fed from upstream — so the only code the picker could
 * offer for that course was the NEW one, and the code genesis still held was
 * offered nowhere.
 *
 * The consequence, which is what these tests are for: an admin who selected the
 * course and typed the code they wanted genesis to reach produced `from === to`,
 * and the screen answered "รหัสใหม่เหมือนรหัสเดิมทุกประการ — ไม่มีอะไรต้องเปลี่ยน"
 * with every store row reading 0, over eleven rows waiting to be changed.
 *
 * BEING WRONG IS WORSE THAN BEING UNABLE. The rename still cannot be run from
 * here — see the self-vs-collision note in buildRenamePreview — so what is
 * asserted below is entirely about what the screen SAYS, not what it can do.
 */

const MSDB_AFTER = ['EXCEL-HR-01', 'MSE-L1', 'POWER-BI'];
const GENESIS_CODE = 'ZZTEST-EXCEL-01';
const EXT_AFTER = [GENESIS_CODE, 'MSE-L1', 'POWER-BI'];

/** Every store read and empty — the shape the reader returns for a code it finds nothing on. */
const allEmpty = () => Object.fromEntries(RENAME_STORES.map((s) => [s.key, []]));

/** The eleven rows, spread the way the real course's are. */
const ELEVEN = {
  courseExtension: [{ courseId: GENESIS_CODE }],
  programOrder: [{ programId: 'P1' }, { programId: 'P2' }],
  skillOrder: [{ skillId: 'S1' }],
  earlyBirdConfig: [{ course_id: GENESIS_CODE }],
  coursePromoLink: [{ course_id: GENESIS_CODE }, { course_id: GENESIS_CODE }],
  scheduleLocal: [{ course_id: GENESIS_CODE }, { course_id: GENESIS_CODE }, { course_id: GENESIS_CODE }],
  article: [{ slug: 'a' }],
};

const preview = ({ oldCode, newCode, matches = {}, msdbCodes = MSDB_AFTER, extensionCodes = EXT_AFTER, ...rest }) =>
  buildRenamePreview({
    oldCode, newCode, msdbCodes, extensionCodes, urlAlias: '',
    matches: { ...allEmpty(), ...matches },
    ...rest,
  });

/** The upstream ROWS, so identity can be proved by `_id`. */
const ANCHOR = '6a7a97f0b830e289fc383406';
const OTHER_ID = 'aa11bb22cc33dd44ee55ff66';
const MSDB_ROWS = [
  { course_id: 'EXCEL-HR-01', _id: ANCHOR },
  { course_id: 'MSE-L1', _id: '111111111111111111111111' },
  { course_id: 'POWER-BI', _id: '222222222222222222222222' },
];

const NOTHING_TO_CHANGE = 'ไม่มีอะไรต้องเปลี่ยน';

// ── The signal itself ───────────────────────────────────────────────────────

test('a genesis code with no upstream row is reported as detached', () => {
  assert.deepEqual(detachedGenesisCodes(EXT_AFTER, MSDB_AFTER), [GENESIS_CODE]);
});

test('a code both sides hold is NOT detached, whatever its casing', () => {
  // `course_id` has no canonical casing upstream. A case difference between the
  // two sides is not a detachment, and treating it as one would flag most of
  // the catalogue.
  assert.deepEqual(detachedGenesisCodes(['MSE-L1'], ['mse-l1']), []);
  assert.deepEqual(detachedGenesisCodes(['Power-Apps'], ['POWER-APPS']), []);
});

test('the detached list is deduped and drops blanks', () => {
  assert.deepEqual(detachedGenesisCodes(['A', 'a', '', '  ', 'B'], []), ['A', 'B']);
});

// ══ ASSERTION 1 ════════════════════════════════════════════════════════════
// A course whose genesis rows sit on a code upstream no longer has is reported
// as upstream-only, with a NON-ZERO store count where the rows exist.

test('the upstream-only state is reported as upstream-only, with real row counts', () => {
  const p = preview({ oldCode: GENESIS_CODE, newCode: 'EXCEL-HR-01', matches: ELEVEN });

  // The preview reaches the right question: genesis holds the old code and
  // upstream does not, upstream holds the new one.
  assert.equal(p.upstream.hasOldCode, false, 'upstream still appears to hold the old code');
  assert.equal(p.upstream.hasNewCode, true);
  assert.equal(p.detached.fromIsOne, true, 'the previewed code is not recognised as genesis-only');

  // The counts are the rows that are actually waiting, not zero.
  assert.equal(p.totalRows, 11, `expected the eleven waiting rows, got ${p.totalRows}`);
  const nonZero = p.stores.filter((s) => s.count > 0).map((s) => s.key).sort();
  assert.deepEqual(nonZero, Object.keys(ELEVEN).sort(), 'a store holding rows reported none');

  // And the two-sided detector, given what this preview carries, names the state.
  const state = detectRenameState({
    oldCounts: countsFromPreview(p),
    newCounts: {},
    upstream: p.upstream,
  });
  assert.equal(state.state, RENAME_STATE.UPSTREAM_ONLY);
  assert.equal(state.reversible, true, 'genesis has not written, so MSDB can still be renamed back');
});

test('the reader, and the view, both name the detached code on that preview', () => {
  const v = buildRenamePreviewView(
    preview({ oldCode: GENESIS_CODE, newCode: 'EXCEL-HR-01', matches: ELEVEN })
  );
  const w = v.warnings.find((x) => x.kind === 'detached');
  assert.ok(w, 'the view says nothing about the code existing only in genesis');
  assert.match(w.title, new RegExp(GENESIS_CODE), 'the warning does not name the code');
  assert.equal(v.total, 11, 'the view understated the blast radius');
});

// ══ ASSERTION 2 ════════════════════════════════════════════════════════════
// "No change needed" cannot be returned while genesis and upstream disagree.

test('THE OBSERVED PATH: identical codes no longer claim there is nothing to change', () => {
  // Exactly what the picker allowed: the only offerable code is the one
  // upstream moved to, so both fields carry it.
  const p = preview({ oldCode: 'EXCEL-HR-01', newCode: 'EXCEL-HR-01' });

  assert.equal(p.ok, false, 'identical codes must still refuse — there is no rename to run');
  assert.equal(p.totalRows, 0, 'the fixture is the observed one: no genesis row on the new code');
  assert.ok(
    !p.blocked.some((b) => b.includes(NOTHING_TO_CHANGE)),
    'the screen still claims there is nothing to change:\n  ' + p.blocked.join('\n  ')
  );
  // It says what is true instead, and names where to start.
  assert.ok(
    p.blocked.some((b) => b.includes(GENESIS_CODE)),
    'the refusal does not name the code genesis is stuck on'
  );
});

test('the same path surfaces the detached code as a warning, not only as a refusal', () => {
  const v = buildRenamePreviewView(preview({ oldCode: 'EXCEL-HR-01', newCode: 'EXCEL-HR-01' }));
  const w = v.warnings.find((x) => x.kind === 'detached');
  assert.ok(w, 'a refused preview drops the one signal that explains it');
  assert.match(w.body, new RegExp(GENESIS_CODE));
});

test('when the two sides AGREE, identical codes still say there is nothing to change', () => {
  /**
   * The narrowing has to be a narrowing. When genesis holds rows on the very
   * code being previewed, "nothing to change" is TRUE and remains the right
   * answer — replacing it everywhere would trade one wrong message for another.
   */
  const p = preview({
    oldCode: 'MSE-L1',
    newCode: 'MSE-L1',
    matches: { courseExtension: [{ courseId: 'MSE-L1' }] },
  });
  assert.ok(p.blocked.some((b) => b.includes(NOTHING_TO_CHANGE)), p.blocked.join(' | '));
});

test('with no detached code anywhere, identical codes say there is nothing to change', () => {
  // Nothing for the two sides to disagree ABOUT — the catalogue is consistent.
  const p = preview({
    oldCode: 'MSE-L1', newCode: 'MSE-L1',
    extensionCodes: ['MSE-L1', 'POWER-BI'],
  });
  assert.ok(p.blocked.some((b) => b.includes(NOTHING_TO_CHANGE)), p.blocked.join(' | '));
});

test('an UNREAD store set cannot trigger the disagreement message', () => {
  /**
   * `matches: {}` means nobody looked, which is a different claim from "the
   * stores are empty". Reporting a disagreement on the strength of rows nobody
   * counted would be the same class of error in the other direction.
   */
  const p = buildRenamePreview({
    oldCode: 'EXCEL-HR-01', newCode: 'EXCEL-HR-01',
    msdbCodes: MSDB_AFTER, extensionCodes: EXT_AFTER, matches: {},
  });
  assert.ok(p.blocked.some((b) => b.includes(NOTHING_TO_CHANGE)), p.blocked.join(' | '));
});

// ── The refusal on the reachable question ──────────────────────────────────

/**
 * ══ THIS ASSERTION WAS DELIBERATELY REPLACED ═══════════════════════════════
 *
 * It used to assert that the upstream hit was refused with the wording
 * "อาจเป็นหลักสูตรเดียวกัน" — a SUSPICION, correct while nothing could settle
 * it. The `upstreamId` anchor settles it, so that wording no longer exists and
 * asserting it would pin a message the code is right to have stopped emitting.
 *
 * WHAT IS GUARANTEED NOW, and it is strictly stronger: with NO anchor the
 * refusal is about the missing anchor and names the row; with a WRONG anchor it
 * says the two are different courses and prints both ids; with a MATCHING
 * anchor it is not a refusal at all.
 */
test('with NO anchor, the upstream hit refuses and names the missing anchor', () => {
  // The fixture passes no `anchor`, which is the pre-backfill state.
  const p = preview({ oldCode: GENESIS_CODE, newCode: 'EXCEL-HR-01', matches: ELEVEN });
  assert.equal(p.ok, false, 'an unanchored row was allowed to rename');
  assert.equal(p.collision.blocked, true);
  assert.equal(p.selfUpstream.looksLikeIt, true, 'the shape was not even recognised');
  assert.equal(p.selfUpstream.proven, false);
  assert.equal(p.selfUpstream.reason, 'no-anchor');
  assert.ok(
    p.blocked.some((b) => b.includes('upstreamId') && b.includes(GENESIS_CODE)),
    'the refusal does not name the row or the missing anchor:\n  ' + p.blocked.join('\n  ')
  );
  // and it points at the fix rather than leaving the operator to guess
  assert.ok(p.blocked.some((b) => b.includes('backfill:extension-anchor')));
});

test('a GENUINE collision is still called what it is', () => {
  // Upstream holds both codes: two courses, and the target really is taken.
  const p = preview({
    oldCode: 'MSE-L1', newCode: 'POWER-BI',
    matches: { courseExtension: [{ courseId: 'MSE-L1' }] },
  });
  assert.equal(p.collision.blocked, true);
  assert.equal(p.collision.mayBeSelfUpstream, false, 'a real collision was softened into a maybe');
  assert.ok(p.blocked.some((b) => b.includes('ถูกใช้แล้ว')), p.blocked.join(' | '));
});

test('a course with NO genesis rows left does not get the self-upstream reading', () => {
  // Nothing of this course is stuck anywhere, so there is no reason to read the
  // upstream hit as its own row rather than a stranger's.
  const p = preview({ oldCode: GENESIS_CODE, newCode: 'EXCEL-HR-01' });
  assert.equal(p.collision.mayBeSelfUpstream, false);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the detached list varies with its input and is not a constant', () => {
  assert.deepEqual(detachedGenesisCodes([], MSDB_AFTER), []);
  assert.deepEqual(detachedGenesisCodes(EXT_AFTER, []), EXT_AFTER);
  assert.notDeepEqual(
    detachedGenesisCodes(EXT_AFTER, MSDB_AFTER),
    detachedGenesisCodes(EXT_AFTER, ['MSE-L1'])
  );
});

test('CONTROL: the phrase being banned is one this module really can emit', () => {
  /**
   * The assertions above are negatives over a message. If the wording changed,
   * they would pass forever against a string nothing produces — so the exact
   * phrase is pinned to a preview that still emits it.
   */
  const agreeing = preview({
    oldCode: 'MSE-L1', newCode: 'MSE-L1',
    matches: { courseExtension: [{ courseId: 'MSE-L1' }] },
  });
  assert.ok(agreeing.blocked.some((b) => b.includes(NOTHING_TO_CHANGE)));
});

test('CONTROL: the eleven-row fixture really carries eleven rows', () => {
  const n = Object.values(ELEVEN).reduce((sum, rows) => sum + rows.length, 0);
  assert.equal(n, 11, `the fixture holds ${n} rows, so the count assertion above proves nothing`);
});

// ══ THE ANCHOR TURNS THE REFUSAL INTO A RESUME ════════════════════════════

test('A MATCHING ANCHOR UNBLOCKS THE RENAME — this is the resume path', () => {
  /**
   * Upstream holds the new code, genesis holds the old, and the `_id` on the
   * row that holds the new code is the one this extension was anchored to while
   * both sides still agreed. That is proof of identity, not an inference from
   * the code — so the "collision" is this course's own half-done rename and the
   * write is allowed to catch genesis up.
   */
  const p = preview({
    oldCode: GENESIS_CODE, newCode: 'EXCEL-HR-01', matches: ELEVEN,
    msdbCourses: MSDB_ROWS, anchor: ANCHOR,
  });
  assert.equal(p.selfUpstream.proven, true, 'the anchor did not prove identity');
  assert.equal(p.collision.blocked, false, 'a proven self-upstream is still refused as a collision');
  assert.equal(p.ok, true, 'the resume is still blocked:\n  ' + p.blocked.join('\n  '));
  // The write is addressed by the anchor, so the preview has to carry it.
  assert.equal(p.anchor, ANCHOR, 'the preview does not carry the anchor the write needs');
  // and the eleven rows are still what will move
  assert.equal(p.totalRows, 11);
});

test('A WRONG ANCHOR REFUSES, and names both ids rather than the code', () => {
  // Upstream's row holding the new code is a DIFFERENT course. This is exactly
  // the merge the anchor exists to prevent.
  const rows = [{ course_id: 'EXCEL-HR-01', _id: OTHER_ID }, ...MSDB_ROWS.slice(1)];
  const p = preview({
    oldCode: GENESIS_CODE, newCode: 'EXCEL-HR-01', matches: ELEVEN,
    msdbCourses: rows, anchor: ANCHOR,
  });
  assert.equal(p.selfUpstream.proven, false);
  assert.equal(p.selfUpstream.reason, 'different-course');
  assert.equal(p.collision.blocked, true, 'a different course was allowed to be merged into');
  assert.ok(
    p.blocked.some((b) => b.includes(ANCHOR) && b.includes(OTHER_ID)),
    'the refusal does not print both ids:\n  ' + p.blocked.join('\n  ')
  );
});

test('AN ORDINARY COLLISION IS UNAFFECTED BY THE ANCHOR', () => {
  /**
   * The unblock must be narrow. Renaming into a code a genuinely different
   * course holds — with upstream still holding the old code too, so this is not
   * the upstream-only shape at all — is refused exactly as before.
   */
  const p = preview({
    oldCode: 'MSE-L1', newCode: 'POWER-BI',
    matches: { courseExtension: [{ courseId: 'MSE-L1' }] },
    msdbCourses: [{ course_id: 'MSE-L1', _id: '111111111111111111111111' }, ...MSDB_ROWS.slice(2)],
    anchor: '111111111111111111111111',
  });
  assert.equal(p.selfUpstream.looksLikeIt, false, 'an ordinary collision was read as upstream-only');
  assert.equal(p.collision.blocked, true);
  assert.equal(p.ok, false);
  assert.ok(p.blocked.some((b) => b.includes('ถูกใช้แล้ว')), p.blocked.join(' | '));
});

test('CONTROL: the same fixture with NO anchor is refused — the anchor is what changed', () => {
  const withAnchor = preview({
    oldCode: GENESIS_CODE, newCode: 'EXCEL-HR-01', matches: ELEVEN,
    msdbCourses: MSDB_ROWS, anchor: ANCHOR,
  });
  const without = preview({
    oldCode: GENESIS_CODE, newCode: 'EXCEL-HR-01', matches: ELEVEN,
    msdbCourses: MSDB_ROWS,
  });
  assert.equal(withAnchor.ok, true);
  assert.equal(without.ok, false);
  assert.equal(without.selfUpstream.reason, 'no-anchor');
});

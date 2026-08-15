import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRenamePreview,
  RENAME_STORES,
  NOT_KEYED_BY_CODE,
  REGIME,
} from '@/lib/courses/renameCoursePreview';

/**
 * The dry run's verdicts, driven for real.
 *
 * Every case here is one the live system cannot show us: there is no collision
 * to observe, no case-only rename in flight, and no course with a missing
 * alias that anyone is about to rename. Those are exactly the states the
 * preview exists to warn about, so they are built as fixtures rather than
 * waited for.
 */

const base = (over = {}) => buildRenamePreview({
  oldCode: 'MSE-L1',
  newCode: 'MSE-L1-NEW',
  msdbCodes: ['MSE-L1', 'MSE-L2', 'POWER-BI'],
  extensionCodes: ['MSE-L1', 'MSE-L2'],
  urlAlias: '',
  matches: {},
  ...over,
});

const storeOf = (p, key) => p.stores.find((s) => s.key === key);

// ── Collision ───────────────────────────────────────────────────────────────

test('a free code is not blocked', () => {
  const p = base();
  assert.equal(p.ok, true);
  assert.equal(p.collision.blocked, false);
  assert.deepEqual(p.blocked, []);
});

test('a code already in MSDB BLOCKS the rename', () => {
  const p = base({ newCode: 'MSE-L2' });
  assert.equal(p.ok, false);
  assert.equal(p.collision.blocked, true);
  assert.equal(p.collision.inMsdb, 'MSE-L2');
  assert.match(p.blocked.join(' '), /ถูกใช้แล้ว/);
});

test('a code held only by a CourseExtension ALSO blocks', () => {
  // The extension is upserted BY CODE, so a collision there silently overwrites
  // another course's SEO, alias and gallery — the destructive case createCourse
  // already guards. Upstream being free is not enough.
  const p = base({ newCode: 'ORPHAN', msdbCodes: ['MSE-L1'], extensionCodes: ['MSE-L1', 'ORPHAN'] });
  assert.equal(p.collision.blocked, true);
  assert.equal(p.collision.inMsdb, null);
  assert.equal(p.collision.inExtension, 'ORPHAN');
});

test('collision is CASE-INSENSITIVE, because upstream casing is not canonical', () => {
  const p = base({ newCode: 'mse-l2' });
  assert.equal(p.collision.blocked, true);
  assert.equal(p.collision.inMsdb, 'MSE-L2', 'the STORED spelling must be reported back');
});

test('the course does NOT collide with itself on a case-only rename', () => {
  // MSE-L1 → mse-l1 finds MSE-L1 in both lists. That is the course being
  // renamed, not an obstacle; treating it as one would make every case-only
  // rename impossible for the wrong reason.
  const p = base({ newCode: 'mse-l1' });
  assert.equal(p.collision.blocked, false);
  assert.equal(p.collision.inMsdb, null);
  assert.equal(p.collision.inExtension, null);
  assert.equal(p.ok, true);
});

test('an identical code is refused as nothing-to-do, not as a collision', () => {
  const p = base({ newCode: 'MSE-L1' });
  assert.equal(p.ok, false);
  assert.equal(p.collision.blocked, false);
  assert.match(p.blocked.join(' '), /เหมือนรหัสเดิม/);
});

test('a blank code on either side is refused', () => {
  assert.equal(base({ newCode: '' }).ok, false);
  assert.equal(base({ oldCode: '' }).ok, false);
});

// ── Case regime ─────────────────────────────────────────────────────────────

test('a case-only rename is FLAGGED', () => {
  assert.equal(base({ newCode: 'mse-l1' }).caseOnly, true);
  assert.equal(base({ newCode: 'MSE-L9' }).caseOnly, false);
});

/**
 * THE ASYMMETRY THAT MAKES A CASE-ONLY RENAME DANGEROUS.
 *
 * The normalised stores no-op — correctly — while every exact-match store still
 * has to change. So the course's ORDERING still works afterwards, which is what
 * an admin spot-checks, while the extension, early-bird, promo links, featured
 * lists and schedule rows are orphaned. The preview has to make that visible
 * per store, not as one banner.
 */
test('on a case-only rename the normalised stores NO-OP and the exact ones do not', () => {
  const p = base({
    newCode: 'mse-l1',
    matches: {
      programOrder: [{ programId: 'MSE', courseOrder: ['MSE-L1'] }],
      skillOrder: [{ skillId: 'DATA', courseOrder: ['MSE-L1'] }],
      courseOutlineFile: [{ courseId: 'mse-l1', lang: 'th' }],
      courseExtension: [{ courseId: 'MSE-L1' }],
      earlyBirdConfig: [{ course_id: 'MSE-L1' }],
      scheduleLocal: [{ course_id: 'MSE-L1' }],
    },
  });
  assert.equal(storeOf(p, 'programOrder').noOp, true);
  assert.equal(storeOf(p, 'skillOrder').noOp, true);
  assert.equal(storeOf(p, 'courseOutlineFile').noOp, true);
  assert.equal(storeOf(p, 'courseExtension').noOp, false);
  assert.equal(storeOf(p, 'earlyBirdConfig').noOp, false);
  assert.equal(storeOf(p, 'scheduleLocal').noOp, false);

  assert.equal(storeOf(p, 'programOrder').willChange, false);
  assert.equal(storeOf(p, 'courseExtension').willChange, true);
});

test('on an ordinary rename NOTHING no-ops', () => {
  const p = base({
    matches: {
      programOrder: [{ programId: 'MSE', courseOrder: ['MSE-L1'] }],
      courseExtension: [{ courseId: 'MSE-L1' }],
    },
  });
  assert.equal(storeOf(p, 'programOrder').noOp, false);
  assert.equal(storeOf(p, 'programOrder').willChange, true);
});

test('every store declares one of the three regimes', () => {
  const regimes = new Set(Object.values(REGIME));
  for (const s of RENAME_STORES) {
    assert.ok(regimes.has(s.regime), `${s.model} has no case regime`);
  }
});

// ── URL ─────────────────────────────────────────────────────────────────────

test('a DERIVED url changes, and demands an alias FIRST', () => {
  const p = base({ urlAlias: '' });
  assert.equal(p.url.aliased, false);
  assert.equal(p.url.current, '/mse-l1-training-course');
  assert.equal(p.url.after, '/mse-l1-new-training-course');
  assert.equal(p.url.changes, true);
  assert.equal(p.url.mustCreateAliasFirst, true);
  assert.equal(p.url.aliasToCreate, '/mse-l1-training-course');
});

test('an ALIASED url survives, and needs no new alias', () => {
  const p = base({ urlAlias: '/excel-essentials' });
  assert.equal(p.url.aliased, true);
  assert.equal(p.url.current, '/excel-essentials');
  assert.equal(p.url.after, '/excel-essentials');
  assert.equal(p.url.changes, false);
  assert.equal(p.url.mustCreateAliasFirst, false);
  assert.equal(p.url.aliasToCreate, null);
});

test('a case-only rename does NOT change a derived url', () => {
  // The derived path lowercases the code, so MSE-L1 and mse-l1 produce the same
  // URL. One of the few things a case-only rename genuinely leaves alone.
  const p = base({ newCode: 'mse-l1', urlAlias: '' });
  assert.equal(p.url.changes, false);
  assert.equal(p.url.mustCreateAliasFirst, false);
});

// ── Historical stores ───────────────────────────────────────────────────────

test('the two historical stores are listed as WILL NOT CHANGE, with a reason', () => {
  const p = base({ matches: { registerPublic: [{ courseCode: 'MSE-L1' }], careerPathRegistration: [] } });
  const keys = p.historical.map((h) => h.key);
  assert.deepEqual(keys.sort(), ['careerPathRegistration', 'registerPublic']);
  for (const h of p.historical) {
    assert.equal(h.willChange, false);
    assert.ok(h.reason && h.reason.length > 20, `${h.key} has no reason`);
  }
  assert.equal(p.historical.find((h) => h.key === 'registerPublic').count, 1);
});

test('the historical stores are NOT in the changing list', () => {
  const p = base({ matches: {} });
  for (const key of ['registerPublic', 'careerPathRegistration']) {
    assert.equal(storeOf(p, key), undefined, `${key} appeared as a store that changes`);
  }
});

test('related_courses is recorded as NOT keyed by code rather than omitted', () => {
  // The one everybody expects to see in the list. It is resolved to ObjectIds
  // before the MSDB write, so a rename does not reach it — and saying nothing
  // would read as an oversight.
  const flat = JSON.stringify(NOT_KEYED_BY_CODE);
  assert.match(flat, /related_courses/);
  assert.match(flat, /ObjectId/);
  assert.equal(base().notKeyedByCode, NOT_KEYED_BY_CODE);
});

// ── Counts, rows, and what was not read ─────────────────────────────────────

test('a store that was READ reports its rows and count', () => {
  const rows = [{ programId: 'MSE' }, { programId: 'DATA' }];
  const p = base({ matches: { programOrder: rows } });
  assert.equal(storeOf(p, 'programOrder').count, 2);
  assert.deepEqual(storeOf(p, 'programOrder').rows, rows);
});

test('a store that was NOT read reports null, never zero', () => {
  // Zero would read as "nothing to change here", which is a different and much
  // more comforting claim than "nobody looked".
  const p = base({ matches: { programOrder: [] } });
  assert.equal(storeOf(p, 'programOrder').count, 0, 'a read-and-empty store is 0');
  assert.equal(storeOf(p, 'earlyBirdConfig').count, null, 'an unread store must be null');
  assert.equal(storeOf(p, 'earlyBirdConfig').willChange, null);
  assert.match(p.undetermined.join('\n'), /EarlyBirdConfig/);
});

test('totalRows counts only what was actually read', () => {
  const p = base({ matches: { programOrder: [{}, {}], courseExtension: [{}] } });
  assert.equal(p.totalRows, 3);
});

// ── The outline blobs ───────────────────────────────────────────────────────

test('the outline PDF paths are reported, old and new', () => {
  const p = base({ outlineLangs: ['th', 'en'] });
  assert.deepEqual(p.outlineBlobs.map((b) => b.from), [
    '/files/course-outline/mse-l1-course-outline-th.pdf',
    '/files/course-outline/mse-l1-course-outline-en.pdf',
  ]);
  assert.deepEqual(p.outlineBlobs.map((b) => b.to), [
    '/files/course-outline/mse-l1-new-course-outline-th.pdf',
    '/files/course-outline/mse-l1-new-course-outline-en.pdf',
  ]);
  assert.ok(p.outlineBlobs.every((b) => b.moves));
});

test('a case-only rename moves NO blob — the filename is lowercased anyway', () => {
  const p = base({ newCode: 'mse-l1', outlineLangs: ['th'] });
  assert.equal(p.outlineBlobs[0].moves, false);
  assert.equal(p.outlineBlobs[0].from, p.outlineBlobs[0].to);
});

test('a course with no outline reports no blobs', () => {
  assert.deepEqual(base().outlineBlobs, []);
});

// ── What a dry run cannot know ──────────────────────────────────────────────

test('the limits of a dry run are stated in the output, not omitted', () => {
  const u = base().undetermined.join('\n');
  assert.match(u, /MSDB/, 'nothing says the upstream write cannot be pre-verified');
  assert.match(u, /blob/, 'nothing says the file move cannot be pre-verified');
  assert.match(u, /9expert/, 'nothing says other projects on the same MSDB are out of reach');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the store list covers every store the A3 audit named', () => {
  const keys = RENAME_STORES.map((s) => s.key).sort();
  assert.deepEqual(keys, [
    'article', 'careerPathRegistration', 'coursePromoLink', 'courseExtension',
    'courseOutlineFile', 'earlyBirdConfig', 'featuredCourse', 'featuredOnlineCourse',
    'navFeaturedOnlineCourse', 'programOrder', 'promotion', 'registerPublic',
    'scheduleLocal', 'skillOrder',
  ].sort());
});

test('CONTROL: the verdicts vary with input — none of them is a constant', () => {
  const free = base();
  const collided = base({ newCode: 'MSE-L2' });
  const caseOnly = base({ newCode: 'mse-l1' });
  assert.notEqual(free.ok, collided.ok);
  assert.notEqual(free.caseOnly, caseOnly.caseOnly);
  assert.notEqual(free.url.after, base({ newCode: 'OTHER' }).url.after);
  assert.notEqual(free.url.mustCreateAliasFirst, base({ urlAlias: '/x' }).url.mustCreateAliasFirst);
});

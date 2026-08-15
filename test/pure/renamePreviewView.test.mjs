import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRenamePreviewView, VERDICT, STORE_DESCRIPTIONS } from '@/lib/courses/renamePreviewView';
import { buildRenamePreview } from '@/lib/courses/renameCoursePreview';
import { RENAME_STORES } from '@/lib/courses/renameCoursePreview';

/**
 * What the screen decides before it renders anything.
 *
 * Driven through the REAL preview builder rather than hand-written view
 * fixtures — a view test fed a shape the preview never produces proves the
 * component renders an imaginary object. Every case here is one production
 * cannot show: nothing has been renamed, so there is no collision to observe
 * and no case-only rename in flight.
 */

const preview = (over = {}) => buildRenamePreview({
  oldCode: 'MSE-L1',
  newCode: 'EXCEL-INT',
  msdbCodes: ['MSE-L1', 'MSE-L2'],
  extensionCodes: ['MSE-L1'],
  urlAlias: '',
  matches: {
    courseExtension: [{ courseId: 'MSE-L1' }],
    programOrder: [{ programId: 'MSE' }],
    article: [{ slug: 'a' }, { slug: 'b' }],
    registerPublic: [{ courseCode: 'MSE-L1' }],
    careerPathRegistration: [],
  },
  ...over,
});

const storeOf = (view, key) => view.stores.find((s) => s.key === key);

// ── Idle ────────────────────────────────────────────────────────────────────

test('no preview yet renders nothing', () => {
  const v = buildRenamePreviewView(null);
  assert.equal(v.verdict, VERDICT.IDLE);
  assert.deepEqual(v.stores, []);
});

// ── Every store, including the empty ones ───────────────────────────────────

/** Every store read, most of them empty — what the real gatherer produces. */
const allRead = (over = {}) => {
  const matches = Object.fromEntries(RENAME_STORES.map((s) => [s.key, []]));
  // `...over` FIRST, then `matches` — the other order lets `over.matches`
  // replace the all-read baseline instead of extending it, which is how this
  // fixture silently stopped reading eleven stores on its first draft.
  return preview({ ...over, matches: { ...matches, ...(over.matches ?? {}) } });
};

test('EVERY changing store appears, zeros included', () => {
  /**
   * "Nothing here" is information. Omitting the empty stores would make a
   * twelve-store migration read as a three-store one, and leave the admin
   * unable to tell "checked, empty" from "not considered".
   */
  const v = buildRenamePreviewView(allRead({ matches: { article: [{ slug: 'a' }] } }));
  const changing = RENAME_STORES.filter((s) => !s.historical);
  assert.equal(v.stores.length, changing.length);
  assert.deepEqual(
    v.stores.map((s) => s.key).sort(),
    changing.map((s) => s.key).sort()
  );
  // The empty ones really do carry 0, and say they were read.
  assert.equal(storeOf(v, 'earlyBirdConfig').count, 0);
  assert.equal(storeOf(v, 'earlyBirdConfig').unread, false);
  assert.equal(storeOf(v, 'article').count, 1);
});

test('a store that was NOT READ is marked unread, never 0', () => {
  // Zero is the more comforting claim and it would be a lie.
  const v = buildRenamePreviewView(preview({ matches: { article: [{ slug: 'a' }] } }));
  assert.equal(storeOf(v, 'article').count, 1);
  assert.equal(storeOf(v, 'earlyBirdConfig').unread, true);
  assert.equal(storeOf(v, 'earlyBirdConfig').count, null);
});

test('every store carries a Thai description of what it holds', () => {
  const v = buildRenamePreviewView(preview());
  for (const s of [...v.stores, ...v.historical]) {
    assert.ok(STORE_DESCRIPTIONS[s.key], `${s.key} has no description`);
    assert.equal(s.holds, STORE_DESCRIPTIONS[s.key]);
    assert.notEqual(s.holds, s.key, `${s.key} falls back to its raw key`);
  }
});

test('the total counts only what was read', () => {
  const v = buildRenamePreviewView(preview());
  // 1 extension + 1 programOrder + 2 articles; unread stores contribute nothing
  assert.equal(v.total, 4);
});

// ── Collision ───────────────────────────────────────────────────────────────

test('A COLLISION IS A REFUSAL, and names the store that holds the code', () => {
  const v = buildRenamePreviewView(preview({ newCode: 'MSE-L2' }));
  assert.equal(v.verdict, VERDICT.BLOCKED);
  assert.ok(v.blocked.length > 0, 'a blocked rename gives no reason');
  assert.equal(v.collision.blocked, true);
  assert.equal(v.collision.inMsdb, 'MSE-L2');
});

test('a blocked preview does NOT carry the interval instruction', () => {
  // Telling an admin to change MSDB promptly after a rename that cannot run is
  // an instruction for something they are not about to do.
  const v = buildRenamePreviewView(preview({ newCode: 'MSE-L2' }));
  assert.ok(!v.warnings.some((w) => w.kind === 'interval'));
});

// ── Case-only ───────────────────────────────────────────────────────────────

test('A CASE-ONLY RENAME IS A WARNING, not a clean pass', () => {
  /**
   * Measured: the normalised stores no-op while every exact-match store still
   * changes, so the ordering an admin spot-checks afterwards looks correct
   * while the extension, early-bird, promo links and schedule rows are
   * orphaned. It reads as the safest possible rename and is one of the worst.
   */
  const v = buildRenamePreviewView(preview({ newCode: 'mse-l1' }));
  assert.equal(v.verdict, VERDICT.CASE_ONLY);
  const warn = v.warnings.find((w) => w.kind === 'case-only');
  assert.ok(warn, 'a case-only rename produced no warning');
  assert.ok(warn.title.length > 10 && warn.body.length > 40, 'the warning says nothing useful');
});

test('the case-only warning NAMES the stores that will silently no-op', () => {
  const v = buildRenamePreviewView(preview({
    newCode: 'mse-l1',
    matches: { programOrder: [{ programId: 'MSE' }], courseExtension: [{ courseId: 'MSE-L1' }] },
  }));
  assert.equal(storeOf(v, 'programOrder').noOp, true);
  assert.equal(storeOf(v, 'courseExtension').noOp, false);
  const warn = v.warnings.find((w) => w.kind === 'case-only');
  assert.match(warn.body, /ลำดับหลักสูตรในโปรแกรม/, 'the no-op store is not named in the warning');
});

test('an ordinary rename is READY and marks nothing as a no-op', () => {
  const v = buildRenamePreviewView(preview());
  assert.equal(v.verdict, VERDICT.READY);
  assert.ok(!v.warnings.some((w) => w.kind === 'case-only'));
  assert.ok(v.stores.every((s) => s.noOp === false));
});

// ── The interval ────────────────────────────────────────────────────────────

test('a runnable rename carries the interval instruction, phrased as an action', () => {
  const v = buildRenamePreviewView(preview());
  const warn = v.warnings.find((w) => w.kind === 'interval');
  assert.ok(warn, 'nothing tells the admin MSDB is still owed');
  assert.match(warn.title, /MSDB/);
  assert.match(warn.title, /นาที/, 'the urgency is not stated');
  assert.match(warn.body, /ยังไม่จัดลำดับ/, 'the ordering consequence is not named');
});

// ── URL ─────────────────────────────────────────────────────────────────────

test('a derived URL reports that an alias is created FIRST', () => {
  const v = buildRenamePreviewView(preview({ urlAlias: '' }));
  assert.equal(v.url.aliased, false);
  assert.equal(v.url.changes, true);
  assert.equal(v.url.aliasFirst, true);
  assert.equal(v.url.aliasToCreate, '/mse-l1-training-course');
});

test('an aliased URL reports no change and no alias step', () => {
  const v = buildRenamePreviewView(preview({ urlAlias: '/excel-intermediate' }));
  assert.equal(v.url.aliased, true);
  assert.equal(v.url.changes, false);
  assert.equal(v.url.aliasFirst, false);
});

// ── Historical ──────────────────────────────────────────────────────────────

test('the historical stores are listed separately, WITH a reason', () => {
  const v = buildRenamePreviewView(preview());
  assert.deepEqual(v.historical.map((h) => h.key).sort(), ['careerPathRegistration', 'registerPublic']);
  for (const h of v.historical) {
    assert.ok(h.reason.length > 20, `${h.key} is listed with no reason`);
  }
  // and they are NOT in the changing table
  assert.equal(storeOf(v, 'registerPublic'), undefined);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the three verdicts are genuinely distinct', () => {
  assert.equal(buildRenamePreviewView(preview()).verdict, VERDICT.READY);
  assert.equal(buildRenamePreviewView(preview({ newCode: 'mse-l1' })).verdict, VERDICT.CASE_ONLY);
  assert.equal(buildRenamePreviewView(preview({ newCode: 'MSE-L2' })).verdict, VERDICT.BLOCKED);
});

test('CONTROL: the view is derived, not a constant', () => {
  const a = buildRenamePreviewView(preview());
  const b = buildRenamePreviewView(preview({ matches: { article: [{ slug: 'x' }] } }));
  assert.notEqual(a.total, b.total);
});

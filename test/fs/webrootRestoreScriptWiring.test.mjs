import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, sourceExists } from '../sourceScan.mjs';

/**
 * THE SEAMS test/pure/webrootRestoreFlow.test.mjs CANNOT REACH.
 *
 * The pure file proves the ordering. What it cannot see is whether the OPERATOR
 * SCRIPT uses that flow honestly — and the one way this feature could be
 * quietly defanged is the rehearsal seam. `runRestoreFlow` accepts an optional
 * `resolveTarget` so the flow can be exercised against a scratch pathname; if
 * the production script ever passed it, an operator typo could aim a restore at
 * an arbitrary Blob key, and no pure test would notice.
 *
 * Same shape, and the same reasoning, as `--backup-collection` in
 * rewrite-legacy-references.mjs: an override that exists for rehearsal, with a
 * guard saying production must not use it.
 */

const SCRIPT = 'scripts/restore-webroot-document.mjs';
const REHEARSAL = 'scripts/_rehearse-webroot-restore.mjs';
const FLOW = 'src/lib/webroot/restoreFlow.mjs';

test('CONTROL: the files under scan exist and were really read', () => {
  for (const rel of [SCRIPT, FLOW]) {
    assert.ok(sourceExists(rel), `${rel} is missing`);
    assert.ok(readSource(rel).code.length > 500, `${rel} scanned to almost nothing`);
  }
});

test('THE GUARD: the production script never passes resolveTarget', () => {
  const src = readSource(SCRIPT);
  assert.equal(
    /resolveTarget/.test(src.code), false,
    'restore-webroot-document.mjs passes resolveTarget. That override exists ONLY '
    + 'so the flow can be rehearsed against a scratch pathname; in production it '
    + 'would let a typo aim a restore at an arbitrary Blob key',
  );
});

test('CONTROL: the guard can see the seam when it IS used', () => {
  // If the rehearsal script does not exist yet this control is skipped rather
  // than silently passing — a matcher that finds nothing anywhere proves nothing.
  if (!sourceExists(REHEARSAL)) {
    assert.fail(`${REHEARSAL} is missing, so the guard above has no positive case `
      + 'and could be passing because the matcher is broken');
  }
  assert.match(
    readSource(REHEARSAL).code, /resolveTarget/,
    'the rehearsal must actually use the seam, or the production guard is '
    + 'asserting the absence of something nothing ever writes',
  );
});

test('the script drives the shared flow rather than re-implementing the ordering', () => {
  const src = readSource(SCRIPT);
  assert.match(src.withImports, /from '\.\.\/src\/lib\/webroot\/restoreFlow\.mjs'/);
  assert.match(src.code, /runRestoreFlow\(/, 'the ordering must come from the tested function');
  assert.equal(
    /archiveCurrentObject\(/.test(src.code), false,
    'the script reaches past runRestoreFlow into the archive step. The order is '
    + 'the feature; a caller that can interleave it can get it wrong',
  );
});

test('--commit is the write flag, and dry run is the default', () => {
  const src = readSource(SCRIPT);
  assert.match(src.code, /has\('--commit'\)/, "the flag vocabulary must match rewrite-legacy-references.mjs");
  assert.equal(/has\('--apply'\)/.test(src.code), false, 'a second vocabulary for "actually write"');
  assert.match(src.code, /commit:\s*COMMIT/, 'the flag must reach the flow rather than being decorative');
});

test('there is no "restore the latest" shortcut anywhere in the script', () => {
  const src = readSource(SCRIPT);
  // The most likely rollback is FROM the newest edition, so a latest-default
  // would be right about the mechanism and wrong about every real incident.
  for (const shortcut of ['--latest', 'latestArchive', 'archives[0]', '.pop()']) {
    assert.equal(
      src.code.includes(shortcut), false,
      `the script offers "${shortcut}" — selection must be explicit`,
    );
  }
});

test('the listing shows what the operator is choosing between, before they choose', () => {
  const src = readSource(SCRIPT);
  assert.match(src.code, /showListing/, 'a no-argument listing must exist');
  assert.match(src.code, /list\(/, 'it must enumerate archives from the store');
  assert.match(src.code, /sha256|hashOf/, 'and show hashes, not just sizes');
});

test('verification is by hash and the read is cache-busted', () => {
  const src = readSource(SCRIPT);
  assert.match(src.code, /createHash\('sha256'\)/);
  assert.match(src.code, /__verify=/,
    'the post-restore read must bypass the CDN. Verifying an object immediately '
    + 'after overwriting it through a cached URL reads the very bytes the check '
    + 'exists to rule out');
  assert.match(src.code, /cache: 'no-store'/);
});

test('the restore is recorded as a NEW row that says where it came from', () => {
  const src = readSource(SCRIPT);
  assert.match(src.code, /insertOne\(/, 'append-only: a new row, never an update');
  assert.equal(
    /updateOne\(|findOneAndUpdate\(/.test(src.code), false,
    'the script mutates an existing row. The history of a document is the one '
    + 'thing an overwrite destroys; editing it is the same mistake one level up',
  );
  assert.match(src.code, /restoredFrom:/, 'the row must say which edition came back');
  assert.match(src.code, /admin_audit_logs/, 'and the audit line must be written');
});

test('no receipt logic leaked into the restore path', () => {
  const src = readSource(SCRIPT);
  const flow = readSource(FLOW);
  for (const s of ['receiptId', 'burnWebrootReceipt', 'issueWebrootReceipt']) {
    assert.equal(src.code.includes(s), false, `${s} appeared in the restore script`);
    assert.equal(flow.code.includes(s), false, `${s} appeared in the restore flow`);
  }
});

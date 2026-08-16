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

/** The body of one top-level function, bounded by the next top-level `const`/`async`. */
function fnBody(code, name) {
  const at = code.indexOf(`async function ${name}(`);
  if (at === -1) return '';
  const rest = code.slice(at + 1);
  const next = rest.search(/\n(?:async function |const |function )/);
  return next === -1 ? rest : rest.slice(0, next);
}

test('the cache-buster is recomputed on EVERY call, not hoisted', () => {
  // THE SUBTLETY THAT MAKES THE RETRY REAL. The poll passes the same identifier
  // each attempt, so a nonce computed once would leave attempts 2..N reading the
  // CDN's copy of the first busted URL — a retry loop that can only ever repeat
  // its first answer.
  const body = fnBody(readSource(SCRIPT).code, 'fetchFreshBytes');
  assert.ok(body.length > 50, 'fetchFreshBytes not found — the matcher is broken');
  assert.match(body, /__verify=/, 'the nonce must be built inside the function body');
  assert.match(body, /cache: 'no-store'/, 'and the fetch inside it must say no-store');
});

test('CONTROL: the same check REJECTS a hoisted nonce and a missing no-store', () => {
  // Two implementations that are wrong in the two ways that matter, put through
  // the same matcher. Without this the assertions above are decoration.
  const hoisted = `
    const BUST = '__verify=' + Date.now();
    async function fetchFreshBytes(pathname) {
      const meta = await head(pathname);
      const res = await fetch(meta.url + '?' + BUST, { cache: 'no-store' });
      return Buffer.from(await res.arrayBuffer());
    }`;
  const noStoreless = `
    async function fetchFreshBytes(pathname) {
      const meta = await head(pathname);
      const res = await fetch(meta.url + '?__verify=' + Date.now(), {});
      return Buffer.from(await res.arrayBuffer());
    }`;
  assert.equal(/__verify=/.test(fnBody(hoisted, 'fetchFreshBytes')), false,
    'a hoisted nonce must not satisfy the per-call check');
  assert.equal(/cache: 'no-store'/.test(fnBody(noStoreless, 'fetchFreshBytes')), false,
    'an init omitting no-store must not satisfy the check');
});

test('recording is gated on restoreDidWrite, so an unobserved restore still records', () => {
  // The 2026-08-10 defect in one line: a status the flow considers written must
  // reach the record. Gating on equality with a single "verified" status would
  // silently drop the not-yet-observable case and leave Blob and Mongo apart.
  const src = readSource(SCRIPT);
  assert.match(src.code, /restoreDidWrite\(result\.status\)/,
    'the script must ask the shared helper whether bytes were written');
  assert.equal(
    /result\.status\s*!==\s*RESTORE\.RESTORED_VERIFIED/.test(src.code), false,
    'the script gates recording on the VERIFIED status alone, which drops the '
    + 'not-yet-observable case — exactly the bug this change removed',
  );
  // `await recordRestore(`, not `recordRestore(result)` — the latter also matches
  // the function's own DECLARATION, which sits above the gate and made this
  // ordering check fail on correct code.
  const gate = src.code.indexOf('restoreDidWrite(result.status)');
  const record = src.code.indexOf('await recordRestore(');
  assert.ok(gate > -1, 'the gate is missing');
  assert.ok(record > gate, 'the gate must precede the record CALL');
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

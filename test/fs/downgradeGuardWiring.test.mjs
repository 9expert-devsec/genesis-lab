import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites } from '../sourceScan.mjs';

/**
 * THE GUARD IS ON THE WRITE PATH, AND IT COUNTS THE PAYLOAD.
 *
 * ── WHY THIS FILE EXISTS: A CONTROL-BREAK THAT DID NOT REDDEN ───────────────
 * Swapping `sectionCountsOf(previousDoc?.data)` for `previousDoc?.sections` in
 * syncLandingData left the whole pure tier green. That break is the subtle
 * reversal of this round's ruling — the stored `sections` field reports the NEW
 * counts even on the preserve-previous branch, so a guard reading it compares
 * against zeros, finds nothing that could shrink, and waves through exactly the
 * run it exists to stop.
 *
 * The pure tests exercise `sectionCountsOf` directly and cannot see which
 * argument the caller passes it. This can.
 */

const SYNC = 'src/lib/landing/syncLandingData.js';

test('the guard is called in the SYNC, not left to a caller', () => {
  /**
   * The invariant belongs to the write. syncLandingData has four callers — the
   * cron route, the admin sync route, triggerLandingSync and the webhook
   * resync — and b10bd54 is the standing evidence for what an invariant spread
   * across call sites costs: revalidatePath landed in one writer of four and
   * three shipped stale pages for months.
   */
  const { code, withImports } = readSource(SYNC);
  assert.match(withImports, /from '@\/lib\/cache-console\/downgradeGuard'/);
  assert.equal(countCallSites(code, 'assessDowngrade'), 1);
  assert.equal(countCallSites(code, 'permitsSnapshotWrite'), 1);
});

test('stored counts come from the PAYLOAD, never from the `sections` field', () => {
  // The break that did not redden anywhere else.
  const { code } = readSource(SYNC);
  assert.match(
    code,
    /const storedCounts = sectionCountsOf\(previousDoc\?\.data\)/,
    'storedCounts must be counted from the stored PAYLOAD'
  );
  assert.ok(
    !/storedCounts\s*=\s*previousDoc\?\.sections/.test(code),
    'reading the stored `sections` field compares against counters that can be zeroed '
    + 'while the payload is intact — the guard would then permit the run it exists to stop'
  );
});

test('incoming counts are counted from the payload ABOUT TO BE WRITTEN', () => {
  // `dataToWrite`, not the locals — the preserve-previous branch reassigns it,
  // and comparing the discarded locals would report a shrink that is not being
  // written.
  const { code } = readSource(SYNC);
  assert.match(code, /const incomingCounts = sectionCountsOf\(dataToWrite\)/);
});

test('the refusal path writes NO snapshot fields — only the refusal record', () => {
  /**
   * "Leaves the existing snapshot untouched" has to be true of the write, not
   * just of the intent. The refusal branch uses `$set` on `lastRefusal` alone;
   * touching `data`, `syncedAt`, `status` or `sections` there would rewrite the
   * very thing being protected.
   */
  /**
   * SCOPED TO THE WRITE CALL, not to the whole branch. The first version of
   * this assertion captured the branch including its RETURN object — which
   * legitimately reports `syncedAt` and `sections` so the caller can see what
   * the run computed — and went red on correct code. What must not contain
   * those fields is the update, and only the update.
   */
  const { code } = readSource(SYNC);
  const branch = /if \(!permitsSnapshotWrite\(downgrade\.verdict\)\) \{([\s\S]*?)\n  \}/.exec(code);
  assert.ok(branch, 'the refusal branch is where it is expected');

  const write = /LandingCache\.updateOne\(([\s\S]*?)\n    \);/.exec(branch[1]);
  assert.ok(write, 'the refusal branch issues exactly one updateOne');
  const writeBody = write[1];

  assert.match(writeBody, /\$set:\s*\{\s*lastRefusal:/, 'it writes the refusal record');
  for (const field of ['data:', 'syncedAt:', 'sections:', 'schemaVersion:']) {
    assert.ok(
      !writeBody.includes(field),
      `the refusal write must not touch ${field} — that is the snapshot it is protecting`
    );
  }
  // And it must not be a findOneAndUpdate with upsert, which would create a
  // document rather than leaving an absent one absent.
  assert.ok(!/findOneAndUpdate/.test(branch[1]), 'the refusal path does not upsert');
});

test('CONTROL: those field names DO appear on the write path it is compared against', () => {
  // Otherwise "the refusal writes no data" passes for a matcher looking for
  // strings that exist nowhere in the file.
  const { code } = readSource(SYNC);
  for (const field of ['data:', 'syncedAt,', 'sections,', 'schemaVersion:']) {
    assert.ok(code.includes(field), `${field} is real text in this file`);
  }
});

test('a successful write CLEARS the refusal', () => {
  // Otherwise a refusal survives its own resolution and the console keeps
  // offering an override for something that already recovered.
  const { code } = readSource(SYNC);
  assert.match(code, /lastRefusal: null/);
});

test('the refusal path does NOT revalidate', () => {
  /**
   * Nothing was published, so there is nothing to regenerate — and
   * regenerating would re-render the same stored snapshot at the cost of a full
   * rebuild. Asserted by position: the revalidate call must come after the
   * refusal branch has returned.
   */
  const { code } = readSource(SYNC);
  const refusalAt = code.indexOf('permitsSnapshotWrite');
  const returnAt = code.indexOf('refused: true');
  const revalidateAt = code.indexOf("revalidatePath('/')");
  assert.ok(refusalAt > -1 && returnAt > refusalAt, 'the refusal returns early');
  assert.ok(revalidateAt > returnAt, 'revalidatePath is downstream of that return');
});

test('allowShrink is a PARAMETER, never stored state', () => {
  // A persisted flag is a permanently disabled guard that nobody remembers
  // turning off.
  const { code } = readSource(SYNC);
  assert.match(code, /allowShrink = false/, 'defaults to off');
  assert.ok(
    !/allowShrink:\s*(true|allowShrink)/.test(code.replace(/assessDowngrade\([^)]*\)/g, '')),
    'allowShrink is never persisted into the document'
  );
});

test('the default refusal actor is the RESERVED system id', () => {
  // The cron and the webhook resync are the overwhelmingly common callers, and
  // SYSTEM_ACTOR_IDS exists so a row cannot be mistaken for a person's.
  const { code } = readSource(SYNC);
  assert.match(code, /actor = 'system:cron'/);
});

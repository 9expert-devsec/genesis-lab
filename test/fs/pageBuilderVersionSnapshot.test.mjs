import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Round 34, commit 1 — `getPageVersions`' projection is UNCHANGED.
 *
 * Avoiding that edit is the entire reason `getPageVersionSnapshot` exists.
 * Round 33 measured the alternative: the metadata the list ships is 153 B per
 * row against a 5.0 KB median snapshot beside it — ~33x — and the list fires on
 * every dialog open while a fetch-one fires on an explicit click. The failure
 * this file guards is a later round quietly adding `snapshot` to the list
 * select and leaving the fetch-one function sitting there unused.
 *
 * ── WHY SOURCE-SCANNED AND NOT EXECUTED ────────────────────────────────────
 * The claim is about SHAPE. A behavioural test would pass just as happily
 * against a widened projection whose extra field the assertion never looked at
 * — the exact "what would have to be true for this to pass while the thing it
 * guards is broken" failure. Reading the real projection cannot pass that way.
 *
 * ── WHY THIS FILE TOUCHES NO DATABASE, WHICH IS NOT AN ACCIDENT ────────────
 * test/run.mjs drives the runner with `isolation: 'none', concurrency: true`,
 * so root-level tests across DIFFERENT files run concurrently IN ONE PROCESS
 * and share test/fakeDb.mjs's module-level state. pageBuilderDraftActions.test
 * already documents the within-file half of this (its cases are subtests of one
 * parent so they cannot interleave); the across-file half is the same hazard
 * one level up, and it is why there is exactly ONE fakeDb-owning parent in the
 * suite. The executed half of commit 1 therefore lives inside that parent, and
 * everything here is pure file reading.
 */

const ACTIONS_SRC = 'src/lib/actions/pageBuilder.js';

/** The `.select(...)` argument on the getPageVersions query, or null. */
function projectionOf(text) {
  const at = text.indexOf('export async function getPageVersions(');
  if (at < 0) return null;
  const body = text.slice(at, text.indexOf('\n}', at));
  const m = body.match(/\.select\(\s*'([^']*)'\s*\)/);
  return m ? m[1] : null;
}

test('getPageVersions still refuses the snapshot', async (t) => {
  const src = readFileSync(ACTIONS_SRC, 'utf8');

  /**
   * ── AMENDED IN ROUND 35, AND THE AMENDMENT IS THE INTERESTING PART ───────
   * This read `['actor', 'createdAt', 'label']` when round 34 wrote it. Round
   * 35 added `versionNumber` to the projection, so the exact set moved.
   *
   * That is a WIDENING of the list projection, which is precisely what this
   * file exists to resist — so it does not get to happen quietly. What the
   * guard is actually for is stated in its own title: the list must never ship
   * a SNAPSHOT, because a snapshot is a whole page document and the list is 20
   * rows on every dialog open (measured round 34: ~33x the row that displays
   * it). `versionNumber` is a small integer, on every row, needed to render the
   * row itself. It is not the payload this guard was built against.
   *
   * The FORM is unchanged and that is deliberate: still an exact set, so the
   * next widening is caught the same way this one was; still a by-name refusal
   * of `snapshot` below; still a control that proves the exact-set form
   * discriminates. Only the expected set moved, and only by the one field.
   */
  await t.test('the projection is exactly the metadata fields', () => {
    const projection = projectionOf(src);
    assert.notEqual(projection, null, 'getPageVersions no longer has a .select() — read it again');
    assert.deepEqual(
      projection.split(/\s+/).filter(Boolean).sort(),
      ['actor', 'createdAt', 'label', 'versionNumber'],
      'getPageVersions projection changed — the fetch-one action exists to avoid this'
    );
  });

  await t.test('and `snapshot` is not in it, by name', () => {
    assert.equal(
      projectionOf(src).includes('snapshot'), false,
      'getPageVersions now ships the snapshot; delete getPageVersionSnapshot or revert this'
    );
  });

  await t.test('CONTROL: a widened projection IS caught', () => {
    // The discrimination form. The same matcher, over the same source with the
    // widen spliced in. If this does not throw, the two cases above prove
    // nothing — they would pass for a projection already widened.
    const widened = src.replace(
      /(export async function getPageVersions\([\s\S]*?)\.select\(\s*'label actor createdAt versionNumber'\s*\)/,
      "$1.select('snapshot label actor createdAt versionNumber')"
    );
    assert.notEqual(widened, src, 'the splice did not apply — this control is inert, fix it');

    const projection = projectionOf(widened);
    assert.equal(projection.includes('snapshot'), true, 'the splice did not reach the projection');
    assert.throws(
      () => assert.deepEqual(
        projection.split(/\s+/).filter(Boolean).sort(),
        ['actor', 'createdAt', 'label', 'versionNumber']
      ),
      /Expected values to be/,
      'the key-set assertion does NOT catch a widened projection'
    );
  });

  await t.test('the fetch-one action exists and is the ONLY door to a snapshot', () => {
    // Round 8's count-the-call-sites shape: one reader of a stored snapshot,
    // not two. A second findById would be a second door with its own answer to
    // the draft-strip question.
    assert.equal(
      src.includes('export async function getPageVersionSnapshot('), true,
      'the fetch-one action is gone — this file is pinning nothing'
    );
    assert.equal(
      [...src.matchAll(/PageVersion\.findById\(/g)].length, 1,
      'a second PageVersion.findById appeared — there should be one door'
    );
  });

  await t.test('the fetch-one read strips the draft, and does so on the RETURN', () => {
    // The behavioural proof is in pageBuilderDraftActions (it needs a database).
    // This pins that the strip is applied to what LEAVES the function rather
    // than to a local that is then discarded — the shape a refactor can break
    // without any test noticing.
    const at = src.indexOf('export async function getPageVersionSnapshot(');
    const body = src.slice(at, src.indexOf('\n}', at));
    assert.match(
      body, /return\s+serialize\(\{[^}]*stripDraft\(row\.snapshot\)/,
      'the returned snapshot is no longer the stripped one'
    );
  });
});

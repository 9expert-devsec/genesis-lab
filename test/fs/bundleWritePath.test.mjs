import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const ROUTE = 'src/app/api/registration/bundle/route.js';
const LEGS = 'src/lib/registration/bundleLegs.js';

/**
 * ══ WHAT THIS FILE PINS, AND WHAT IT CANNOT ════════════════════════════════
 *
 * IT PINS THAT THE CODE **ASKS** FOR A SESSION. It does not, and cannot, pin
 * THAT THE TRANSACTION BEHAVES — that it commits on success, that it aborts on
 * failure, or that a partial write is impossible.
 *
 * THE SUITE HAS NO DATABASE. There is no Mongo here, real or containerised;
 * test/fakeDb.mjs is a hand-written stand-in with no transaction semantics at
 * all. So nothing in this repository can observe an abort, and a test claiming
 * to have done so would be testing the fake.
 *
 * Read that as the honest scope rather than as a gap someone should close with
 * a mock: a mock that "aborts" proves the mock aborts. What CAN be checked from
 * here is the source — that the write is wrapped, that the wrapper is the only
 * write path, and above all that no fallback exists to write the legs unwrapped
 * when the wrapper throws. That last one is the property with teeth, because a
 * fallback would look like graceful degradation and would in fact be the exact
 * partial-write hazard the transaction exists to prevent.
 *
 * The behaviour itself is verified by the manual click-test, against the real
 * cluster, which is where it can actually be verified. The deployment was
 * confirmed read-only on 2026-09-05 to be a replica set (`hello` reports
 * `setName: atlas-jckskf-shard-0`, `logicalSessionTimeoutMinutes: 30`, MongoDB
 * 8.0.30), so transactions are supported there today — and `orderLegsMarkerLast`
 * exists for the day that stops being true.
 */

test('the write opens a session and runs inside withTransaction', () => {
  const code = read(ROUTE);
  assert.match(code, /mongoose\.startSession\(\)/, 'no session is opened — the write is unwrapped');
  assert.match(code, /session\.withTransaction\(/, 'the write is not inside a transaction');
  assert.match(code, /session\.endSession\(\)/, 'the session is never ended — it would leak on every request');
});

test('every create on this path passes the session', () => {
  /**
   * A `create` inside `withTransaction` that does NOT carry `{ session }` is
   * NOT in the transaction — it commits on its own and survives an abort. That
   * is the quietest possible way to lose the guarantee while keeping every
   * appearance of it, which is why this counts rather than merely greps.
   */
  const code = read(ROUTE);
  const creates = [...code.matchAll(/RegisterPublic\.create\(/g)];
  assert.equal(creates.length, 1, `expected exactly one create on this path, found ${creates.length}`);

  const withSession = [...code.matchAll(/RegisterPublic\.create\([^)]*\{\s*session\s*\}\s*\)/g)];
  assert.equal(withSession.length, 1, 'the create does not pass the session — it would escape the transaction');
});

test('CONTROL: the session-bearing matcher can tell the two forms apart', () => {
  const good = 'await RegisterPublic.create([leg], { session });';
  const bad = 'await RegisterPublic.create([leg]);';
  const rx = /RegisterPublic\.create\([^)]*\{\s*session\s*\}\s*\)/g;
  assert.equal((good.match(rx) ?? []).length, 1);
  assert.equal((bad.match(rx) ?? []).length, 0);
});

test('THERE IS NO FALLBACK: nothing writes when the transaction throws', () => {
  /**
   * The rule, stated as source. If `withTransaction` throws — an unsupported
   * deployment being the case that would hit EVERY submission — the request
   * must fail loudly and completely, with nothing written. A `catch` that
   * retried the legs unwrapped would be the worst available outcome.
   *
   * Checked by looking at what is INSIDE the catch: it may log and it may
   * return, and it may not create, insert or save.
   */
  const code = read(ROUTE);
  const start = code.indexOf('} catch (err) {');
  assert.notEqual(start, -1, 'the write no longer has a catch — has the shape changed?');
  const body = code.slice(start, code.indexOf('\n  }', start));

  for (const forbidden of ['create(', 'insertMany(', 'save(', 'bulkWrite(', 'updateOne(']) {
    assert.equal(
      body.includes(forbidden),
      false,
      `the failure path calls ${forbidden} — a fallback write would defeat the transaction entirely`,
    );
  }
  assert.match(body, /console\.error/, 'the failure is silent — it must be greppable the first time it happens');
  assert.match(body, /status:\s*500/, 'the failure does not report as a failure');
});

test('CONTROL: the catch-body slice is really the catch body', () => {
  const code = read(ROUTE);
  const start = code.indexOf('} catch (err) {');
  const body = code.slice(start, code.indexOf('\n  }', start));
  assert.ok(body.length > 50 && body.length < 2000, `the slice is ${body.length} chars — the bounds moved`);
  // It contains the log and NOT the happy-path return, so a "no create" result
  // above is the catch being clean rather than the slice being empty.
  assert.match(body, /ATOMIC WRITE FAILED/);
  assert.equal(body.includes('referenceNumber'), false, 'the slice has swallowed the success return');
});

test('the marker ordering is applied, and it is applied BEFORE the write', () => {
  const code = read(ROUTE);
  const orderedAt = code.indexOf('orderLegsMarkerLast(');
  const writeAt = code.indexOf('await writeLegsAtomically(orderedLegs)');
  assert.notEqual(orderedAt, -1, 'the marker ordering is gone — read its note before deleting it');
  assert.notEqual(writeAt, -1, 'the atomic write call is gone');
  assert.ok(orderedAt < writeAt, 'the legs are written before they are ordered');
});

test('the ordering carries the argument for why it survives beside a transaction', () => {
  /**
   * The comment IS the mechanism here: the next reader's most likely action is
   * to delete the ordering as redundant, and the only thing standing in the way
   * is the note saying the two guards fail in different worlds — the same shape
   * as writeEarlyBird's pre-read beside its E11000, which is named there for
   * exactly this reason.
   */
  const legs = read(LEGS);
  assert.match(legs, /writeEarlyBird/, 'the comparison to the E11000 pre-read is gone');
  assert.match(legs, /fail in different worlds/, 'the reason both guards are kept is gone');
  assert.match(legs, /replica set/, 'the note no longer says what a transaction depends on');
  assert.match(legs, /PREMISE/, 'the premise to re-read is gone');
});

test('the completeness query is written down where the ordering is defined', () => {
  // "Is this request complete" has to be answerable, and the answer has to live
  // beside the thing that makes it true.
  const legs = read(LEGS);
  assert.match(legs, /_id === bundle\.requestId/, 'the completeness property is not stated');
  assert.match(legs, /register_public/, 'the query an admin would run is not written down');
});

test('the requestId is minted BEFORE any write — no leg can exist without one', () => {
  /**
   * The alternative — write leg one, then use its `_id` — leaves a window in
   * which a row is a bundle leg that nothing can group. Minting the ObjectId
   * client-side closes it: the id is known before the first create, and it is
   * the marker's explicit `_id` as well as every leg's `requestId`.
   */
  const code = read(ROUTE);
  const mintAt = code.indexOf('new mongoose.Types.ObjectId()');
  const buildAt = code.indexOf('buildBundleTag(');
  const writeAt = code.indexOf('await writeLegsAtomically(');
  assert.notEqual(mintAt, -1, 'the requestId is no longer minted up front');
  assert.ok(mintAt < buildAt, 'the tag is built before the id exists');
  assert.ok(buildAt < writeAt, 'the write happens before the tag is built');
});

test('the route never reaches for the unguarded page read', () => {
  const code = read(ROUTE);
  assert.match(code, /getPublishedPageBuilderPageById/, 'the published-only read is gone');
  assert.equal(
    /getPageBuilderPageById\b(?!\w)/.test(code.replace(/getPublishedPageBuilderPageById/g, '')),
    false,
    'the route reaches for the unguarded by-id read — it returns draft content',
  );
});

test('the pair is re-resolved on submit, not trusted from the body', () => {
  /**
   * The page resolved it once to decide whether to render the form. A round can
   * roll off, a bundle can be closed and a page can be unpublished while a form
   * sits open in a tab, so the POST resolves again from scratch.
   */
  const code = read(ROUTE);
  const calls = [...code.matchAll(/resolveBundleRequest\(/g)];
  assert.equal(calls.length, 2, `expected the cheap pass and the full pass, found ${calls.length}`);
  // And the tag is built from what RESOLVED, never from the request body.
  assert.match(code, /sectionId:\s*gate\.section\.id/, 'the tag takes its sectionId from the body');
  assert.match(code, /name:\s*gate\.content\.name/, 'the tag takes its name from the body');
});

test('CONTROL: the body-vs-resolved probe would catch the wrong source', () => {
  const planted = 'sectionId: data.sectionId,\n  name: data.name,';
  assert.equal(/sectionId:\s*gate\.section\.id/.test(planted), false);
  assert.equal(/name:\s*gate\.content\.name/.test(planted), false);
});

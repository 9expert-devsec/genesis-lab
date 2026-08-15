import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, countCallSites, walkSources, blankStringBodies } from '../sourceScan.mjs';
import { pairContract, isValidPair } from '@/lib/audit/auditContract';

/**
 * THE THREE OVERRIDE RULINGS, each with the assertion that goes red if it is
 * REVERSED. Written before the component, because rounds 2 and 3 both shipped a
 * ruling implemented as a value with nothing over it and the control run caught
 * it, not review.
 *
 * The rulings:
 *   1. the menu key is a LITERAL at the call site
 *   2. the audit policy is `full` — a discarded pre-image defeats the row
 *   3. allowShrink is a parameter with NO persisted form
 */

const ACTIONS = 'src/lib/actions/cache-console.js';

// ══ RULING 1 — the menu key is a literal at the call site ══════════════════

test('RULING 1 REVERSED: the override guards and audits on a LITERAL menu key', () => {
  /**
   * Not a constant, not a variable. test/fs/auditCoverage compares the menu a
   * function AUDITS against the menu it GUARDS by reading both out of the same
   * function body — a shared constant makes the two unverifiable and lets one
   * drift from the other silently. Round 3 shipped a `MENU` constant here and
   * the coverage guard caught it.
   */
  const { code } = readSource(ACTIONS);
  const fn = /export async function applySnapshotOverride[\s\S]*?\n\}/.exec(code);
  assert.ok(fn, 'applySnapshotOverride is where it is expected');

  assert.match(fn[0], /requireAdmin\('landing_cache'\)/, 'guards on the literal');
  assert.match(fn[0], /menu:\s*'landing_cache'/, 'audits on the same literal');
  assert.ok(
    !/requireAdmin\(\s*[A-Z_][A-Z0-9_]*\s*\)/.test(fn[0]),
    'a hoisted constant would make the audited-vs-guarded comparison unverifiable'
  );
});

test('CONTROL: that extraction really captures the function body', () => {
  // A regex capturing an empty string would make the assertions above pass
  // while proving nothing.
  const { code } = readSource(ACTIONS);
  const fn = /export async function applySnapshotOverride[\s\S]*?\n\}/.exec(code);
  assert.ok(fn[0].length > 400, 'the captured body is a real body');
  assert.match(fn[0], /recordAdminActionAfter/, 'and it is the one that audits');
});

// ══ RULING 2 — `full` policy, and a pre-image that survives it ═════════════

test('RULING 2 REVERSED: the snapshot pair is `full`, not count_only or act_only', () => {
  /**
   * `count_only` and `act_only` both NULL `before` and `after`
   * (recordAdminAction.js:140). The override is a write whose entire value as
   * an audit row is "these are the numbers a human approved losing" — at
   * either lower policy the writer would discard exactly that, keeping only
   * the fact that someone clicked.
   */
  assert.equal(isValidPair('landing_cache', 'snapshot'), true);
  assert.equal(pairContract('landing_cache', 'snapshot').diff, 'full');
});

test('RULING 2 REVERSED: the override actually PASSES a before and an after', () => {
  // A `full` policy with nothing handed to it is the same outcome by a
  // different route: the row is written, the payload is empty, and nothing
  // reddens.
  const { code } = readSource(ACTIONS);
  const fn = /export async function applySnapshotOverride[\s\S]*?\n\}/.exec(code)[0];
  assert.match(fn, /before:\s*\{\s*sections:\s*beforeSections\s*\}/);
  assert.match(fn, /after:\s*\{\s*sections:\s*afterSections\s*\}/);
});

test('RULING 2: the pre-image is read BEFORE the write that replaces it', () => {
  /**
   * Ordering, which is the part a policy check cannot see. Once the sync has
   * written, the previous section counts are gone — so `beforeSections` must be
   * computed from the document read at the top of the action, not from a
   * re-read afterwards.
   */
  const { code } = readSource(ACTIONS);
  const fn = /export async function applySnapshotOverride[\s\S]*?\n\}/.exec(code)[0];
  const preImageAt = fn.indexOf('const beforeSections');
  const syncAt = fn.indexOf('syncLandingData(');
  assert.ok(preImageAt > -1 && syncAt > -1, 'both are present');
  assert.ok(preImageAt < syncAt, 'the pre-image is captured before the sync runs');
});

// ══ RULING 3 — allowShrink is a parameter with no persisted form ═══════════

test('RULING 3 REVERSED: allowShrink is never written to any document', () => {
  /**
   * A persisted "shrink allowed" flag is a permanently disabled guard that
   * nobody remembers turning off — and unlike a parameter, nothing about the
   * next run would reveal it. Scanned across the whole cache-console surface
   * plus the sync and the model, with string bodies blanked so a mention in
   * explanatory copy does not read as a field.
   */
  const FILES = [
    'src/lib/actions/cache-console.js',
    'src/lib/landing/syncLandingData.js',
    'src/models/LandingCache.js',
    'src/lib/cache-console/downgradeGuard.js',
  ];
  for (const rel of FILES) {
    const code = blankStringBodies(readSource(rel).code);
    // A schema field, or a $set of it, in any spelling anyone would reach for.
    for (const banned of [
      /allowShrink\s*:\s*\{\s*type/,        // a mongoose field
      /\$set[\s\S]{0,80}allowShrink/,       // written into a document
      /shrinkAllowedUntil/,                 // the "until" flag the brief bans
      /allowShrinkUntil/,
    ]) {
      assert.ok(!banned.test(code), `${rel} persists allowShrink (${banned})`);
    }
  }
});

test('RULING 3: allowShrink defaults to FALSE and is a function parameter', () => {
  const { code } = readSource('src/lib/landing/syncLandingData.js');
  assert.match(code, /allowShrink = false/, 'off unless a caller opts in');
  assert.match(
    code,
    /export async function syncLandingData\(\{[^}]*allowShrink/,
    'it arrives as a parameter, not as read state'
  );
});

test('CONTROL: the banned patterns fire on the shapes they are meant to catch', () => {
  // Otherwise the sweep above passes for regexes that match nothing.
  const FIXTURES = [
    ['allowShrink: { type: Boolean, default: false },', /allowShrink\s*:\s*\{\s*type/],
    ['await Doc.updateOne({}, { $set: { allowShrink: true } });', /\$set[\s\S]{0,80}allowShrink/],
    ['shrinkAllowedUntil: new Date(),', /shrinkAllowedUntil/],
  ];
  for (const [snippet, pattern] of FIXTURES) {
    assert.ok(pattern.test(snippet), `${pattern} does not fire on ${snippet}`);
  }
});

test('the ONLY caller passing allowShrink: true is the override action', () => {
  /**
   * The flag's blast radius, pinned. A second caller — a cron route, a trigger
   * wrapper — would disable the guard on a path with no human reading numbers,
   * which is the failure the whole round exists to prevent.
   */
  const hits = walkSources('src')
    .filter((f) => /allowShrink:\s*true/.test(blankStringBodies(f.code)))
    .map((f) => f.rel);
  assert.deepEqual(hits, ['src/lib/actions/cache-console.js']);
});

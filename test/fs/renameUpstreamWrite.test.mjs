import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources, countCallSites } from '../sourceScan.mjs';

/**
 * THE RENAME WRITES UPSTREAM — ONCE, WITH ONE KEY, AND BEFORE IT TOUCHES
 * GENESIS.
 *
 * ══ THIS FILE REPLACES test/fs/renameNoUpstreamWrite ═══════════════════════
 *
 * That file asserted the exact opposite: that no `msdbCreate/Update/Delete`
 * was reachable from the rename, because a HUMAN was supposed to change
 * `course_id` in MSDB afterwards. The two-phase design is retired — the
 * requirement is that an admin renames in genesis and is DONE — so the old ban
 * would now forbid the feature. It is replaced rather than deleted, and what
 * replaced it is stricter about the things that actually protect the data:
 *
 *   ONE WRITE, not a loop or a retry. A second PUT could rename a course that
 *   is already renamed.
 *   ONE KEY. Merge semantics are established (docs/api-domains.md, measured
 *   2026-08-16), so `{course_id}` alone suffices — and a reconstructed full
 *   payload would open a lost-update window against any concurrent editor.
 *   ADDRESSED BY THE ANCHOR, never by a code lookup, which is exactly what
 *   cannot tell this course from whatever now answers to its code.
 *   BEFORE ANY GENESIS WRITE, so a refusal leaves nothing anywhere.
 *
 * The formerCodes / gate / audit assertions below are carried over unchanged:
 * none of them depended on the phase split.
 */

const ENTRY = 'src/lib/actions/course-rename.js';
const UPSTREAM_WRITES = ['msdbCreate', 'msdbUpdate', 'msdbDelete'];

/** Every repo module reachable from `entries` through `@/` imports. */
function closure(entries) {
  const byRel = new Map(walkSources('src').map((f) => [f.rel, f]));
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel) || !byRel.has(rel)) continue;
    seen.add(rel);
    for (const m of byRel.get(rel).withImports.matchAll(/from\s+'(@\/[^']+)'/g)) {
      const base = 'src/' + m[1].slice(2);
      for (const cand of [`${base}.js`, `${base}.jsx`, `${base}/index.js`]) {
        if (byRel.has(cand)) { queue.push(cand); break; }
      }
    }
  }
  return [...seen].map((rel) => byRel.get(rel));
}

// ══ THE UPSTREAM WRITE PRECEDES ANY GENESIS WRITE ═════════════════════════

test('THE UPSTREAM WRITE COMES BEFORE EVERY GENESIS WRITE', () => {
  /**
   * The safety property of the whole round. A non-2xx before any genesis
   * mutation is a clean refusal with no debris; the reverse order leaves
   * genesis-done/upstream-pending, measured NOT reversible because genesis has
   * written `formerCodes` and its own guards then refuse the undo.
   *
   * Positional, over the scrubbed source: the upstream call must sit above the
   * first Mongo mutation in the file.
   */
  const { code } = readSource(ENTRY);
  const upstreamAt = code.indexOf("msdbUpdate('public-course'");
  assert.notEqual(upstreamAt, -1, 'the rename no longer writes upstream at all');

  const GENESIS_WRITES = /\.(updateOne|updateMany|findOneAndUpdate|bulkWrite|deleteOne|deleteMany|save)\s*\(/g;
  const positions = [...code.matchAll(GENESIS_WRITES)].map((m) => ({ at: m.index, verb: m[1] }));
  assert.ok(positions.length >= 5, `expected the genesis writes, found ${positions.length}`);

  const early = positions.filter((p) => p.at < upstreamAt);
  assert.deepEqual(
    early.map((p) => p.verb), [],
    'a genesis write happens BEFORE the upstream write — a refusal would leave debris:\n  '
    + early.map((p) => p.verb).join('\n  ')
  );
});

test('the upstream write happens ONCE, with ONE key, addressed by the ANCHOR', () => {
  const { code } = readSource(ENTRY);
  const writes = [...code.matchAll(/(?<![\w$])(msdbCreate|msdbUpdate|msdbDelete)\s*\(/g)];
  assert.deepEqual(writes.map((m) => m[1]), ['msdbUpdate'],
    `expected exactly one msdbUpdate, found: ${writes.map((m) => m[1]).join(', ') || '(none)'}`);
  assert.match(code, /msdbUpdate\('public-course', anchor, \{ course_id: to \}\)/,
    'the upstream write is not a one-key PUT addressed by the anchor');
  // The anchor comes from the preview's extension row, NOT from a code lookup.
  assert.match(code, /const anchor = String\(preview\.anchor \?\? ''\)\.trim\(\)/,
    'the anchor is not taken from the preview');
});

test('AN UNANCHORED ROW REFUSES, and names the row rather than falling back', () => {
  const { code } = readSource(ENTRY);
  const at = code.indexOf('isAnchorShaped(anchor)');
  assert.notEqual(at, -1, 'the anchor is never validated');
  const upstreamAt = code.indexOf("msdbUpdate('public-course'");
  assert.ok(at < upstreamAt, 'the anchor is validated after the write it addresses');
  const branch = code.slice(at, upstreamAt);
  assert.match(branch, /return fail\(/, 'a missing anchor does not refuse');
  assert.match(branch, /needsAnchor: true/, 'the refusal is not identifiable');
  assert.match(branch, /courseId: from/, 'the refusal does not name the row');
  assert.match(branch, /backfill:extension-anchor/, 'the refusal does not say how to fix it');
  // and it must NOT resolve the course by code as a fallback
  assert.ok(!/getCourseByCode/.test(code), 'the rename resolves the course by code somewhere');
});

// ══ SUCCESS IS A READ-BACK ════════════════════════════════════════════════

test('the outcome comes from a READ-BACK, not from the response', () => {
  const { code } = readSource(ENTRY);
  assert.match(code, /async function readUpstreamById\(id\)/, 'there is no read-back by _id');
  assert.match(code, /String\(c\?\._id\) === String\(id\)/, 'the read-back does not match on _id');
  assert.match(code, /revalidate: 0/, 'the read-back is cached — it would confirm a stale row');

  // The classification is fed the READ-BACK ROW; the response only says whether
  // the call threw.
  assert.equal(countCallSites(code, 'classifyUpstreamWrite'), 1, 'the outcome is not classified exactly once');
  assert.match(code, /row: upstreamRow,/, 'the classifier is not given the re-read row');
  assert.match(code, /readFailed,/, 'a failed read-back is indistinguishable from a clean one');

  // Nothing captures the write's own return value, so nothing can branch on it.
  assert.ok(!/=\s*await msdbUpdate/.test(code),
    'the response of the upstream write is captured — it must not be the evidence');
});

test('a non-APPLIED outcome returns BEFORE any genesis write', () => {
  const { code } = readSource(ENTRY);
  const guardAt = code.indexOf('verdict.outcome !== UPSTREAM_OUTCOME.APPLIED');
  assert.notEqual(guardAt, -1, 'nothing stops a non-applied outcome');
  const firstGenesis = code.search(/\.(updateOne|updateMany)\s*\(/);
  assert.ok(guardAt < firstGenesis, 'genesis is written before the outcome is checked');
  const branch = code.slice(guardAt, code.indexOf('const upper = normalizeCourseCode(from)'));
  assert.match(branch, /wroteGenesis: false/, 'the refusal does not say genesis is untouched');
  assert.match(branch, /return fail\(/);
});

test('a TIMEOUT yields UNKNOWN and nothing is rolled back on it', () => {
  const { code } = readSource(ENTRY);
  assert.match(code, /timeout: isTimeoutError\(writeError\)/,
    'a timeout is not distinguished from a refusal');
  assert.match(code, /UPSTREAM_OUTCOME\.UNKNOWN[\s\S]{0,80}UNKNOWN_ADVICE\.th/,
    'an unknown outcome does not carry its advice');
  // NOTHING writes the old code back upstream anywhere in this file.
  assert.ok(!/course_id: from/.test(code),
    'the action can write the OLD code back upstream — that is a rollback on a guess');
});

// ══ THE CACHE FAN-OUT RUNS ONLY ON A CONFIRMED SUCCESS ════════════════════

test('the fan-out is AFTER the outcome check and cannot be reached otherwise', () => {
  const { code } = readSource(ENTRY);
  const fanAt = code.indexOf('renameCacheTargets(');
  assert.notEqual(fanAt, -1, 'there is no cache fan-out');
  const guardAt = code.indexOf('verdict.outcome !== UPSTREAM_OUTCOME.APPLIED');
  assert.ok(guardAt < fanAt, 'the fan-out can run on a non-applied outcome');

  // Every early refusal sits above it, so the only way here is straight through.
  const returns = [...code.slice(0, fanAt).matchAll(/return fail\(/g)].length;
  assert.ok(returns >= 5, `expected the early refusals above the fan-out, found ${returns}`);

  assert.equal(countCallSites(code, 'bustUpstream'), 1, 'the tags are not busted exactly once');
  assert.equal(countCallSites(code, 'triggerNavMenuSync'), 1, 'the mega menu is never resynced');
  assert.equal(countCallSites(code, 'triggerLandingSync'), 1, 'the landing snapshot is never resynced');
});

test('CONTROL: the closure is real and the write-verb scan can fire', () => {
  const files = closure([ENTRY]);
  const rels = files.map((f) => f.rel);
  assert.ok(files.length >= 10, `the closure found only ${files.length} modules`);
  assert.ok(rels.includes(ENTRY));
  assert.ok(rels.includes('src/lib/courses/renameCoursePlan.js'), 'the walk did not follow @/ imports');
  assert.ok(rels.includes('src/lib/actions/course-rename-preview.js'), 'the walk did not reach the preview');
  assert.ok(rels.includes('src/lib/courses/renameUpstreamPlan.js'), 'the walk did not reach the outcome planner');

  // The same scan, pointed at a module that writes upstream, reports it.
  const writer = readSource('src/lib/actions/courses.js');
  const found = UPSTREAM_WRITES.filter((v) =>
    new RegExp(String.raw`(?<![\w$])${v}\s*\(`).test(writer.code));
  assert.ok(found.length >= 2, `the verb scan found only ${found.length} upstream writes in a known writer`);
});

// ── formerCodes reaches exactly the two ruled sites ─────────────────────────

test('formerCodes is consulted by /search and resolveCourse, and nowhere else', () => {
  /**
   * Ruled: those two only. NOT the client-side catalogue filters, which would
   * need the extension payload widened for a case their users do not hit.
   *
   * The WRITERS are excluded by name — the model that declares the field, the
   * action that appends it, the planner that refuses a collision against it,
   * the lookup that exists to serve resolveCourse, and the corpus builder that
   * attaches it for the haystack. Everything else reading it is scope creep.
   */
  const ALLOWED = new Set([
    'src/models/CourseExtension.js',
    'src/lib/actions/course-rename.js',
    'src/lib/actions/course-extensions.js',
    'src/lib/courses/renameCoursePlan.js',
    'src/lib/search/searchCorpus.js',
    'src/lib/search/matchSearch.js',
    'src/lib/resolveCourse.js',
  ]);
  const readers = walkSources('src')
    .filter((f) => /formerCodes/.test(f.code))
    .map((f) => f.rel)
    .filter((rel) => !ALLOWED.has(rel));
  assert.deepEqual(
    readers, [],
    'formerCodes leaked outside the two ruled consulting sites:\n  ' + readers.join('\n  ')
  );
});

test('the two consulting sites really do read it', () => {
  // The negative above passes over an empty set if nothing reads the field.
  assert.match(readSource('src/lib/search/matchSearch.js').code, /c\?\.formerCodes/,
    'the course haystack does not read formerCodes');
  assert.match(readSource('src/lib/resolveCourse.js').code, /byAlias\.formerCodes/,
    'resolveCourse path 1 does not read formerCodes');
  assert.equal(
    countCallSites(readSource('src/lib/resolveCourse.js').code, 'fetchExtensionByFormerCode'), 1,
    'resolveCourse path 2 does not consult the former-code lookup'
  );
});

// ── The gate, and the audit rail ────────────────────────────────────────────

test('the rename is gated, and on the key the audit rail can read', () => {
  /**
   * `requireAdmin('courses')`, not `requirePageAction`. Reported at the call
   * site: `requirePageAction(pageKey)` takes ONE argument, so a second
   * `'rename'` would be silently ignored and authorise exactly what this does
   * — while leaving the coverage guard unable to see the menu literal.
   */
  const { code } = readSource(ENTRY);
  assert.match(code, /requireAdmin\('courses'\)/, 'the rename is not gated on courses');
  assert.ok(!/requirePageAction/.test(code), 'requirePageAction would hide the menu from the audit sweep');
});

test('the rename records ONE audit row, keyed on the NEW code', () => {
  const { code } = readSource(ENTRY);
  assert.equal(countCallSites(code, 'recordAdminActionAfter'), 1, 'expected exactly one audit row');
  assert.match(code, /action:\s*'rename'/);
  assert.match(code, /entity:\s*'course_code'/);
  assert.match(code, /recordId:\s*to,/, 'recordId must be the NEW code — findable from what exists now');
  assert.match(code, /meta:\s*\{[\s\S]*?from,/, 'the OLD code must be in meta');
  assert.match(code, /counts:\s*actual/, 'the per-store counts must be in meta');
  assert.match(code, /actor:\s*\{ id: session\.user\?\.id/, 'no session actor recorded');
});

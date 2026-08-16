import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * THE PREVIEW WRITES NOTHING, PROVED RATHER THAN PROMISED.
 *
 * ── WHY A STRUCTURAL PROOF AND NOT A BEHAVIOURAL ONE ───────────────────────
 * A behavioural test would have to run the preview against a database and then
 * show that nothing changed — which proves it for the rows it happened to
 * touch, on the path it happened to take, with the data that happened to be
 * there. The property wanted here is stronger and simpler: NO WRITE CALL EXISTS
 * IN THE REACHABLE CODE. That is a question about source, so it is asked of
 * source, over the module AND everything it imports from this repo.
 *
 * ── THE WALK ───────────────────────────────────────────────────────────────
 * Starts at the two entry files and follows `@/` imports transitively. A write
 * hidden one hop away in a helper is exactly the shape this has to catch — the
 * whole point of the rule is that the preview cannot be made to write BY
 * ACCIDENT, and an accident looks like importing something innocuous.
 *
 * ── WHAT IT CANNOT SEE, SAID PLAINLY ───────────────────────────────────────
 * A computed method name (`Model[verb](...)`), a write reached through a
 * dynamic `await import()`, and anything the upstream HTTP client does on our
 * behalf. `listPublicCourses` is in the closure and performs a GET; the ban
 * list below therefore cannot include `fetch`, and an upstream endpoint that
 * mutated on GET would be invisible here. Named, not hidden.
 */

const ENTRIES = [
  'src/lib/actions/course-rename-preview.js',
  'src/lib/courses/renameCoursePreview.js',
];

/**
 * Calls that persist, invalidate, or fire a downstream job.
 *
 * `revalidate*` and `triggerLandingSync` are in here with the mutators on
 * purpose: neither writes a document, but both are OBSERVABLE SIDE EFFECTS of
 * the kind a dry run must not have. A preview that quietly busted the public
 * cache would make "I only looked" false in a way an admin would notice on the
 * live site.
 */
const BANNED = [
  'save', 'create', 'insertOne', 'insertMany', 'bulkWrite',
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete', 'findByIdAndDelete', 'remove',
  'revalidatePath', 'revalidateTag', 'bustUpstream', 'triggerLandingSync',
  'msdbCreate', 'msdbUpdate', 'msdbDelete',
];

/** Every repo module reachable from `entries` through `@/` imports. */
function closure(entries) {
  const byRel = new Map(walkSources('src').map((f) => [f.rel, f]));
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel) || !byRel.has(rel)) continue;
    seen.add(rel);
    const { withImports } = byRel.get(rel);
    for (const m of withImports.matchAll(/from\s+'(@\/[^']+)'/g)) {
      const base = 'src/' + m[1].slice(2);
      for (const cand of [`${base}.js`, `${base}.jsx`, `${base}/index.js`]) {
        if (byRel.has(cand)) { queue.push(cand); break; }
      }
    }
  }
  return [...seen].map((rel) => byRel.get(rel));
}

/**
 * ── ONE EXEMPTION, NAMED AND SELF-INVALIDATING ─────────────────────────────
 *
 * `requireAdmin` reaches the NextAuth config, and that file writes. Both writes
 * are LOGIN BOOKKEEPING on the `Admin` collection — `lastLoginAt` and
 * `totpVerifiedAt` — inside the credentials `authorize` callback, i.e. they run
 * when somebody SIGNS IN, not when a gated action calls `requireAdmin()` on an
 * already-authenticated request. They touch no course data and every gated
 * action in the codebase reaches them.
 *
 * Exempted rather than dropped from the walk, so the exemption is a line in a
 * diff. The control below proves the file still exists and still writes ONLY to
 * `Admin`: the day it writes anything else, this stops being defensible and
 * goes red instead of quietly covering it.
 */
const EXEMPT = new Map([
  ['src/lib/auth/options.js', 'Admin login bookkeeping (lastLoginAt / totpVerifiedAt) in the sign-in callback'],
]);

test('the reachable closure contains NO write call', () => {
  const offenders = [];
  for (const f of closure(ENTRIES)) {
    if (EXEMPT.has(f.rel)) continue;
    for (const verb of BANNED) {
      // `.verb(` — a METHOD call or a bare imported call. Bounded on the dot so
      // `remove` does not match `removeImports`, and read from scrubbed code so
      // a verb named in a comment is not a hit.
      const re = new RegExp(String.raw`(?<![\w$])${verb}\s*\(`);
      if (re.test(f.code)) offenders.push(`${f.rel}: ${verb}(`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'the rename PREVIEW can reach a write — it must not:\n  ' + offenders.join('\n  ')
  );
});

test('CONTROL: the closure is real, and the ban list can actually fire', () => {
  /**
   * The assertion above is a negative over a walk. An empty closure, or a
   * regex that matches nothing, satisfies it forever — so both halves are
   * pinned here.
   */
  const files = closure(ENTRIES);
  const rels = files.map((f) => f.rel);
  assert.ok(files.length >= 6, `the closure found only ${files.length} modules`);
  for (const entry of ENTRIES) assert.ok(rels.includes(entry), `${entry} missing from its own closure`);
  // It genuinely FOLLOWS imports rather than listing the entries back.
  assert.ok(rels.includes('src/lib/courses/courseOrder.js'), 'the walk did not follow @/ imports');
  assert.ok(rels.includes('src/lib/api/public-courses.js'), 'the walk did not reach the upstream reader');

  // And the same scan, pointed at a module that DOES write, reports it.
  const writer = readSource('src/lib/actions/program-order.js');
  const found = BANNED.filter((v) => new RegExp(String.raw`(?<![\w$])${v}\s*\(`).test(writer.code));
  assert.ok(
    found.length >= 2,
    `the ban list found only ${found.length} write verbs in a known writer — it is not live`
  );
});

/**
 * THE PREVIEW IS ITS OWN MODULE, NOT A FLAG ON THE RENAME.
 *
 * A `dryRun: true` branch would put the write path and the preview path in one
 * function, and "does the preview write" would become a question about control
 * flow that no source scan can answer. Two modules make it a question about
 * imports, which is the only reason the assertion above means anything.
 */
test('the preview does not import a rename/write action', () => {
  // Whole module paths, anchored on the closing quote. An earlier draft used
  // the bare substring `courses'` and matched `@/lib/courses/courseOrder` —
  // a guard that fails on a pure helper teaches people to delete it.
  const FORBIDDEN = [
    '@/lib/actions/program-order',
    '@/lib/actions/course-extensions',
    '@/lib/actions/courses',
    '@/lib/api/msdb-write',
  ];
  for (const rel of ENTRIES) {
    const { withImports } = readSource(rel);
    for (const mod of FORBIDDEN) {
      assert.ok(
        !withImports.includes(`from '${mod}'`),
        `${rel} imports ${mod} — the preview must not reach a writer`
      );
    }
  }
});

test('CONTROL: the exemption is still real, and still only Admin', () => {
  for (const [rel, why] of EXEMPT) {
    const { code } = readSource(rel);
    const writes = [...code.matchAll(/(?<![\w$])(\w+)\.(updateOne|updateMany|deleteOne|deleteMany|save|create)\s*\(/g)];
    assert.ok(writes.length > 0, `${rel} no longer writes — drop its exemption (${why})`);
    const models = [...new Set(writes.map((m) => m[1]))];
    assert.deepEqual(
      models, ['Admin'],
      `${rel} now writes to ${models.join(', ')} — the exemption covered Admin login bookkeeping only`
    );
  }
});

/**
 * THE UPSTREAM BLOCK ADDED A READ, NOT A WRITE.
 *
 * `buildRenamePreview` now reports what the upstream catalogue holds for both
 * codes, so `detectRenameState` can tell the interval from its reverse. That
 * answer is computed from `msdbCodes`, which the collision check already had in
 * hand — no extra fetch, and certainly no write. Pinned here beside the
 * read-only guard because "we added an upstream signal" is exactly the change
 * during which an upstream WRITE would look plausible.
 */
test('the upstream state block is derived, not fetched, and writes nothing', () => {
  const { code } = readSource('src/lib/courses/renameCoursePreview.js');
  assert.match(code, /const upstream = \{/, 'the preview no longer reports upstream state');
  /**
   * `codes`, not `msdbCodes`: the planner now takes the upstream ROWS
   * (`msdbCourses`) so a hit can be identified by `_id`, and derives the code
   * list from them. Still derived, still no fetch — which is what this asserts.
   */
  assert.match(code, /const codes = upstreamRows \? upstreamRows\.map/, 'the code list is not derived from the rows');
  assert.match(code, /hasOldCode: findInsensitive\(codes, from\)/, 'it does not read the codes it already has');
  assert.match(code, /hasNewCode: findInsensitive\(codes, to\)/);
  // The planner is pure — it takes the block, it does not go and get one.
  const plan = readSource('src/lib/courses/renameCoursePlan.js');
  assert.ok(!/listPublicCourses|aiFetch|fetch\(/.test(plan.code), 'the planner fetches upstream itself');
  assert.match(plan.code, /upstream = null/, 'the planner does not take upstream as an argument');
});

test('the pure planner imports no model, no db and no cache API', () => {
  // It is handed its data. That is what lets every verdict be driven against
  // fixtures, including the ones with no live instance.
  const { withImports } = readSource('src/lib/courses/renameCoursePreview.js');
  for (const forbidden of ['@/models/', 'db/connect', 'next/cache', 'mongoose']) {
    assert.ok(!withImports.includes(forbidden), `the planner imports ${forbidden}`);
  }
});

test('the gatherer is RBAC-gated before it reads anything', () => {
  const { code } = readSource(ENTRIES[0]);
  const guard = code.indexOf("requireAdmin('courses')");
  const firstRead = code.indexOf('.find(');
  assert.ok(guard !== -1, 'the preview is not gated');
  assert.ok(firstRead === -1 || guard < firstRead, 'a read happens before the RBAC check');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources, countCallSites } from '../sourceScan.mjs';

/**
 * PHASE 1 WRITES MONGO AND NOTHING UPSTREAM — proved, not promised.
 *
 * The rename runs in two phases so that a human, not this action, changes
 * `course_id` in MSDB. If the action ever gained an upstream write the two
 * phases would collapse into one and the tech lead's step would silently stop
 * being the thing that makes the change real — while every comment here went on
 * saying otherwise.
 *
 * Same treatment as the preview's read-only property: the ban is asserted over
 * the TRANSITIVE `@/` import closure, because a write one hop away in a helper
 * is the shape that actually slips through.
 *
 * WHAT IT CANNOT SEE, named rather than implied: a computed method name, a
 * dynamic `await import()`, and anything the upstream HTTP client does on our
 * behalf. `previewCourseCodeRename` is in the closure and performs a GET
 * through `aiFetch`, so `fetch` cannot be on the ban list — an upstream
 * endpoint that mutated on GET would be invisible here.
 */

const ENTRY = 'src/lib/actions/course-rename.js';

/** Every way this repo writes upstream. */
const UPSTREAM_WRITES = ['msdbCreate', 'msdbUpdate', 'msdbDelete'];

/**
 * The auth config writes `lastLoginAt` / `totpVerifiedAt` on `Admin` at
 * sign-in and is reached by every gated action. It performs no UPSTREAM write,
 * which is what this file bans, so it needs no exemption here — recorded so the
 * absence of an exemption list is a decision rather than an oversight.
 */
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

test('nothing reachable from the rename writes upstream', () => {
  const offenders = [];
  for (const f of closure([ENTRY])) {
    for (const verb of UPSTREAM_WRITES) {
      if (new RegExp(String.raw`(?<![\w$])${verb}\s*\(`).test(f.code)) {
        offenders.push(`${f.rel}: ${verb}(`);
      }
    }
  }
  assert.deepEqual(
    offenders, [],
    'phase 1 can reach an MSDB write — the two-phase split exists so a HUMAN '
    + 'makes that change:\n  ' + offenders.join('\n  ')
  );
});

test('the rename does not import the upstream write module at all', () => {
  const { withImports } = readSource(ENTRY);
  assert.ok(!withImports.includes("from '@/lib/api/msdb-write'"), 'msdb-write is imported');
});

test('CONTROL: the closure is real and the ban list can fire', () => {
  const files = closure([ENTRY]);
  const rels = files.map((f) => f.rel);
  assert.ok(files.length >= 10, `the closure found only ${files.length} modules`);
  assert.ok(rels.includes(ENTRY));
  // It genuinely follows imports.
  assert.ok(rels.includes('src/lib/courses/renameCoursePlan.js'), 'the walk did not follow @/ imports');
  assert.ok(rels.includes('src/lib/actions/course-rename-preview.js'), 'the walk did not reach the preview');

  // And the same scan, pointed at a module that DOES write upstream, reports it.
  const writer = readSource('src/lib/actions/courses.js');
  const found = UPSTREAM_WRITES.filter((v) =>
    new RegExp(String.raw`(?<![\w$])${v}\s*\(`).test(writer.code));
  assert.ok(found.length >= 2, `the ban list found only ${found.length} upstream writes in a known writer`);
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

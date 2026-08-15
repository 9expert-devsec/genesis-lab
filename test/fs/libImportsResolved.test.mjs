import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkSources, scrubSource, blankStringBodies } from '../sourceScan.mjs';

/**
 * A helper from src/lib that a file CALLS but never IMPORTS.
 *
 * ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
 * Twice now, an edit has replaced an import LINE rather than adding one — the
 * new specifier lands on the exact line the old one occupied, and the call site
 * further down the file is left referencing a name that no longer resolves:
 *
 *   d42359b  -import { refNo } from '@/lib/refNo';
 *            +import { getCourseByCode } from '@/lib/api/public-courses';
 *            …leaving `refNo(doc._id)` undefined in BOTH registration routes
 *
 *   a4fc31c  -import { coursePriceLabel } from '@/lib/coursePriceLabel';
 *            +import { ArticleImageLightbox } from './ArticleImageLightbox';
 *            …leaving `coursePriceLabel(price, …)` undefined in RelatedCourseCard
 *
 * A third arrived by OMISSION rather than replacement, which is worth naming
 * because the fix is the same and the review that catches it is not:
 *
 *   19a0f4b   added `recordAdminActionAfter({…})` at two sites in
 *             src/lib/actions/course-extensions.js and never added its import
 *             at all — no line was replaced. It broke the extension half of
 *             every course save, and stayed broken for eleven days.
 *
 * Neither was caught by anything. That is the interesting part, and it is why a
 * guard rather than a code review note:
 *
 *   · IT BUILDS. `next build` does not resolve free identifiers, and neither
 *     does the bundler — a bare name is legal JS right up until it evaluates.
 *   · IT IS CONDITIONAL AT RUNTIME. The article crash only fires when the page
 *     renders a RelatedCourseCard, so 424 articles were fine and 64 were a 500.
 *     The refNo crash only fires AFTER the registration row is written, so the
 *     row exists, the request 500s, and the confirmation email never sends.
 *   · IT LOOKS LIKE DATA. Both times the first hypothesis was "some records
 *     have a shape the helper chokes on", because the pages that DO work make
 *     that the natural reading. It is not data. It is a missing line.
 *
 * ── WHAT THE CHECK IS ───────────────────────────────────────────────────────
 * Every named export of every module under src/lib is a name that MUST be
 * imported where it is used. So: collect those names, then for each file under
 * src/app, src/components AND src/lib, flag any that the file references
 * without importing and without declaring locally.
 *
 * String BODIES are blanked before the reference scan — a log line naming the
 * function it reports on does not call it. See the control.
 *
 * `.code` (imports stripped) is what a reference is counted in, and
 * `.withImports` is where the import is looked for — the split from
 * sourceScan's docstring, and getting it backwards fails silently in both
 * directions here: counting references in `withImports` would let the import
 * line satisfy its own call site.
 *
 * ── WHAT IT DELIBERATELY DOES NOT CLAIM ─────────────────────────────────────
 * This is a text scan, not a scope analysis, and it inherits every limit in
 * sourceScan's header. Specifically it cannot see a name reached through a
 * barrel re-export, a computed `obj[name]`, or a genuine shadow it does not
 * recognise as a declaration. It is a floor on one concrete defect, not a
 * `no-undef` implementation — the honest version of that is ESLint, and this
 * guard is not pretending to be it.
 */

// ── the detector, as a function, so the control below can drive the same code
// path on synthetic text rather than asserting about a different implementation

/** Named exports of an already-scrubbed lib module. */
function namedExports(code) {
  const out = new Set();
  for (const m of code.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm
  )) out.add(m[1]);
  // `export { a, b as c }` — the LOCAL name is what an importer writes, so for
  // `as` the right-hand side is the exported one.
  for (const m of code.matchAll(/^export\s*\{([^}]*)\}\s*;?\s*$/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) out.add(name);
    }
  }
  return out;
}

/**
 * Is `name` used as a VALUE here?
 *
 * Excludes `foo.name` (a property), longer identifiers ending in it, and
 * `name:` — which is a property KEY or a destructuring rename
 * (`{ programHref: programUrl }`), i.e. a binding site, not a reference. That
 * last exclusion is load-bearing: without it SkillBreadcrumb's renamed prop
 * reads as a call to lib/utils' identically-named export.
 */
function referencesValue(code, name) {
  // Callers pass ALREADY-BLANKED code (see `findUnimported`). Blanking here
  // instead would re-scan every file once per exported name — ~968 passes per
  // file, which took the guard from under a second to 31.
  return new RegExp(String.raw`(?<![.\w$])${name}(?![\w$])(?!\s*:)`).test(code);
}

/** An import statement that binds `name`. Read from text that KEPT its imports. */
function importsName(withImports, name) {
  return new RegExp(String.raw`import[\s\S]*?\b${name}\b[\s\S]*?from`).test(withImports);
}

/** A local declaration or parameter that legitimately shadows the lib name. */
function declaresLocally(code, name) {
  return (
    new RegExp(String.raw`(?:function|const|let|var|class)\s+${name}\b`).test(code) ||
    new RegExp(String.raw`\{[^{}]*\b${name}\b[^{}]*\}\s*=`).test(code) ||
    new RegExp(String.raw`\b${name}\s*[,)]?\s*(?:=>|\))`).test(code)
  );
}

/** Every (file, name) pair where a lib export is used but not bound. */
function findUnimported(files, exportOwners) {
  const problems = [];
  for (const f of files) {
    // Once per FILE, not once per name — see referencesValue.
    const code = blankStringBodies(f.code);
    // A lib module obviously "uses" the names it exports without importing
    // them. Only matters now that src/lib scans itself.
    const own = namedExports(f.code);
    for (const [name, specs] of exportOwners) {
      if (own.has(name)) continue;
      // Cheap substring reject before the three regexes. Most of the ~968
      // exported names appear in no given file at all.
      if (!code.includes(name)) continue;
      if (!referencesValue(code, name)) continue;
      if (importsName(f.withImports, name)) continue;
      if (declaresLocally(code, name)) continue;
      problems.push(`${f.rel} uses \`${name}\` (exported by ${specs.join(' | ')}) without importing it`);
    }
  }
  return problems;
}

// ── the scan ────────────────────────────────────────────────────────────────

const LIBS = walkSources('src/lib');

/** name → the lib module(s) exporting it. */
const OWNERS = new Map();
for (const f of LIBS) {
  const spec = '@/' + f.rel.replace(/^src\//, '').replace(/\.(js|jsx|mjs)$/, '');
  for (const name of namedExports(f.code)) {
    if (!OWNERS.has(name)) OWNERS.set(name, []);
    OWNERS.get(name).push(spec);
  }
}

/**
 * ── src/lib IS A CONSUMER TOO, AND THAT WAS THE HOLE ────────────────────────
 * This guard shipped scanning src/app and src/components only, with src/lib
 * read for EXPORT NAMES and never as a consumer of its own. On 2026-08-11 a
 * fourth instance of the same defect surfaced in
 * src/lib/actions/course-extensions.js — `recordAdminActionAfter` called at two
 * sites, exported by src/lib/audit/recordAdminAction, imported nowhere. It
 * broke the extension half of EVERY course save in production, and this guard
 * could not see it: the file was never in the scan set.
 *
 * The name was a REAL export the whole time. The guard's rule was right and its
 * REACH was wrong, which is the least interesting way for a check to fail and
 * the easiest to miss when it is green.
 *
 * Widening further was measured, not assumed. Taking the EXPORT universe to all
 * of src/ produces 89 false positives — route modules export `POST`, models
 * export `Banner`, ui exports `Card`, and those words appear in JSX prose. So
 * the export side stays src/lib, whose names are distinctive; only the consumer
 * side grows.
 */
const CONSUMERS = [
  ...walkSources('src/app'),
  ...walkSources('src/components'),
  ...walkSources('src/lib'),
];

// ── controls ────────────────────────────────────────────────────────────────

test('the scan can see something (lib exports and consumer files were found)', () => {
  // Vacuous-pass guard. If walkSources silently returns nothing — a moved
  // directory, a rename — the real assertion below passes on an empty set and
  // reports nothing, which is exactly the false-green this tier exists to stop.
  assert.ok(OWNERS.size > 200, `expected many lib exports, found ${OWNERS.size}`);
  assert.ok(CONSUMERS.length > 100, `expected many consumer files, found ${CONSUMERS.length}`);
});

test('CONTROL: the detector fires on a call site whose import was replaced', () => {
  // The a4fc31c edit, reproduced exactly: the import line is occupied by a
  // DIFFERENT specifier and the call site below it is untouched. This proves
  // the assertion below reddens on the pre-fix tree without needing the pre-fix
  // tree — and it fails if a future refactor of the matchers stops detecting.
  const raw = [
    "import { READING_PROGRESS_ANCHOR_ID } from '@/lib/readingProgress';",
    "import { ArticleImageLightbox } from './ArticleImageLightbox';",
    'function RelatedCourseCard({ course }) {',
    '  const price = Number(course.course_price ?? 0);',
    "  return <span>{coursePriceLabel(price, { suffix: '.-' })}</span>;",
    '}',
  ].join('\n');
  const broken = {
    rel: 'synthetic/ArticleDetailClient.jsx',
    code: scrubSource(raw),
    withImports: scrubSource(raw, { stripImports: false }),
  };

  const hits = findUnimported([broken], OWNERS);
  assert.equal(hits.length, 1, `expected exactly one hit, got: ${JSON.stringify(hits)}`);
  assert.match(hits[0], /coursePriceLabel/);
});

test('CONTROL: the detector fires on a src/lib file, not just src/app', () => {
  // The 2026-08-11 shape, and the hole this guard had: a lib module calling
  // another lib module's export with no import. Same synthetic treatment as
  // above, so this proves the REACH rather than just the rule.
  const raw = [
    "import { dbConnect } from '@/lib/db/connect';",
    "import { requireAdmin } from '@/lib/actions/auth';",
    'export async function saveCourseExtension(courseId, data) {',
    '  await dbConnect();',
    '  recordAdminActionAfter({ menu: "courses", recordId: courseId });',
    '  return { ok: true };',
    '}',
  ].join('\n');
  const broken = {
    rel: 'synthetic/lib/actions/course-extensions.js',
    code: scrubSource(raw),
    withImports: scrubSource(raw, { stripImports: false }),
  };

  const hits = findUnimported([broken], OWNERS);
  assert.equal(hits.length, 1, `expected exactly one hit, got: ${JSON.stringify(hits)}`);
  assert.match(hits[0], /recordAdminActionAfter/);
});

test('CONTROL: naming a lib function inside a STRING is not calling it', () => {
  // The two false positives that appeared when the scan reached src/lib, and
  // the reason string bodies are blanked. Both are real code in the repo:
  // a console line that names the function it is reporting on, and a constant
  // whose VALUE is a source location. Neither imports anything, and neither is
  // a defect — if this control fails, the guard is about to file two bugs that
  // do not exist.
  const raw = [
    "const ARTICLE_SORT_SOURCE = 'src/lib/actions/articles.js → getArticles()';",
    'function report() {',
    '  console.log("[mc-receipt] sendMasterclassReceipt complete", ARTICLE_SORT_SOURCE);',
    '}',
  ].join('\n');
  const innocent = {
    rel: 'synthetic/lib/articleRank.js',
    code: scrubSource(raw),
    withImports: scrubSource(raw, { stripImports: false }),
  };

  assert.deepEqual(findUnimported([innocent], OWNERS), []);
});

test('CONTROL: the same file with the import restored is clean', () => {
  // The other half — without this, a detector that flagged EVERYTHING would
  // satisfy the control above and make the real assertion unfalsifiable.
  const raw = [
    "import { coursePriceLabel } from '@/lib/coursePriceLabel';",
    "import { ArticleImageLightbox } from './ArticleImageLightbox';",
    'function RelatedCourseCard({ course }) {',
    '  const price = Number(course.course_price ?? 0);',
    "  return <span>{coursePriceLabel(price, { suffix: '.-' })}</span>;",
    '}',
  ].join('\n');
  const fixed = {
    rel: 'synthetic/ArticleDetailClient.jsx',
    code: scrubSource(raw),
    withImports: scrubSource(raw, { stripImports: false }),
  };

  assert.deepEqual(findUnimported([fixed], OWNERS), []);
});

// ── the assertion ───────────────────────────────────────────────────────────

test('no file under src/app, src/components or src/lib uses a src/lib export it never imported', () => {
  const problems = findUnimported(CONSUMERS, OWNERS);
  assert.deepEqual(
    problems,
    [],
    'a lib helper is referenced with no binding in scope — this is a ReferenceError '
    + 'at render/request time, and it BUILDS:\n    ' + problems.join('\n    ')
  );
});

// ── the two concrete incidents, named ───────────────────────────────────────
// The scan above would catch either regression, but it reports them as a
// generic list. These name the files so a reintroduction says WHICH incident
// came back rather than just "something is unimported".

test('ArticleDetailClient imports coursePriceLabel (a4fc31c regression)', () => {
  const f = CONSUMERS.find((s) =>
    s.rel.endsWith('articles/[slug]/_components/ArticleDetailClient.jsx'));
  assert.ok(f, 'ArticleDetailClient.jsx not found — did it move?');
  assert.ok(
    referencesValue(f.code, 'coursePriceLabel'),
    'the call site is gone — if that is deliberate, delete this test with it'
  );
  assert.ok(
    importsName(f.withImports, 'coursePriceLabel'),
    'coursePriceLabel is called but not imported — the related-course card 500s'
  );
});

for (const route of ['inhouse', 'public']) {
  test(`registration/${route} route imports refNo (d42359b regression)`, () => {
    const f = CONSUMERS.find((s) => s.rel === `src/app/api/registration/${route}/route.js`);
    assert.ok(f, `registration/${route}/route.js not found — did it move?`);
    assert.ok(
      referencesValue(f.code, 'refNo'),
      'the call site is gone — if that is deliberate, delete this test with it'
    );
    assert.ok(
      importsName(f.withImports, 'refNo'),
      'refNo is called but not imported — the row is written, then the request throws'
    );
  });
}

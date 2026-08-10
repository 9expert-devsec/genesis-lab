import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkSources, scrubSource } from '../sourceScan.mjs';

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
 * src/app and src/components, flag any that the file references without
 * importing and without declaring locally.
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
    for (const [name, specs] of exportOwners) {
      if (!referencesValue(f.code, name)) continue;
      if (importsName(f.withImports, name)) continue;
      if (declaresLocally(f.code, name)) continue;
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

const CONSUMERS = [...walkSources('src/app'), ...walkSources('src/components')];

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

test('no file under src/app or src/components uses a src/lib export it never imported', () => {
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

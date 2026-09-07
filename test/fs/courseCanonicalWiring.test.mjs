import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * WHICH BRANCH OF THE CATCH-ALL GETS THE NEW CANONICAL, AND WHICH KEEP THE OLD.
 *
 * ══ WHY A SOURCE GUARD, STATED RATHER THAN PAPERED OVER ═════════════════════
 * `generateMetadata` in this route cannot be invoked from any tier in this
 * suite: it awaits `resolveCourse`, which opens a Mongo connection AND calls
 * the upstream course API over the network. Stubbing both to test the two lines
 * between them would be testing the stub.
 *
 * So the wiring is asserted from source, with the limitation named: this proves
 * the COURSE branch computes its canonical from the helper and no longer from
 * the request, and that the other branches were left alone. It does not prove
 * the rendered <link rel="canonical">. The value side is proved for real in
 * test/render/courseCanonicalMetadata, which invokes buildCourseJsonLd — the
 * one consumer that IS pure — and asserts it equals the helper's answer.
 *
 * Same split, same reason, as test/fs/metaDescriptionWiring for the article
 * page.
 *
 * ── AND WHY THE "OTHER BRANCHES" HALF IS THE IMPORTANT ONE ──────────────────
 * `pageUrl` is shared by every page type this route serves — career paths,
 * programs, skills, custom pages, builder pages. Each of those has ONE URL, so
 * self-canonicalising says something true and must not change. The round's
 * whole risk is a careless edit widening the course fix across the file, and
 * that is what the count below pins.
 */

const PAGE = 'src/app/(public)/[...slug]/page.jsx';
const { code, withImports } = readSource(PAGE);

test('the course branch computes its canonical from the shared helper', () => {
  // `code` strips imports, so the import check must read `withImports` — the
  // rule test/sourceScan.mjs states, and the exact trap it names: a "does this
  // import exist" assertion read from `code` sees no import statements at all
  // and fails for a reason that has nothing to do with the claim.
  assert.match(withImports, /import \{ courseCanonicalUrl \}/, 'the helper is not imported');
  assert.match(
    code,
    /const canonicalUrl\s*=\s*\n?\s*courseCanonicalUrl\(course, extension, process\.env\.NEXT_PUBLIC_SITE_URL\)\s*\|\|\s*pageUrl/,
    'the course branch no longer derives its canonical from courseCanonicalUrl',
  );
});

test('the course branch uses that value for BOTH canonical and og:url', () => {
  // Two claims about the same page. Emitting one and not the other is a
  // half-migration that reads as done.
  assert.match(code, /alternates: \{ canonical: canonicalUrl \}/, 'alternates.canonical');
  assert.match(code, /url: canonicalUrl,/, 'openGraph.url');
});

test('the course branch no longer self-canonicalises', () => {
  // THE DEFECT ITSELF, as the shape that must not come back. The course branch
  // is located by its own resolver call so this cannot be satisfied by some
  // other branch's `pageUrl`.
  const start = code.indexOf('const resolved = await resolveCourse(segment);');
  assert.notEqual(start, -1, 'the course branch moved — re-anchor this guard');
  // A CODE anchor, not a comment: readSource() strips comments, so anchoring on
  // one silently matches nothing and the slice becomes the rest of the file.
  const end = code.indexOf('resolveBuilderPageForRequest(segment)', start);
  assert.notEqual(end, -1, 'the branch end marker moved — re-anchor this guard');
  const branch = code.slice(start, end);
  assert.ok(!/alternates: \{ canonical: pageUrl \}/.test(branch),
    'the course canonical follows the request again');
  assert.ok(/courseCanonicalUrl\(/.test(branch), 'the helper is not called inside the course branch');
});

test('the BreadcrumbList names the same URL as the canonical tag', () => {
  // The breadcrumb's last item is the course itself, so it is the same claim in
  // other clothes — a fourth copy of the rule until this round, and one that
  // carried the same double-slash defect (an alias already starts with `/`).
  assert.match(
    code,
    /const courseUrl\s*=\s*\n?\s*courseCanonicalUrl\(course, extension, process\.env\.NEXT_PUBLIC_SITE_URL\)/,
    'the breadcrumb builds its own course URL again',
  );
  assert.ok(
    !/const courseSlug\s*=/.test(code),
    'the local courseSlug copy of the alias rule is back',
  );
});

// ── the regression guard for every OTHER page type ──────────────────────────
test('the custom page canonical is UNCHANGED — it still prefers its own field', () => {
  // The exact expression, because the claim is "untouched" rather than
  // "equivalent". A custom page has one URL and self-canonicalising is right
  // for it; `customPage.canonicalUrl` overriding that is a deliberate admin
  // affordance and is not this round's business.
  assert.match(
    code,
    /const canonical = customPage\.canonicalUrl \|\| `\$\{base\}\/\$\{segment\}`/,
    'the custom page canonical changed',
  );
  assert.ok(!/courseCanonicalUrl\(customPage/.test(code), 'the course helper leaked into custom pages');
});

test('the builder page canonical is UNCHANGED', () => {
  assert.match(
    code,
    /seo\.canonicalUrl \|\| `\$\{base\}\/\$\{segment\}`/,
    'the builder page canonical changed',
  );
});

test('program, skill and career-path branches still self-canonicalise', () => {
  // Counted, not spot-checked: three branches each emit `canonical: pageUrl`,
  // and the course branch used to be a fourth. If a later edit "tidies" one of
  // these onto the course helper, the count moves and this says so.
  const selfCanonical = [...code.matchAll(/alternates: \{ canonical: pageUrl \}/g)];
  assert.equal(
    selfCanonical.length, 3,
    `${selfCanonical.length} branches self-canonicalise; expected exactly 3 `
    + '(program, skill, career path). The course branch must NOT be among them, '
    + 'and the other three must NOT have been changed.',
  );
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the scan read a real file and the anchors are present', () => {
  // Six of the assertions above are `assert.match`. A file that failed to read
  // would fail them all loudly — but the two `assert.ok(!...)` negatives would
  // pass triumphantly against an empty string, and those are the two guarding
  // the defect coming back.
  assert.ok(code.length > 20000, `${PAGE} read as ${code.length} chars`);
  assert.match(code, /resolveCourse\(segment\)/, 'the course resolver call is missing');
  assert.match(code, /pageUrl/, 'pageUrl is gone entirely — the other branches lost their canonical');
  assert.match(code, /customPage\.canonicalUrl/, 'the custom page anchor is missing');
});

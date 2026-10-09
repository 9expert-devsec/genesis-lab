import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkSources, readSource } from '../sourceScan.mjs';

/**
 * THE SWEEP: no site in `src/` may compile a variable into a pattern without
 * putting it through `lib/searchTerm.js` first.
 *
 * ── WHY A SWEEP AND NOT N SITE TESTS ──────────────────────────────────────
 * `/articles?q=(` reached production as an HTTP 500 (reproduced before fixing:
 * `Regular expression is invalid`). The fix touched twelve call sites, and the
 * reason it was twelve is that FIVE of them already carried a hand-written copy
 * of the escape expression while TEN had none — so the repo already knew about
 * this hazard, had already written the fix five times, and had still shipped
 * the bug at a site nobody connected to the ones that were handled.
 *
 * A test per site cannot close that. The failure is the NEXT unescaped site,
 * which by definition no existing test names. This walks every `.js`/`.jsx`
 * file under `src/`, finds every pattern-compiling expression, and requires
 * each one to be either fed by the helper or on a reviewed list with a stated
 * reason — so "we looked and it is fine" is one readable place rather than an
 * absence.
 *
 * ── WHAT COUNTS AS A COMPILE SITE ─────────────────────────────────────────
 *   `new RegExp(…)`     — ECMAScript; throws on an unterminated group.
 *   `$regex: …`         — Mongo compiles the STRING server-side. Same hazard,
 *                         and this is where the production 500 came from.
 * A regex LITERAL (`/foo/`) cannot carry a runtime value and is not a site.
 *
 * Read from `withImports`, which is the source with COMMENTS STRIPPED — this
 * repo's doc blocks quote `$regex: search` repeatedly (including the fixed
 * sites, deliberately, so the diff explains itself) and a scanner that counted
 * those would be permanently red for the right reason and the wrong cause.
 */

/**
 * What must appear in the compiled expression for a site to count as fed.
 *
 *   `searchTermPattern(` / `escapeRegex(`  — the helper, called inline
 *   `term` / `escaped` / `eventPrefix`     — the three local names this repo
 *                                            gives the helper's result, matched
 *                                            as WHOLE WORDS so `searchTerm`,
 *                                            `termRaw` or `unescaped` are not
 *                                            accepted. The last test below
 *                                            proves each of those files really
 *                                            imports the module, so a
 *                                            thirteenth private copy named
 *                                            `term` cannot pass on the name
 *                                            alone.
 *
 * Matched against a WINDOW after the compile token rather than against a parsed
 * expression: `` new RegExp(`^${eventPrefix}\\.`) `` and
 * `` { $regex: `^${escaped}$` } `` are template literals with braces and
 * commas in them, and every attempt to bound "the expression" by punctuation
 * cut them in the wrong place. The question being asked is "does the value
 * compiled here trace to the helper", and a window answers exactly that.
 */
const SAFE_FEEDERS = [
  /searchTermPattern\(/,
  /escapeRegex\(/,
  /\bterm\b/,
  /\bescaped\b/,
  /\beventPrefix\b/,
];
const isSafe = (expr) => SAFE_FEEDERS.some((re) => re.test(expr));

/** How much of the expression after the compile token is examined. */
const WINDOW = 80;

/**
 * Every compile site deliberately NOT fed by the helper, and why.
 *
 * Granularity is the FILE, not the line: line numbers go stale on every edit
 * and get bumped without being read. A new compile site in an unlisted file
 * turns this red; one in a listed file does not, which is the accepted cost.
 */
const REVIEWED = new Map([
  ['src/lib/articles/viewCounter.js',
    'BOT_UA_RE is built from a module-level literal list of bot names'],
  ['src/lib/articles/legacyTagSlug.js',
    'built from the EXTRA_SPACES constant; no runtime input reaches it'],
  ['src/lib/articles/seoTitleCleanup.js',
    'SEPARATORS and BRAND are literals; the one input-fed site here uses escapeRegex'],
  ['src/lib/chat/contactLinks.js',
    'the URL, EMAIL and PHONE sources are module-level literals'],
  ['src/lib/cookieConsentStore.js',
    'built from the CONSENT_COOKIE constant, which is a literal'],
  ['src/components/about/InstructorSection2.jsx',
    'iterates the hardcoded KEYWORDS list; the instructor title is the HAYSTACK, not the pattern'],
  ['src/lib/pageBuilder/scopeCss.js',
    'sectionId is a generated UUID and isValidSectionId refuses anything else '
    + 'before it reaches the selector — fail-closed, and tested in its own file'],
]);

/** `new RegExp(` and `$regex:` occurrences, each with the window after it. */
function compileSites(code) {
  const out = [];
  for (const m of code.matchAll(/(new RegExp\(|\$regex:)\s*/g)) {
    const at = m.index + m[0].length;
    out.push({
      kind: m[1] === '$regex:' ? '$regex' : 'new RegExp',
      expr: code.slice(at, at + WINDOW).split('\n')[0].trim(),
    });
  }
  return out;
}

const rel = (p) => p.replace(/\\/g, '/');

test('every pattern-compiling site in src/ is fed by the shared helper', () => {
  const offenders = [];
  let checked = 0;

  for (const file of walkSources('src')) {
    if (!/\.(?:js|jsx)$/.test(file.rel)) continue;
    if (REVIEWED.has(rel(file.rel))) continue;
    for (const site of compileSites(file.withImports)) {
      checked += 1;
      if (isSafe(site.expr)) continue;
      offenders.push(`${rel(file.rel)}  ${site.kind}(${site.expr})`);
    }
  }

  assert.ok(checked >= 20, `the sweep found only ${checked} sites — it has stopped looking`);
  assert.deepEqual(
    offenders, [],
    `these compile a value the shared helper never saw:\n  ${offenders.join('\n  ')}`,
  );
});

test('CONTROL: the sweep can SEE the code that shipped the production 500', () => {
  /**
   * The detector and the feeder list are the halves that rot: a `compileSites`
   * regex that stopped matching, or a `SAFE_FEEDERS` entry that accepted
   * everything, leaves the sweep green and blind. So both are run against the
   * exact code `getArticles` shipped, transcribed here rather than imported —
   * it no longer exists to import.
   */
  const before = "if (search) { filter.$or = ["
    + "{ title:   { $regex: search, $options: 'i' } },"
    + "{ excerpt: { $regex: search, $options: 'i' } } ]; }";
  const sites = compileSites(before);
  assert.equal(sites.length, 2, 'the site detector no longer sees the real bug');
  for (const site of sites) {
    assert.equal(isSafe(site.expr), false, `${site.expr} was waved through`);
  }

  // And the same code AFTER, which must be ACCEPTED — otherwise the sweep is
  // merely rejecting everything and proves nothing in the other direction.
  for (const site of compileSites(before.replaceAll('$regex: search', '$regex: term'))) {
    assert.equal(isSafe(site.expr), true, `${site.expr} was rejected`);
  }

  // A near-miss name must NOT be accepted: the word feeders use \b.
  for (const nearMiss of ["searchTerm, 'i')", "termRaw, 'i')", "unescaped, 'i')", "q, 'i')"]) {
    assert.equal(isSafe(nearMiss), false, `${nearMiss} was accepted by a loose feeder`);
  }
  // While the real shapes in the repo ARE accepted, including the two that
  // defeated expression-parsing.
  for (const real of ['`^${escaped}$`, $options:', '`^${eventPrefix}\\\\.`)', "term, 'i')"]) {
    assert.equal(isSafe(real), true, `${real} was rejected`);
  }
});

test('the reviewed list is not a dumping ground', () => {
  // An entry for a file that no longer compiles a pattern is a permanent hole
  // in the sweep for a reason that has gone away.
  for (const [path, why] of REVIEWED) {
    const file = readSource(path);
    assert.ok(
      compileSites(file.withImports).length > 0,
      `${path} is on the reviewed list but compiles no pattern any more — drop the entry`,
    );
    assert.ok(why.length > 30, `${path} needs a real reason, not "${why}"`);
  }
});

test('all twelve fixed sites import the shared helper', () => {
  /**
   * The sweep proves no site compiles a bare variable. This proves the
   * variables are fed by the shared MODULE and not by a thirteenth private copy
   * that happens to be called `term` — which the name-based feeders above would
   * otherwise accept. Read from `raw`, because an import is what is asserted.
   */
  const FIXED = [
    'src/lib/actions/articles.js',
    'src/lib/actions/customPages.js',
    'src/lib/actions/pageBuilder.js',
    'src/lib/actions/masterclass-registrations.js',
    'src/lib/actions/career-path-registrations.js',
    'src/lib/actions/webhook-logs.js',
    'src/lib/actions/redirects.js',
    'src/lib/actions/course-extensions.js',
    'src/lib/registrations/listFilter.js',
    'src/lib/articleViews/queries.js',
    'src/lib/articles/seoTitleCleanup.js',
    'src/app/(public)/search/_components/SearchClient.jsx',
  ];
  for (const path of FIXED) {
    assert.match(
      readSource(path).raw, /from ['"]@\/lib\/searchTerm['"]/,
      `${path} no longer imports the shared helper`,
    );
  }
});

test('no private copy of the escape expression survives in src/', () => {
  /**
   * The point of one module is that there is ONE of it. Five copies is how ten
   * sites ended up with none: the expression was clearly known, and knowing it
   * in five places is not the same as applying it in fifteen.
   */
  const COPY = /\[\s*\\?\.\s*\\?\*\s*\\?\+/;   // the `[.*+…` character class
  const copies = [];
  for (const file of walkSources('src')) {
    if (!/\.(?:js|jsx)$/.test(file.rel)) continue;
    if (rel(file.rel) === 'src/lib/searchTerm.js') continue;   // the one copy
    if (COPY.test(file.withImports)) copies.push(rel(file.rel));
  }
  assert.deepEqual(copies, [], `a private escape expression survives in:\n  ${copies.join('\n  ')}`);
});

test('CONTROL: that copy-detector matches the expression it is hunting', () => {
  const COPY = /\[\s*\\?\.\s*\\?\*\s*\\?\+/;
  // Written with an escaped `$` rather than in a template literal: the class
  // contains `${}`, which a template literal reads as an interpolation.
  assert.match('s.replace(/[.*+?^${}()|[\\]\\\\]/g, \'\\$&\')', COPY);
  assert.doesNotMatch("const re = new RegExp(term, 'i');", COPY);
});

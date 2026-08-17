import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSource } from '../sourceScan.mjs';

/**
 * /search's SEAMS — the ones no render or pure test can reach.
 *
 * Three claims live here:
 *   1. the page ships NO corpus (the whole point of the rework);
 *   2. the route owns no matching rules and the corpus is not rebuilt per
 *      keystroke;
 *   3. the input's ring suppression actually BEATS the global `*:focus-visible`
 *      rule — computed from the real globals.css, not asserted from memory.
 *
 * Read through test/sourceScan.mjs so the prose in these files explaining what
 * was removed cannot satisfy a matcher, and so CRLF is normalised first.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PAGE = readSource('src/app/(public)/search/page.jsx');
const CLIENT = readSource('src/app/(public)/search/_components/SearchClient.jsx');
const ROUTE = readSource('src/app/api/search/route.js');
const CORPUS = readSource('src/lib/search/searchCorpus.js');
const MATCH = readSource('src/lib/search/matchSearch.js');
const ENRICH = readSource('src/lib/api/enrich-courses.js');

const countOf = (code, re) => (code.match(re) ?? []).length;

// ── 1. The page ships no corpus ─────────────────────────────────────────────

test('the search page fetches NOTHING and passes only the query', () => {
  /**
   * It used to fetch every public course, every schedule, every active article,
   * every career path and every promotion, and hand all of it to the client.
   * The regression to guard is not "it got slower" — it is someone adding one
   * corpus back "just for the initial render", which is how the old shape
   * started.
   */
  for (const gone of [
    'listPublicCourses',
    'getAllSchedules',
    'getActiveCareerPaths',
    'getActivePromotions',
    'Article',
    'dbConnect',
  ]) {
    assert.equal(
      PAGE.withImports.includes(gone), false,
      `${gone} is back in the search page — the corpus must not be shipped`,
    );
  }
  assert.match(PAGE.code, /<SearchClient initialQ=\{initialQ\} \/>/, 'only the query is passed');
});

test('the client no longer receives or filters a corpus', () => {
  for (const prop of ['courseMap', 'careerPaths =', 'promotions =']) {
    assert.equal(
      CLIENT.code.includes(prop), false,
      `SearchClient still takes ${prop} — it should receive only initialQ`,
    );
  }
  assert.match(CLIENT.code, /export function SearchClient\(\{ initialQ \}\)/);
  // …and no in-memory filter survived.
  assert.equal(
    /\.filter\(\(c\) =>[\s\S]{0,200}toLowerCase\(\)\.includes\(term\)/.test(CLIENT.code), false,
    'a client-side corpus filter is back',
  );
});

test('CONTROL: the page-scan probes DO fire on the shape that was removed', () => {
  // Without this, "listPublicCourses is absent" passes because the matcher is
  // looking at the wrong file or an empty string.
  const old = "import { listPublicCourses } from '@/lib/api/public-courses';";
  assert.ok(old.includes('listPublicCourses'));
  assert.ok(PAGE.code.length > 200, 'the page was actually read');
  assert.match(PAGE.code, /export default async function SearchPage/);
  // The corpus builder is where those imports legitimately live now.
  assert.ok(CORPUS.withImports.includes('listPublicCourses'));
  assert.ok(CORPUS.withImports.includes('getActivePromotions'));
});

// ── 2. The route is thin; the corpus is cached ──────────────────────────────

test('the route owns no matching rules — it fetches, calls, serialises', () => {
  assert.match(ROUTE.withImports, /from '@\/lib\/search\/matchSearch'/);
  assert.match(ROUTE.withImports, /from '@\/lib\/search\/searchCorpus'/);
  assert.match(ROUTE.code, /searchCorpusFor\(corpus, q\)/, 'the matcher decides');
  for (const rule of ['toLowerCase()', '.includes(', '.filter(']) {
    assert.equal(
      ROUTE.code.includes(rule), false,
      `the route is matching by itself (${rule}) — that belongs in matchSearch.js`,
    );
  }
});

test('it is a GET route handler, not a server action', () => {
  // Abortable, unqueued, cacheable — see the handler's docstring for the
  // reasoning. `'use server'` here would silently change all three.
  assert.match(ROUTE.code, /export async function GET\(request\)/);
  assert.equal(ROUTE.code.includes("'use server'"), false);
  assert.match(ROUTE.code, /cache-control/i, 'a repeated query is served from cache');
});

test('a below-minimum query never touches the corpus', () => {
  // A one-character query must not trigger a cold build whose result is then
  // discarded. The short-circuit has to come BEFORE the await.
  const guard = ROUTE.code.indexOf('SEARCH_MIN_CHARS');
  const build = ROUTE.code.indexOf('getSearchCorpus');
  assert.notEqual(guard, -1, 'the minimum-length guard is gone');
  assert.notEqual(build, -1, 'the corpus call is gone');
  assert.ok(guard < build, 'the guard must precede the corpus call');
});

test('the corpus is built once per TTL, and collapses concurrent builds', () => {
  assert.match(CORPUS.code, /SEARCH_CORPUS_TTL_MS/, 'there is a TTL');
  assert.match(CORPUS.code, /if \(cached && now - cachedAt < SEARCH_CORPUS_TTL_MS\) return cached/);
  assert.match(CORPUS.code, /if \(pending\) return pending/, 'a burst of first requests is one build');
});

test('the article BODY is neither fetched, nor matched, nor serialised', () => {
  /**
   * ── THIS GUARD WAS REVERSED, DELIBERATELY ─────────────────────────────────
   * It used to assert "the body IS selected and stripped, and the projection
   * drops it". Matching bodies worked and produced bad results — an article
   * mentioning a term once in passing came back as a result about it — so the
   * body is gone from the corpus entirely rather than merely unread.
   *
   * The guard is repointed rather than deleted, because the claim it protects
   * still exists and is now stronger: `contentText` must appear NOWHERE. A
   * deleted guard protects nothing; an inverted one keeps the seam under watch.
   */
  assert.equal(
    /\.select\('[^']*\bcontent\b[^']*'\)/.test(CORPUS.code), false,
    'the corpus must not select the article body',
  );
  assert.match(
    CORPUS.code, /\.select\('slug title excerpt coverUrl publishedAt tags'\)/,
    'the article projection is the card fields only',
  );

  for (const [name, src] of Object.entries({ CORPUS, MATCH, ROUTE, CLIENT })) {
    assert.equal(
      src.code.includes('contentText'), false,
      `${name} still mentions contentText — the body must appear nowhere`,
    );
  }
  assert.equal(
    CORPUS.code.includes('htmlToSearchText'), false,
    'the HTML-stripping helper went with the field it existed for',
  );

  const projection = MATCH.code.match(/const pickArticle = \([\s\S]*?\}\);/)?.[0] ?? '';
  assert.ok(projection.length > 50, 'the article projection is gone');
  assert.equal(projection.includes('contentText'), false, 'the body must not cross the wire');
  assert.equal(projection.includes('content:'), false);
  assert.ok(projection.includes('excerpt'), 'but the card fields must survive');
});

test('CONTROL: the projection probe DOES see a field that IS carried', () => {
  // Without this, "contentText is absent" is satisfiable by a matcher that
  // found no projection at all.
  const projection = MATCH.code.match(/const pickArticle = \([\s\S]*?\}\);/)?.[0] ?? '';
  for (const kept of ['slug', 'title', 'coverUrl', 'tags']) {
    assert.ok(projection.includes(kept), `${kept} should be in the projection`);
  }
});

// ── enrich-courses: one fan-out, not two ────────────────────────────────────

test('the corpus reuses enrich-courses and skips its SCHEDULE fan-out', () => {
  /**
   * enrich-courses does two passes: one detail request per course, then one
   * schedule request per course. The corpus already has every schedule from a
   * single `getAllSchedules()`, so the second pass would buy the same rows
   * again, N requests at a time.
   */
  assert.match(CORPUS.withImports, /from '@\/lib\/api\/enrich-courses'/, 'reused, not re-written');
  assert.match(CORPUS.code, /withSchedules: false/, 'the second fan-out is skipped');
  assert.equal(
    CORPUS.code.includes('listSchedulesByCourse'), false,
    'and no second fan-out was hand-rolled here either',
  );
  /**
   * The `includeDetailFields` opt-in is GONE from this call, and that is the
   * claim now. It pulled `course_objectives` and `training_topics` for the
   * matcher; both left the haystack when matching narrowed to what a card can
   * show, so fetching them would put two large arrays per course into the
   * corpus for the whole TTL with nothing reading them — the same rule that
   * removed the article body.
   */
  assert.equal(
    /includeDetailFields/.test(CORPUS.code), false,
    'the objectives/topics opt-in must go with the matching rule it fed',
  );
  for (const dead of ['course_objectives', 'training_topics']) {
    assert.equal(CORPUS.code.includes(dead), false, `${dead} must not be fetched at all`);
  }
});

test('enrich-courses defaults are unchanged for every pre-existing caller', () => {
  /**
   * /training-course, /program/[slug] and /skill/[slug] all rely on the
   * schedules and on the fixed field mapping. A default flip here is invisible
   * until one of those pages renders an empty schedule strip.
   */
  assert.match(ENRICH.code, /withSchedules = true/, 'schedules stay ON by default');
  assert.match(ENRICH.code, /includeDetailFields = \[\]/, 'no extra fields by default');
  assert.match(ENRICH.code, /if \(withSchedules\) \{/, 'and the flag actually gates the pass');
  // The extra fields must not have been folded into the default mapping —
  // every existing caller passes enriched courses into a client component, so
  // a new default field is a payload regression on three other pages.
  const mapping = ENRICH.code.match(/return items\.map\(\(c\) => \{[\s\S]*$/)?.[0] ?? '';
  assert.ok(mapping.length > 200, 'the mapping is gone');
  assert.equal(mapping.includes('course_objectives:'), false, 'not a default field');
  assert.equal(mapping.includes('training_topics:'), false);
  assert.match(mapping, /\.\.\.extra,/, 'extras arrive through the opt-in instead');
});

// ── The three things a network makes the client responsible for ────────────

test('a stale reply cannot overwrite a newer one', () => {
  /**
   * SOURCE-SCANNED, and it has to be: the request lives in a `useEffect`, so no
   * static render reaches it and this suite has no DOM to fire one in. That is
   * precisely why it needs a guard — an out-of-order overwrite is invisible in
   * every other tier and shows up only as a user seeing results for a query
   * they have already finished typing over.
   *
   * TWO mechanisms, and the distinction matters: `seq` is the INVARIANT (a
   * reply that is not the latest is dropped, whatever order it arrived in),
   * while `AbortController` is a best-effort saving of bandwidth — a response
   * can already be in flight when `abort()` lands, so it cannot be relied on
   * for correctness. Neither depends on timing.
   */
  assert.match(CLIENT.code, /const mine = \+\+seq\.current;/, 'each request takes a sequence number');
  assert.equal(
    countOf(CLIENT.code, /if \(mine !== seq\.current\) return/g), 2,
    'both the success AND the failure path must drop a stale reply',
  );
  assert.match(CLIENT.code, /new AbortController\(\)/, 'and the previous request is aborted');
  assert.match(CLIENT.code, /return \(\) => controller\.abort\(\)/, 'on cleanup');
  assert.match(CLIENT.code, /err\?\.name === 'AbortError'/, 'an abort is not an error state');
});

test('loading and failure are wired to the request, not to the debounce', () => {
  assert.match(
    CLIENT.code, /setState\(\(prev\) => \(\{ status: 'loading', data: prev\.data \}\)\)/,
    'the skeleton follows the in-flight request, and keeps the previous data',
  );
  assert.match(CLIENT.code, /setState\(\{ status: 'ready', data: json \}\)/);
  assert.match(
    CLIENT.code, /setState\(\{ status: 'error', data: null \}\)/,
    'a failure gets its own status — it must not fall through to the empty state',
  );
  assert.match(CLIENT.code, /if \(!res\.ok\) throw new Error/, 'a non-200 is a failure, not empty data');
  // The debounce still governs WHEN a request is issued, unchanged at 200ms.
  assert.match(CLIENT.code, /\}, 200\);/, 'the 200ms debounce stays');
  assert.match(CLIENT.code, /router\.replace\(next, \{ scroll: false \}\)/, 'and the ?q= URL sync stays');
});

test('CONTROL: the sequence-guard probes DO fire on a version without them', () => {
  /**
   * Every assertion above is a presence check on source text; if the matchers
   * were subtly wrong they would report absent and the tests would fail loudly
   * — but a matcher counting the WRONG thing could pass on unrelated code. Run
   * against the naive implementation this replaced.
   */
  const naive = `
    fetch(url).then((r) => r.json()).then((json) => setState({ status: 'ready', data: json }));
  `;
  assert.equal(countOf(naive, /if \(mine !== seq\.current\) return/g), 0, 'no guard to find');
  assert.equal(/new AbortController\(\)/.test(naive), false);
  assert.equal(/setState\(\{ status: 'error', data: null \}\)/.test(naive), false);
  // …and the counter really is 2 in the live file, not 0 matched by accident.
  assert.ok(CLIENT.code.includes('seq.current'), 'the live client does use a sequence');
});

// ── The outbound online-course href is built in one place ───────────────────

test('the online-course href has exactly one definition', () => {
  const HREF = readSource('src/lib/onlineCourseHref.js');
  assert.match(HREF.code, /export function onlineCourseHref/);
  assert.match(HREF.code, /siteConfig\.academyUrl/, 'the fallback lives with the rule');

  for (const rel of [
    'src/app/_components/home/OnlineCourseCard.jsx',
    'src/app/(public)/search/_components/SearchClient.jsx',
  ]) {
    const src = readSource(rel);
    assert.match(src.withImports, /from ["']@\/lib\/onlineCourseHref["']/, `${rel} must import it`);
    assert.equal(
      /website_urls\s*(\[0\]|\)\s*&&)/.test(src.code), false,
      `${rel} still picks website_urls[0] itself — that rule has one home`,
    );
  }
});

// ── 3. The ring suppression really does beat the global rule ────────────────

/**
 * CSS specificity of a simple selector, as `[ids, classes+pseudo-classes,
 * elements]`. Deliberately tiny — it only has to rank the two selectors below.
 */
function specificity(selector) {
  const ids = countOf(selector, /#[\w-]+/g);
  // Escaped colons (`\:`) inside a Tailwind class name are NOT pseudo-classes.
  const cleaned = selector.replace(/\\./g, '_');
  const classes = countOf(cleaned, /\.[\w-]+/g) + countOf(cleaned, /(?<!:):[a-z-]+(?:\([^)]*\))?/g);
  const elements = countOf(cleaned, /(^|\s|>|\+|~)[a-z][\w-]*/g);
  return [ids, classes, elements];
}
const rank = ([a, b, c]) => a * 10000 + b * 100 + c;

test('the global rule really is `*:focus-visible` with a ring, in globals.css', () => {
  // The premise of the whole fix. If this rule moved or changed shape, the
  // suppression below is guarding nothing.
  const css = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
  const block = css.match(/\*:focus-visible\s*\{([\s\S]*?)\}/)?.[1];
  assert.ok(block, 'the global *:focus-visible rule is gone');
  assert.match(block, /ring-2/, 'it applies a RING');
  assert.match(block, /ring-offset-2/);
  assert.match(block, /outline-none/, 'which is why the input’s focus:outline-none did nothing');
});

test('the input’s suppression outranks the global rule on specificity', () => {
  /**
   * HOW THE OVERRIDE IS VERIFIED rather than assumed. Tailwind compiles
   * `focus-visible:ring-0` to `.focus-visible\:ring-0:focus-visible` — a class
   * AND a pseudo-class, (0,2,0). The global rule is `*:focus-visible` — the
   * universal selector contributes nothing, so it is a pseudo-class alone,
   * (0,1,0). The utility wins.
   *
   * It wins a second time on cascade layer, and the mechanism is worth getting
   * right rather than assuming: the rule sits at line ~444 of globals.css,
   * FAR BELOW `@tailwind utilities` on line 3, so raw file order says the
   * opposite. What decides it is that the rule is wrapped in `@layer base`,
   * which Tailwind HOISTS into the base layer at build time — and base is
   * emitted before utilities. Both facts are asserted, because either alone
   * would be enough and relying on the unstated one is how this breaks quietly.
   */
  const globalSel = '*:focus-visible';
  const utilitySel = '.focus-visible\\:ring-0:focus-visible';
  assert.deepEqual(specificity(globalSel), [0, 1, 0], 'the global rule is one pseudo-class');
  assert.deepEqual(specificity(utilitySel), [0, 2, 0], 'the utility is a class plus a pseudo-class');
  assert.ok(
    rank(specificity(utilitySel)) > rank(specificity(globalSel)),
    'the suppression must outrank the rule it suppresses',
  );

  const css = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
  const baseDirective = css.indexOf('@tailwind base');
  const utilitiesDirective = css.indexOf('@tailwind utilities');
  assert.notEqual(baseDirective, -1, '@tailwind base is gone from globals.css');
  assert.notEqual(utilitiesDirective, -1, '@tailwind utilities is gone from globals.css');
  assert.ok(baseDirective < utilitiesDirective, 'the utilities layer is emitted after base');

  // The rule is hoisted into that base layer by its `@layer base` wrapper — NOT
  // by where it happens to sit in the file, which is below the directives.
  const ruleAt = css.indexOf('*:focus-visible');
  const wrapperAt = css.lastIndexOf('@layer base', ruleAt);
  assert.notEqual(wrapperAt, -1, 'the global rule must be inside @layer base to be hoisted');
  assert.ok(
    ruleAt > utilitiesDirective,
    'sanity: the rule really does sit below the directives, so file order is NOT what decides this',
  );
});

test('CONTROL: the specificity function ranks known selectors correctly', () => {
  /**
   * Without this the comparison above is a function agreeing with itself. Run
   * against selectors whose specificity is not in dispute.
   */
  assert.deepEqual(specificity('*'), [0, 0, 0]);
  assert.deepEqual(specificity('div'), [0, 0, 1]);
  assert.deepEqual(specificity('.a'), [0, 1, 0]);
  assert.deepEqual(specificity('#a'), [1, 0, 0]);
  assert.deepEqual(specificity('a:hover'), [0, 1, 1]);
  assert.ok(rank(specificity('#a')) > rank(specificity('.a.b.c')));
  assert.ok(rank(specificity('.a:focus')) > rank(specificity('*:focus')));
  // …and the escaped colon in a Tailwind class is not counted as a pseudo-class.
  assert.deepEqual(specificity('.focus-visible\\:ring-0'), [0, 1, 0]);
});

test('CONTROL: `focus:` would NOT have been enough', () => {
  /**
   * The trap named in the brief, as a check rather than a comment: a
   * `focus:ring-0` utility compiles to `…:focus`, which never applies while the
   * global rule is `:focus-visible`. Same specificity, different state — it
   * simply does not overlap.
   */
  const wrong = '.focus\\:ring-0:focus';
  const right = '.focus-visible\\:ring-0:focus-visible';
  assert.equal(rank(specificity(wrong)), rank(specificity(right)), 'equally specific…');
  assert.ok(wrong.endsWith(':focus') && !wrong.endsWith(':focus-visible'), '…but a different state');
  assert.ok(right.endsWith(':focus-visible'), 'only this one overlaps the rule being overridden');
  assert.equal(
    CLIENT.code.includes('focus:ring-0'), false,
    'the component must not use the variant that cannot win',
  );
});

// ── Control ─────────────────────────────────────────────────────────────────

test('CONTROL: every source in this file was actually read and scrubbed', () => {
  for (const [name, src] of Object.entries({ PAGE, CLIENT, ROUTE, CORPUS, MATCH, ENRICH })) {
    assert.ok(src.code.length > 200, `${name} was not actually read`);
  }
  assert.match(MATCH.code, /export function searchCorpusFor/);
  assert.match(CORPUS.code, /export async function getSearchCorpus/);
  assert.match(CLIENT.code, /export function SearchResults/);
  // …and the prose did not survive into `code`.
  assert.equal(CORPUS.code.includes('unstable_cache'), false, 'comments must be stripped');
});

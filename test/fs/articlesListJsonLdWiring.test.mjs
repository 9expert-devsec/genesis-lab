import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources, countCallSites } from '../sourceScan.mjs';

/**
 * That the /articles ItemList is actually EMITTED, and emitted server-side.
 *
 * test/pure/articleListJsonLd invokes the builder for real and is the stronger
 * test. It cannot reach this half: page.jsx awaits `getArticles`, which opens a
 * Mongo connection the suite does not have. So the wiring is asserted from
 * source — with the limitation stated rather than papered over. This proves the
 * builder is CALLED and its output is stringified into a script tag on the
 * server; it does not prove a crawler received one.
 *
 * The measured evidence that it does is in the commit: the production build's
 * /articles response carried zero `application/ld+json` blocks before this
 * change and one after.
 */

const PAGE = 'src/app/(public)/articles/page.jsx';
const BUILDER = 'src/lib/articles/buildListJsonLd.js';
const URL_HELPER = 'src/lib/articles/articleUrl.js';
const DETAIL = 'src/app/(public)/articles/[slug]/page.jsx';

test('the listing page calls the builder and emits the script tag', () => {
  const { code } = readSource(PAGE);
  assert.equal(countCallSites(code, 'buildListJsonLd'), 1, 'the builder is not called exactly once');
  assert.match(code, /type="application\/ld\+json"/, 'no ld+json script tag on the listing');
  assert.match(
    code,
    /dangerouslySetInnerHTML=\{\{\s*__html:\s*JSON\.stringify\(/,
    'the JSON-LD is not stringified into the tag the way the detail page does it'
  );
});

test('the tag is omitted rather than emitted empty when nothing matched', () => {
  const { code } = readSource(PAGE);
  // The builder returns null for an empty set; the page must honour that. An
  // `<ItemList>` asserting zero items is a positive claim that the site has no
  // articles, which is not what "no match for this filter" means.
  assert.match(
    code,
    /\{listJsonLd\s*&&\s*\(/,
    'the script tag is not guarded — an empty result would emit an ItemList of nothing'
  );
});

/**
 * IT IS NOT IN A CLIENT COMPONENT.
 *
 * The entire argument for this block is that it reaches readers who never run
 * the page's JavaScript. Emitted from a `'use client'` file it would arrive by
 * hydration, which is the audience it was written to bypass.
 */
test('the JSON-LD is emitted from a server component', () => {
  const { raw } = readSource(PAGE);
  assert.ok(!/^\s*['"]use client['"]/m.test(raw), 'the listing page became a client component');
});

test('the builder itself is server-safe — no hooks, no client directive', () => {
  const { raw, code } = readSource(BUILDER);
  assert.ok(!/^\s*['"]use client['"]/m.test(raw));
  assert.ok(!/\buse[A-Z]\w*\(/.test(code), 'the builder calls a React hook');
});

// ── One canonical URL, one truncation ───────────────────────────────────────

/**
 * BOTH article JSON-LD blocks resolve their URL through the same helper.
 *
 * The failure this prevents is silent and total: an ItemList whose entries name
 * URLs the detail pages do not claim describes a set of documents that, to a
 * crawler, are not the ones it can fetch. Two template literals are how that
 * happens — see lib/articles/articleUrl.js.
 */
/**
 * ABSOLUTE article URLs only. A relative `href={`/articles/${slug}`}` is a link
 * for a browser that already knows the origin — five components build one and
 * none of them is what this rule is about. What matters is every place that
 * pairs an ORIGIN with the path, because that is the string a crawler compares.
 */
const ABSOLUTE_ARTICLE_URL = /(https:\/\/[^`'"\s]*|\$\{[^}]*(?:SITE_URL|siteUrl|base)[^}]*\})\/articles\/\$\{/;

/**
 * THE THREE REMAINING SPELLINGS ARE KNOWN, NAMED, AND UNCHANGED.
 *
 * The helper's job was to stop the two JSON-LD blocks from disagreeing, and it
 * does. It did NOT unify the site's canonical origin, and pretending otherwise
 * by quietly rewriting these three would change what every published article
 * emits — a decision about canonical URLs, not a side effect of adding a
 * listing block. So they are recorded here, with what each uses, and this test
 * fails if a FOURTH appears.
 *
 * Reconciling them is the follow-up this list exists to make impossible to
 * forget:
 *   · [slug]/page.jsx        → NEXT_PUBLIC_SITE_URL   (canonical + og:url)
 *   · ArticleDetailClient    → a hardcoded literal    (share links)
 *   · sitemap.js             → its own `base`         (the sitemap entries)
 * and the helper defaults to a fourth origin again, inherited from buildJsonLd.
 * See lib/articles/articleUrl.js, which states the same thing at the value.
 */
const KNOWN_ORIGIN_SPELLINGS = [
  DETAIL,
  'src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx',
  'src/app/sitemap.js',
];

test('no FOURTH place builds an absolute article URL by hand', () => {
  const owners = walkSources('src')
    .filter((f) => f.rel !== URL_HELPER)
    .filter((f) => ABSOLUTE_ARTICLE_URL.test(f.code))
    .map((f) => f.rel);

  assert.deepEqual(
    owners.sort(),
    [...KNOWN_ORIGIN_SPELLINGS].sort(),
    'an absolute /articles/ URL appeared outside the recorded set — route it through articleCanonicalUrl'
  );
});

test('CONTROL: the matcher separates absolute URLs from relative hrefs', () => {
  // Without this the rule could pass by matching nothing at all, and it would
  // also be satisfied by a regex that swept in every `href` on the site.
  assert.ok(ABSOLUTE_ARTICLE_URL.test('`${process.env.NEXT_PUBLIC_SITE_URL}/articles/${slug}`'));
  assert.ok(ABSOLUTE_ARTICLE_URL.test('`https://genesis-lab.9expert.app/articles/${a.slug}`'));
  assert.ok(ABSOLUTE_ARTICLE_URL.test('`${base}/articles/${a.slug}`'));
  assert.ok(!ABSOLUTE_ARTICLE_URL.test('`/articles/${article.slug}`'), 'a relative href was swept in');
  assert.ok(!ABSOLUTE_ARTICLE_URL.test('href={`/articles/${a.slug}`}'), 'a relative href was swept in');
});

test('both JSON-LD builders CALL the shared url helper', () => {
  // `code` and countCallSites, not a match on `withImports`. A match on the
  // imported text is satisfied by the import line alone — the file can go back
  // to a hand-built template literal and keep an unused import, and the guard
  // stays green. That is defect 5 in test/sourceScan.mjs's header, and this
  // test was written that way first and caught doing it by the revert drill.
  for (const rel of [BUILDER, 'src/lib/articles/buildJsonLd.js']) {
    const { code } = readSource(rel);
    assert.equal(
      countCallSites(code, 'articleCanonicalUrl'),
      1,
      `${rel} does not resolve its url through the shared helper exactly once`
    );
  }
});

test('the listing description goes through the shared truncation helper', () => {
  const { code } = readSource(BUILDER);
  assert.match(code, /toMetaDescription\(/, 'the builder must use the shared helper');
  // The second truncation this file exists to prevent. metaDescriptionWiring
  // already asserts the helper is the only OWNER of the logic; this asserts
  // this builder did not grow its own slice instead.
  assert.ok(
    !/\.slice\(0,\s*\d+\)/.test(code),
    'the builder truncates by hand — that is the second implementation the helper removed'
  );
});

// ── Control ─────────────────────────────────────────────────────────────────

test('CONTROL: the files were read and the matchers are live', () => {
  const page = readSource(PAGE);
  assert.ok(page.code.length > 1000, `page.jsx scrubbed to ${page.code.length} chars`);
  assert.equal(countCallSites(page.code, 'buildListJsonLd'), 1);
  // countCallSites finds nothing for a name that is not there — proving the
  // count above is a measurement rather than a constant.
  assert.equal(countCallSites(page.code, 'buildCourseJsonLd'), 0);
  // And the walk in the url test really does traverse src.
  assert.ok(walkSources('src/lib/articles').length >= 3);
});

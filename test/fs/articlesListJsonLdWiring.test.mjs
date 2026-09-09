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
 * TWO REMAINING SPELLINGS. THERE WERE THREE.
 *
 * This list was written to make the follow-up impossible to forget, and round
 * ORIGIN-1 (2026-09-09) is that follow-up. What it recorded then was:
 *
 *   · [slug]/page.jsx        → NEXT_PUBLIC_SITE_URL   (canonical + og:url)
 *   · ArticleDetailClient    → a hardcoded literal    (share links)
 *   · sitemap.js             → its own `base`         (the sitemap entries)
 *   … and the helper defaulting to a FOURTH origin, inherited from buildJsonLd.
 *
 * The fourth is gone: lib/articles/articleUrl.js now defaults to lib/seo/siteUrl's
 * SITE_URL, the site's one origin. ArticleDetailClient is gone from this list
 * too — it no longer pairs an origin with the path at all, it calls
 * articleCanonicalUrl, so removing it is not a weakening. If it ever goes back
 * to building the URL itself, the matcher sees it again and this test fails.
 *
 * The two that remain are NOT hardcoded hosts and are not this round's scope:
 *   · [slug]/page.jsx        → NEXT_PUBLIC_SITE_URL   (canonical + og:url)
 *   · sitemap.js             → its own `base`         (the sitemap entries)
 * Both resolve to the live origin in production. They are second EXPRESSIONS
 * for one value rather than second values — the thing lib/seo/siteUrl argues
 * against, because an expression that merely agrees in production disagrees
 * everywhere else. Absorbing them is a later round; this test fails if a THIRD
 * appears in the meantime.
 */
const KNOWN_ORIGIN_SPELLINGS = [
  DETAIL,
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

// ── No article module names a host of its own ───────────────────────────────

/**
 * THE ASSERTION ROUND ORIGIN-1 EXISTS FOR.
 *
 * The article modules resolved to `https://genesis-lab.9expert.app` — a literal
 * preview host, sitting in a defaulted parameter and looking entirely correct.
 * It passed every other test in this suite and in test/pure/articleListJsonLd,
 * because a fixture and a hardcoded value agree with each other perfectly. What
 * it did was emit the preview origin from production: 78 occurrences on
 * /articles and 9 on an article detail page, measured 2026-09-09, while those
 * same pages served a `<link rel="canonical">` on the live domain.
 *
 * So: these files compose from the origin constant and MUST NOT spell a host.
 * Read from `code`, imports and comments stripped — the paragraph above names
 * the host and must not be able to satisfy the rule it describes (defects 1, 2
 * and 5 in sourceScan.mjs).
 */
for (const rel of [URL_HELPER, BUILDER, 'src/lib/articles/buildJsonLd.js']) {
  test(`${rel} names no host of its own`, () => {
    const { code } = readSource(rel);
    assert.ok(
      !code.includes('genesis-lab.9expert.app'),
      'the preview host is back — this is the defect ORIGIN-1 removed'
    );
    assert.ok(
      !code.includes('9experttraining'),
      'even the CORRECT host is wrong here: the origin comes from lib/seo/siteUrl, '
        + 'and a second spelling that agrees in production disagrees everywhere else'
    );
  });
}

test('CONTROL: the host scan DOES fire on a file that spells one out', () => {
  // Without this the three assertions above could pass by reading nothing —
  // a scrubbed file, a bad path, an empty string. siteConfig is where the host
  // legitimately lives, so the scan must be able to see it there.
  const { code } = readSource('src/config/site.js');
  assert.ok(
    code.includes('9experttraining'),
    'the scan cannot see a host where one really is — the assertions above pass vacuously'
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

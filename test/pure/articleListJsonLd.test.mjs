import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildListJsonLd, ARTICLE_LIST_NAME } from '@/lib/articles/buildListJsonLd';
import { buildJsonLd } from '@/lib/articles/buildJsonLd';
import { articleCanonicalUrl, ARTICLE_SITE_URL } from '@/lib/articles/articleUrl';
import { META_DESCRIPTION_MAX } from '@/lib/seo/metaDescription';

/**
 * The /articles ItemList.
 *
 * A pure builder, so this invokes it for real rather than scanning source. The
 * wiring into page.jsx is the part that cannot be invoked here (it awaits Mongo)
 * and is guarded in test/fs/articlesListJsonLdWiring.
 */

const ITEM = (slug, title, extra = {}) => ({
  slug,
  title,
  excerpt: `บทสรุปของ ${title}`,
  ...extra,
});

const THREE = [
  ITEM('data-storytelling', 'Data Storytelling'),
  ITEM('power-bi-basics', 'Power BI Basics'),
  ITEM('canva-for-teams', 'Canva for Teams'),
];

// ── Shape ───────────────────────────────────────────────────────────────────

test('it builds an ItemList with one ListItem per article', () => {
  const ld = buildListJsonLd(THREE);
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'ItemList');
  assert.equal(ld.name, ARTICLE_LIST_NAME);
  assert.equal(ld.itemListElement.length, 3);
  for (const el of ld.itemListElement) assert.equal(el['@type'], 'ListItem');
});

test('EVERY entry carries a url — the whole point of emitting this', () => {
  const ld = buildListJsonLd(THREE);
  for (const el of ld.itemListElement) {
    assert.ok(el.url, `a ListItem has no url: ${JSON.stringify(el)}`);
    assert.match(el.url, /^https:\/\/\S+\/articles\/\S+$/);
    assert.equal(el.item.url, el.url, 'the ListItem and its item disagree about the url');
    assert.equal(el.item['@id'], el.url);
  }
});

test('a reader with no JavaScript gets the titles too, not just links', () => {
  const ld = buildListJsonLd(THREE);
  const headlines = ld.itemListElement.map((el) => el.item.headline);
  assert.deepEqual(headlines, ['Data Storytelling', 'Power BI Basics', 'Canva for Teams']);
});

// ── The url agrees with the detail page's own structured data ───────────────

/**
 * THE ASSERTION THE SHARED HELPER EXISTS FOR.
 *
 * Both blocks are emitted, both name the same article, and a crawler reading
 * both must be able to tell that they are one document. Compared against
 * `buildJsonLd`'s real output rather than against a literal, so a change to the
 * canonical shape has to move both or fail here.
 */
test('a ListItem url is byte-identical to the detail page JSON-LD url', () => {
  const article = {
    ...ITEM('data-storytelling', 'Data Storytelling'),
    active: true,
    publishedAt: '2026-01-01T00:00:00.000Z',
    jsonLd: { enabled: true },
  };
  const detail = buildJsonLd(article);
  const list = buildListJsonLd([article]);
  assert.equal(list.itemListElement[0].url, detail.url);
  assert.equal(list.itemListElement[0].item['@id'], detail.mainEntityOfPage['@id']);
});

test('a Thai slug survives into the url unchanged, as the detail page emits it', () => {
  const slug = 'สอน-power-bi';
  const ld = buildListJsonLd([ITEM(slug, 'สอน Power BI')]);
  assert.equal(ld.itemListElement[0].url, `${ARTICLE_SITE_URL}/articles/${slug}`);
  assert.equal(ld.itemListElement[0].url, articleCanonicalUrl(slug));
});

test('a custom siteUrl reaches every entry', () => {
  const ld = buildListJsonLd(THREE, { siteUrl: 'https://example.com' });
  assert.equal(ld.url, 'https://example.com/articles');
  for (const el of ld.itemListElement) assert.match(el.url, /^https:\/\/example\.com\//);
});

// ── Position ────────────────────────────────────────────────────────────────

test('positions are 1-based on the first page', () => {
  const ld = buildListJsonLd(THREE);
  assert.deepEqual(ld.itemListElement.map((el) => el.position), [1, 2, 3]);
});

test('positions continue across pages rather than restarting', () => {
  const ld = buildListJsonLd(THREE, { page: 3, pageSize: 12 });
  assert.deepEqual(ld.itemListElement.map((el) => el.position), [25, 26, 27]);
});

test('pageSize defaults to the array length, so a caller that omits it is still consistent', () => {
  const ld = buildListJsonLd(THREE, { page: 2 });
  assert.deepEqual(ld.itemListElement.map((el) => el.position), [4, 5, 6]);
});

// ── numberOfItems ───────────────────────────────────────────────────────────

test('numberOfItems is the TOTAL when given, not this page length', () => {
  const ld = buildListJsonLd(THREE, { page: 1, pageSize: 12, total: 488 });
  assert.equal(ld.numberOfItems, 488);
});

test('numberOfItems is absent when no total is supplied', () => {
  assert.ok(!('numberOfItems' in buildListJsonLd(THREE)));
});

// ── The description goes through the shared helper ──────────────────────────

test('a long excerpt is truncated by the shared helper, not restated raw', () => {
  const long = 'ก'.repeat(400);
  const ld = buildListJsonLd([ITEM('long', 'Long', { excerpt: long })]);
  const description = ld.itemListElement[0].item.description;
  assert.ok(
    description.length <= META_DESCRIPTION_MAX,
    `description is ${description.length} chars — the helper was bypassed`
  );
  assert.ok(description.endsWith('…'), 'truncated text should carry the ellipsis the helper adds');
});

test('seoDescription wins over excerpt, the same order the meta tag uses', () => {
  const ld = buildListJsonLd([
    ITEM('x', 'X', { seoDescription: 'the SEO one', excerpt: 'the excerpt one' }),
  ]);
  assert.equal(ld.itemListElement[0].item.description, 'the SEO one');
});

test('an article with neither gets NO description key rather than an empty one', () => {
  const ld = buildListJsonLd([{ slug: 'bare', title: 'Bare' }]);
  assert.ok(!('description' in ld.itemListElement[0].item));
});

// ── Omissions that are decisions ────────────────────────────────────────────

test('no datePublished leaks onto the listing', () => {
  const ld = buildListJsonLd([
    ITEM('d', 'D', { publishedAt: '2026-01-01T00:00:00.000Z' }),
  ]);
  const flat = JSON.stringify(ld);
  assert.ok(!/datePublished/.test(flat), 'the listing put back the date the detail page withholds');
  assert.ok(!/2026-01-01/.test(flat), 'a publish date reached the structured data by another key');
});

test('image is present when there is a cover and absent when there is not', () => {
  const withCover = buildListJsonLd([ITEM('c', 'C', { coverUrl: 'https://cdn/x.jpg' })]);
  assert.equal(withCover.itemListElement[0].item.image, 'https://cdn/x.jpg');
  const without = buildListJsonLd([ITEM('n', 'N', { coverUrl: '' })]);
  assert.ok(!('image' in without.itemListElement[0].item), 'an empty image url was emitted');
});

// ── Nothing to describe ─────────────────────────────────────────────────────

test('an empty result returns null so the page emits no script tag', () => {
  assert.equal(buildListJsonLd([]), null);
  assert.equal(buildListJsonLd(null), null);
  assert.equal(buildListJsonLd(undefined), null);
});

test('an item with no slug is dropped rather than given a url ending in undefined', () => {
  const ld = buildListJsonLd([ITEM('ok', 'Ok'), { title: 'No slug' }]);
  assert.equal(ld.itemListElement.length, 1);
  assert.ok(!JSON.stringify(ld).includes('undefined'));
});

test('a set whose every item lacks a slug is null, not an empty ItemList', () => {
  assert.equal(buildListJsonLd([{ title: 'a' }, { title: 'b' }]), null);
});

// ── Controls ────────────────────────────────────────────────────────────────

/**
 * CONTROL: the output actually serialises.
 *
 * Every assertion above reads the object. The page stringifies it into a
 * <script> tag, and a value that survives assertion but throws or emits
 * `undefined` on JSON.stringify would fail only in production.
 */
test('CONTROL: the result round-trips through JSON', () => {
  const ld = buildListJsonLd(THREE, { page: 2, pageSize: 12, total: 488 });
  const json = JSON.stringify(ld);
  assert.deepEqual(JSON.parse(json), ld);
  assert.ok(!json.includes('undefined'));
});

/**
 * CONTROL: the positive cases would fail on a builder that returned a constant.
 */
test('CONTROL: different inputs produce different output', () => {
  const a = buildListJsonLd(THREE);
  const b = buildListJsonLd([THREE[0]]);
  assert.notDeepEqual(a, b);
  assert.notEqual(a.itemListElement.length, b.itemListElement.length);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArticleBreadcrumbJsonLd } from '@/lib/articles/articleBreadcrumbJsonLd';
import { buildJsonLd } from '@/lib/articles/buildJsonLd';

const SITE = 'https://example.test';

test('หน้าแรก → บทความ → the article, last crumb = the Article JSON-LD url', () => {
  const article = {
    slug: 'สูตร-excel', title: 'สูตร Excel', active: true, publishedAt: '2026-01-01',
    jsonLd: { enabled: true },
  };
  const crumbs = buildArticleBreadcrumbJsonLd(article, SITE);
  assert.equal(crumbs['@type'], 'BreadcrumbList');
  assert.deepEqual(
    crumbs.itemListElement.map((i) => [i.position, i.name, i.item]),
    [
      [1, 'หน้าแรก', SITE],
      [2, 'บทความ', `${SITE}/articles`],
      [3, 'สูตร Excel', `${SITE}/articles/สูตร-excel`],
    ]
  );
  assert.equal(crumbs.itemListElement[2].item, buildJsonLd(article, SITE).url);
});

test('emitted even when the Article JSON-LD is disabled; null without a slug', () => {
  const article = { slug: 's', title: 't', jsonLd: { enabled: false } };
  assert.equal(buildJsonLd(article, SITE), null);
  assert.ok(buildArticleBreadcrumbJsonLd(article, SITE));
  assert.equal(buildArticleBreadcrumbJsonLd({ title: 't' }, SITE), null);
});

test('publisher logo is the square brand mark that exists in public/', () => {
  const ld = buildJsonLd({ slug: 's', title: 't', active: true, publishedAt: 'x', jsonLd: { enabled: true } }, SITE);
  assert.equal(ld.publisher.logo.url, `${SITE}/logo/9exp-stand.png`);
});

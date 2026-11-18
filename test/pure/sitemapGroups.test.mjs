import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogConfigSitemapPaths,
  isReviewCopySlug,
  promotionSitemapPaths,
} from '@/lib/seo/sitemapGroups';

/**
 * D04 — the pure rules behind the sitemap's new groups. The sitemap itself
 * reads Mongo and cannot run here; its "no .limit()" wiring is asserted in
 * test/fs/writerRoutesWiring.
 */

test('review copies are dropped; ordinary slugs, and look-alikes, are kept', () => {
  assert.equal(isReviewCopySlug('power-bi-tips-review-20261112'), true);
  assert.equal(isReviewCopySlug(' power-bi-tips-review-20261112 '), true);
  // CONTROLS: a real article that merely mentions a review, or a date that is
  // not exactly eight digits at the very end, is a page of its own.
  assert.equal(isReviewCopySlug('power-bi-tips'), false);
  assert.equal(isReviewCopySlug('code-review-checklist'), false);
  assert.equal(isReviewCopySlug('review-2026'), false);
  assert.equal(isReviewCopySlug('x-review-20261112-final'), false);
  assert.equal(isReviewCopySlug('x-review-2026111'), false);
});

test('catalog configs: unpublished and slug-less rows are left out, duplicates once', () => {
  const at = new Date('2026-11-01T00:00:00Z');
  assert.deepEqual(
    catalogConfigSitemapPaths([
      { urlSlug: 'power-bi-all-courses', isPublished: true, updatedAt: at },
      { urlSlug: 'hidden-all-courses', isPublished: false },
      { urlSlug: '  ', isPublished: true },
      { urlSlug: null },
      { urlSlug: '/business-all-courses/' }, // isPublished absent = published
      { urlSlug: 'power-bi-all-courses', isPublished: true },
    ]),
    [
      { path: '/power-bi-all-courses', updatedAt: at },
      { path: '/business-all-courses', updatedAt: undefined },
    ]
  );
});

test('promotion cards: only well-formed /promotions/<slug> hrefs, once each', () => {
  assert.deepEqual(
    promotionSitemapPaths([
      { href: '/promotions/claude-ai-duo' },
      { href: '/promotions/' },
      { href: '/promotions' },
      { href: 'https://example.com/promotions/x' },
      { href: '/promotions/claude-ai-duo' },
      {},
    ]),
    ['/promotions/claude-ai-duo']
  );
});

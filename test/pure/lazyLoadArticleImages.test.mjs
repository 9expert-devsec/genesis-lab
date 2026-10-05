import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lazyLoadArticleImages } from '@/lib/articles/lazyLoadArticleImages';

/**
 * Render-time `loading="lazy"` / `decoding="async"` on article body images.
 */

test('adds loading=lazy and decoding=async to a bare <img>', () => {
  const out = lazyLoadArticleImages('<p><img src="/a.png" alt="a" width="10" height="20"></p>');
  assert.equal(
    out,
    '<p><img src="/a.png" alt="a" width="10" height="20" loading="lazy" decoding="async"></p>'
  );
});

test('an author-set loading is left alone, and that img gets no decoding either', () => {
  const html = '<img src="/hero.png" loading="eager"><img src="/b.png">';
  const out = lazyLoadArticleImages(html);
  assert.match(out, /<img src="\/hero\.png" loading="eager">/);
  assert.match(out, /<img src="\/b\.png" loading="lazy" decoding="async">/);
});

test('an existing decoding is kept, not duplicated', () => {
  const out = lazyLoadArticleImages('<img src="/c.png" decoding="sync">');
  assert.equal(out, '<img src="/c.png" decoding="sync" loading="lazy">');
});

test('nothing to change → the original bytes back, not a re-serialisation', () => {
  const noImg = '<p>no images<br/></p>';
  assert.equal(lazyLoadArticleImages(noImg), noImg);
  const allSet = '<p><img src="/d.png" loading="lazy"/></p>';
  assert.equal(lazyLoadArticleImages(allSet), allSet);
  assert.equal(lazyLoadArticleImages(''), '');
  assert.equal(lazyLoadArticleImages(null), '');
});

test('images nested inside wrapped tables are reached', () => {
  const html = '<div class="article-table-scroll"><table><tbody><tr><td><img src="/e.png"></td></tr></tbody></table></div>';
  assert.match(lazyLoadArticleImages(html), /<img src="\/e\.png" loading="lazy" decoding="async">/);
});

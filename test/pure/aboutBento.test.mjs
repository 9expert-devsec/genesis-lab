import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BENTO_PATTERN, galleryLayout } from '@/lib/about/bento';

/**
 * /about-us community gallery slots. See src/lib/about/bento.js.
 */

const photos = (n) => Array.from({ length: n }, (_, i) => ({ _id: `p${i}`, image_url: `https://x/${i}.jpg`, caption_th: '' }));

test('six or more photos → the first six as wide/narrow/narrow, narrow/narrow/wide', () => {
  const out = galleryLayout(photos(10));
  assert.equal(out.layout, 'bento');
  assert.deepEqual(out.items.map((i) => i.size), ['wide', 'narrow', 'narrow', 'narrow', 'narrow', 'wide']);
  assert.deepEqual(out.items.map((i) => i.id), ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'], 'admin order kept');
  assert.equal(BENTO_PATTERN.length, 6);
});

test('fewer than six → an even grid of every photo', () => {
  const out = galleryLayout(photos(4));
  assert.equal(out.layout, 'grid');
  assert.equal(out.items.length, 4);
  assert.ok(out.items.every((i) => i.size === 'narrow'));
  assert.deepEqual(galleryLayout([]), { layout: 'grid', items: [] });
});

test('alt text is the caption, else a numbered fallback; photos without a URL are skipped', () => {
  const out = galleryLayout([
    { _id: 'a', image_url: 'https://x/a.jpg', caption_th: '  ห้อง Jupiter  ' },
    { _id: 'b', image_url: '' },
    { _id: 'c', image_url: 'https://x/c.jpg' },
  ]);
  assert.deepEqual(out.items.map((i) => i.alt), ['ห้อง Jupiter', 'ภาพบรรยากาศการอบรม 2']);
});

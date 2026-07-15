import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reidSection, stripImageOwnership } from '@/lib/pageBuilder/reidSection';

const img = () => ({ id: 'i1', type: 'image', content: { src: 'https://cdn/x.jpg', publicId: 'page-builder/x', alt: 'a' }, advanced: { sectionId: 'hero' } });

test('reidSection clears the ownership token (publicId) but keeps src', () => {
  const c = reidSection(img());
  assert.equal(c.content.publicId, '');
  assert.equal(c.content.src, 'https://cdn/x.jpg');
});
test('reidSection clears advanced.sectionId and re-mints id', () => {
  const c = reidSection(img());
  assert.equal(c.advanced.sectionId, '');
  assert.ok(c.id && c.id !== 'i1');
});
test('reidSection does NOT mutate the original (item 5 Part 1 safety)', () => {
  const src = img();
  reidSection(src);
  assert.equal(src.content.publicId, 'page-builder/x');
});

test('stripImageOwnership clears nested publicIds, keeps ids + src', () => {
  const tree = [{ id: 'c1', type: 'card_grid', content: { children: [img(), { id: 'i2', type: 'image', content: { src: 's2', publicId: 'page-builder/y' } }] } }];
  const out = stripImageOwnership(tree);
  assert.equal(out[0].content.children[0].content.publicId, '');
  assert.equal(out[0].content.children[1].content.publicId, '');
  assert.equal(out[0].id, 'c1'); // no re-mint
  assert.equal(out[0].content.children[1].content.src, 's2');
});
test('stripImageOwnership does NOT mutate the original', () => {
  const tree = [{ id: 'c1', type: 'card_grid', content: { children: [{ id: 'i2', type: 'image', content: { publicId: 'page-builder/y' } }] } }];
  stripImageOwnership(tree);
  assert.equal(tree[0].content.children[0].content.publicId, 'page-builder/y');
});

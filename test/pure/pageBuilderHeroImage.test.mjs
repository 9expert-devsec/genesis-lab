import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroImageSectionId } from '@/lib/pageBuilder/heroImage';

/**
 * D08 — only the image that OPENS a builder page is eager/high priority. The
 * search is confined to the first rendered top-level section; a page that
 * opens with anything else gets no eager image at all.
 */

const img = (id, src = 'https://res.cloudinary.com/ddva7xvdt/image/upload/x.png') =>
  ({ id, type: 'image', content: { src } });

test('hero = first image inside the first rendered top-level section, and nothing else', () => {
  // A top-level image.
  assert.equal(heroImageSectionId([img('a'), img('b')]), 'a');
  // Hidden / disabled leading sections do not claim the slot.
  assert.equal(
    heroImageSectionId([
      { id: 'off', type: 'heading', enabled: false },
      { id: 'hid', type: 'image', settings: { visibility: 'hidden' }, content: { src: 'x' } },
      img('a'),
    ]),
    'a'
  );
  // Inside a container — walked into, depth-first.
  assert.equal(
    heroImageSectionId([
      { id: 'c', type: 'two_column', content: { left: [{ id: 'h', type: 'heading' }], right: [img('nested')] } },
      img('later'),
    ]),
    'nested'
  );
  // CONTROLS: a page that opens with text has no hero, even if an image follows;
  // an image with no src renders nothing and cannot be the hero.
  assert.equal(heroImageSectionId([{ id: 'h', type: 'heading' }, img('below')]), null);
  assert.equal(heroImageSectionId([img('empty', '  ')]), null);
  assert.equal(heroImageSectionId(null), null);
});

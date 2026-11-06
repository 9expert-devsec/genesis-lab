import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArticleByline } from '@/app/(public)/articles/[slug]/_components/ArticleByline';

const render = (props) => renderToStaticMarkup(createElement(ArticleByline, props));

const academy = { _id: 'a', slug: '9expert-academy', displayName: '9Expert Academy', type: 'organization', avatarPublicId: 'x/writers/a' };
const vate = { _id: 'b', slug: 'chalaivate', displayName: 'อ.เวท', type: 'person', avatarPublicId: '' };

test('no writers: the legacy author text, exactly as it read before', () => {
  assert.match(render({ author: '9Expert Team' }), /บทความโดย: <!-- -->9Expert Team|บทความโดย: 9Expert Team/);
});

test('no writers: writerIds absent reaches here as the default, and shows the legacy text', () => {
  assert.match(render({ writers: undefined, author: 'old' }), /old/);
});

test('no writers and no text: nothing at all', () => {
  assert.equal(render({ author: '' }), '');
});

test('with writers: the names, joined, in place of the legacy text', () => {
  const html = render({ writers: [vate, academy], author: 'old' });
  assert.match(html, /อ\.เวท &amp; 9Expert Academy/);
  assert.equal(html.includes('old'), false);
});

test('with writers: the label has no colon, and the avatars come first', () => {
  const html = render({ writers: [academy] });
  assert.match(html, />บทความโดย</);
  assert.ok(html.indexOf('<img') < html.indexOf('9Expert Academy'));
});

test('with writers: one 28px avatar each, overlapping', () => {
  const html = render({ writers: [vate, academy] });
  assert.equal((html.match(/<img /g) ?? []).length, 2);
  assert.equal((html.match(/width="28"/g) ?? []).length, 2);
  assert.match(html, /-space-x-2/);
});

test('with writers: a photo goes through the avatar helper, and no photo gets the default', () => {
  const html = render({ writers: [academy, vate] });
  assert.match(html, /res\.cloudinary\.com\/[^"]+\/x\/writers\/a/);
  assert.match(html, /src="\/avatar\/avatar-default-128\.png"/);
});

test('names are plain text until the profile pages exist', () => {
  assert.equal(render({ writers: [vate] }).includes('<a'), false);
});

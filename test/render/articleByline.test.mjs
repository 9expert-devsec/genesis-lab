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

test('no writers, no text and no reading time: nothing at all', () => {
  assert.equal(render({ author: '' }), '');
});

test('with writers: the names, joined, in place of the legacy text', () => {
  const html = render({ writers: [vate, academy], author: 'old' });
  assert.match(html, /อ\.เวท<\/a><\/span><span> &amp; <a[^>]*>9Expert Academy<\/a>/);
  assert.equal(html.includes('old'), false);
});

test('with writers: the label has no colon, and the avatars come first', () => {
  const html = render({ writers: [academy] });
  assert.match(html, />บทความโดย</);
  assert.ok(html.indexOf('<img') < html.indexOf('>9Expert Academy<'));
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

test('each name and each avatar links to the profile', () => {
  const html = render({ writers: [vate, academy] });
  assert.equal((html.match(/href="\/author\/chalaivate"/g) ?? []).length, 2);
  assert.equal((html.match(/href="\/author\/9expert-academy"/g) ?? []).length, 2);
});

test('an avatar link has a name of its own, since its image is decorative', () => {
  assert.match(render({ writers: [vate] }), /<a [^>]*aria-label="อ\.เวท"/);
});

test('a focused avatar is lifted out of the overlap', () => {
  assert.match(render({ writers: [vate] }), /focus-visible:z-10/);
});

test('the reading time sits in the same row, after the names and a divider', () => {
  const html = render({ writers: [vate], minutes: 7 });
  const row = html.slice(0, html.lastIndexOf('</div>'));
  const name = row.indexOf('>อ.เวท<');
  const divider = row.indexOf('byline-divider');
  const time = row.indexOf('นาที');
  assert.ok(name !== -1 && name < divider && divider < time);
  assert.match(html, />?\s*7(<!-- -->)? (<!-- -->)?นาที/);
  assert.equal((html.match(/<div/g) ?? []).length, 1, 'one row');
});

test('the divider is hidden on narrow screens, where the row may wrap', () => {
  assert.match(render({ writers: [vate], minutes: 7 }), /class="hidden [^"]*sm:block"/);
});

test('the reading time stays when only the legacy text is there', () => {
  const html = render({ author: 'old', minutes: 2 });
  assert.match(html, /old/);
  assert.match(html, /นาที/);
});

test('with nobody named, the reading time still shows, with no divider', () => {
  const html = render({ minutes: 2 });
  assert.match(html, /นาที/);
  assert.equal(html.includes('byline-divider'), false);
});

test('the row has clear space under the cover', () => {
  assert.match(render({ writers: [vate] }), /data-testid="article-byline"/);
  assert.match(render({ writers: [vate] }), /class="mt-5 /);
});

test('no date is printed: the owner decision stands', () => {
  const text = render({ writers: [vate], minutes: 2 }).replace(/<[^>]+>/g, ' ');
  assert.match(text, /นาที/, 'the probe reads the visible text');
  assert.doesNotMatch(text, /25\d\d|20\d\d/);
});

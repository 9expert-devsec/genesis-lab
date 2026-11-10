import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArticleCardByline } from '@/components/articles/ArticleCardByline';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { cardBylineParts } from '@/lib/writers/articleWriters';

const render = (writers) => renderToStaticMarkup(createElement(ArticleCardByline, { writers }));
const imgs = (html) => (html.match(/<img /g) ?? []).length;

const w = (name) => ({ _id: name, displayName: name, avatarPublicId: `x/writers/${name}` });

test('no writers: nothing, not an empty strip', () => {
  assert.equal(render([]), '');
  assert.equal(render(undefined), '');
});

test('one writer: one avatar and the name', () => {
  const html = render([w('A')]);
  assert.equal(imgs(html), 1);
  assert.match(html, />A<\/span>/);
});

test('two writers: two avatars and A & B', () => {
  const html = render([w('A'), w('B')]);
  assert.equal(imgs(html), 2);
  assert.match(html, />A &amp; B<\/span>/);
  assert.match(html, /-space-x-2/);
});

test('three writers: the first two, then the count of the rest', () => {
  const html = render([w('A'), w('B'), w('C')]);
  assert.equal(imgs(html), 2);
  assert.match(html, />A &amp; B และอีก 1 คน<\/span>/);
  assert.equal(html.includes('>C'), false);
});

test('five writers count three more', () => {
  assert.equal(cardBylineParts([w('A'), w('B'), w('C'), w('D'), w('E')]).label, 'A & B และอีก 3 คน');
});

test('the avatars are 28px', () => {
  assert.equal((render([w('A'), w('B')]).match(/width="28"/g) ?? []).length, 2);
});

test('the byline is never a link: it sits inside a card', () => {
  assert.equal(render([w('A'), w('B'), w('C')]).includes('<a'), false);
});

const article = { _id: '1', slug: 's', title: 'T', excerpt: 'E' };

test('the /articles card draws the byline at its foot', () => {
  const html = renderToStaticMarkup(createElement(ArticleCard, { article: { ...article, writers: [w('A')] } }));
  assert.ok(html.indexOf('อ่านเพิ่มเติม') < html.indexOf('article-card-byline'));
});

test('the /articles card without writers draws none', () => {
  const html = renderToStaticMarkup(createElement(ArticleCard, { article }));
  assert.equal(html.includes('article-card-byline'), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJsonLd } from '@/lib/articles/buildJsonLd';

const article = {
  slug: 's',
  title: 'T',
  active: true,
  publishedAt: '2026-01-01T00:00:00.000Z',
  jsonLd: { enabled: true, overrides: {} },
};

const academy = { _id: 'a', displayName: '9Expert Academy', type: 'organization' };
const vate = { _id: 'b', displayName: 'อ.เวท', type: 'person' };

const authorOf = (over) => buildJsonLd({ ...article, ...over }, 'https://example.test').author;

test('a person writer is a Person, with no url yet', () => {
  assert.deepEqual(authorOf({ writers: [vate] }), [{ '@type': 'Person', name: 'อ.เวท' }]);
});

test('an organization writer is an Organization', () => {
  assert.deepEqual(authorOf({ writers: [academy] }), [{ '@type': 'Organization', name: '9Expert Academy' }]);
});

test('several writers stay in byline order', () => {
  assert.deepEqual(authorOf({ writers: [vate, academy] }).map((a) => a.name), ['อ.เวท', '9Expert Academy']);
});

test('resolved writers win over the legacy fields', () => {
  const author = authorOf({
    writers: [vate],
    author: 'old',
    jsonLd: { enabled: true, overrides: { authorName: 'override' } },
  });
  assert.equal(author[0].name, 'อ.เวท');
});

test('no writers: the override still comes first, exactly as before', () => {
  assert.deepEqual(
    authorOf({ author: 'old', jsonLd: { enabled: true, overrides: { authorName: 'override' } } }),
    { '@type': 'Person', name: 'override' },
  );
});

test('no writers: then the author text', () => {
  assert.deepEqual(authorOf({ author: 'old' }), { '@type': 'Person', name: 'old' });
  assert.deepEqual(authorOf({ author: 'old', writers: [] }), { '@type': 'Person', name: 'old' });
});

test('no writers and no text: the publisher, still as a Person', () => {
  assert.deepEqual(authorOf({}), { '@type': 'Person', name: '9Expert Training' });
});

test('publisher does not change with writers', () => {
  const site = 'https://example.test';
  assert.deepEqual(
    buildJsonLd({ ...article, writers: [vate] }, site).publisher,
    buildJsonLd(article, site).publisher,
  );
});

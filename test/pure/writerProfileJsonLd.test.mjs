import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJsonLd } from '@/lib/articles/buildJsonLd';
import {
  buildWriterBreadcrumbJsonLd,
  buildWriterProfileJsonLd,
  serializeJsonLd,
} from '@/lib/writers/writerJsonLd';

const SITE = 'https://example.test';

const person = {
  slug: 'chalaivate',
  displayName: 'อ.เวท',
  type: 'person',
  role: 'CEO',
  bio: 'bio text',
  avatarPublicId: 'x/writers/a',
  socialLinks: [
    { platform: 'facebook', url: 'https://facebook.com/a' },
    { platform: 'website', url: 'https://a.test/' },
  ],
};

const org = { slug: '9expert-academy', displayName: '9Expert Academy', type: 'organization', role: 'ทีม', bio: '', avatarPublicId: '', socialLinks: [] };

test('the page is a ProfilePage at the writer address', () => {
  const data = buildWriterProfileJsonLd(person, SITE);
  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], 'ProfilePage');
  assert.equal(data.url, 'https://example.test/author/chalaivate');
});

test('a person is a Person, with every field', () => {
  const { mainEntity } = buildWriterProfileJsonLd(person, SITE);
  assert.equal(mainEntity['@type'], 'Person');
  assert.equal(mainEntity.name, 'อ.เวท');
  assert.equal(mainEntity.url, 'https://example.test/author/chalaivate');
  assert.match(mainEntity.image, /^https:\/\/res\.cloudinary\.com\//);
  assert.equal(mainEntity.jobTitle, 'CEO');
  assert.equal(mainEntity.description, 'bio text');
});

test('sameAs holds every social URL, in order', () => {
  assert.deepEqual(
    buildWriterProfileJsonLd(person, SITE).mainEntity.sameAs,
    ['https://facebook.com/a', 'https://a.test/'],
  );
});

test('sameAs ends with the YouTube channel, once', () => {
  const channel = 'https://www.youtube.com/@9expert';
  assert.deepEqual(
    buildWriterProfileJsonLd({ ...person, youtubeChannelUrl: channel }, SITE).mainEntity.sameAs,
    ['https://facebook.com/a', 'https://a.test/', channel],
  );
  const twice = { ...person, socialLinks: [{ platform: 'youtube', url: channel }], youtubeChannelUrl: channel };
  assert.deepEqual(buildWriterProfileJsonLd(twice, SITE).mainEntity.sameAs, [channel]);
});

test('an organization is an Organization, with no jobTitle', () => {
  const { mainEntity } = buildWriterProfileJsonLd(org, SITE);
  assert.equal(mainEntity['@type'], 'Organization');
  assert.equal('jobTitle' in mainEntity, false);
});

test('empty fields are left out, not sent empty', () => {
  const { mainEntity } = buildWriterProfileJsonLd(org, SITE);
  for (const key of ['image', 'description', 'sameAs']) {
    assert.equal(key in mainEntity, false, key);
  }
});

test('the breadcrumb runs home, list, writer', () => {
  const trail = buildWriterBreadcrumbJsonLd(person, SITE);
  assert.equal(trail['@type'], 'BreadcrumbList');
  assert.deepEqual(trail.itemListElement.map((i) => [i.position, i.name, i.item]), [
    [1, 'หน้าแรก', SITE],
    [2, 'ผู้เขียน', `${SITE}/author`],
    [3, 'อ.เวท', `${SITE}/author/chalaivate`],
  ]);
});

test('a bio cannot close the script block', () => {
  const text = serializeJsonLd(buildWriterProfileJsonLd({ ...person, bio: '</script><b>' }, SITE));
  assert.equal(text.includes('</script'), false);
  assert.equal(JSON.parse(text).mainEntity.description, '</script><b>');
});

// ── the article side ────────────────────────────────────────────────────────

const article = {
  slug: 's',
  title: 'T',
  active: true,
  publishedAt: '2026-01-01T00:00:00.000Z',
  jsonLd: { enabled: true, overrides: {} },
};

test('an article author links to the writer page and carries the avatar', () => {
  const [author] = buildJsonLd({ ...article, writers: [person] }, SITE).author;
  assert.equal(author.url, 'https://example.test/author/chalaivate');
  assert.match(author.image, /^https:\/\/res\.cloudinary\.com\//);
});

test('an article author with no avatar has a url and no image', () => {
  const [author] = buildJsonLd({ ...article, writers: [org] }, SITE).author;
  assert.equal(author.url, 'https://example.test/author/9expert-academy');
  assert.equal('image' in author, false);
});

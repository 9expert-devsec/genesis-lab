import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCloudinaryTransform } from '@/lib/cloudinaryUrl';

/**
 * The transform goes in right after `/image/upload/`, only on this account's
 * delivery URLs, and never twice. See src/lib/cloudinaryUrl.js.
 */
const BASE = 'https://res.cloudinary.com/ddva7xvdt/image/upload/';
const ROADMAP = `${BASE}v1758786307/skills/roadmaps/gqagkziatfrqojblvrcr.png`;
const T = 'w_960,c_limit,f_auto,q_auto';

test('plain versioned URL: the transform lands between upload/ and the version', () => {
  assert.equal(
    withCloudinaryTransform(ROADMAP, T),
    `${BASE}w_960,c_limit,f_auto,q_auto/v1758786307/skills/roadmaps/gqagkziatfrqojblvrcr.png`,
  );
  // a public id with no version segment is still transformed, not mistaken for one
  assert.equal(withCloudinaryTransform(`${BASE}skills/x.png`, 'f_auto,q_auto'), `${BASE}f_auto,q_auto/skills/x.png`);
});

test('a URL that already carries a transformation is returned unchanged — no double insert', () => {
  const already = `${BASE}w_64,h_64,c_fill,f_auto,q_auto/v1/skills/icon.png`;
  assert.equal(withCloudinaryTransform(already, T), already);
  const single = `${BASE}f_auto/v1/x.png`;
  assert.equal(withCloudinaryTransform(single, T), single);
  // and applying the helper twice is the same as applying it once
  const once = withCloudinaryTransform(ROADMAP, T);
  assert.equal(withCloudinaryTransform(once, 'f_auto,q_auto'), once);
});

test('non-Cloudinary and other-cloud URLs are untouched', () => {
  for (const url of [
    '/files/catalog/skill-dev-catalog.pdf',
    'https://www.9experttraining.com/logo/ai-chatbot.webp',
    'https://res.cloudinary.com/othercloud/image/upload/v1/x.png',
    'https://res.cloudinary.com/ddva7xvdt/video/upload/v1/x.mp4',
    'http://res.cloudinary.com/ddva7xvdt/image/upload/v1/x.png',
  ]) {
    assert.equal(withCloudinaryTransform(url, T), url);
  }
});

test('null, undefined, empty and a missing transform come back as given', () => {
  assert.equal(withCloudinaryTransform(null, T), null);
  assert.equal(withCloudinaryTransform(undefined, T), undefined);
  assert.equal(withCloudinaryTransform('', T), '');
  assert.equal(withCloudinaryTransform(ROADMAP, ''), ROADMAP);
});

test('a query string survives, and the transform still goes in the path', () => {
  assert.equal(
    withCloudinaryTransform(`${ROADMAP}?_a=BAMAK+Ri0`, T),
    `${BASE}w_960,c_limit,f_auto,q_auto/v1758786307/skills/roadmaps/gqagkziatfrqojblvrcr.png?_a=BAMAK+Ri0`,
  );
});

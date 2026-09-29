import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildHomeJsonLd } from '@/lib/seo/homeJsonLd';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { siteConfig } from '@/config/site';

/**
 * Home's `@graph`.
 *
 * A pure builder, so this invokes it for real rather than scanning source. The
 * two things that cannot be invoked here — that page.jsx actually RENDERS this
 * builder, and that its `<link rel="canonical">` is built from the same value —
 * are guarded in test/fs/homeJsonLdWiring.
 *
 * ── THE CONTROL EVERY TEST HERE SHARES ─────────────────────────────────────
 * The builder takes an origin. Production passes nothing. Each test below
 * rebuilds the graph on a DIFFERENT origin and asserts the result moved with
 * it. That is what separates "the code composes URLs from one constant" from
 * "the fixture and the code happen to contain the same string" — a hardcoded
 * host would survive the swap, and surviving the swap is the failure.
 */

/** An origin nothing in src could coincidentally contain. */
const OTHER = 'https://control.example.invalid';

const nodesOf = (graph) => graph['@graph'];
const nodeOfType = (graph, type) => nodesOf(graph).find((n) => n['@type'] === type);

/** Every string value in a JSON document, at any depth. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) strings(v, out);
  }
  return out;
}

// ── 1. The WebPage url IS the canonical ─────────────────────────────────────

/**
 * `siteConfig.url` is not a second spelling standing in for the canonical — it
 * is the exact expression app/page.jsx passes to `alternates.canonical`, which
 * test/fs/homeJsonLdWiring pins. So asserting against it here asserts against
 * the tag.
 *
 * Measured on a production build (2026-09-09, NEXT_PUBLIC_SITE_URL set to the
 * live host): the emitted tag is `https://www.9experttraining.com` — no
 * trailing slash. The graph must not add one.
 */
test('the WebPage url is the value the canonical tag is built from', () => {
  const webPage = nodeOfType(buildHomeJsonLd(), 'WebPage');
  assert.equal(webPage.url, siteConfig.url);
  assert.equal(webPage.url, SITE_URL, 'SITE_URL and the canonical source must be one value');
});

test('and it carries no trailing slash the canonical does not have', () => {
  const webPage = nodeOfType(buildHomeJsonLd(), 'WebPage');
  assert.ok(
    !webPage.url.endsWith('/'),
    `the canonical has no trailing slash, so the graph must not either: ${webPage.url}`
  );
});

test('CONTROL: the url FOLLOWS the origin — it is composed, not restated', () => {
  const webPage = nodeOfType(buildHomeJsonLd(OTHER), 'WebPage');
  assert.equal(webPage.url, OTHER);
  assert.notEqual(webPage.url, siteConfig.url, 'a hardcoded url would have ignored the argument');
});

// ── 2. omit-empty: nothing hollow is ever emitted ───────────────────────────

/**
 * The three things §0.2 forbids: an empty string, a null, and a `{{placeholder}}`
 * that was never substituted. Run over the SERIALISED document, because that is
 * what a crawler reads — a key holding `undefined` disappears in JSON.stringify
 * and is not a defect, while one holding `""` survives and is.
 */
function hollowValues(graph) {
  const found = [];
  const walk = (value, path) => {
    if (value === null) found.push(`${path} is null`);
    else if (typeof value === 'string') {
      if (value === '') found.push(`${path} is an empty string`);
      if (value.includes('{{')) found.push(`${path} carries an unreplaced placeholder: ${value}`);
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };
  walk(JSON.parse(JSON.stringify(graph)), '$');
  return found;
}

test('no node carries an empty string, a null, or an unreplaced placeholder', () => {
  assert.deepEqual(hollowValues(buildHomeJsonLd()), []);
});

test('CONTROL: the detector really does see all three when they are planted', () => {
  const planted = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: '', url: '{{SITE}}/', description: null },
      { '@type': 'Place', sameAs: ['ok', ''] },
    ],
  };
  const found = hollowValues(planted);
  assert.equal(found.length, 4, `expected all four to be caught, got: ${found.join(' | ')}`);
  assert.ok(found.some((f) => f.includes('empty string')));
  assert.ok(found.some((f) => f.includes('is null')));
  assert.ok(found.some((f) => f.includes('placeholder')));
});

// ── 3. Every site URL is composed from the one origin ───────────────────────

/** Absolute URLs in the graph that claim to be on this site. */
const siteUrlsIn = (graph, origin) =>
  [...new Set(strings(graph).filter((s) => s === origin || s.startsWith(`${origin}/`)))].sort();

test('every site URL and @id in the graph is built from the origin', () => {
  const graph = buildHomeJsonLd(OTHER);
  assert.deepEqual(siteUrlsIn(graph, OTHER), [
    OTHER,
    `${OTHER}/#logo`,
    `${OTHER}/#organization`,
    `${OTHER}/#training-location`,
    `${OTHER}/#webpage`,
    `${OTHER}/#website`,
    `${OTHER}/brand/og-9expert-1200x630.png`,
    `${OTHER}/logo/9exp-stand.png`,
  ]);
});

/**
 * THE ASSERTION THIS WHOLE MODULE EXISTS FOR.
 *
 * Change the origin and NOTHING may still name the old one. A literal host left
 * behind in the builder passes every other test in this file — it would simply
 * sit there, correct-looking, emitting the production domain on a staging
 * deployment and splitting the organisation entity in two. This is the only
 * assertion that sees it.
 */
test('changing the origin moves EVERY site URL — no literal host survives', () => {
  const moved = JSON.stringify(buildHomeJsonLd(OTHER));
  assert.ok(
    !moved.includes(SITE_URL),
    'a URL still names the production origin after the origin was changed — it is hardcoded'
  );
});

test('CONTROL: the same scan DOES find the origin when it is the one in use', () => {
  const real = JSON.stringify(buildHomeJsonLd());
  assert.ok(real.includes(SITE_URL), 'the scan must be able to see the origin, or it proves nothing');
});

/**
 * The external profiles are NOT affected by the origin and must not be. Stated
 * as its own assertion so the test above cannot be "fixed" one day by stripping
 * every absolute URL out of the graph.
 */
test('external URLs are untouched by the origin swap', () => {
  const organization = nodeOfType(buildHomeJsonLd(OTHER), 'EducationalOrganization');
  assert.ok(organization.sameAs.includes(siteConfig.facebookUrl));
  assert.ok(organization.sameAs.every((u) => !u.startsWith(OTHER)));
});

// ── 4. the contact facts come from siteConfig, not from literals here ───────

/**
 * Four facts used to exist twice — once in this builder and once in the
 * /contact-us sections that display them — and all four pairs had drifted:
 *
 *   hasMap         a DIFFERENT Google Maps short link than the page's button
 *   geo            ~60m from the centre of the map the page embeds
 *   streetAddress  `อาคาร เอเวอร์กรีนเพลส` against the page's `อาคารเอเวอร์กรีน เพลส`
 *   taxID          shown on the page, absent from the graph entirely
 *
 * Ruled 2026-09-29 in favour of the page's values and moved into siteConfig.
 * These assert the graph now READS that one source; test/fs/homeJsonLdWiring
 * asserts the literals are gone from this module's source, which is the half a
 * value comparison cannot see (a literal that happens to equal the config
 * passes everything below).
 */
test('the Place hasMap and geo are siteConfig\'s map link and coordinate pair', () => {
  const place = nodeOfType(buildHomeJsonLd(), 'Place');
  assert.equal(place.hasMap, siteConfig.mapLink);
  assert.equal(place.geo.latitude, siteConfig.geo.latitude);
  assert.equal(place.geo.longitude, siteConfig.geo.longitude);
});

test('the ruled values are the ones emitted — the page\'s, not the old graph\'s', () => {
  const place = nodeOfType(buildHomeJsonLd(), 'Place');
  assert.equal(place.hasMap, 'https://maps.app.goo.gl/vKekFgf7kHkzaQwq9');
  assert.equal(place.geo.latitude, 13.75021);
  assert.equal(place.geo.longitude, 100.53042);
  assert.notEqual(place.hasMap, 'https://maps.app.goo.gl/8ny66J39HeZ2Yh678', 'the superseded link');
  assert.notEqual(place.geo.latitude, 13.750661, 'the superseded latitude');
});

test('streetAddress is siteConfig\'s one-line form, on both nodes that carry it', () => {
  const graph = buildHomeJsonLd();
  const organization = nodeOfType(graph, 'EducationalOrganization');
  const place = nodeOfType(graph, 'Place');
  assert.equal(organization.address.streetAddress, siteConfig.addressStreetTh);
  assert.equal(place.address.streetAddress, siteConfig.addressStreetTh);
  // the same object, so the two can never diverge
  assert.deepEqual(organization.address, place.address);
});

test('streetAddress carries the RULED building spelling, not the old one', () => {
  const street = nodeOfType(buildHomeJsonLd(), 'Place').address.streetAddress;
  assert.ok(street.includes('อาคารเอเวอร์กรีน เพลส'), `ruled spelling missing: ${street}`);
  assert.ok(!street.includes('อาคาร เอเวอร์กรีนเพลส'), `superseded spelling present: ${street}`);
});

test('the building name inside streetAddress is siteConfig.buildingTh', () => {
  const street = nodeOfType(buildHomeJsonLd(), 'Place').address.streetAddress;
  assert.ok(street.includes(siteConfig.buildingTh));
  // and the page's display form composes from the SAME field
  assert.ok(siteConfig.addressDisplayTh[0].includes(siteConfig.buildingTh));
});

test('the organisation carries taxID, from siteConfig', () => {
  const organization = nodeOfType(buildHomeJsonLd(), 'EducationalOrganization');
  assert.equal(organization.taxID, siteConfig.taxId);
  assert.equal(organization.taxID, '0105548019065');
});

test('the contact facts do NOT move with the origin — they are not URLs on this site', () => {
  const place = nodeOfType(buildHomeJsonLd(OTHER), 'Place');
  assert.equal(place.hasMap, siteConfig.mapLink, 'hasMap is an external link, not an origin-relative one');
  assert.equal(place.address.streetAddress, siteConfig.addressStreetTh);
  assert.equal(nodeOfType(buildHomeJsonLd(OTHER), 'EducationalOrganization').taxID, siteConfig.taxId);
});

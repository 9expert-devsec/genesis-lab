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

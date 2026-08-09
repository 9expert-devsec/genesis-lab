import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildJsonLd, validateJsonLd } from '@/lib/articles/buildJsonLd';
import { readSourceForScanning } from '../sourceScan.mjs';

// The article publish date is not shown to anyone.
//
// ── WHY THIS IS A TEST AND NOT JUST A DELETION ──────────────────────────────
// Every surface here is one line of JSX or one object key. A date is exactly
// the kind of thing that gets helpfully added back — it looks like an
// improvement, and nothing about the code says otherwise. This file is the
// thing that says otherwise.
//
// NOTE THE INVERSION: these assert ABSENCE, so each one needs a companion
// asserting the surface still renders something, or "no date" would pass for a
// component that renders nothing at all.
//
// SCOPE, because two different questions get confused: `publishedAt` is
// untouched as DATA. It orders the sitemap, the search results and the landing
// fetch, and it gates publication. What is removed is every path by which it
// reaches a HUMAN.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

const ARTICLE = {
  active: true,
  publishedAt: '2026-07-30T11:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  title: 'หัวข้อบทความ',
  excerpt: 'สรุปย่อ',
  coverUrl: 'https://res.cloudinary.com/x/y.png',
  slug: 'a-slug',
  author: 'ผู้เขียน',
  jsonLd: { enabled: true, schemaType: 'Article', overrides: {} },
};

test('JSON-LD carries no date at all', () => {
  // Google RENDERS datePublished in the search result, so leaving it here would
  // put back on the SERP exactly what was removed from the page.
  const jsonLd = buildJsonLd(ARTICLE, 'https://example.com');
  assert.ok(jsonLd, 'the builder still produces a block');
  assert.equal('datePublished' in jsonLd, false);
  assert.equal('dateModified' in jsonLd, false);
  // No date leaks under another name either.
  const serialised = JSON.stringify(jsonLd);
  assert.ok(!serialised.includes('2026-07-30'), 'the publish instant is nowhere in the output');
  assert.ok(!serialised.includes('2026-08-01'), 'nor the modified instant');
});

test('CONTROL: the rest of the JSON-LD is intact, so absence is not emptiness', () => {
  // Without this, "no datePublished" would pass for a builder that returned
  // an empty object, or null, on every article.
  const jsonLd = buildJsonLd(ARTICLE, 'https://example.com');
  for (const key of ['@context', '@type', 'headline', 'description', 'image', 'author', 'publisher', 'url']) {
    assert.ok(key in jsonLd, `${key} still emitted`);
  }
  assert.equal(jsonLd.headline, 'หัวข้อบทความ');
});

test('the completeness chip does not warn about a field we removed on purpose', () => {
  // Leaving the check in place would fire on EVERY article and train admins to
  // ignore the one chip that tells them something is genuinely missing.
  const status = validateJsonLd(buildJsonLd(ARTICLE, 'https://example.com'));
  assert.equal(status.status, 'valid', `expected a clean chip, got: ${JSON.stringify(status)}`);
  assert.ok(!status.message.includes('datePublished'));
  // …and the validator still catches something that IS missing.
  const noHeadline = validateJsonLd({ description: 'd', image: 'i' });
  assert.equal(noHeadline.status, 'warning');
  assert.ok(noHeadline.message.includes('headline'), 'it is still a live check');
});

test('no public article surface renders publishedAt', () => {
  // Comments are stripped first: each of these files explains the removal in
  // prose that names `publishedAt`, and an assertion about what a component
  // RENDERS must never be satisfiable — or falsifiable — by a comment about it.
  const SURFACES = [
    ['article detail', 'src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx', 'บทความโดย'],
    ['article list',   'src/app/(public)/articles/_components/ArticlesPageClient.jsx',          'อ่านเพิ่มเติม'],
    ['search results', 'src/app/(public)/search/_components/SearchClient.jsx',                  'article.excerpt'],
  ];
  for (const [label, file, stillThere] of SURFACES) {
    const code = src(file);
    assert.ok(
      !/article\.publishedAt/.test(code),
      `${label} still reads article.publishedAt. The date is not shown anywhere — ` +
      'see the note at the removal site. publishedAt remains valid as DATA.',
    );
    // The companion: the surface still renders. Otherwise "no date" passes for
    // a file that renders nothing.
    assert.ok(code.includes(stillThere), `${label} still renders its other content`);
  }
});

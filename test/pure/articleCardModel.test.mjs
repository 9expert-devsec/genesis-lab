import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toBlogCardModel, ARTICLE_COVER_FALLBACK } from '@/lib/articleCardModel';

/**
 * The Article → BlogCard mapping.
 *
 * ── THE POINT OF THIS FILE IS THE DRIFT GUARD AT THE BOTTOM ───────────────
 * `BlogSection` still performs this mapping inline (BlogSection.jsx:34-48).
 * That copy was deliberately left alone — the landing page is the reference in
 * this round, and editing the reference while matching against it is how you
 * end up matching your own edit. So there are two copies on purpose, and the
 * last tests here are what stop them diverging quietly.
 */

const ARTICLE = {
  _id: 'a1',
  slug: 'excel-tips',
  title: 'Excel tips',
  excerpt: 'an excerpt',
  coverUrl: 'https://www.9experttraining.com/cover.png',
  programs: ['MSE', 'POWER-BI'],
  skills: ['BUSINESS'],
};

test('a complete article maps to the shape BlogCard reads', () => {
  assert.deepEqual(toBlogCardModel(ARTICLE), {
    id: 'a1',
    programs: ['MSE', 'POWER-BI'],
    skills: ['BUSINESS'],
    title: 'Excel tips',
    excerpt: 'an excerpt',
    thumbnail: 'https://www.9experttraining.com/cover.png',
    slug: '/articles/excel-tips',
  });
});

test('the slug becomes a full href — the card hands it straight to <Link>', () => {
  assert.equal(toBlogCardModel(ARTICLE).slug, '/articles/excel-tips');
});

test('a missing cover falls back, because next/image throws on an undefined src', () => {
  for (const coverUrl of [undefined, null, '', '   ']) {
    assert.equal(
      toBlogCardModel({ ...ARTICLE, coverUrl }).thumbnail,
      ARTICLE_COVER_FALLBACK,
      `coverUrl=${JSON.stringify(coverUrl)}`
    );
  }
});

test('CONTROL: a real cover is NOT replaced — so the fallback above is about the empty case', () => {
  assert.equal(toBlogCardModel(ARTICLE).thumbnail, ARTICLE.coverUrl);
  assert.notEqual(toBlogCardModel(ARTICLE).thumbnail, ARTICLE_COVER_FALLBACK);
});

test('taxonomy is always an array, never undefined — the chips map over it', () => {
  const got = toBlogCardModel({ ...ARTICLE, programs: undefined, skills: 'nonsense' });
  assert.deepEqual(got.programs, []);
  assert.deepEqual(got.skills, []);
});

test('id falls back to the slug when _id is absent', () => {
  assert.equal(toBlogCardModel({ ...ARTICLE, _id: undefined }).id, 'excel-tips');
});

test('title and excerpt default to empty strings rather than undefined', () => {
  const got = toBlogCardModel({ slug: 's' });
  assert.equal(got.title, '');
  assert.equal(got.excerpt, '');
});

test('unusable input does not throw', () => {
  for (const input of [null, undefined, {}, 0, '']) {
    const got = toBlogCardModel(input);
    assert.equal(typeof got, 'object');
    assert.equal(got.thumbnail, ARTICLE_COVER_FALLBACK);
  }
});

test('the input article is never mutated', () => {
  const before = JSON.stringify(ARTICLE);
  toBlogCardModel(ARTICLE);
  assert.equal(JSON.stringify(ARTICLE), before);
});

// ── the drift guard ───────────────────────────────────────────────────────

const LANDING = 'src/app/_components/home/BlogSection.jsx';
const landingSource = () => readFileSync(LANDING, 'utf8');

test('BlogSection still maps inline — this guard is about a KNOWN duplicate, not a suspected one', () => {
  // If the landing section is ever converted to import this module, these
  // guards stop being meaningful and should go with the conversion. Asserting
  // the premise means they cannot quietly become no-ops.
  assert.match(landingSource(), /const blogs = articles\.map\(\(a\) => \(\{/);
});

test('both copies use the SAME fallback cover path', () => {
  assert.ok(
    landingSource().includes(ARTICLE_COVER_FALLBACK),
    'the landing copy substitutes a different stand-in — the two cards would show ' +
      'different art for the same coverless article'
  );
});

test('both copies emit the same key set', () => {
  const src = landingSource();
  const block = src.slice(src.indexOf('const blogs = articles.map'), src.indexOf('}));'));
  const landingKeys = [...block.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]).sort();
  const ourKeys = Object.keys(toBlogCardModel(ARTICLE)).sort();
  assert.deepEqual(
    landingKeys, ourKeys,
    'the two mappings produce different shapes; BlogCard reads one of them'
  );
});

test('CONTROL: the landing block really was found — an empty slice would pass the key check vacuously', () => {
  const src = landingSource();
  const block = src.slice(src.indexOf('const blogs = articles.map'), src.indexOf('}));'));
  assert.ok(block.length > 200, `slice looks empty: ${block.length} chars`);
  assert.match(block, /thumbnail:/);
});

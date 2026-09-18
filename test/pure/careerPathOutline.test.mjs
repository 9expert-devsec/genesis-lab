// The career-path outline derivation — one rule, checked from both ends.
//
// Every /files/ filename in the app comes from one alphabet (lib/files/pathKey)
// and one shape per entity. For career paths the shape is the one round OUT-RDR
// shipped ten files under, so the pins below are against REAL names that exist
// on Cloudinary today, not against a convention someone might like.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAREER_OUTLINE_CATEGORY,
  CAREER_OUTLINE_LANGS,
  CAREER_OUTLINE_PREFIX,
  careerOutlineFileName,
  careerOutlinePublicPath,
  careerOutlineSlugKey,
  careerOutlineWouldGoStale,
  isCareerOutlineLang,
  isFilesPdfPath,
} from '@/lib/career-paths/careerPathOutline';
import { LEGACY_PUBLIC_ID_PREFIX, legacyPathToPublicId } from '@/lib/legacyPublicId';

/** Nine of the ten OUT-RDR files, whose names derive from api_slug. */
const SHIPPED = [
  ['prompt-engineer-career-path', '/files/course-outline/career-prompt-engineer-course-outline-th.pdf'],
  ['business-analytics-career-path', '/files/course-outline/career-business-analytics-course-outline-th.pdf'],
  ['citizen-developer-career-path', '/files/course-outline/career-citizen-developer-course-outline-th.pdf'],
  ['rpa-developer-career-path', '/files/course-outline/career-rpa-developer-course-outline-th.pdf'],
  ['accounting-and-finance-career-path', '/files/course-outline/career-accounting-and-finance-course-outline-th.pdf'],
  ['data-analyst-career-path', '/files/course-outline/career-data-analyst-course-outline-th.pdf'],
  ['power-automate-specialist-career-path', '/files/course-outline/career-power-automate-specialist-course-outline-th.pdf'],
  ['web-developer-career-path', '/files/course-outline/career-web-developer-course-outline-th.pdf'],
  ['visual-communication-and-presentation-career-path', '/files/course-outline/career-visual-communication-and-presentation-course-outline-th.pdf'],
];

test('the category is course-outline and the prefix is career- (the OUT-RDR shape, not a new one)', () => {
  assert.equal(CAREER_OUTLINE_CATEGORY, 'course-outline');
  assert.equal(CAREER_OUTLINE_PREFIX, 'career-');
  assert.deepEqual([...CAREER_OUTLINE_LANGS], ['th', 'en']);
});

test('slug key strips the -career-path suffix once, lowercases, and validates through the shared alphabet', () => {
  assert.deepEqual(careerOutlineSlugKey('rpa-developer-career-path'), { ok: true, value: 'rpa-developer' });
  assert.deepEqual(careerOutlineSlugKey('  RPA-Developer-Career-Path '), { ok: true, value: 'rpa-developer' });
  assert.deepEqual(careerOutlineSlugKey('rpa-developer'), { ok: true, value: 'rpa-developer' }, 'no suffix is fine');
  assert.deepEqual(careerOutlineSlugKey('career-path-career-path'), { ok: true, value: 'career-path' }, 'only the trailing suffix goes');
  assert.equal(careerOutlineSlugKey('').ok, false);
  assert.equal(careerOutlineSlugKey('-career-path').ok, false, 'a bare suffix leaves nothing to name');
  assert.equal(careerOutlineSlugKey('rpa developer-career-path').ok, false, 'a space is not in the alphabet');
  assert.equal(careerOutlineSlugKey('rpa_developer-career-path').ok, false, 'an underscore is not in the alphabet');
  assert.match(careerOutlineSlugKey('bad slug').reason, /slug/, 'the refusal names the field');
});

test('nine of the ten shipped files derive exactly from their api_slug', () => {
  for (const [apiSlug, path] of SHIPPED) {
    const key = careerOutlineSlugKey(apiSlug);
    assert.ok(key.ok, apiSlug);
    assert.equal(careerOutlinePublicPath(key.value, 'th'), path);
    assert.equal(careerOutlineFileName(key.value, 'TH'), path.split('/').pop(), 'lang is case-folded');
  }
});

test('the tenth (data-engineer-bi) does NOT derive — the lib has no override, by design', () => {
  const key = careerOutlineSlugKey('data-engineer-bi-career-path');
  assert.equal(
    careerOutlinePublicPath(key.value, 'th'),
    '/files/course-outline/career-data-engineer-bi-course-outline-th.pdf',
  );
  // The OUT-RDR file lives elsewhere; only the re-point script knows that name.
  assert.notEqual(
    careerOutlinePublicPath(key.value, 'th'),
    '/files/course-outline/career-data-engineering-and-business-intelligence-course-outline-th.pdf',
  );
});

test('the derived path maps to the public_id the existing assets actually sit at', () => {
  // Verified 2026-09-18 against the Cloudinary Admin API: 10/10 raw assets at
  // exactly 9exp-genesis/legacy + path. This pins the mapping this side.
  const { publicId } = legacyPathToPublicId(SHIPPED[0][1], 'raw', LEGACY_PUBLIC_ID_PREFIX);
  assert.equal(publicId, '9exp-genesis/legacy/files/course-outline/career-prompt-engineer-course-outline-th.pdf');
});

test('isCareerOutlineLang accepts th/en in any case and nothing else', () => {
  assert.ok(isCareerOutlineLang('th') && isCareerOutlineLang('EN'));
  assert.ok(!isCareerOutlineLang('fr') && !isCareerOutlineLang('') && !isCareerOutlineLang(undefined));
});

test('isFilesPdfPath: our shape and only our shape', () => {
  for (const good of [
    '/files/course-outline/career-rpa-developer-course-outline-th.pdf',
    '/files/catalog/program-dev-catalog.pdf',
    '/files/x/y.pdf',
  ]) assert.ok(isFilesPdfPath(good), good);
  for (const bad of [
    '', 'https://9exp.link/rpa-developer-course-outline', '9exp.link/web-developer-course-outline',
    'https://res.cloudinary.com/x/raw/upload/a.pdf', '/files/a.pdf', '/files/a/b/c.pdf',
    '/files/a/../b.pdf', '/files/a/b.pdf?x=1', '/files/a/b.PDF', '/files/a/b.docx', 'files/a/b.pdf',
    '/files/a/ b.pdf', '/files//b.pdf',
  ]) assert.ok(!isFilesPdfPath(bad), `should refuse: ${JSON.stringify(bad)}`);
});

test('stale check: fires only when the slug key actually changes under a stored /files path', () => {
  const stored = '/files/course-outline/career-rpa-developer-course-outline-th.pdf';
  assert.equal(careerOutlineWouldGoStale({ previousApiSlug: 'rpa-developer-career-path', nextApiSlug: 'rpa-developer-career-path', outlineUrl: stored }), null, 'no rename');
  assert.equal(careerOutlineWouldGoStale({ previousApiSlug: 'rpa-developer-career-path', nextApiSlug: 'RPA-Developer', outlineUrl: stored }), null, 'case/suffix noise is not a rename');
  assert.equal(careerOutlineWouldGoStale({ previousApiSlug: 'rpa-developer-career-path', nextApiSlug: 'rpa-dev-career-path', outlineUrl: 'https://9exp.link/x' }), null, 'an external paste has no derived file to go stale');
  assert.equal(careerOutlineWouldGoStale({ previousApiSlug: 'rpa-developer-career-path', nextApiSlug: 'rpa-dev-career-path', outlineUrl: '' }), null, 'nothing stored, nothing stale');
  assert.equal(careerOutlineWouldGoStale({ previousApiSlug: '', nextApiSlug: 'rpa-dev-career-path', outlineUrl: stored }), null, 'a new record has no previous key');
  assert.deepEqual(
    careerOutlineWouldGoStale({ previousApiSlug: 'rpa-developer-career-path', nextApiSlug: 'rpa-dev-career-path', outlineUrl: stored }),
    { from: 'rpa-developer', to: 'rpa-dev', stored, derived: '/files/course-outline/career-rpa-dev-course-outline-th.pdf' },
  );
});

test('stale check: a stored path that never matched its slug is NOT reported without a rename (the OUT-RDR file)', () => {
  const stored = '/files/course-outline/career-data-engineering-and-business-intelligence-course-outline-th.pdf';
  assert.equal(careerOutlineWouldGoStale({ previousApiSlug: 'data-engineer-bi-career-path', nextApiSlug: 'data-engineer-bi-career-path', outlineUrl: stored }), null);
  // …but a rename of that path IS, because the stored file is named for neither key.
  assert.ok(careerOutlineWouldGoStale({ previousApiSlug: 'data-engineer-bi-career-path', nextApiSlug: 'data-eng-career-path', outlineUrl: stored }));
});

test('CONTROL: the stale check returns null when the rename lands exactly on the stored path', () => {
  // Renaming TO the slug the file was named for is not stale — the admin is fixing it.
  const stored = '/files/course-outline/career-rpa-developer-course-outline-th.pdf';
  assert.equal(careerOutlineWouldGoStale({ previousApiSlug: 'rpa-dev-career-path', nextApiSlug: 'rpa-developer-career-path', outlineUrl: stored }), null);
});

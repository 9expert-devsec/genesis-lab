import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseJsonLd } from '@/lib/courses/buildCourseJsonLd';

/**
 * THE COURSE JSON-LD CARRIES NO RATING AND NO REVIEW.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * buildCourseJsonLd emitted a hardcoded, site-wide AggregateRating — 4.9 / 5
 * with the "90K+ learners" marketing count as `ratingCount` — on every one of
 * the 77 course pages, identical on each, with no rating anywhere in visible
 * content. That is 90,000 reviews per course that do not exist, in
 * machine-readable form: a review-snippet policy violation, not a missed
 * rich result. The repo already forbade it twice (lib/schemas/pageBuilder.js
 * JSONLD_TYPES; the JSON-LD hook point in [...slug]/page.jsx); the builder
 * predated both.
 *
 * ── WHY BOTH BRANCHES ──────────────────────────────────────────────────────
 * The builder has two shapes of output: with `offers` + `hasCourseInstance`
 * (a priced course with open schedules) and without (no price, no rounds —
 * both keys come out `undefined`). The rating sat OUTSIDE that conditional,
 * so an assertion on one shape could pass while the other still carried it
 * if the key were ever re-added inside a branch. Both are asserted.
 *
 * test/fs/noAggregateRatingJsonLd is the source-level half: no file under
 * src/ constructs the key at all.
 */

const SITE = 'https://www.9experttraining.com';

const PRICED = {
  course_id: 'VIBE-CODE-L1',
  course_name: 'Build Business Apps with Claude Code',
  course_teaser: 'สร้างแอปธุรกิจด้วย Claude Code',
  course_price: 12900,
  course_cover_url: 'https://res.cloudinary.com/x/vibe.png',
};
const UNPRICED = {
  course_id: 'FREE-INTRO',
  course_name: 'Intro session',
};
const EXT = { urlAlias: '/build-business-apps-with-claude-code-training-course' };
const SCHEDULES = [
  { status: 'open', scheduleType: 'classroom', start_date: '2026-10-01', end_date: '2026-10-02' },
  { status: 'nearly_full', scheduleType: 'online', start_date: '2026-11-05', end_date: '2026-11-06' },
];

const withInstances = buildCourseJsonLd({ course: PRICED, extension: EXT, schedules: SCHEDULES, siteUrl: SITE });
const bare = buildCourseJsonLd({ course: UNPRICED, extension: null, schedules: [], siteUrl: SITE });

/** Every key at every depth of a plain object tree. */
function deepKeys(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => deepKeys(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) { out.add(k); deepKeys(v, out); }
  }
  return out;
}
/** Every `@type` value at every depth. */
function deepTypes(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => deepTypes(n, out));
  else if (node && typeof node === 'object') {
    if (typeof node['@type'] === 'string') out.add(node['@type']);
    Object.values(node).forEach((v) => deepTypes(v, out));
  }
  return out;
}

test('the fixtures exercise BOTH branches of the builder', () => {
  // With offers and instances…
  assert.equal(withInstances['@type'], 'Course');
  assert.equal(withInstances.offers?.['@type'], 'Offer');
  assert.equal(withInstances.hasCourseInstance?.length, 2);
  // …and without either. If a fixture drifted into the other branch, the
  // assertions below would be checking the same shape twice.
  assert.equal(bare['@type'], 'Course');
  assert.equal(bare.offers, undefined);
  assert.equal(bare.hasCourseInstance, undefined);
});

test('a priced course with open rounds has NO aggregateRating and NO review', () => {
  assert.equal('aggregateRating' in withInstances, false, 'aggregateRating is back');
  assert.equal('review' in withInstances, false, 'review is back');
  assert.equal(deepKeys(withInstances).has('aggregateRating'), false, 'aggregateRating nested somewhere');
  assert.equal(deepKeys(withInstances).has('review'), false, 'review nested somewhere');
  assert.equal(deepTypes(withInstances).has('AggregateRating'), false);
  assert.equal(deepTypes(withInstances).has('Review'), false);
});

test('an unpriced course with no rounds has NO aggregateRating and NO review', () => {
  assert.equal('aggregateRating' in bare, false, 'aggregateRating is back');
  assert.equal('review' in bare, false, 'review is back');
  assert.equal(deepTypes(bare).has('AggregateRating'), false);
  assert.equal(deepTypes(bare).has('Review'), false);
});

test('the rest of the document is unchanged by the removal', () => {
  // Pins the keys that DO remain, so the removal cannot have taken a
  // neighbour with it — and so a re-added rating shows up as an extra key.
  assert.deepEqual(Object.keys(withInstances).sort(), [
    '@context', '@type', 'description', 'hasCourseInstance', 'image',
    'inLanguage', 'name', 'offers', 'provider', 'url',
  ]);
  assert.deepEqual(Object.keys(bare).sort(), [
    '@context', '@type', 'description', 'hasCourseInstance', 'image',
    'inLanguage', 'name', 'offers', 'provider', 'url',
  ]);
  // JSON.stringify drops the undefined ones; that is what the page serialises.
  const serialised = JSON.parse(JSON.stringify(bare));
  assert.deepEqual(Object.keys(serialised).sort(), [
    '@context', '@type', 'description', 'inLanguage', 'name', 'provider', 'url',
  ]);
});

test('CONTROL: the deep readers DO see a rating when one is present', () => {
  // Without this, "no AggregateRating anywhere" would also be true of readers
  // that never descend into the tree.
  const poisoned = {
    ...withInstances,
    hasCourseInstance: [{ ...withInstances.hasCourseInstance[0], aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9' } }],
  };
  assert.equal(deepKeys(poisoned).has('aggregateRating'), true);
  assert.equal(deepTypes(poisoned).has('AggregateRating'), true);
});

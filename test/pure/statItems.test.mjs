import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatItems, HOME_STAT_KEYS, ABOUT_STAT_KEYS } from '@/lib/stats/statItems';

/**
 * getSiteStats() output → the ordered strip items Home and About render.
 * See src/lib/stats/statItems.js.
 */

const STATS = {
  organizations: 5000,
  setListed: 300,
  learners: 90000,
  followers: 700000,
  rating: 5.0,
  courses: 77,
  masterclasses: 2,
  asOf: '',
};

test('Home: six items in the decided order, rating carries the star', () => {
  const items = buildStatItems(STATS, HOME_STAT_KEYS);
  assert.deepEqual(items.map((i) => i.label), ['องค์กร', 'ผู้เรียน', 'รีวิว', 'ผู้ติดตาม', 'หลักสูตร', 'Masterclass']);
  const rating = items.find((i) => i.key === 'rating');
  assert.equal(rating.kind, 'rating');
  assert.equal(rating.star, true);
  assert.equal(items.filter((i) => i.star).length, 1);
});

test('About: six items, บริษัทจดทะเบียน in, no rating', () => {
  const items = buildStatItems(STATS, ABOUT_STAT_KEYS);
  assert.deepEqual(items.map((i) => i.label), ['องค์กร', 'บริษัทจดทะเบียน', 'ผู้เรียน', 'ผู้ติดตาม', 'หลักสูตร', 'Masterclass']);
  assert.equal(items.some((i) => i.key === 'rating'), false);
  assert.ok(items.every((i) => i.kind === 'count'));
});

test('a null computed count drops that one item — never rendered as 0', () => {
  const items = buildStatItems({ ...STATS, courses: null }, HOME_STAT_KEYS);
  assert.equal(items.length, 5);
  assert.equal(items.some((i) => i.key === 'courses'), false);
  assert.equal(items.find((i) => i.key === 'masterclasses').value, 2);
  assert.deepEqual(buildStatItems(undefined, HOME_STAT_KEYS), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSiteStats } from '@/lib/stats/getSiteStats';
import {
  FALLBACK_STATS,
  parseStatField,
  parseStatsInput,
  resolveStats,
} from '@/lib/stats/statsInput';

/**
 * The stats loader and the admin input validator. The loader's three sources
 * are injected; production callers pass nothing. See src/lib/stats/.
 */

const deps = (over = {}) => ({
  loadStored: async () => ({ stats: null, asOf: '' }),
  loadCourseCount: async () => 77,
  loadMasterclassCount: async () => 2,
  ...over,
});

test('a fresh AboutConfig (no stats yet) yields the pre-move literals', async () => {
  const s = await getSiteStats(deps());
  assert.deepEqual(s, {
    organizations: 5000,
    setListed: 300,
    learners: 90000,
    followers: 700000,
    rating: 5.0,
    courses: 77,
    masterclasses: 2,
    asOf: '',
  });
});

test('saved values win per field; a null field keeps its fallback', async () => {
  const s = await getSiteStats(deps({
    loadStored: async () => ({
      stats: { organizations: 5100, learners: 94000, setListed: null, followers: undefined, rating: 4.8 },
      asOf: ' ข้อมูลตั้งแต่ปี 2015 – สิงหาคม 2026 ',
    }),
  }));
  assert.equal(s.organizations, 5100);
  assert.equal(s.learners, 94000);
  assert.equal(s.rating, 4.8);
  assert.equal(s.setListed, FALLBACK_STATS.setListed);
  assert.equal(s.followers, FALLBACK_STATS.followers);
  assert.equal(s.asOf, 'ข้อมูลตั้งแต่ปี 2015 – สิงหาคม 2026');
});

test('a computed count that throws or comes back 0 is null — never shown as 0', async () => {
  const failed = await getSiteStats(deps({
    loadCourseCount: async () => { throw new Error('upstream timeout'); },
    loadMasterclassCount: async () => 0,
  }));
  assert.equal(failed.courses, null);
  assert.equal(failed.masterclasses, null);
  // and the typed values are unaffected
  assert.equal(failed.organizations, 5000);
});

test('a config read that throws falls back to the literals instead of failing the page', async () => {
  const s = await getSiteStats(deps({ loadStored: async () => { throw new Error('db down'); } }));
  assert.equal(s.learners, 90000);
  assert.equal(s.courses, 77);
});

test('resolveStats rejects negatives and non-numbers in stored data', () => {
  const r = resolveStats({ organizations: -1, learners: '94000', followers: NaN });
  assert.equal(r.organizations, FALLBACK_STATS.organizations);
  assert.equal(r.learners, FALLBACK_STATS.learners);
  assert.equal(r.followers, FALLBACK_STATS.followers);
});

test('count fields: empty is "not set"; integers and thousands separators are accepted', () => {
  assert.deepEqual(parseStatField('count', ''), { value: null });
  assert.deepEqual(parseStatField('count', '   '), { value: null });
  assert.deepEqual(parseStatField('count', '94000'), { value: 94000 });
  assert.deepEqual(parseStatField('count', '94,000'), { value: 94000 });
  assert.deepEqual(parseStatField('count', '0'), { value: 0 });
});

test('count fields: decimals, negatives and text are rejected', () => {
  for (const bad of ['-5', '1.5', 'abc', '5K', '1e3']) {
    const r = parseStatField('count', bad);
    assert.equal(r.value, null, bad);
    assert.ok(r.error, `${bad} should carry an error`);
  }
});

test('rating: 0–5 with at most one decimal', () => {
  assert.deepEqual(parseStatField('rating', '5'), { value: 5 });
  assert.deepEqual(parseStatField('rating', '4.8'), { value: 4.8 });
  assert.deepEqual(parseStatField('rating', '0'), { value: 0 });
  for (const bad of ['5.1', '6', '4.85', '-1', 'x']) {
    assert.ok(parseStatField('rating', bad).error, bad);
  }
});

test('parseStatsInput reports every bad field and keeps the good ones', () => {
  const r = parseStatsInput({ organizations: '5,000', learners: 'many', rating: '9', followers: '' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['learners', 'rating']);
  assert.equal(r.stats.organizations, 5000);
  assert.equal(r.stats.followers, null);
  assert.equal(r.stats.setListed, null);
  assert.equal(parseStatsInput({}).ok, true);
  assert.equal(parseStatsInput(undefined).ok, true);
});

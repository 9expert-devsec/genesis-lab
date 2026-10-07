import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import * as dateRange from '@/lib/admin/dateRange';
import * as consentRange from '@/lib/consentStatsRange';

test('ArticleView declares a { day: 1 } index beside the unique compound one', () => {
  const { code } = readSource('src/models/ArticleView.js');
  assert.match(code, /ArticleViewSchema\.index\(\{ articleId: 1, day: 1 \}, \{ unique: true \}\);/);
  assert.match(code, /ArticleViewSchema\.index\(\{ day: 1 \}\);/);
});

test('the article-views reads are read-only', () => {
  const { code } = readSource('src/lib/articleViews/queries.js');
  assert.doesNotMatch(
    code,
    /\.(create|insertMany|updateOne|updateMany|findOneAndUpdate|replaceOne|deleteOne|deleteMany|bulkWrite|save|createIndex|createIndexes|syncIndexes)\(/,
  );
  assert.doesNotMatch(code, /\$(merge|out)\b/, 'no writing aggregation stage');
});

test('collection start is queried as the earliest day, never hardcoded', () => {
  const { code } = readSource('src/lib/articleViews/queries.js');
  assert.match(code, /ArticleView\.findOne\(\{\}, \{ day: 1, _id: 0 \}\)\.sort\(\{ day: 1 \}\)/);
  assert.doesNotMatch(readSource('src/lib/articleViews/dashboard.js').code, /'20\d\d-\d\d-\d\d'/);
});

test('consent-stats uses the shared date range module, unchanged in behaviour', () => {
  assert.equal(consentRange.parseConsentStatsRange, dateRange.parseDateRange);
  for (const k of ['RANGE_PRESETS', 'DEFAULT_RANGE', 'MAX_RANGE_DAYS', 'addDays', 'daySpan', 'parseIsoDate', 'rangeLabel', 'weekStart']) {
    assert.equal(consentRange[k], dateRange[k], k);
  }
  const { code } = readSource('src/lib/consentStatsRange.js');
  assert.doesNotMatch(code, /function parseIsoDate|function addDays/, 'no second copy');
});

test('eachDay is inclusive and ordered', () => {
  assert.deepEqual(dateRange.eachDay('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.deepEqual(dateRange.eachDay('2026-10-02', '2026-10-01'), []);
});

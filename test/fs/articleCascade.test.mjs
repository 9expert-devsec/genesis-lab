import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scrubSource } from '../sourceScan.mjs';

import { ARTICLE_SORT } from '@/lib/articleRank';
import { ARTICLE_ORDER_INDEX } from '@/models/Article';

/**
 * THE SEAM: the sort Mongo runs, the comparator the admin list runs, and the
 * index that decides whether the sort is free.
 *
 * src/lib/articleRank.js has warned about this in prose since it was written —
 * "THESE TWO MUST MOVE TOGETHER … there is no mechanism that makes them agree".
 * There is now a mechanism for the half that can have one: the cascade is a
 * single exported object, and the reader imports it instead of spelling it out.
 * The comparator still has to be hand-written (a rank must be computable without
 * a database), and the pure tier pins its behaviour.
 *
 * What this file adds is the third party nobody was watching. A cascade change
 * that leaves ARTICLE_ORDER_INDEX behind does not fail, does not warn, and does
 * not look wrong in review — it just drops the query to a COLLSCAN plus a
 * blocking in-memory sort, and the page degrades as the collection grows until
 * the 32 MB sort limit turns it into an outage. Measured against a copy of the
 * real 486 documents: with a matching index the plan is
 * LIMIT <- PROJECTION_SIMPLE <- FETCH <- IXSCAN; with the direction wrong it is
 * PROJECTION_SIMPLE <- SORT <- COLLSCAN.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ACTIONS_REL = 'src/lib/actions/articles.js';
const actions = scrubSource(readFileSync(path.join(ROOT, ACTIONS_REL), 'utf8'), { stripImports: false });

test('C2-a — getArticles sorts by the shared cascade object, not by a literal', () => {
  assert.match(
    actions, /\.sort\(ARTICLE_SORT\)/,
    `[${ACTIONS_REL}] getArticles must call .sort(ARTICLE_SORT). A literal here is a ` +
    'second copy of the cascade, and the copy in src/lib/articleRank.js is the one ' +
    'the admin rank column uses — when they drift, the number in the column stops ' +
    'being the position on the page and nothing errors.',
  );
  assert.match(
    actions, /import\s*\{[^}]*\bARTICLE_SORT\b[^}]*\}\s*from\s*'@\/lib\/articleRank'/,
    'and it must come from the pure module that owns it',
  );
});

test('C2-a2 — no cascade literal survives anywhere in the reader', () => {
  // The import alone does not stop someone adding a second `.sort({...})` to a
  // new query. Any sort object in this file naming two or more cascade keys is
  // a copy by definition.
  const literals = [...actions.matchAll(/\.sort\(\s*\{([^}]*)\}\s*\)/g)].map((m) => m[1]);
  const offenders = literals.filter(
    (body) => ['isPinnedOnArticlePage', 'pinOrder', 'sortKey'].filter((k) => body.includes(k)).length >= 2
  );
  assert.deepEqual(
    offenders, [],
    `[${ACTIONS_REL}] a literal ordering cascade is spelled out here:\n` +
    offenders.map((o) => `    .sort({${o}})`).join('\n') +
    '\n\nUse ARTICLE_SORT.',
  );
});

test('C2-a3 — the index covers the cascade, key for key and sign for sign', () => {
  assert.deepEqual(
    ARTICLE_ORDER_INDEX, ARTICLE_SORT,
    'the index and the cascade have drifted. An index serves a sort only in its own ' +
    'direction or its exact reverse, so this is not a style question: the query ' +
    'silently stops using the index and starts sorting the whole collection in memory.',
  );
  assert.deepEqual(Object.keys(ARTICLE_ORDER_INDEX), Object.keys(ARTICLE_SORT), 'key order too');
});

test('CONTROL: the literal-detector fires on a real cascade literal and not on a single-key sort', () => {
  // Without this, C2-a2 passes because the regex matches nothing at all — which
  // is also what it does if `.sort(` is ever written differently.
  const detect = (src) =>
    [...src.matchAll(/\.sort\(\s*\{([^}]*)\}\s*\)/g)]
      .map((m) => m[1])
      .filter((b) => ['isPinnedOnArticlePage', 'pinOrder', 'sortKey'].filter((k) => b.includes(k)).length >= 2);

  assert.equal(
    detect('.sort({ isPinnedOnArticlePage: -1, pinOrder: 1, sortKey: -1 })').length, 1,
    'a full cascade literal must be caught',
  );
  assert.equal(
    detect('.sort({ isPinnedOnArticlePage: -1, pinOrder: 1 })').length, 1,
    'so must a partial one — a prefix of the cascade is still a second source of truth',
  );
  assert.equal(
    detect('.sort({ publishedAt: -1, createdAt: -1 })').length, 0,
    'getFeaturedArticlesForLanding sorts by date and is NOT the ordering cascade — ' +
    'flagging it would put an unrelated query on an exception list',
  );
  assert.equal(detect('.sort({ pinOrder: 1 })').length, 0, 'a single key is a filtered block read, not the cascade');

  // and the file really was read
  assert.ok(actions.length > 2000, `[${ACTIONS_REL}] scrubbed to ${actions.length} chars`);
  assert.ok(actions.includes('getArticles'), 'the reader is in the scanned source');
});

test('CONTROL: the cascade really is three keys, in the order the index assumes', () => {
  // Both deepEqual assertions above pass if ARTICLE_SORT were somehow empty.
  assert.deepEqual(
    Object.entries(ARTICLE_SORT),
    [['isPinnedOnArticlePage', -1], ['pinOrder', 1], ['sortKey', -1]],
    'stated literally exactly once, here, so that a change to the cascade has to be ' +
    'a deliberate edit to a test rather than something that quietly agrees with itself',
  );
});

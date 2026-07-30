import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  ADMIN_LIST_FIELDS,
  PUBLIC_LIST_FIELDS,
  toFieldList,
  toSelectString,
} from '@/lib/articleListFields';
import Article from '@/models/Article';

/**
 * A projection is a contract between a query and the component that renders its
 * result, and it is the kind that fails SILENTLY. Ask Mongo for `pinOrder` and
 * spell it `pinorder`, and Mongo does not complain — it returns documents
 * without the field, `a.pinOrder` reads `undefined`, and the number input in
 * the position cell renders `0`. Leave `isPinnedOnArticlePage` out entirely and
 * `shouldShowPinBadge` goes false for every row and the pin badges vanish.
 * Nothing errors, nothing warns, nothing logs. The page just quietly means
 * something different.
 *
 * So there are two independent guards here, and BOTH are needed:
 *
 *   1. every name in the projection EXISTS on the real Mongoose schema
 *      → catches a typo, and a field renamed in the model
 *   2. every field the client READS is in the projection
 *      → catches a column added to the table without widening the projection
 *
 * Guard 1 alone passes a projection of `_id` and nothing else. Guard 2 alone
 * passes a projection full of misspellings. Neither is the other's control.
 *
 * Both derive their expectation from the REAL source — the model's schema paths
 * and a scan of the client — rather than from a list transcribed into this
 * file, because a transcribed list drifts the moment someone adds a column and
 * updates neither.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const ADMIN_CLIENT_REL = 'src/app/admin/articles/_components/ArticlesAdminClient.jsx';
const RANK_REL = 'src/lib/articleRank.js';
const POSITIONING_REL = 'src/lib/articlePositioning.js';

/** Field names the real model declares, top level only. */
const SCHEMA_PATHS = new Set(
  Object.keys(Article.schema.paths).filter((p) => !p.includes('.'))
);

const ADMIN = toFieldList(ADMIN_LIST_FIELDS);
const PUBLIC = toFieldList(PUBLIC_LIST_FIELDS);

/**
 * Property reads off an article-shaped identifier, from real source.
 *
 * The admin client names its rows `a` (map callbacks, mutation handlers) and
 * `r` (setRows updaters); PositionCell/RankCell name theirs `article`; the two
 * pure helpers use `a?.` / `article?.`. All four are scanned, with the optional
 * chain, or the helpers' reads would go uncounted — and they are the ones
 * nobody thinks about when adding a projection.
 */
function fieldReads(src) {
  const names = new Set();
  for (const m of src.matchAll(/\b(?:a|r|article)\??\.([A-Za-z_]\w*)/g)) names.add(m[1]);
  return names;
}

/**
 * Names the scan finds that are NOT stored fields. Every entry needs a reason —
 * an unexplained exclusion is how this guard gets muted one field at a time.
 */
const NOT_STORED = new Map([
  ['rank',      'computed by assignArticleRanks from the cascade; not a column'],
  ['rankBasis', 'computed by assignArticleRanks; "pinned" | "date" | null'],
  ['pinTie',    'computed by assignArticleRanks; two pinned rows sharing a pinOrder'],
]);

// ── guard 1: the names are real ──────────────────────────────────────────────

test('every field in ADMIN_LIST_FIELDS exists on the real Article schema', () => {
  const unknown = ADMIN.filter((f) => !SCHEMA_PATHS.has(f));
  assert.deepEqual(
    unknown, [],
    `These projection fields are not declared on ArticleSchema:\n\n` +
    unknown.map((f) => `  ${f}`).join('\n') +
    `\n\nMongo does not error on an unknown projection field — it returns ` +
    `documents without it, the client reads undefined, and the cell renders ` +
    `blank. Nothing in the toolchain catches this.\n\n` +
    `Schema declares: ${[...SCHEMA_PATHS].sort().join(', ')}`,
  );
});

test('every field in PUBLIC_LIST_FIELDS exists on the real Article schema', () => {
  const unknown = PUBLIC.filter((f) => !SCHEMA_PATHS.has(f));
  assert.deepEqual(unknown, [], `not declared on ArticleSchema: ${unknown.join(', ')}`);
});

test('CONTROL: the schema check rejects a bogus field name', () => {
  // Without this, the assertions above would also pass for an EMPTY projection,
  // or if SCHEMA_PATHS were somehow every string in the universe. Show the same
  // membership test says no to something that is definitely not a column.
  assert.equal(SCHEMA_PATHS.has('pinorder'), false, 'a lowercase typo of pinOrder');
  assert.equal(SCHEMA_PATHS.has('totallyNotAField'), false);
  const bogus = toFieldList(`${ADMIN_LIST_FIELDS} pinorder`);
  const unknown = bogus.filter((f) => !SCHEMA_PATHS.has(f));
  assert.deepEqual(
    unknown, ['pinorder'],
    'the same filter that passes ADMIN_LIST_FIELDS must reject a typo — otherwise ' +
    'it is matching an empty intersection and proving nothing',
  );
});

test('CONTROL: SCHEMA_PATHS was actually populated from the model', () => {
  // An import that resolved to a stub, or a Mongoose version that moved
  // `.schema.paths`, would give an empty set and make guard 1 vacuous.
  assert.ok(SCHEMA_PATHS.size > 15, `only found ${SCHEMA_PATHS.size} schema paths`);
  for (const known of ['slug', 'title', 'content', 'publishedAt', 'pinOrder', 'createdAt']) {
    assert.ok(SCHEMA_PATHS.has(known), `schema path '${known}' missing — the model did not load`);
  }
});

// ── guard 2: the projection covers what the client reads ─────────────────────

test('ADMIN_LIST_FIELDS covers every field the admin list actually reads', () => {
  const reads = new Set([
    ...fieldReads(read(ADMIN_CLIENT_REL)),
    ...fieldReads(read(RANK_REL)),
    ...fieldReads(read(POSITIONING_REL)),
  ]);
  assert.ok(reads.size > 10, `only found ${reads.size} field reads — the scanner is not scanning`);

  const required = [...reads].filter((f) => SCHEMA_PATHS.has(f) && !NOT_STORED.has(f));
  const missing = required.filter((f) => !ADMIN.includes(f));

  assert.deepEqual(
    missing, [],
    `The admin list reads these fields, but the projection in ` +
    `src/lib/articleListFields.js does not request them:\n\n` +
    missing.map((f) => `  ${f}`).join('\n') +
    `\n\nEach one will read back as undefined: a blank cell, an unlit toggle, ` +
    `or a missing pin badge — with no error anywhere. Add them to ` +
    `ADMIN_LIST_FIELDS, or if the value is computed rather than stored, add it ` +
    `to NOT_STORED in this file WITH a reason.`,
  );
});

test('CONTROL: dropping a field from ADMIN_LIST_FIELDS reddens exactly the coverage check', () => {
  // The coverage assertion above would pass for ANY superset, including a
  // projection of the whole document. Prove it is sensitive in the other
  // direction: remove one field the client demonstrably reads and the same
  // computation must report it.
  const reads = new Set([
    ...fieldReads(read(ADMIN_CLIENT_REL)),
    ...fieldReads(read(RANK_REL)),
    ...fieldReads(read(POSITIONING_REL)),
  ]);
  const required = [...reads].filter((f) => SCHEMA_PATHS.has(f) && !NOT_STORED.has(f));

  const crippled = ADMIN.filter((f) => f !== 'pinOrder');
  const missing = required.filter((f) => !crippled.includes(f));
  assert.deepEqual(
    missing, ['pinOrder'],
    'removing pinOrder must be detected — if this comes back empty the coverage ' +
    'check is not comparing against the real read set',
  );
});

test('the computed rank fields are NOT in the projection (asking Mongo for them is a no-op)', () => {
  for (const computed of NOT_STORED.keys()) {
    assert.equal(
      ADMIN.includes(computed), false,
      `${computed} is produced by assignArticleRanks, not stored — projecting it ` +
      'would suggest the value comes from the database, which is how the rank ' +
      'column would end up silently empty if the ranker were ever skipped',
    );
    assert.equal(SCHEMA_PATHS.has(computed), false, `${computed} must not be a schema path either`);
  }
});

// ── the public set: knowingly short, pinned so nobody wires it blind ──────────

test('PUBLIC_LIST_FIELDS is NOT sufficient for /articles — do not wire it without the badge fields', () => {
  // FOUND WHILE IMPLEMENTING, and the reason the public list still reads whole
  // documents: ArticlesPageClient calls shouldShowPinBadge(article), which reads
  // isPinnedOnArticlePage and showPinBadge. Neither is in this projection.
  // Applying it to /articles would make `isPinnedOnArticlePage === true` false
  // for every row and delete the pin badge from the entire public list — the
  // exact silent-drop shape this commit exists to stop. This test states the gap
  // so it is discovered here rather than in production.
  const publicClient = read('src/app/(public)/articles/_components/ArticlesPageClient.jsx');
  assert.match(
    publicClient, /shouldShowPinBadge\(article\)/,
    'if the public list no longer calls shouldShowPinBadge, re-evaluate this test ' +
    'and PUBLIC_LIST_FIELDS together',
  );
  for (const needed of ['isPinnedOnArticlePage', 'showPinBadge']) {
    assert.equal(
      PUBLIC.includes(needed), false,
      `PUBLIC_LIST_FIELDS now contains ${needed}. If that was deliberate, wire it ` +
      'into src/app/(public)/articles/page.jsx and rewrite this test to assert ' +
      'sufficiency instead of the gap.',
    );
  }
  // …and the gap is only harmless while nothing uses it.
  const publicPage = read('src/app/(public)/articles/page.jsx');
  assert.equal(
    /PUBLIC_LIST_FIELDS/.test(publicPage), false,
    'the public list now projects PUBLIC_LIST_FIELDS, which is missing the two ' +
    'fields shouldShowPinBadge needs — every pin badge on /articles is gone',
  );
});

// ── the normaliser ───────────────────────────────────────────────────────────

test('toSelectString accepts a string or an array and normalises whitespace', () => {
  assert.equal(toSelectString('a b  c'), 'a b c');
  assert.equal(toSelectString(['a', 'b', 'c']), 'a b c');
  assert.equal(toSelectString('  a \n b '), 'a b');
  assert.equal(toSelectString(['a', '', null, 'b']), 'a b');
});

test('toSelectString returns empty for empty input, so getArticles keeps its no-projection default', () => {
  for (const empty of ['', '   ', [], null, undefined]) {
    assert.equal(
      toSelectString(empty), '',
      `toSelectString(${JSON.stringify(empty)}) must be falsy — getArticles gates ` +
      '`.select()` on it, and a truthy empty string would project nothing at all, ' +
      'returning documents with only _id',
    );
  }
});

test('getArticles gates .select() on a non-empty projection and never projects the count', () => {
  // Pinned at the source: the reader is a 'use server' module and cannot be
  // imported here. Two properties matter and neither is visible from the
  // signature — that `.select()` is conditional (so existing callers keep whole
  // documents), and that countDocuments runs on the unprojected filter (so
  // `total` still describes the whole matching set, which is what the
  // truncation banner compares against).
  const actions = read('src/lib/actions/articles.js');
  assert.match(actions, /const projection = toSelectString\(select\);/);
  assert.match(actions, /if \(projection\) query\.select\(projection\);/);
  assert.match(
    actions, /Article\.countDocuments\(filter\)/,
    'countDocuments must keep running against `filter` alone',
  );
});

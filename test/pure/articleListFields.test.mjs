import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
const exists = (rel) => existsSync(path.join(ROOT, rel));

const ADMIN_CLIENT_REL = 'src/app/admin/articles/_components/ArticlesAdminClient.jsx';

/**
 * Every `@/lib/*` module the admin list can reach, transitively.
 *
 * ── WHY THIS IS A WALK AND NOT A LIST ───────────────────────────────────────
 * It used to be three hand-written paths: the client, articleRank and
 * articlePositioning. That list was correct when it was written and had no way
 * to stay correct, and this file already records what a hand-derived read-set
 * costs — PUBLIC_LIST_FIELDS was built from direct `article.X` reads and missed
 * the two fields `shouldShowPinBadge()` consumes, which would have deleted every
 * pin badge from /articles.
 *
 * That is the same defect one level up: a field can reach the projection's
 * obligation through an IMPORT rather than through a property read in the
 * component. Round 2 made it concrete — the client now calls
 * `describeOrderControls`, which lives in a module the hand-list did not name
 * and which reads `sortKey`, `pinOrder` and `isPinnedOnArticlePage` on the
 * caller's behalf. So the guard follows the imports instead of being told about
 * them, and a new helper joins the read-set the moment it is imported.
 */
function reachableLibModules(entry) {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const src = read(queue.shift());
    for (const m of src.matchAll(/from\s+'(@\/lib\/[^']+)'/g)) {
      const rel = `src/lib/${m[1].slice('@/lib/'.length)}.js`;
      if (!seen.has(rel) && exists(rel)) {
        seen.add(rel);
        queue.push(rel);
      }
    }
  }
  return [...seen];
}

const REACHED = reachableLibModules(ADMIN_CLIENT_REL);

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
 * `r` (setRows updaters); OrderCell/RankCell name theirs `article`; the pure
 * helpers use `a?.` / `article?.`. All are scanned, with the optional chain, or
 * the helpers' reads would go uncounted — and they are the ones nobody thinks
 * about when adding a projection.
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
  const reads = new Set(REACHED.flatMap((rel) => [...fieldReads(read(rel))]));
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

test('P5-b — CONTROL: the import walk is LIVE and reaches the helpers, not just the component', () => {
  // The upgrade from a three-file list to a walk is worth nothing if the walk
  // returns the entry file and stops. These are the modules that read article
  // fields ON THE CLIENT'S BEHALF — the exact shape the old hand-list missed.
  assert.ok(REACHED.length > 4, `the walk reached only ${REACHED.length} files`);
  for (const rel of [
    'src/lib/articleRank.js',        // the comparator: sortKey, pinOrder, publishedAt, createdAt
    'src/lib/articlePositioning.js', // isPositioned / shouldShowPinBadge
    'src/lib/articleOrdering.js',    // describeOrderControls — imported in round 2
    'src/lib/articleSortKey.js',     // reached only THROUGH articleOrdering, i.e. transitively
  ]) {
    assert.ok(
      REACHED.includes(rel),
      `${rel} is reachable from the admin client but the walk did not find it. ` +
      'Every field it reads is a field the projection silently owes.',
    );
  }
  assert.equal(REACHED[0], ADMIN_CLIENT_REL, 'the entry point is included, not just its imports');
});

test('P5-c — CONTROL: a field read ONLY through an import is genuinely required', () => {
  // This is the property the walk exists for, stated so it cannot quietly become
  // vacuous. `sortKey` appears nowhere in ArticlesAdminClient.jsx as a property
  // read — the client never writes `a.sortKey`. It reaches the projection's
  // obligation purely because describeOrderControls and the comparator read it,
  // which is precisely the route the old three-file list could not see.
  const clientOnly = fieldReads(read(ADMIN_CLIENT_REL));
  assert.equal(
    clientOnly.has('sortKey'), false,
    'if the client starts reading sortKey directly, pick another field for this ' +
    'control — it has to be one that is ONLY visible through an import',
  );

  const viaImports = new Set(REACHED.flatMap((rel) => [...fieldReads(read(rel))]));
  assert.equal(viaImports.has('sortKey'), true, 'but the walk sees it');
  assert.ok(
    ADMIN.includes('sortKey'),
    'and it is therefore in the projection. Without it, assignArticleRanks would ' +
    'run in the browser against `sortKey: undefined` for all 486 rows, every rank ' +
    'would fall through to the date tiers, and the admin column would disagree ' +
    'with /articles for every row anyone had reordered — silently.',
  );
});

test('CONTROL: dropping a field from ADMIN_LIST_FIELDS reddens exactly the coverage check', () => {
  // The coverage assertion above would pass for ANY superset, including a
  // projection of the whole document. Prove it is sensitive in the other
  // direction: remove one field the client demonstrably reads and the same
  // computation must report it.
  const reads = new Set(REACHED.flatMap((rel) => [...fieldReads(read(rel))]));
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
  // documents: the public ArticleCard calls shouldShowPinBadge(article), which reads
  // isPinnedOnArticlePage and showPinBadge. Neither is in this projection.
  // Applying it to /articles would make `isPinnedOnArticlePage === true` false
  // for every row and delete the pin badge from the entire public list — the
  // exact silent-drop shape this commit exists to stop. This test states the gap
  // so it is discovered here rather than in production.
  const publicClient = read('src/components/articles/ArticleCard.jsx');
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

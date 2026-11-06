import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import {
  ARTICLE_AUTHOR_TO_WRITER,
  BLANK_AUTHOR_LABEL,
  MIGRATION_WRITER_SLUGS,
  planArticleWriterMigration,
  writerSlugForAuthor,
} from '@/lib/writers/articleWriterMigration';

const ACADEMY_ID = 'academy-id';
const VATE_ID = 'vate-id';
const ids = new Map([['9expert-academy', ACADEMY_ID], ['chalaivate', VATE_ID]]);

const TABLE = [
  ['9Expert Team', '9expert-academy'],
  ['9Expert-Team', '9expert-academy'],
  ['9Expert Academy', '9expert-academy'],
  ['9Expert Academic', '9expert-academy'],
  ['9Expert Training', '9expert-academy'],
  ['9Expert News', '9expert-academy'],
  ['ชไลเวท พิพัฒพรรณวงศ์ (อ.เวท)', 'chalaivate'],
];

for (const [author, slug] of TABLE) {
  test(`mapping: ${author} → ${slug}`, () => {
    assert.equal(writerSlugForAuthor(author), slug);
  });
}

test('mapping: the table has those rows and no others', () => {
  assert.equal(ARTICLE_AUTHOR_TO_WRITER.size, TABLE.length);
});

test('mapping: empty and missing go to the default writer', () => {
  for (const blank of ['', '   ', null, undefined]) {
    assert.equal(writerSlugForAuthor(blank), '9expert-academy', String(blank));
  }
});

test('mapping: anything else is unknown, even a near miss', () => {
  for (const value of ['Somebody', '9expert team', '9Expert Team ', 'อ.เวท', 'constructor']) {
    assert.equal(writerSlugForAuthor(value), null, value);
  }
});

test('the script needs exactly the two writers', () => {
  assert.deepEqual([...MIGRATION_WRITER_SLUGS].sort(), ['9expert-academy', 'chalaivate']);
});

test('plan: each article gets its writer', () => {
  const plan = planArticleWriterMigration([
    { _id: 1, author: '9Expert Team', active: true },
    { _id: 2, author: TABLE[6][0], active: true },
    { _id: 3, author: '', active: true },
  ], ids);
  assert.deepEqual(plan.writes, [
    { _id: 1, writerId: ACADEMY_ID },
    { _id: 2, writerId: VATE_ID },
    { _id: 3, writerId: ACADEMY_ID },
  ]);
});

test('plan: an already-set article is skipped, and nothing is ever overwritten', () => {
  const plan = planArticleWriterMigration([
    { _id: 1, author: '9Expert Team', writerIds: ['someone'] },
  ], ids);
  assert.deepEqual(plan.writes, []);
  assert.equal(plan.alreadySet, 1);
});

test('plan: an empty or absent writerIds is a target', () => {
  const plan = planArticleWriterMigration([
    { _id: 1, author: '9Expert Team', writerIds: [] },
    { _id: 2, author: '9Expert Team' },
    { _id: 3, author: '9Expert Team', writerIds: null },
  ], ids);
  assert.equal(plan.writes.length, 3);
});

test('plan: an unknown value is reported with its ids and not written', () => {
  const plan = planArticleWriterMigration([
    { _id: 1, author: 'Somebody' },
    { _id: 2, author: 'Somebody' },
    { _id: 3, author: 'Else' },
  ], ids);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.unmapped, [
    { author: 'Somebody', ids: [1, 2] },
    { author: 'Else', ids: [3] },
  ]);
});

test('plan: counts split active from inactive, per mapping', () => {
  const plan = planArticleWriterMigration([
    { _id: 1, author: '9Expert Team', active: true },
    { _id: 2, author: '9Expert Team', active: false },
    { _id: 3, author: '9Expert Team' },
    { _id: 4 },
  ], ids);
  assert.deepEqual(plan.mapped, [
    { author: '9Expert Team', slug: '9expert-academy', active: 2, inactive: 1 },
    { author: BLANK_AUTHOR_LABEL, slug: '9expert-academy', active: 1, inactive: 0 },
  ]);
});

// ── the script, as text: importing it would run it ──────────────────────────

const script = readSource('scripts/migrate-article-writers.mjs').code;

test('the script defaults to a dry run: the only write sits behind APPLY', () => {
  assert.equal((script.match(/\.(?:updateOne|updateMany|insertOne|insertMany|bulkWrite|deleteOne|deleteMany|replaceOne)\(/g) ?? []).length, 1);
  assert.ok(script.indexOf('if (APPLY) {') < script.indexOf('.updateOne('), 'the write is inside the --apply branch');
  assert.ok(script.indexOf('if (APPLY) {') !== -1);
});

test('the script sets writerIds and nothing else', () => {
  assert.match(script, /\{ \$set: \{ writerIds: \[writerId\] \} \}/);
  assert.equal(/updatedAt|contentUpdatedAt/.test(script), false);
});

test('the script loads no model, so it cannot build an index', () => {
  // `withImports`: `.code` has its import lines removed, which would pass anything.
  const { withImports } = readSource('scripts/migrate-article-writers.mjs');
  assert.match(withImports, /from 'mongoose'/, 'the scan can see an import');
  assert.equal(/models\//.test(withImports), false);
});

test('the script aborts on a missing or inactive writer', () => {
  assert.match(script, /!writer \|\| writer\.isActive === false/);
});

test('the script re-reads and verifies after applying', () => {
  assert.match(script, /countDocuments\(\{ 'writerIds\.0': \{ \$exists: true \} \}\)/);
});

test('the footer is the agreed sentence', () => {
  assert.match(script, /article pages cache for 1 hour — bylines update as pages revalidate, or redeploy/);
});

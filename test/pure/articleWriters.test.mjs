import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { parseArticleFormData } from '@/lib/articleFormPayload';
import { articleSchema, articleUpdateSchema } from '@/lib/schemas/article';
import {
  INVALID_WRITER_ID_MESSAGE,
  NO_WRITER_MESSAGE,
  articleAuthorLabel,
  collectWriterIds,
  dedupeIds,
  initialArticleWriters,
  joinWriterNames,
  orderWriters,
  planArticleWriters,
  searchableWriters,
} from '@/lib/writers/articleWriters';
import { castWriterIds } from '@/lib/writers/castWriterIds';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);

const base = { slug: 's', title: 'T', content: '<p>c</p>' };

const academy = { _id: A, displayName: '9Expert Academy', isActive: true, isDefault: true };
const vate = { _id: B, displayName: 'อ.เวท', isActive: true };
const off = { _id: C, displayName: 'ปิดแล้ว', isActive: false };

// ── the schema ──────────────────────────────────────────────────────────────

test('update requires writerIds: missing and empty both fail with the Thai message', () => {
  for (const input of [base, { ...base, writerIds: [] }]) {
    const parsed = articleUpdateSchema.safeParse(input);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error.issues[0].message, NO_WRITER_MESSAGE);
  }
});

test('create may arrive with none: the action then takes the default writer', () => {
  assert.deepEqual(articleSchema.parse(base).writerIds, []);
});

test('both schemas reject an id that is not 24 hex characters', () => {
  for (const schema of [articleSchema, articleUpdateSchema]) {
    for (const bad of ['abc', 'g'.repeat(24), '123456789012', `${A}0`]) {
      assert.equal(schema.safeParse({ ...base, writerIds: [A, bad] }).success, false, bad);
    }
  }
});

test('the order survives the schema', () => {
  assert.deepEqual(articleUpdateSchema.parse({ ...base, writerIds: [B, A] }).writerIds, [B, A]);
});

test('writerIds gets through all layers: the zod strip trap', () => {
  const fd = new FormData();
  fd.set('slug', 's');
  fd.set('title', 'T');
  fd.set('content', '<p>c</p>');
  fd.set('jsonLd', '{}');
  fd.set('writerIds', JSON.stringify([B, A]));
  assert.deepEqual(articleUpdateSchema.parse(parseArticleFormData(fd)).writerIds, [B, A]);
});

test('a client-supplied author does not get past the schema', () => {
  assert.equal('author' in articleSchema.parse({ ...base, author: 'forged' }), false);
});

test('jsonLd.overrides.authorName is no longer written', () => {
  const data = articleSchema.parse({ ...base, jsonLd: { overrides: { authorName: 'x', headline: 'h' } } });
  assert.deepEqual(Object.keys(data.jsonLd.overrides).includes('authorName'), false);
  assert.equal(data.jsonLd.overrides.headline, 'h');
});

// ── casting ─────────────────────────────────────────────────────────────────

test('castWriterIds gives ObjectIds, in order', () => {
  const out = castWriterIds([B, A]);
  assert.ok(out.every((id) => id instanceof mongoose.Types.ObjectId));
  assert.deepEqual(out.map(String), [B, A]);
});

test('castWriterIds keeps the first occurrence of a duplicate', () => {
  assert.deepEqual(castWriterIds([B, A, B]).map(String), [B, A]);
});

test('castWriterIds rejects a bad id rather than dropping it', () => {
  assert.throws(() => castWriterIds([A, 'not-an-id']), { message: INVALID_WRITER_ID_MESSAGE });
  assert.throws(() => castWriterIds(['123456789012']), { message: INVALID_WRITER_ID_MESSAGE });
});

// ── the compat `author` string ──────────────────────────────────────────────

test('one writer: just the name', () => {
  assert.equal(joinWriterNames([vate]), 'อ.เวท');
});

test('two writers: primary first, joined with " & "', () => {
  assert.equal(joinWriterNames([vate, academy]), 'อ.เวท & 9Expert Academy');
});

// ── the save rules ──────────────────────────────────────────────────────────

test('a save keeps the requested order, not the order the read returned', () => {
  const plan = planArticleWriters({ ids: [B, A], found: [academy, vate] });
  assert.deepEqual(plan.writers.map((w) => w._id), [B, A]);
});

test('a save dedupes before it decides', () => {
  const plan = planArticleWriters({ ids: [A, A], found: [academy] });
  assert.equal(plan.ok, true);
  assert.equal(plan.writers.length, 1);
});

test('an update with no writers is refused', () => {
  const plan = planArticleWriters({ ids: [] });
  assert.deepEqual(plan, { ok: false, error: NO_WRITER_MESSAGE });
});

test('a create with no writers takes the default writer', () => {
  const plan = planArticleWriters({ ids: [], defaultWriter: academy, creating: true });
  assert.deepEqual(plan, { ok: true, writers: [academy] });
});

test('a create with no default writer, or an inactive one, is refused', () => {
  assert.equal(planArticleWriters({ ids: [], creating: true }).ok, false);
  assert.equal(planArticleWriters({ ids: [], defaultWriter: off, creating: true }).ok, false);
});

test('an id with no row is refused', () => {
  assert.equal(planArticleWriters({ ids: [A, B], found: [academy] }).ok, false);
});

test('an inactive writer is refused, by name', () => {
  const plan = planArticleWriters({ ids: [A, C], found: [academy, off] });
  assert.equal(plan.ok, false);
  assert.match(plan.error, /ปิดแล้ว/);
});

test('the default is not a way past the checks: a create that names ids gets those ids', () => {
  const plan = planArticleWriters({ ids: [C], found: [off], defaultWriter: academy, creating: true });
  assert.equal(plan.ok, false);
});

// ── readers take `undefined` ────────────────────────────────────────────────

test('dedupeIds, orderWriters and collectWriterIds all take a missing field', () => {
  assert.deepEqual(dedupeIds(undefined), []);
  assert.deepEqual(orderWriters(undefined, [academy]), []);
  assert.deepEqual(collectWriterIds([{}, { writerIds: [A] }, { writerIds: [A, B] }]), [A, B]);
});

test('the admin list shows names, and the legacy text without writerIds', () => {
  const names = { [A]: '9Expert Academy', [B]: 'อ.เวท' };
  assert.equal(articleAuthorLabel({ writerIds: [B, A], author: 'old' }, names), 'อ.เวท & 9Expert Academy');
  assert.equal(articleAuthorLabel({ author: 'old' }, names), 'old');
  assert.equal(articleAuthorLabel({ writerIds: [], author: 'old' }, names), 'old');
  assert.equal(articleAuthorLabel({}, names), '');
});

test('the form opens on the article writers, in their order', () => {
  assert.deepEqual(initialArticleWriters({ writerIds: [B, A] }, [academy, vate]), [vate, academy]);
});

test('the form opens on the default writer for a new or unbound article', () => {
  assert.deepEqual(initialArticleWriters(null, [vate, academy]), [academy]);
  assert.deepEqual(initialArticleWriters({ author: 'old' }, [vate, academy]), [academy]);
});

test('the dropdown offers active, unselected writers matching the search', () => {
  const options = [academy, vate, off];
  assert.deepEqual(searchableWriters(options, [academy]), [vate]);
  assert.deepEqual(searchableWriters(options, [], 'EXPERT'), [academy]);
  assert.deepEqual(searchableWriters(options, [], 'ไม่มีชื่อนี้'), []);
});

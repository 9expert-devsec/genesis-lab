import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The seams test/pure/articleWriters cannot reach: buildModelData and the actions
 * live in a 'use server' file and take no injected reads, and the form and the
 * pages need a browser. So this reads them.
 */

const actions = readSource('src/lib/actions/articles.js').code;
const form = readSource('src/app/admin/articles/_components/ArticleForm.jsx').code;
const detail = readSource('src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx').code;
const publicPage = readSource('src/app/(public)/articles/[slug]/page.jsx').code;
const adminPage = readSource('src/app/admin/articles/page.jsx').code;
const listClient = readSource('src/app/admin/articles/_components/ArticlesAdminClient.jsx').code;
const fields = readSource('src/lib/articleListFields.js').code;
const model = readSource('src/models/Article.js').code;

function fn(name) {
  const at = actions.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  assert.notEqual(at, -1, `${name} not found`);
  const next = actions.slice(at + 1).search(/\n(?:export )?(?:async )?function /);
  return actions.slice(at, next === -1 ? actions.length : at + 1 + next);
}

test('buildModelData casts the ids and writes the compat author, after the spread', () => {
  const body = fn('buildModelData');
  const spread = body.indexOf('...data');
  assert.notEqual(spread, -1);
  assert.ok(spread < body.indexOf('castWriterIds('), 'writerIds must not be overwritten by the raw strings');
  assert.ok(spread < body.indexOf('author: joinWriterNames(writers)'), 'author must come from the writers');
});

test('create resolves writers, as creating, before it builds the document', () => {
  const body = fn('createArticle');
  assert.match(body, /resolveArticleWriters\(parsed\.data\.writerIds, \{ creating: true \}\)/);
  assert.ok(body.indexOf('if (!resolved.ok)') < body.indexOf('Article.create('));
});

test('update requires writers through its own schema, and resolves them before writing', () => {
  const body = fn('updateArticle');
  assert.match(body, /articleUpdateSchema\.safeParse\(/);
  assert.equal(/\barticleSchema\b/.test(body), false);
  assert.ok(body.indexOf('if (!resolved.ok)') !== -1);
  assert.ok(body.indexOf('if (!resolved.ok)') < body.indexOf('Article.findByIdAndUpdate('));
});

test('the audit snapshot records writerIds', () => {
  assert.match(fn('articleFields'), /writerIds:\s+doc\.writerIds \?\? \[\]/);
});

test('the form sends writerIds and no author', () => {
  assert.match(form, /fd\.set\('writerIds'/);
  assert.equal(/fd\.set\('author'/.test(form), false);
});

test('the free-text author input and the JSON-LD Author override are gone', () => {
  assert.equal(/setAuthor/.test(form), false);
  assert.equal(/key: 'authorName'/.test(form), false);
});

test('the form mounts the picker with the legacy note wired', () => {
  assert.match(form, /<ArticleWritersPicker/);
  assert.match(form, /legacyAuthor=\{isEdit && !article\.writerIds\?\.length/);
});

test('both form previews read the selected writers', () => {
  assert.match(form, /author: joinWriterNames\(writers\)/);
  assert.match(form, /coverUrl,\s+writers,/);
});

test('the public page resolves writers and hands them to the byline and the JSON-LD', () => {
  assert.match(publicPage, /readWritersByIds\(article\.writerIds\)/);
  assert.match(publicPage, /buildJsonLd\(\{ \.\.\.article, writers \}\)/);
  assert.match(publicPage, /writers=\{writers\}/);
});

test('the page renders one byline and the User-icon line is gone', () => {
  assert.equal((detail.match(/<ArticleByline/g) ?? []).length, 1);
  assert.equal(/<User\b/.test(detail), false);
  assert.equal(/\barticle\.author &&/.test(detail), false, 'the byline decides, not this file');
});

test('the admin list reads writer names once, not per row', () => {
  assert.equal((adminPage.match(/readWriterNames\(/g) ?? []).length, 1);
  assert.equal(/\.map\([^)]*readWriterNames/.test(adminPage), false);
});

test('the admin list searches and shows the resolved label', () => {
  assert.equal(/a\.author/.test(listClient), false);
  assert.equal((listClient.match(/articleAuthorLabel\(a, writerNames\)/g) ?? []).length, 4);
});

test('the list projection and the model both carry writerIds', () => {
  assert.match(fields, /ADMIN_LIST_FIELDS[\s\S]*?writerIds/);
  assert.match(model, /writerIds:\s+\[\{ type: mongoose\.Schema\.Types\.ObjectId, ref: 'Writer' \}\]/);
  assert.match(model, /ArticleSchema\.index\(\{ writerIds: 1 \}\)/);
});

test('`author` and the JSON-LD override stay on the model until round 4', () => {
  assert.match(model, /author:\s+\{ type: String/);
  assert.match(model, /authorName:\s+\{ type: String/);
});

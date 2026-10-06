import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scrubSource } from '../sourceScan.mjs';

/**
 * `contentUpdatedAt` is set in exactly two places — createArticle and
 * updateArticle — and NOTHING else may touch it. Every other Article write
 * (pin/reorder bulkWrite, toggle active, featuredOnLanding, the course-rename
 * cascade, scripts/) bumps `updatedAt` without the content changing; if one of
 * them wrote this field too, it would inherit exactly the defect it exists to
 * avoid.
 *
 * The rule is "no mention", not "no write": nothing outside those two bodies
 * has a reason to name the field yet, so a plain mention is the cheapest
 * matcher that cannot under-fire. Comments are stripped first — the model's
 * doc block and this file's own prose name it.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WRITER_REL = 'src/lib/actions/articles.js';
const MODEL_REL = 'src/models/Article.js';
const FIELD = /\bcontentUpdatedAt\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

const code = (full) => scrubSource(readFileSync(full, 'utf8'), { stripImports: false });
const rel = (full) => path.relative(ROOT, full).split(path.sep).join('/');

function actionBodies(src) {
  const out = new Map();
  const re = /\n(?:export\s+)?async\s+function\s+(\w+)\s*\(/g;
  const starts = [...src.matchAll(re)].map((m) => ({ name: m[1], at: m.index }));
  starts.forEach((s, i) => out.set(s.name, src.slice(s.at, starts[i + 1]?.at ?? src.length)));
  return out;
}

test('only createArticle and updateArticle (and the schema) name contentUpdatedAt', () => {
  const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))];
  assert.ok(files.length > 100, `walker only found ${files.length} files`);

  const outside = files
    .filter((f) => ![WRITER_REL, MODEL_REL].includes(rel(f)))
    .filter((f) => FIELD.test(code(f)))
    .map(rel);
  assert.deepEqual(outside, [], `contentUpdatedAt is named outside its writer:\n  ${outside.join('\n  ')}`);

  const bodies = actionBodies(code(path.join(ROOT, WRITER_REL)));
  for (const name of ['applyPlan', 'toggleArticleActive', 'toggleArticleFeaturedOnLanding', 'deleteArticle']) {
    assert.ok(bodies.has(name), `could not find ${name} in ${WRITER_REL} — re-point this test`);
  }
  const touching = [...bodies].filter(([, body]) => FIELD.test(body)).map(([name]) => name).sort();
  assert.deepEqual(touching, ['createArticle', 'updateArticle']);
});

test('CONTROL: the matcher sees a real write and the body splitter is scoped', () => {
  assert.equal(FIELD.test("await Article.updateOne({ _id }, { $set: { contentUpdatedAt: new Date() } });"), true);
  const bodies = actionBodies('\nexport async function a() { contentUpdatedAt }\nasync function b() { x }');
  assert.equal(FIELD.test(bodies.get('a')), true);
  assert.equal(FIELD.test(bodies.get('b')), false);
});

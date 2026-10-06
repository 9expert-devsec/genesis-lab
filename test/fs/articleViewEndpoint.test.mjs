import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scrubSource } from '../sourceScan.mjs';

/**
 * The view endpoint's two promises, checked where they would be broken:
 *
 *   1. it never WRITES an article. Counting into the `articles` document would
 *      bump updatedAt on every read and churn ISR; the only article access is a
 *      projected existence read through the native driver, so the Article model
 *      is not imported at all;
 *   2. it never reads an identifier: no IP header, no cookie.
 */

const ROUTE = 'src/app/api/articles/view/route.js';
const code = scrubSource(readFileSync(ROUTE, 'utf8'), { stripImports: false });

test('the view endpoint never imports the Article model, never writes articles, and never reads IP headers or cookies', () => {
  assert.doesNotMatch(code, /from\s+['"]@\/models\/Article['"]/, 'imports the Article model');
  assert.doesNotMatch(
    code,
    /collection\(\s*['"]articles['"]\s*\)\s*\.\s*(?:update|insert|replace|delete|bulkWrite|findOneAnd)/,
    'writes to the articles collection',
  );
  for (const header of ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'x-vercel-forwarded-for', 'forwarded']) {
    assert.ok(!code.toLowerCase().includes(`'${header}'`), `reads ${header}`);
  }
  assert.doesNotMatch(code, /\brequest\.ip\b|\.cookies\b|cookies\(\)|headers\(\)/, 'reads an ip or a cookie');

  // Production-only: the env gate runs before the first DB call.
  const gate = code.indexOf('isCountingEnabled(process.env)');
  const firstDb = code.indexOf('dbConnect()');
  assert.ok(gate !== -1, 'the route must call isCountingEnabled(process.env)');
  assert.ok(firstDb !== -1 && gate < firstDb, 'isCountingEnabled must run before dbConnect()');

  // CONTROL: the scan is reading the real file — it does increment the view row.
  assert.match(code, /ArticleView\.updateOne\(/);
  assert.match(code, /\$inc:\s*\{\s*count:\s*1\s*\}/);
});

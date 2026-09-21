import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, blankStringBodies } from '../sourceScan.mjs';

/**
 * The two ISR detail routes log their 404s — and stay ISR while doing it.
 *
 * ── THE TWO THINGS THAT MUST BOTH HOLD ─────────────────────────────────────
 *  1. `/articles/[slug]` and `/masterclass/[slug]` call recordStaticNotFound
 *     immediately before `notFound()`, so a junk slug that regenerates shows
 *     up in not_found_hits (the same log the catch-all writes) instead of
 *     being invisible behind an `X-Vercel-Cache: HIT`.
 *  2. The helper they call reads NO dynamic API. The catch-all's boundary
 *     (notFoundBoundary → headers()) is the obvious thing to reuse and the one
 *     thing that must not be: one `headers()` in the tree turns the route back
 *     into a per-request function, which is what round A removed. isrRoutes
 *     walks the page directories; this file walks the helper, which lives
 *     under lib and is outside that walk.
 */

const PAGES = [
  { rel: 'src/app/(public)/articles/[slug]/page.jsx', guard: 'article', path: '`/articles/${rawSlug}`' },
  { rel: 'src/app/(public)/masterclass/[slug]/page.jsx', guard: 'course', path: '`/masterclass/${slug}`' },
];
/** Regex-escape a literal source fragment (backtick template included). */
const esc = (str) => str.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const HELPER = readSource('src/lib/redirects/recordStaticNotFound.js');
const BOUNDARY = readSource('src/lib/redirects/notFoundBoundary.js');

for (const p of PAGES) {
  test(`${p.rel}: records the 404 with the request path, then calls notFound()`, () => {
    const src = readSource(p.rel);
    assert.match(
      src.withImports,
      /import \{ recordStaticNotFound \} from '@\/lib\/redirects\/recordStaticNotFound'/,
      'the page does not import the static logger',
    );
    // The block, in order: the guard, the record with THIS route's path, notFound.
    const block = new RegExp(
      `if \\(!${p.guard}\\) \\{\\s*recordStaticNotFound\\(${esc(p.path)}\\);\\s*notFound\\(\\);\\s*\\}`,
    );
    assert.match(src.code, block, `expected the guard block to read: if (!${p.guard}) { recordStaticNotFound(${p.path}); notFound(); }`);
    // Exactly one call: generateMetadata also looks the slug up and must not
    // log a second row for the same request.
    assert.equal(src.code.match(/recordStaticNotFound\(/g).length, 1);
    // And not the catch-all's boundary, which would make the route dynamic.
    assert.doesNotMatch(src.withImports, /notFoundBoundary/);
  });
}

test('the helper reads no dynamic API and does not reach notFoundBoundary', () => {
  const code = blankStringBodies(HELPER.code);
  assert.doesNotMatch(HELPER.withImports, /from\s+['"]next\/headers['"]/, 'next/headers would make every caller per-request');
  assert.doesNotMatch(HELPER.withImports, /notFoundBoundary/);
  assert.doesNotMatch(code, /\bheaders\(\)|\bcookies\(\)|\bdraftMode\(\)|\bconnection\(\)/);
  // CONTROL: the boundary it deliberately does not reuse DOES read headers().
  assert.match(BOUNDARY.withImports, /from\s+['"]next\/headers['"]/);
});

test('the helper defers through after() from next/server and swallows every failure', () => {
  assert.match(HELPER.withImports, /import \{ after \} from 'next\/server'/);
  assert.match(HELPER.withImports, /import \{ recordNotFound \} from '@\/lib\/redirects\/resolveNotFound'/);
  const code = HELPER.code;
  assert.match(code, /schedule = after/, 'after is the default scheduler');
  assert.match(code, /host = canonicalHost\(\)/, 'the host defaults to the canonical site host');
  // Both the scheduler and the record are wrapped: a throw from either is a
  // warning, never a 500 on a 404.
  assert.match(code, /try \{\s*schedule\(/);
  assert.match(code, /\.catch\(\(err\) => \{\s*warn\(/);
});

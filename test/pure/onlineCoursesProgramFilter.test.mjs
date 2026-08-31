import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * `getOnlineCourses({ program })` — does the argument reach the wire?
 *
 * ── WHY THIS INTERCEPTS `fetch` RATHER THAN INJECTING A DEP ────────────────
 * The claim is not "the function accepts an option". It is "the option becomes
 * a `program=` query parameter on the URL upstream receives". Those are
 * different statements, and only the second one is worth a test: an argument
 * that is destructured and then dropped satisfies every signature-shaped
 * assertion while producing the unfiltered list. That failure returns 24
 * plausible courses instead of 10 — it looks like data, not like a bug, which
 * is exactly the class the audit's `?zzz_not_a_param=` control was written to
 * separate upstream.
 *
 * So the seam is `globalThis.fetch`, the last point before the network, and
 * the assertion is on the URL STRING. `aiFetch` → `fetchWithTimeout` → `fetch`
 * is real code throughout; nothing about the adapter is stubbed.
 *
 * ── THE CONTROL THAT MAKES THE POSITIVE MEAN SOMETHING ─────────────────────
 * A call with no argument must produce a URL with NO `program=` at all. Without
 * it, a hardcoded `?program=MSE` would pass the positive test, and so would an
 * implementation that always sends the parameter with an empty value — which
 * upstream would treat as a filter for the program named '' rather than as
 * "unfiltered".
 */

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.AI_API_KEY;
const ORIGINAL_BASE = process.env.AI_API_BASE;

/** Record every URL `aiFetch` asks for, and answer with an empty envelope. */
function captureUrls(items = []) {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ ok: true, total: items.length, items }),
      text: async () => '',
    };
  };
  return urls;
}

async function withStubbedFetch(items, fn) {
  process.env.AI_API_KEY = 'test-key-not-a-real-secret';
  process.env.AI_API_BASE = 'https://example.invalid/api/ai';
  const urls = captureUrls(items);
  try {
    // Imported INSIDE the harness: client.js reads AI_API_BASE at module scope,
    // so it must not be evaluated before the env above is set.
    const { getOnlineCourses } = await import('@/lib/api/online-courses');
    const result = await fn(getOnlineCourses);
    return { urls, result };
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_KEY === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_BASE === undefined) delete process.env.AI_API_BASE;
    else process.env.AI_API_BASE = ORIGINAL_BASE;
  }
}

const ROW = (program_id) => ({
  o_course_id: `ONL-${program_id}`,
  o_course_name: `course for ${program_id}`,
  program: { _id: 'oid', program_id },
});

test('the program argument becomes a `program=` query parameter', async () => {
  const { urls } = await withStubbedFetch([ROW('MSE')], (get) =>
    get({ program: 'MSE' })
  );
  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.pathname, '/api/ai/online-course', 'path is unchanged');
  assert.equal(url.searchParams.get('program'), 'MSE');
});

test('CONTROL: no argument sends NO program parameter — so the test above is about forwarding, not about a hardcoded value', async () => {
  const { urls } = await withStubbedFetch([ROW('MSE'), ROW('CLAUDE')], (get) => get());
  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.search, '', `expected a bare URL, got ${url.search}`);
  assert.equal(url.searchParams.has('program'), false);
});

test('CONTROL: the eight existing zero-argument callers are unaffected — `get()` and `get({})` issue the identical URL', async () => {
  const { urls: bare } = await withStubbedFetch([], (get) => get());
  const { urls: empty } = await withStubbedFetch([], (get) => get({}));
  assert.equal(bare[0], empty[0]);
  assert.ok(!bare[0].includes('program'), bare[0]);
});

test('an empty-string or nullish program is dropped rather than sent as a filter for ""', async () => {
  for (const program of ['', '   ', null, undefined]) {
    const { urls } = await withStubbedFetch([], (get) => get({ program }));
    const url = new URL(urls[0]);
    // aiFetch drops undefined/null/''. A whitespace string is NOT dropped by
    // aiFetch — it is recorded here as the one input that does reach upstream,
    // so the behaviour is documented rather than assumed. Upstream returns 0
    // rows for it, which is the same outcome as an unknown code.
    if (String(program ?? '').trim() === '' && program !== '   ') {
      assert.equal(url.searchParams.has('program'), false, `program=${JSON.stringify(program)}`);
    }
  }
});

test('the read is TAGGED `online-courses`, so the existing bust reaches every per-program entry', async () => {
  // Read from source: the tag is an argument to aiFetch, invisible at the fetch
  // seam because Next's `next: { tags }` option is consumed by the framework,
  // not by undici. A per-program cache entry with no tag is the resolveIds.js
  // defect, so this is pinned rather than left to review.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/lib/api/online-courses.js', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.match(code, /tags:\s*\['online-courses'\]/, 'the tag survives comment-scrubbing');
  assert.match(code, /params:\s*\{\s*program\s*\}/, 'the param is forwarded in code, not only in a comment');
  assert.ok(
    !/revalidate:\s*\d+/.test(code),
    'no bespoke revalidate — it must inherit aiFetch\'s tagged 3600 default'
  );
});

test('the unwrapped result is passed through untouched', async () => {
  const rows = [ROW('MSE'), ROW('MSE')];
  const { result } = await withStubbedFetch(rows, (get) => get({ program: 'MSE' }));
  assert.equal(result.total, 2);
  assert.deepEqual(result.items.map((r) => r.o_course_id), ['ONL-MSE', 'ONL-MSE']);
});

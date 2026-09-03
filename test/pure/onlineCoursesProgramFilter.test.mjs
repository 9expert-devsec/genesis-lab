import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getOnlineCourses } from '@/lib/api/online-courses';

/**
 * `getOnlineCourses({ program })` — does the argument reach the request?
 *
 * ── WHY THIS INJECTS A DEP RATHER THAN SWAPPING `globalThis.fetch` ─────────
 * The first version of this file stubbed the global. It passed when run alone
 * and FAILED in the suite, one of its cases sitting on a real network call for
 * 42 seconds: test/run.mjs:214 drives the runner with `isolation: 'none'` and
 * `concurrency: true`, so every test file shares one process. A global swap is
 * therefore visible to whatever else is mid-flight, and the restore can land
 * inside another file's call — it can corrupt tests it has nothing to do with,
 * which is worse than merely being flaky.
 *
 * `listPublicCourses` already carries a `deps` seam for exactly this reason and
 * says so at its own call site. Same seam, same shape.
 *
 * ── WHAT IS ACTUALLY ASSERTED ──────────────────────────────────────────────
 * Not that the function accepts an option — an argument destructured and then
 * dropped satisfies every signature-shaped assertion while quietly returning
 * all 24 rows, which reads as data rather than as a bug. What is asserted is
 * the OPTIONS OBJECT handed to the fetcher, which is what becomes the query
 * string.
 */

/** Record the (path, options) pairs the adapter asks for. */
function spy(items = []) {
  const calls = [];
  const fetchUpstream = async (path, options) => {
    calls.push({ path, options });
    return { ok: true, total: items.length, items };
  };
  return { calls, deps: { fetchUpstream } };
}

const ROW = (program_id) => ({
  o_course_id: `ONL-${program_id}`,
  o_course_name: `course for ${program_id}`,
  program: { _id: 'oid', program_id },
});

test('the program argument is forwarded as the `program` request param', async () => {
  const { calls, deps } = spy([ROW('MSE')]);
  await getOnlineCourses({ program: 'MSE' }, deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/online-course', 'the path is unchanged');
  assert.equal(calls[0].options.params.program, 'MSE');
});

test('CONTROL: no argument forwards NO program value — so the test above is about forwarding, not a hardcoded string', async () => {
  const { calls, deps } = spy([ROW('MSE'), ROW('CLAUDE')]);
  await getOnlineCourses(undefined, deps);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].options.params.program, undefined,
    'an unfiltered call must not name a program'
  );
});

test('CONTROL: the eight existing zero-argument callers are unaffected — get() and get({}) send identical options', async () => {
  const a = spy(); await getOnlineCourses(undefined, a.deps);
  const b = spy(); await getOnlineCourses({}, b.deps);
  assert.deepEqual(a.calls[0].options, b.calls[0].options);
  assert.equal(a.calls[0].options.params.program, undefined);
});

test('the tag travels with every call, filtered or not — an untagged per-program entry is unreachable by any bust', async () => {
  for (const arg of [undefined, { program: 'MSE' }]) {
    const { calls, deps } = spy();
    await getOnlineCourses(arg, deps);
    assert.deepEqual(calls[0].options.tags, ['online-courses']);
  }
});

test('no bespoke revalidate — the call inherits aiFetch\'s tagged 3600 default', async () => {
  const { calls, deps } = spy();
  await getOnlineCourses({ program: 'MSE' }, deps);
  assert.equal(
    'revalidate' in calls[0].options, false,
    'a hand-set revalidate here would be the resolveIds.js:26 defect a second time'
  );
});

test('a nullish program is passed through for aiFetch to drop, not stringified into a filter for "undefined"', async () => {
  for (const program of [undefined, null, '']) {
    const { calls, deps } = spy();
    await getOnlineCourses({ program }, deps);
    const sent = calls[0].options.params.program;
    assert.ok(
      sent === undefined || sent === null || sent === '',
      `program=${JSON.stringify(program)} reached the params as ${JSON.stringify(sent)}`
    );
  }
});

test('the unwrapped result is passed through untouched', async () => {
  const rows = [ROW('MSE'), ROW('MSE')];
  const { deps } = spy(rows);
  const result = await getOnlineCourses({ program: 'MSE' }, deps);
  assert.equal(result.total, 2);
  assert.deepEqual(result.items.map((r) => r.o_course_id), ['ONL-MSE', 'ONL-MSE']);
});

test('CONTROL: the production default really is aiFetch — the seam is for tests, not a second code path', () => {
  // Read from source: a `deps` object whose default was something else would
  // make every assertion above true of a function nothing calls.
  const src = readFileSync('src/lib/api/online-courses.js', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.match(code, /\{ fetchUpstream = aiFetch \} = \{\}/);
  assert.match(code, /params:\s*\{\s*program\s*\}/, 'forwarded in code, not only in a comment');
  assert.match(code, /tags:\s*\['online-courses'\]/, 'the tag survives comment-scrubbing');
});

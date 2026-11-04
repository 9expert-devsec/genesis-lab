import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

/**
 * An `-all-courses` URL that names no program and no skill goes through the
 * redirect/404 boundary, like every other URL the app has nothing for.
 *
 * It used to render the WHOLE catalog under an H1 of the raw slug, HTTP 200.
 * That was a soft 404, and it sat in front of notFoundOrRedirect(), so a rule in
 * the admin Redirect Panel for such a URL could never fire and the 404 log never
 * saw it. `/rpa-all-courses` and `/365-copilot-all-courses` were both this.
 *
 * The drive is test/allCoursesBoundary.case.mjs: the real CatchAllPage in its
 * own process, which is why this is one spawn shared by every test below. See
 * that file for why it cannot run in the runner's process.
 *
 * WHAT THIS CANNOT SEE: the live data. The real slugs (27 program + 7 skill,
 * measured 2026-11-04) come from program_page_configs and skill_page_configs,
 * which no tier here reaches. The fixtures are one of each.
 */
const CASE = fileURLToPath(new URL('../allCoursesBoundary.case.mjs', import.meta.url));

let drive;
function routeDrive() {
  drive ??= promisify(execFile)(process.execPath, [CASE], { maxBuffer: 1024 * 1024 })
    .then(({ stdout }) => JSON.parse(stdout.trim().split('\n').at(-1)));
  return drive;
}

const REDIRECT = (status, to) => `NEXT_REDIRECT;replace;${to};${status};`;
const NOT_FOUND = 'NEXT_NOT_FOUND';

test('unresolved slug + a permanent rule: 308 to the rule, not a catalog', async () => {
  const r = (await routeDrive())['365-copilot-all-courses'];
  assert.equal(r.thrown, REDIRECT(308, '/microsoft-copilot-all-courses'));
});

test('unresolved slug + a temporary rule: 307, so the rule decides the status', async () => {
  const r = (await routeDrive())['moved-for-now-all-courses'];
  assert.equal(r.thrown, REDIRECT(307, '/excel-all-courses'));
});

test('unresolved slug + no rule: a real 404, recorded in the 404 log', async () => {
  const out = await routeDrive();
  assert.equal(out['no-such-thing-all-courses'].thrown, NOT_FOUND);
  assert.ok(out.recorded.includes('/no-such-thing-all-courses'));
});

test('a published config whose upstream record is gone is unresolved too', async () => {
  // This is how /rpa-all-courses got here: the row outlived the upstream id.
  assert.equal((await routeDrive())['gone-upstream-all-courses'].thrown, NOT_FOUND);
});

test('an unpublished config is unresolved too', async () => {
  assert.equal((await routeDrive())['hidden-all-courses'].thrown, NOT_FOUND);
});

test('no unresolved slug reads the catalog', async () => {
  const out = await routeDrive();
  for (const slug of [
    '365-copilot-all-courses', 'moved-for-now-all-courses', 'no-such-thing-all-courses',
    'hidden-all-courses', 'gone-upstream-all-courses',
  ]) {
    // A config row loads the lists before finding nothing, so the two that have
    // one read /public-course on the way. Neither may render it.
    assert.equal('rendered' in out[slug], false, `${slug} rendered something`);
  }
  assert.deepEqual(out['no-such-thing-all-courses'].fetched, []);
});

test('a resolvable PROGRAM slug still renders the program page', async () => {
  const r = (await routeDrive())['excel-all-courses'];
  assert.equal(r.thrown, undefined);
  assert.equal(r.rendered, 'program');
  assert.equal(r.entity, 'EXC');
});

test('a resolvable SKILL slug still renders the skill page', async () => {
  const r = (await routeDrive())['data-all-courses'];
  assert.equal(r.thrown, undefined);
  assert.equal(r.rendered, 'skill');
  assert.equal(r.entity, 'DATA');
});

test('a rule cannot shadow a live page: the resolver runs first', async () => {
  // The fixture holds a rule on /excel-all-courses. Reaching the boundary only
  // when nothing resolved is what keeps it from firing.
  assert.equal((await routeDrive())['excel-all-courses'].rendered, 'program');
});

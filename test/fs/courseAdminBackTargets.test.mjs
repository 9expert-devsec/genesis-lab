import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * Where the admin lands when they press ←, and what the filter does on the way.
 *
 * Two server components and a client list, none of which this runner can
 * render: the pages are `async` and reach next-auth, mongoose and the upstream
 * API at module load. The DERIVATION is pure and tested in
 * test/pure/adminListQuery; this file pins the wiring, and in particular the
 * one substitution that produces a plausible-looking 404.
 */

const PROMOS_PAGE = readSource('src/app/admin/courses/[courseId]/page.jsx');
const LIST = readSource('src/app/admin/courses/_components/CoursesAdminClient.jsx');

// ── B1: back to the EDIT page, keyed correctly ──────────────────────────────

test('the promos/FAQ page sends ← to the edit page, keyed by the FETCHED _id', () => {
  // THE TRAP (1da69ce): this route's param is the course_id CODE, /edit takes
  // the MSDB ObjectId. Building the edit URL from `courseId` would produce
  // /admin/courses/COPILOT-STU/edit — a 404 that reads as a missing course.
  assert.match(
    PROMOS_PAGE.code,
    /courseResult\?\._id\s*\?\s*`\/admin\/courses\/\$\{courseResult\._id\}\/edit`/,
    'the edit target is not derived from the fetched course _id'
  );
});

test('CONTROL: the route param is NOT used to build the edit URL', () => {
  // The substitution that would look right in review and 404 in production.
  assert.doesNotMatch(
    PROMOS_PAGE.code,
    /\/admin\/courses\/\$\{courseId\}\/edit/,
    'the edit URL is built from the course_id CODE — that route takes an _id'
  );
});

test('with no upstream course it falls back to the list rather than a dead link', () => {
  // This page deliberately still renders when getCourseByCode fails, and then
  // there is no _id to build an edit URL from. Also the right target for anyone
  // who arrived by typed URL or bookmark rather than from the editor.
  assert.match(
    PROMOS_PAGE.code,
    /:\s*'\/admin\/courses'/,
    'no fallback target when upstream is unavailable'
  );
  assert.match(
    PROMOS_PAGE.code,
    /courseResult\?\._id\s*\?\s*'กลับไปยังหน้าแก้ไขหลักสูตร'\s*:\s*'กลับไปยังรายการหลักสูตร'/,
    'the label does not follow the target — it would promise the wrong page'
  );
});

// ── B2: the filter survives the round trip ──────────────────────────────────

test('the list seeds its filters FROM the URL', () => {
  for (const [state, param] of [['search', 'q'], ['filterProgram', 'program'], ['filterType', 'type']]) {
    assert.match(
      LIST.code,
      new RegExp(String.raw`\[${state},[^\]]*\]\s*=\s*useState\(\(\)\s*=>\s*searchParams\.get\('${param}'\)`),
      `${state} is not seeded from ?${param}`
    );
  }
});

test('the list mirrors its filters back into the URL', () => {
  // Without this the URL never carries the filter, so nothing downstream can.
  assert.match(LIST.code, /window\.history\.replaceState/, 'the filter never reaches the URL');
});

test('CONTROL: the list does not re-run the server on every keystroke', () => {
  // `router.replace` would round-trip the server component per character for a
  // list already filtered entirely on the client. replaceState is the whole
  // point of the choice — if this becomes router.replace, that was a mistake.
  assert.doesNotMatch(
    LIST.code,
    /router\.replace\(/,
    'the filter sync went back to router.replace — a server round-trip per keystroke'
  );
});

test('the list carries the filter into the edit link', () => {
  assert.match(
    LIST.code,
    /withListQuery\(\s*`\/admin\/courses\/\$\{encodeURIComponent\(course\._id\)\}\/edit`/,
    'the edit link drops the filter — it dies at this hop'
  );
});

test('the promos/FAQ page carries the filter one hop further', () => {
  assert.match(
    PROMOS_PAGE.code,
    /withListQuery\(/,
    'the filter is lost when going back from the promos page'
  );
  assert.match(PROMOS_PAGE.code, /courseListQuery\(await searchParams\)/);
});

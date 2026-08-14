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

/**
 * ── THE FILTER NOW ARRIVES AS A PROP AND LEAVES THROUGH ONE WRITER ─────────
 *
 * These three cases used to assert the OPPOSITE MECHANISM: that the filters
 * were `useState(() => searchParams.get(…))` and were mirrored back with
 * `window.history.replaceState`. That shape is the defect
 * test/fs/urlFilterNoState recorded for this file, and it has been converted —
 * so the cases are rewritten rather than deleted, because what they were
 * really protecting still matters: THE FILTER MUST REACH THE URL, or every
 * back-link below it carries nothing.
 *
 * The old CONTROL argued that `router.replace` would round-trip the server per
 * keystroke. That objection was about WRITING ON EVERY KEYSTROKE, not about the
 * URL owning the filter, and it is now answered by the search box committing on
 * Enter/blur instead of on input. The cost is stated in the component.
 */
test('the list takes its filters as props rather than seeding them from the URL', () => {
  const sig = /export function CoursesAdminClient\(\{([\s\S]*?)\}\)/.exec(LIST.code);
  assert.ok(sig, 'the component signature was not found');
  for (const param of ['q', 'program', 'type']) {
    assert.match(sig[1], new RegExp(`\\b${param}\\b`), `${param} is not a prop`);
  }
  assert.doesNotMatch(
    LIST.code,
    /useState\(\(\)\s*=>\s*searchParams\.get/,
    'the lazily-seeded filter state is back — it goes stale on any navigation that keeps the instance'
  );
});

test('the list writes its filters back into the URL, through exactly one writer', () => {
  // Without a write the URL never carries the filter, so nothing downstream can.
  const writes = [...LIST.code.matchAll(/router\.(push|replace)\(/g)].length;
  assert.equal(writes, 1, `expected a single URL writer, found ${writes}`);
  assert.doesNotMatch(
    LIST.code,
    /window\.history\.replaceState/,
    'replaceState is back — it writes an address the router never observes, so useSearchParams and the URL disagree'
  );
});

test('the search box does not write the URL on every keystroke', () => {
  // The surviving half of the original CONTROL, and the reason the conversion
  // was affordable: this page is force-dynamic, so a write per character would
  // re-read upstream courses, extensions and programs per character.
  assert.doesNotMatch(
    LIST.code,
    /onChange=\{\(e\)\s*=>\s*navigate\(\{\s*q:/,
    'the search box commits on every keystroke — one server render per character'
  );
  assert.match(LIST.code, /onBlur=\{/, 'the search box has no blur commit');
  assert.match(LIST.code, /e\.key === 'Enter'/, 'the search box has no Enter commit');
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

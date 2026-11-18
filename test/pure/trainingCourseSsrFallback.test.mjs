import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, sourceExists } from '../sourceScan.mjs';
import {
  buildProgramRank,
  groupCoursesByProgram,
} from '@/lib/courses/courseListGrouping';

/**
 * D03 — /training-course must ship its H1 and course links in the server HTML
 * AND stay a static/ISR route. The Suspense fallback is what the server HTML
 * carries (CourseListClient bails out to client rendering on useSearchParams),
 * so: the fallback must be a real render, and nothing on the server side may
 * read the request — that would turn the route into a per-request render.
 */

const PAGE = 'src/app/(public)/training-course/page.jsx';
// Comment-stripped, imports stripped: "does the page DO X" guards.
const code = (rel) => readSource(rel).code;

test('page: the Suspense fallback is CourseListStatic, not null', () => {
  const src = code(PAGE);
  assert.doesNotMatch(src, /fallback=\{\s*null\s*\}/);
  assert.match(src, /fallback=\{\s*<CourseListStatic\b/);
});

test('page: reads nothing from the request (searchParams / cookies / headers / force-dynamic)', () => {
  const src = code(PAGE);
  for (const banned of [/\bsearchParams\b/, /\bcookies\s*\(/, /\bheaders\s*\(/, /force-dynamic/]) {
    assert.doesNotMatch(src, banned);
  }
  // The fallback and the view must not read the URL either, or the fallback
  // bails out exactly like the boundary it stands in for.
  for (const rel of [
    'src/app/(public)/training-course/_components/CourseListStatic.jsx',
    'src/app/(public)/training-course/_components/CourseListView.jsx',
  ]) {
    // withImports: the subject IS an import line.
    assert.doesNotMatch(readSource(rel).withImports, /next\/navigation/, rel);
  }
});

test('the route has NO loading.jsx (R2) — it would hide the server-rendered list', () => {
  // A route-level loading.jsx wraps the page in a Suspense boundary: the
  // prerendered HTML then shows the skeleton and parks the real body (H1 and
  // every course link) in a hidden container until an inline script reveals it
  // (~300 ms, measured in R1). The page's own Suspense fallback already
  // server-renders the list, so the skeleton only got in its way.
  assert.equal(sourceExists('src/app/(public)/training-course/loading.jsx'), false);
  // CONTROL: the probe resolves real paths (the page itself exists).
  assert.equal(sourceExists('src/app/(public)/training-course/page.jsx'), true);
});

test('grouping: admin order first, unranked programs after, alphabetical among themselves', () => {
  const c = (id, program_name) => ({ course_id: id, program: { program_name } });
  const items = [c('a', 'Zeta'), c('b', 'Excel'), c('c', 'Alpha'), c('d', 'Excel'), c('e', 'Power BI')];
  const groups = groupCoursesByProgram(items, buildProgramRank(['Power BI', 'Excel']));
  assert.deepEqual(
    groups.map((g) => [g.program.program_name, g.courses.map((x) => x.course_id)]),
    [['Power BI', ['e']], ['Excel', ['b', 'd']], ['Alpha', ['c']], ['Zeta', ['a']]]
  );
});

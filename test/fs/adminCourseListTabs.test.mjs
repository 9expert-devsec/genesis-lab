import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource } from '../sourceScan.mjs';
import { CourseListTabs } from '@/app/admin/courses/_components/CourseListTabs';

/**
 * ADM-1 — /admin/courses: หลักสูตรทั้งหมด / Private Courses tabs.
 *
 * The tab is URL state (`?tab=private`), read from `searchParams` on every
 * render. A copy in `useState` is the url-filter-state defect class
 * (test/fs/urlFilterNoState explains why a first-render assertion cannot catch
 * it), so the guard is on SHAPE: the tab is derived in page.jsx and no client
 * component holds it in state.
 */

const PAGE = readSource('src/app/admin/courses/page.jsx');
const CLIENTS = [
  'src/app/admin/courses/_components/CourseListTabs.jsx',
  'src/app/admin/courses/_components/PrivateCoursesTable.jsx',
  'src/app/admin/courses/_components/CoursesAdminClient.jsx',
].map(readSource);

test('the tab is derived from searchParams in page.jsx', () => {
  assert.match(PAGE.code, /const tab = one\('tab'\) === 'private'/, 'page.jsx does not read ?tab from searchParams');
});

test('no client component copies the tab into state', () => {
  for (const src of CLIENTS) {
    assert.doesNotMatch(src.code, /\[\s*(?:active)?[tT]ab\s*,\s*set\w*\s*\]\s*=\s*useState/, `${src.rel} holds the tab in useState`);
    assert.doesNotMatch(src.code, /useSearchParams\(\)/, `${src.rel} reads the URL itself instead of taking props`);
  }
});

test('the private table renders only in the ?tab=private arm; the grouped list only in the other', () => {
  const flat = PAGE.code.replace(/\s+/g, ' ');
  assert.match(
    flat,
    /\{tab === 'private' \? \( <PrivateCoursesTable [^]*?\) : \( <CoursesAdminClient /,
    'the two lists are not the two arms of the tab ternary'
  );
  assert.equal(flat.match(/<PrivateCoursesTable\b/g)?.length, 1, 'PrivateCoursesTable is rendered somewhere else too');
  assert.equal(flat.match(/<CoursesAdminClient\b/g)?.length, 1, 'CoursesAdminClient is rendered somewhere else too');
});

test('tabs are links with aria-current, carrying the other params and only the private one carrying tab', () => {
  const html = renderToStaticMarkup(
    createElement(CourseListTabs, { active: 'private', query: 'q=excel', counts: { all: 78, private: 3 } })
  );
  assert.match(html, /<nav aria-label="รายการหลักสูตร"/);
  const links = [...html.matchAll(/<a ([^>]*)>([^]*?)<\/a>/g)].map(([, attrs, body]) => ({ attrs, body }));
  assert.equal(links.length, 2);
  const [all, priv] = links;
  assert.match(all.attrs, /href="\/admin\/courses\?q=excel"/);
  assert.doesNotMatch(all.attrs, /aria-current/);
  assert.match(all.body, /หลักสูตรทั้งหมด[^]*78/);
  assert.match(priv.attrs, /href="\/admin\/courses\?q=excel&amp;tab=private"/);
  assert.match(priv.attrs, /aria-current="page"/);
  assert.match(priv.body, /Private Courses[^]*>3</);
  assert.match(priv.attrs, /focus-visible:ring-2/, 'no visible focus ring');
});

test('CONTROL: on the default tab the first link is current and no href carries tab', () => {
  const html = renderToStaticMarkup(createElement(CourseListTabs, { active: '', query: '', counts: {} }));
  const links = [...html.matchAll(/<a ([^>]*)>/g)].map(([, a]) => a);
  assert.match(links[0], /href="\/admin\/courses"/);
  assert.match(links[0], /aria-current="page"/);
  assert.doesNotMatch(links[1], /aria-current/);
  assert.match(links[1], /href="\/admin\/courses\?tab=private"/);
});

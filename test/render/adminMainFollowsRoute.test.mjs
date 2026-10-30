import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname } from 'next/navigation';
import { AdminMain } from '@/components/layout/AdminMain';
import { readSource } from '../sourceScan.mjs';

/**
 * ADM-1b — `<main>`'s scroll mode follows the CURRENT route.
 *
 * It was decided in src/app/admin/layout.jsx from the middleware's
 * `x-pathname` header. A layout is not re-rendered on client navigation, so
 * that was the route the admin LANDED on: open an article editor, click
 * วิทยากร or Cache Console in the sidebar, and `main` stayed `overflow-y: clip`
 * — measured scrollHeight 1239 / 5433 against a 900px viewport, the rest of
 * the page unreachable.
 *
 * A first-render assertion cannot see staleness (the captured value and the
 * live one agree on the first render), so the guard is on SHAPE — the mode is
 * computed from `usePathname()` in the render, never from a captured copy, and
 * the server layout no longer decides it — plus the route→mode mapping itself.
 */

const MAIN = readSource('src/components/layout/AdminMain.jsx');
const LAYOUT = readSource('src/app/admin/layout.jsx');

const modeFor = (path) => {
  __setPathname(path);
  try {
    const html = renderToStaticMarkup(createElement(AdminMain, null, 'x'));
    return /<main class="[^"]*\b(overflow-y-(?:clip|auto))\b/.exec(html)?.[1] ?? null;
  } finally {
    __setPathname('/');
  }
};

test('AdminMain decides the mode from usePathname() in the render', () => {
  assert.match(MAIN.code, /const pathname = usePathname\(\)/, 'AdminMain does not read usePathname()');
  assert.match(MAIN.code, /isFullHeightRoute\(pathname\)\s*\?\s*'overflow-y-clip'\s*:\s*'overflow-y-auto'/);
});

test('no captured copy of the path: no useState / useRef / useMemo / module-level path', () => {
  assert.doesNotMatch(MAIN.code, /use(?:State|Ref|Memo)\s*\(/, 'AdminMain holds state — the path must not be captured');
  assert.doesNotMatch(MAIN.code, /^(?:let|var|const)\s+\w*[pP]ath\w*\s*=/m, 'a module-level path value');
});

test('the server layout no longer decides main’s scroll mode', () => {
  assert.doesNotMatch(LAYOUT.code, /isFullHeightRoute\(/, 'layout.jsx still reads the route list');
  assert.doesNotMatch(LAYOUT.code, /<main\b/, 'layout.jsx still renders <main> itself');
  assert.match(LAYOUT.code, /<AdminMain>\{children\}<\/AdminMain>/, 'the layout does not render AdminMain');
});

test('route → mode: editors clip, content pages scroll', () => {
  for (const p of ['/admin/articles/abc/edit', '/admin/articles/new', '/admin/courses/abc/edit',
    '/admin/courses/new', '/admin/pages/builder/abc', '/admin/pages/new', '/admin/pages/abc/edit', '/admin/pages']) {
    assert.equal(modeFor(p), 'overflow-y-clip', `${p} should be full-height`);
  }
  for (const p of ['/admin/instructors', '/admin/cache', '/admin/courses', '/admin/articles', '/admin']) {
    assert.equal(modeFor(p), 'overflow-y-auto', `${p} must scroll`);
  }
});

test('CONTROL: the same component answers differently as the route changes', () => {
  // The client-navigation case in one process: editor first, then instructors.
  assert.equal(modeFor('/admin/articles/abc/edit'), 'overflow-y-clip');
  assert.equal(modeFor('/admin/instructors'), 'overflow-y-auto');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/AdminSidebar';

/**
 * EXACTLY ONE sidebar row is highlighted, asserted by RENDERING the sidebar.
 *
 * ══ WHY THIS EXISTS ALONGSIDE THE PURE TEST ═════════════════════════════════
 * test/pure/activeNavItem.test.mjs owns the RULE and test/fs/adminNavShape runs
 * the same table over the real NAV_GROUPS data. Neither can see the WIRING.
 * `SidebarItem` could go back to deciding `isActive` for itself tomorrow —
 *
 *     const isActive = currentPath.startsWith(item.href)   // the shipped bug
 *
 * — and both of those files would stay green, because `activeNavHref` would
 * still be a correct function that nothing calls. That is defect-7 face one in
 * this suite's terms: the guard keeps binding to something true and stops
 * describing what the component does.
 *
 * So this renders the actual component at the actual path and counts the rows
 * marked `aria-current="page"`. Reverting A4 makes THIS go red, on
 * /admin/masterclass/registrations, with a count of 2.
 *
 * The `aria-current` attribute is the hook rather than the Tailwind classes on
 * purpose: the colour treatment is free to change (the round-A brief forbids
 * restyling, but a later round will not), and a guard keyed on `bg-9e-action/10`
 * would fail a repaint and pass a regression. `aria-current` is also the thing a
 * screen reader announces, so asserting on it asserts on the user-facing claim
 * "you are here" rather than on its rendering.
 *
 * `isSuperadmin` so every row is visible — canAccess filtering is a separate
 * concern with its own coverage, and a filtered list could hide the second
 * highlight and make this pass for the wrong reason.
 */

/**
 * Set the route and render, SYNCHRONOUSLY and in one tick — the pathname is
 * shared module state and this runner uses isolation:'none' with concurrency,
 * so an await between the set and the render lets another file overwrite it.
 * Same shape (and same reasons) as test/render/adminFullHeightRoutes.
 */
function sidebarAt(pathname) {
  __setPathname(pathname);
  try {
    return renderToStaticMarkup(
      createElement(AdminSidebar, {
        isSuperadmin: true,
        pages: null,
        userName: 'Somchai',
        userEmail: 'somchai@9expert.co.th',
      })
    );
  } finally {
    __setPathname('/');
  }
}

/** How many rows the rendered sidebar marks as the current page. */
function activeRows(markup) {
  return [...markup.matchAll(/aria-current="page"/g)].length;
}

/** The hrefs of the <a> elements carrying aria-current, in document order. */
function activeHrefs(markup) {
  return [...markup.matchAll(/<a\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes('aria-current="page"'))
    .map((tag) => (tag.match(/href="([^"]*)"/) ?? [])[1]);
}

// The render must have produced a real sidebar before any count means anything:
// a component that threw and rendered nothing would report "zero active rows"
// on every path and look like a considered result.
test('sidebar renders its nav rows at all', () => {
  const markup = sidebarAt('/admin');
  assert.match(markup, /aria-label="Admin"/, 'the <nav> did not render');
  const rows = [...markup.matchAll(/<a\b/g)].length;
  assert.ok(rows >= 30, `only ${rows} links rendered — the counts below would be vacuous`);
});

const CASES = [
  ['/admin',                                           '/admin'],
  ['/admin/masterclass',                               '/admin/masterclass'],
  // THE DEFECT. Both /admin/masterclass and this href are prefixes of the path,
  // and the shipped per-item rule lit both rows.
  ['/admin/masterclass/registrations',                 '/admin/masterclass/registrations'],
  ['/admin/masterclass/68f0a1b2c3d4e5f607182930/edit', '/admin/masterclass'],
  ['/admin/promotions',                                '/admin/promotions'],
  ['/admin/promotions/banner',                         '/admin/promotions/banner'],
  ['/admin/courses/new',                               '/admin/courses'],
  ['/admin/faqs',                                      '/admin/faqs'],
  ['/admin/local-faqs',                                '/admin/local-faqs'],
];

for (const [pathname, expected] of CASES) {
  test(`sidebar: exactly one row is current on ${pathname}`, () => {
    const markup = sidebarAt(pathname);
    assert.equal(activeRows(markup), 1, `${activeRows(markup)} rows are marked current`);
    assert.deepEqual(activeHrefs(markup), [expected]);
  });
}

test('sidebar: a path no row owns highlights nothing rather than guessing', () => {
  const markup = sidebarAt('/admin/no-such-page');
  assert.equal(activeRows(markup), 0);
  // /admin is `exact`, so Dashboard does not become the fallback for every
  // unrecognised admin route.
  assert.deepEqual(activeHrefs(markup), []);
});

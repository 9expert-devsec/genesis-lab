import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PublicHeaderClient } from '@/components/layout/PublicHeaderClient';

/**
 * The header's right-side action cluster — search · theme toggle · hamburger.
 *
 * WHY THIS FILE EXISTS: a fourth action used to sit at the head of this
 * cluster, an Orbit button linking to a /universe route that has been
 * deleted. A stale <Link href="/universe"> is not a build error in Next —
 * it renders happily and 404s only when a visitor clicks it — so nothing in
 * the toolchain would catch the entry point being reintroduced. That is what
 * the first test below guards, and it is the reason the file is in the render
 * tier rather than the fs tier: the assertion is about what the header
 * actually EMITS, so it still holds if the link comes back through a config
 * array, a map, or any indirection a source grep would sail past.
 *
 * The remaining tests pin the cluster the removal left behind. Deleting the
 * first child of a `gap-2` flex row is the kind of edit that silently takes a
 * sibling with it, so search, toggle and hamburger are each asserted present,
 * and the container's own spacing class is pinned.
 */

// Realistic-but-inert props: every one degrades to empty upstream, which is
// the documented contract (PublicHeader passes empties on fetch failure).
const PROPS = {
  programs: [],
  dynamicCareerPaths: [],
  tnhsCourses: [],
  navOnlineCourses: [],
  navMenuData: { programs: {}, skills: {}, programSlugs: {}, skillSlugs: {} },
  navMasterclasses: [],
};

const html = renderToStaticMarkup(createElement(PublicHeaderClient, PROPS));

/** Does the rendered markup carry an anchor pointing at `href`? */
function hasLinkTo(markup, href) {
  return new RegExp(`<a\\b[^>]*href="${href.replace(/[/]/g, '\\/')}"`).test(markup);
}

test('the header emits NO link to /universe — the route is gone', () => {
  assert.equal(hasLinkTo(html, '/universe'), false, 'the /universe entry point is back');
  // Belt and braces: not as a link, not as a class hook, not anywhere.
  assert.ok(!/universe/i.test(html), 'no /universe reference of any kind may remain');
});

test('CONTROL: the same matcher DOES find a link that is present', () => {
  // Without this, hasLinkTo() could be broken (a bad regex, an unrendered
  // header) and the assertion above would pass for the wrong reason.
  assert.equal(hasLinkTo(html, '/search'), true, 'matcher failed on a link known to exist');
});

test('the search action survives the removal', () => {
  assert.match(html, /<a\b[^>]*href="\/search"[^>]*aria-label="ค้นหา"/);
});

test('the theme toggle survives the removal', () => {
  // Pre-mount placeholder — ThemeToggle renders the real switch only after
  // its mount effect, which renderToStaticMarkup never runs.
  assert.match(html, /<span[^>]*aria-hidden="true"[^>]*class="inline-block h-7 w-12 rounded-full/);
});

test('the hamburger survives the removal', () => {
  assert.match(html, /<button[^>]*aria-label="เปิดเมนู"/);
});

test('the actions container keeps its gap-2 spacing', () => {
  // The Orbit button was the first child of this row; removing a flex child
  // must not have touched the row itself.
  assert.match(html, /class="ml-auto flex flex-none items-center gap-2 lg:ml-0"/);
});

test('search is now the FIRST action in the cluster', () => {
  // Pins the order the removal produced. If a fourth action reappears ahead
  // of search — the exact shape of the regression this file guards — this
  // goes red even if that action is not a /universe link.
  const cluster = html.match(
    /class="ml-auto flex flex-none items-center gap-2 lg:ml-0">([\s\S]*?)<\/header>/
  );
  assert.ok(cluster, 'actions container not found in the rendered header');
  const firstAnchor = cluster[1].match(/<a\b[^>]*href="([^"]*)"/);
  assert.equal(firstAnchor?.[1], '/search');
});

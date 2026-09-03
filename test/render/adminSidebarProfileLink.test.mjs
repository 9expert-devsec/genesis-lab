import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import { readSource } from '../sourceScan.mjs';

/**
 * /admin/profile moved from a nav row to the footer identity card. The route to
 * it must survive the move — including the permission gate on it.
 *
 * ══ THE FAILURE MODE THIS IS FOR ════════════════════════════════════════════
 * `profile` is now the ONLY registered page with no nav row (allow-listed by
 * name in test/fs/adminNavShape). Every guard that would have noticed it
 * disappearing has been told not to. If the footer link then regressed — the
 * gate inverted, the wrapper reverted to a <div>, the collapsed rail losing its
 * icon — nothing else in the suite would say so, because from every other
 * guard's point of view `profile` is deliberately unlinked. That is precisely
 * the shape the ADMIN_PAGES/NAV_GROUPS parity guard exists for, one level down,
 * so the replacement route gets its own assertion rather than an allowlist and
 * a hope.
 *
 * ── THE GATE IS THE POINT, IN BOTH DIRECTIONS ───────────────────────────────
 * A permission check is only tested by the case it must REFUSE. A user without
 * `profile` gets the identity block as inert text — not a disabled-looking
 * link, not a link that leads to a 403 — so this asserts both that the <a>
 * appears with the permission and that it is absent without it, and that the
 * identity itself still renders either way (the block's other job, telling you
 * who you are signed in as, is not permission-gated).
 */

/** Render synchronously in one tick — see test/render/adminSidebarActiveItem. */
function sidebar(props) {
  __setPathname('/admin');
  try {
    return renderToStaticMarkup(createElement(AdminSidebar, {
      userName: 'Somchai Jaidee',
      userEmail: 'somchai@9expert.co.th',
      roleName: 'Content',
      roleColor: '#2563eb',
      ...props,
    }));
  } finally {
    __setPathname('/');
  }
}

/** The full <a> tag pointing at /admin/profile, or null. */
function profileAnchor(markup) {
  const tag = [...markup.matchAll(/<a\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => /href="\/admin\/profile"/.test(t));
  return tag ?? null;
}

/** Every page key except `profile` — a role with everything BUT this page. */
const ALL_BUT_PROFILE = ALL_PAGE_KEYS.filter((k) => k !== 'profile');

test('profile link: superadmin gets the identity card as a link', () => {
  const markup = sidebar({ isSuperadmin: true, pages: null });
  const anchor = profileAnchor(markup);
  assert.ok(anchor, 'the footer identity card does not link to /admin/profile');
  assert.match(markup, /Somchai Jaidee/, 'the identity itself still renders');
  assert.match(markup, /somchai@9expert\.co\.th/);
});

test('profile link: a role holding the profile key gets the link', () => {
  const markup = sidebar({ isSuperadmin: false, pages: ['dashboard', 'profile'] });
  assert.ok(profileAnchor(markup), 'canAccess(user, "profile") was true and no link rendered');
});

test('profile link: a role WITHOUT the key gets inert text, not a link', () => {
  const markup = sidebar({ isSuperadmin: false, pages: ALL_BUT_PROFILE });
  assert.equal(profileAnchor(markup), null,
    'a link to a page the user cannot open is a 403 the menu offered them');
  // The block still does its other job. Losing the identity along with the link
  // would be a silent regression for exactly the users who cannot see this test
  // fail any other way.
  assert.match(markup, /Somchai Jaidee/, 'the signed-in identity must still render');
  assert.match(markup, /Content/, 'and so must the role badge');
});

test('profile link: it is keyboard-reachable and visibly focusable', () => {
  // It became a control this round; a control that only a mouse can reach is
  // not finished. <a href> puts it in the tab order for free — what does not
  // come for free is a visible focus ring, and the default outline is removed
  // by the reset, so focus-visible has to put one back explicitly.
  const anchor = profileAnchor(sidebar({ isSuperadmin: true, pages: null }));
  assert.match(anchor, /focus-visible:ring-2/,
    'no focus ring: a keyboard user cannot see where they are');
  assert.match(anchor, /hover:bg-/, 'no hover affordance: it does not read as clickable');
  assert.match(anchor, /aria-label="[^"]+"/,
    'the accessible name would otherwise be the concatenated name, email and role badge');
});

test('profile link: the collapsed rail still has a route to the page', () => {
  // Collapsed, the identity text is hidden, so the card above is hidden with it
  // — and profile no longer has a nav row to fall back on. Without a footer
  // icon the page would be reachable only by typing the URL, which is the exact
  // defect test/fs/rbacNavParity was written for.
  //
  // `collapsed` is read from localStorage AFTER mount, so it is false in every
  // server render and cannot be driven from a prop: the collapsed rail CANNOT
  // be rendered from here. This reads the source instead and says so plainly —
  // it asserts the branch EXISTS and is gated the same way, which is weaker
  // than rendering it, and the appearance of the collapsed rail is named as
  // browser-only in the round report rather than quietly claimed here.
  //
  // Shape-bound, so: if you restructure this footer, come back and check this
  // still binds (test/sourceScan.mjs, defect 7).
  const { code } = readSource('src/components/layout/AdminSidebar.jsx');
  const links = [...code.matchAll(/href="\/admin\/profile"/g)].length;
  assert.equal(links, 2,
    'expected two links to /admin/profile in the footer — the expanded identity '
    + 'card and the collapsed icon-only row. One of them is gone, or the href moved '
    + 'into a variable this matcher cannot see');
  assert.match(code, /\{collapsed && canReachProfile && \(/,
    'the collapsed footer link must carry the SAME canAccess gate as the expanded one');
});

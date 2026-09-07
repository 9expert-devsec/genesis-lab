import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname } from 'next/navigation';
import { AdminSidebar, AdminSidebarFooter } from '@/components/layout/AdminSidebar';
import { readSource } from '../sourceScan.mjs';

/**
 * The avatar in the sidebar footer, in BOTH rail states.
 *
 * ══ THIS IS THE TIER THAT MATTERS, AND ROUND A IS WHY ═══════════════════════
 * Every test in test/pure/avatarUrl passes while the sidebar renders a raw
 * publicId into `src`. The function would be correct; nothing would call it.
 * That is exactly the hole round A fell into — a correct longest-match selector
 * that the component never used, with the pure and fs tiers both green — and
 * the round-B brief names it as the lesson. So the assertions here are about
 * the rendered `src` attribute, not about the helper.
 *
 * ── THE COLLAPSED RAIL IS NOW REALLY RENDERED ───────────────────────────────
 * Round A could not do this. `collapsed` is post-mount state read from
 * localStorage, so it is always false in a server render, and the collapsed
 * branch could only be asserted by reading the source — which
 * test/render/adminSidebarProfileLink said plainly at the time.
 *
 * The footer is now its own exported component taking `collapsed` as a PROP.
 * AdminSidebar passes the state it already had, so nothing changed at runtime,
 * and the collapsed rail can be mounted directly. The source-read assertion it
 * replaces has been deleted rather than left alongside: two guards on one claim
 * means the weaker one is what people read.
 */

const PUBLIC_ID = '9expert/avatars/abc123';
const DEFAULT_36 = '/avatar/avatar-default-128.png';

const IDENTITY = {
  userName: 'Somchai Jaidee',
  userEmail: 'somchai@9expert.co.th',
  badgeLabel: 'Content',
};

const footer = (props) =>
  renderToStaticMarkup(createElement(AdminSidebarFooter, { ...IDENTITY, ...props }));

const imgTags = (markup) => [...markup.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const anchorTags = (markup) => [...markup.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) ?? [])[1];
const profileAnchor = (markup) =>
  anchorTags(markup).find((t) => /href="\/admin\/profile"/.test(t)) ?? null;

// ── expanded rail ───────────────────────────────────────────────────────────
test('expanded, no avatar set: the src is the bundled default asset path', () => {
  const markup = footer({ collapsed: false, canReachProfile: true, userImagePublicId: null });
  const imgs = imgTags(markup);
  assert.equal(imgs.length, 1, `expected one avatar, found ${imgs.length}`);
  assert.equal(attr(imgs[0], 'src'), DEFAULT_36);
});

test('expanded, avatar set: the src is a Cloudinary URL with the 36px transform', () => {
  const markup = footer({ collapsed: false, canReachProfile: true, userImagePublicId: PUBLIC_ID });
  const src = attr(imgTags(markup)[0], 'src');
  assert.ok(src.startsWith('https://res.cloudinary.com/'), src);
  assert.match(src, /\bw_36\b/);
  assert.match(src, /\bh_36\b/);
  assert.ok(src.endsWith(`/${PUBLIC_ID}`), src);
});

test('expanded: the raw publicId is never the src', () => {
  // The bypass this whole file exists to catch: interpolating
  // `userImagePublicId` straight into src instead of calling avatarUrl.
  const src = attr(imgTags(footer({
    collapsed: false, canReachProfile: true, userImagePublicId: PUBLIC_ID,
  }))[0], 'src');
  assert.notEqual(src, PUBLIC_ID);
  assert.match(src, /\/image\/upload\//, 'the transform is missing entirely');
});

test('expanded: the avatar is INSIDE the single /admin/profile link', () => {
  const markup = footer({ collapsed: false, canReachProfile: true, userImagePublicId: PUBLIC_ID });
  const anchor = profileAnchor(markup);
  assert.ok(anchor, 'the identity card does not link to /admin/profile');

  // The <img> must appear after the opening <a> and before its </a>.
  const openAt = markup.indexOf(anchor);
  const closeAt = markup.indexOf('</a>', openAt);
  const imgAt = markup.indexOf('<img');
  assert.ok(imgAt > openAt && imgAt < closeAt,
    'the avatar is outside the link — it must be part of the same control');
});

test('expanded: ONE focus ring on ONE control, and the avatar is not a link', () => {
  // A second tab stop landing on the same destination reads as a broken
  // control to anyone using a keyboard, and two rings on one row look like two
  // controls.
  const markup = footer({ collapsed: false, canReachProfile: true, userImagePublicId: PUBLIC_ID });
  const profileLinks = anchorTags(markup).filter((t) => /href="\/admin\/profile"/.test(t));
  assert.equal(profileLinks.length, 1, `${profileLinks.length} links to /admin/profile in one footer`);
  assert.equal(
    [...profileLinks[0].matchAll(/focus-visible:ring-2/g)].length, 1,
    'exactly one focus-ring class on the control',
  );
  const img = imgTags(markup)[0];
  assert.ok(!/tabindex/i.test(img), 'the avatar has its own tab stop');
  assert.ok(!/href=/.test(img), 'the avatar is a link of its own');
});

// ── collapsed rail — REALLY RENDERED, not source-read ───────────────────────
test('collapsed: the avatar renders and is the visible affordance', () => {
  const markup = footer({ collapsed: true, canReachProfile: true, userImagePublicId: PUBLIC_ID });
  const imgs = imgTags(markup);
  assert.equal(imgs.length, 1, 'the collapsed rail must show exactly one avatar');
  assert.match(attr(imgs[0], 'src'), /\bw_36\b/);
  // The identity text is hidden at this width — the avatar is all there is.
  assert.ok(!markup.includes('Somchai Jaidee'), 'the name would overflow the narrow rail');
});

test('collapsed: the avatar is inside the /admin/profile link, which keeps its label', () => {
  const markup = footer({ collapsed: true, canReachProfile: true, userImagePublicId: null });
  const anchor = profileAnchor(markup);
  assert.ok(anchor, 'collapsed, /admin/profile has NO route from the menu at all');
  assert.match(anchor, /aria-label="โปรไฟล์ของฉัน"/,
    'the accessible name is the only thing naming this control when the text is hidden');
  assert.match(anchor, /focus-visible:ring-2/);
});

test('collapsed, no avatar set: the control is not an empty box', () => {
  const markup = footer({ collapsed: true, canReachProfile: true, userImagePublicId: null });
  assert.equal(attr(imgTags(markup)[0], 'src'), DEFAULT_36,
    'with no photo and no text, an empty link is an invisible control');
});

// ── the permission gate ─────────────────────────────────────────────────────
test('no profile permission: the avatar still renders, with no link', () => {
  for (const collapsed of [false, true]) {
    const markup = footer({ collapsed, canReachProfile: false, userImagePublicId: PUBLIC_ID });
    assert.equal(imgTags(markup).length, 1, `avatar missing when collapsed=${collapsed}`);
    assert.equal(profileAnchor(markup), null,
      `a link to a page the user cannot open, when collapsed=${collapsed}`);
    assert.ok(!/tabindex/i.test(imgTags(markup)[0]), 'inert markup must not be focusable');
  }
});

test('no profile permission, expanded: the identity itself still renders', () => {
  // Saying who is signed in is this block's other job, and it is not
  // permission-gated. Losing it along with the link would make the rail look
  // different for a role rather than offer less.
  const markup = footer({ collapsed: false, canReachProfile: false, userImagePublicId: null });
  assert.match(markup, /Somchai Jaidee/);
  assert.match(markup, /Content/);
});

// ── the whole sidebar, so the prop is proven to reach the footer ────────────
test('AdminSidebar threads userImagePublicId through to the footer', () => {
  // The footer tests above mount the component directly, so they would all
  // pass if AdminSidebar forgot to pass the prop. This is that seam.
  __setPathname('/admin');
  try {
    const markup = renderToStaticMarkup(createElement(AdminSidebar, {
      isSuperadmin: true,
      pages: null,
      userName: 'Somchai',
      userEmail: 'somchai@9expert.co.th',
      userImagePublicId: PUBLIC_ID,
    }));
    const img = imgTags(markup).find((t) => /res\.cloudinary\.com/.test(attr(t, 'src')));
    assert.ok(img, 'the publicId did not reach the footer avatar');
    assert.match(attr(img, 'src'), /\bw_36\b/);
  } finally {
    __setPathname('/');
  }
});

test('AdminSidebar with no avatar renders the default, not a broken img', () => {
  __setPathname('/admin');
  try {
    const markup = renderToStaticMarkup(createElement(AdminSidebar, {
      isSuperadmin: true,
      pages: null,
      userName: 'Somchai',
      userEmail: 'somchai@9expert.co.th',
    }));
    assert.ok(imgTags(markup).some((t) => attr(t, 'src') === DEFAULT_36),
      'the bundled default is not rendered when userImagePublicId is omitted');
  } finally {
    __setPathname('/');
  }
});

// ── the layout seam ─────────────────────────────────────────────────────────
test('the layout reads the avatar from Mongo, not from the session', () => {
  // Shape-bound (test/sourceScan.mjs, defect 7). It is here because the failure
  // is invisible: a session-sourced avatar renders perfectly and is simply up
  // to 16 hours stale, which nobody reports as a bug — they report that
  // uploading "didn't work".
  const { code, withImports } = readSource('src/app/admin/layout.jsx');
  assert.match(withImports, /import Admin from '@\/models\/Admin'/,
    'the layout does not import the Admin model');
  assert.match(code, /Admin\.findOne\(\{ email: user\.email \}\)\.select\('imagePublicId'\)\.lean\(\)/,
    'the narrow lookup is gone or was widened');
  assert.match(code, /userImagePublicId=\{userImagePublicId\}/,
    'the value is read but never passed to the sidebar');
  assert.doesNotMatch(code, /user\?\.imagePublicId|session[^\n]*imagePublicId/,
    'the avatar is being read off the session — that is the JWT staleness trap');
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the two avatar states render different src values', () => {
  // Without this, a footer that ignored `userImagePublicId` entirely and always
  // rendered the default would satisfy every "the default is shown" assertion
  // above and look correct.
  const withPhoto = attr(imgTags(footer({ collapsed: false, canReachProfile: true, userImagePublicId: PUBLIC_ID }))[0], 'src');
  const without = attr(imgTags(footer({ collapsed: false, canReachProfile: true, userImagePublicId: null }))[0], 'src');
  assert.notEqual(withPhoto, without);
});

test('CONTROL: collapsed and expanded really are different renderings', () => {
  // The collapsed assertions are only meaningful if the prop changes anything.
  const expanded = footer({ collapsed: false, canReachProfile: true, userImagePublicId: null });
  const collapsed = footer({ collapsed: true, canReachProfile: true, userImagePublicId: null });
  assert.notEqual(expanded, collapsed);
  assert.match(expanded, /Somchai Jaidee/);
  assert.ok(!collapsed.includes('Somchai Jaidee'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname } from 'next/navigation';
import { AdminSidebar, AdminSidebarFooter } from '@/components/layout/AdminSidebar';

/**
 * WHICH token reaches WHICH element.
 *
 * ══ WHY THIS TIER, AND NOT THE TWO THAT ALREADY PASS ════════════════════════
 * test/fs/adminRailContrast proves the token VALUES clear AA. test/fs/adminRailTheme
 * proves the component contains no raw hex and no theme variant. Both stay green
 * if the group header is painted with --admin-rail-item, if the active pill and
 * the hover fill are swapped, or if the focus ring is applied to nothing at all
 * — every one of those uses correct tokens in a wrong place.
 *
 * That is round A's lesson stated one round later: the pure and fs guards were
 * all green while the UI was wrong, because a correct value that reaches the
 * wrong element is invisible to any test that never renders. So this file
 * renders and reads the class strings off the markup.
 *
 * ── WHAT IT STILL CANNOT SEE ────────────────────────────────────────────────
 * Class strings, not computed styles. It cannot tell you that
 * `bg-[var(--admin-rail-surface)]` produced #0D1B2A on screen, that a hover
 * actually lifted, that a focus ring was visible, or how 11px Thai glyphs
 * anti-alias at these ratios. Named as unverified in the round report.
 */

const PUBLIC_ID = '9expert/avatars/abc123';

function sidebar(pathname = '/admin/courses', props = {}) {
  __setPathname(pathname);
  try {
    return renderToStaticMarkup(createElement(AdminSidebar, {
      isSuperadmin: true,
      pages: null,
      userName: 'Somchai Jaidee',
      userEmail: 'somchai@9expert.co.th',
      roleName: 'Content',
      roleColor: '#2563eb',
      userImagePublicId: PUBLIC_ID,
      ...props,
    }));
  } finally {
    __setPathname('/');
  }
}

const footer = (props) => renderToStaticMarkup(createElement(AdminSidebarFooter, {
  userName: 'Somchai Jaidee',
  userEmail: 'somchai@9expert.co.th',
  badgeLabel: 'Content',
  ...props,
}));

/** Every tag of a kind, as raw strings. */
const tags = (markup, name) => [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);

/**
 * Just the <nav>, so "a nav row" means a nav row.
 *
 * MEASURED: the first version of this file selected rows by `href="/admin`
 * across the whole rail, which swept in the FOOTER's profile card — an <a> to
 * /admin/profile that is deliberately styled as a light card and carries none
 * of the nav-item classes. The sweep then failed on an element it was never
 * about. Nav rows and footer controls are different things and the selector has
 * to know it.
 */
function navRegion(markup) {
  const start = markup.indexOf('<nav');
  const end = markup.indexOf('</nav>', start);
  assert.ok(start !== -1 && end !== -1, 'no <nav> in the rendered rail');
  return markup.slice(start, end);
}

/** The one nav <a> marked as the current page. */
const activeRow = (markup) => tags(navRegion(markup), 'a').find((t) => t.includes('aria-current="page"')) ?? null;
/** The nav <a> rows that are not the current page. */
const inactiveRows = (markup) => tags(navRegion(markup), 'a')
  .filter((t) => !t.includes('aria-current="page"'));

test('the rail surface and its divider come from the rail tokens', () => {
  const aside = tags(sidebar(), 'aside')[0];
  assert.ok(aside, 'no <aside> rendered');
  assert.match(aside, /md:bg-\[var\(--admin-rail-surface\)\]/);
  assert.match(aside, /md:border-\[var\(--admin-rail-divider\)\]/,
    'the right edge must be a real divider against the dark surface, not a light hairline');
  assert.match(aside, /md:w-60/, 'the rail is 240px per the mockup geometry');
});

test('the active row is a solid pill, not a tint', () => {
  const row = activeRow(sidebar('/admin/courses'));
  assert.ok(row, 'no active row rendered');
  assert.match(row, /bg-\[var\(--admin-rail-active-bg\)\]/);
  assert.match(row, /text-\[var\(--admin-rail-active-fg\)\]/);
  assert.match(row, /rounded-9e-sm/, 'radius 8 per the mockup');
  // The old marker is gone in both halves — a 10% tint and a left border.
  assert.ok(!/bg-9e-action\/10/.test(row), 'the 10% tint is back; it is invisible on navy');
  assert.ok(!/border-l-2/.test(row), 'the left-border marker is back');
});

test('inactive rows take the item token and the hover fill', () => {
  const rows = inactiveRows(sidebar('/admin/courses'));
  assert.ok(rows.length >= 20, `only ${rows.length} inactive rows — the sweep is wrong`);
  for (const row of rows) {
    assert.match(row, /text-\[var\(--admin-rail-item\)\]/, row);
    assert.match(row, /hover:bg-\[var\(--admin-rail-hover\)\]/, row);
    assert.match(row, /hover:text-\[var\(--admin-rail-brand\)\]/, row);
  }
});

test('the active row does NOT also carry the inactive treatment', () => {
  // The two branches must be exclusive. Both applied at once would let the
  // hover fill paint over the pill.
  const row = activeRow(sidebar('/admin/courses'));
  assert.ok(!/text-\[var\(--admin-rail-item\)\]/.test(row), row);
  assert.ok(!/hover:bg-\[var\(--admin-rail-hover\)\]/.test(row), row);
});

test('THE GROUP HEADER TAKES NO HOVER FILL — it brightens its text instead', () => {
  // The measured rule from test/fs/adminRailContrast: --admin-rail-group on
  // --admin-rail-hover is 3.90:1, below AA. A header that lifted would become
  // unreadable at exactly the moment the pointer was on it. Only a render can
  // see that the split was actually applied to the right element.
  const headers = tags(sidebar(), 'button').filter((t) => /aria-controls="admin-nav-/.test(t));
  assert.equal(headers.length, 6, `expected 6 group headers, found ${headers.length}`);
  for (const h of headers) {
    assert.match(h, /text-\[var\(--admin-rail-group\)\]/, h);
    assert.match(h, /hover:text-\[var\(--admin-rail-brand\)\]/, h);
    assert.ok(!/hover:bg-/.test(h),
      'the group header must not take a hover fill — its colour measures 3.90:1 on it');
  }
});

test('every interactive rail control carries the rail focus ring', () => {
  // A2 and B5 both depend on this, and the colour had to be re-picked for the
  // dark surface: --9e-action scores 3.29:1 here and all but vanishes.
  const markup = sidebar();
  const controls = [
    ...tags(markup, 'button').filter((t) => !/aria-hidden/.test(t)),
    ...tags(markup, 'a').filter((t) => /href="\/admin/.test(t)),
  ];
  assert.ok(controls.length >= 30, `only ${controls.length} controls swept`);
  for (const c of controls) {
    assert.match(c, /focus-visible:ring-\[var\(--admin-rail-focus\)\]/, c);
    assert.match(c, /focus-visible:ring-offset-\[var\(--admin-rail-surface\)\]/, c);
    assert.ok(!/focus-visible:ring-9e-action\b/.test(c),
      'the white-background ring colour is back; it scores 3.29:1 on this rail');
  }
});

test('hover, focus and active stay three distinguishable treatments', () => {
  // Not two. The failure would be silent: if hover and active shared a
  // background, the active row would simply stop being distinguishable from
  // whatever the pointer is over.
  const markup = sidebar('/admin/courses');
  const active = activeRow(markup);
  const inactive = inactiveRows(markup)[0];
  assert.match(active, /bg-\[var\(--admin-rail-active-bg\)\]/);   // solid fill
  assert.match(inactive, /hover:bg-\[var\(--admin-rail-hover\)\]/); // lift
  assert.match(inactive, /focus-visible:ring-2/);                   // ring
  assert.notEqual(
    /bg-\[var\(--admin-rail-active-bg\)\]/.test(inactive), true,
    'an inactive row paints the active fill',
  );
});

// ── the footer, in both rail states ─────────────────────────────────────────
test('the user card is a light surface with the card tokens on it', () => {
  const markup = footer({ collapsed: false, canReachProfile: true, userImagePublicId: PUBLIC_ID });
  const card = tags(markup, 'a').find((t) => /href="\/admin\/profile"/.test(t));
  assert.ok(card, 'the identity card does not link to /admin/profile');
  assert.match(card, /bg-\[var\(--admin-rail-card\)\]/);
  assert.match(card, /hover:bg-\[var\(--admin-rail-card-hover\)\]/,
    'the card must lift to its own hover colour — the rail fill would invert it');
  assert.match(card, /rounded-9e-md/, 'radius 12 per the mockup');
  assert.match(markup, /text-\[var\(--admin-rail-card-fg\)\]/, 'the user name');
  assert.match(markup, /text-\[var\(--admin-rail-card-muted\)\]/, 'the user email');
});

test('the unlinked card keeps the same surface — the rail does not look different for a role', () => {
  const markup = footer({ collapsed: false, canReachProfile: false, userImagePublicId: PUBLIC_ID });
  assert.match(markup, /bg-\[var\(--admin-rail-card\)\]/);
  assert.equal(tags(markup, 'a').length, 0, 'a link rendered for a user who cannot open the page');
  assert.match(markup, /Somchai Jaidee/);
});

test('collapsed: the avatar row takes the RAIL hover fill, not the card one', () => {
  // There is no card at that width — the avatar sits directly on the rail.
  const markup = footer({ collapsed: true, canReachProfile: true, userImagePublicId: PUBLIC_ID });
  const link = tags(markup, 'a').find((t) => /href="\/admin\/profile"/.test(t));
  assert.ok(link, 'collapsed, /admin/profile has no route from the menu');
  assert.match(link, /hover:bg-\[var\(--admin-rail-hover\)\]/);
  assert.ok(!/admin-rail-card-hover/.test(link), 'the card hover colour leaked into the collapsed rail');
  assert.match(link, /focus-visible:ring-\[var\(--admin-rail-focus\)\]/);
});

test('collapsed: the rail still paints, so the icon-only state is not bare', () => {
  const markup = sidebar('/admin/courses');
  // The collapsed rail cannot be driven from a prop on AdminSidebar (collapsed
  // is post-mount state), so this checks the always-rendered half: the group
  // divider used when collapsed reads the rail's divider token.
  assert.match(markup, /border-\[var\(--admin-rail-divider\)\]/);
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the active and inactive rows really do render differently', () => {
  // Every assertion above is per-branch. If both branches emitted the same
  // string, half of them would be checking the other half's element.
  const markup = sidebar('/admin/courses');
  assert.notEqual(activeRow(markup), inactiveRows(markup)[0]);
});

test('CONTROL: the sweeps found real elements, not empty lists', () => {
  // Six `for` loops above report success over an empty collection.
  const markup = sidebar();
  assert.ok(tags(markup, 'a').length >= 30, 'no nav rows found');
  assert.ok(tags(markup, 'button').length >= 7, 'no buttons found');
  assert.ok(tags(markup, 'aside').length === 1, 'no rail found');
});

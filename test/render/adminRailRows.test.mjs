import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname } from 'next/navigation';
import { SidebarItem, AdminSidebarFooter, AdminSidebarHeader } from '@/components/layout/AdminSidebar';

/**
 * THE ROW BOX, and the collapsed rail's geometry.
 *
 * ══ THE DEFECT THIS FILE PINS ═══════════════════════════════════════════════
 * Round C copied the mockup's geometry literally, so the active nav row was
 * TALLER than an inactive one (py-2.5 vs py-1.5) and carried a BIGGER icon
 * (18px vs 16px). On a static mockup that reads as emphasis. In a live menu it
 * means the list reflows every time you navigate: the row you land on grows by
 * 8px and pushes every row below it down, so the thing you were about to click
 * has moved out from under the pointer.
 *
 * Nothing could see that. It is not a colour, so the token guards were green;
 * it is not a missing class, so the palette render test was green; and it does
 * not throw. The only way to catch it is to render both branches and compare
 * the boxes, which is what this file does.
 *
 * ── AND ITS OTHER HALF: THE COLLAPSED ACTIVE ROW ────────────────────────────
 * The same literal copy left the expanded pill's `w-full` on the collapsed row,
 * so the active icon sat in a capsule stretched across a 64px rail instead of
 * in a centred square tile. Both halves are asserted here because they are one
 * mistake, and fixing either alone leaves the rail wrong.
 *
 * ── WHY THE SUBCOMPONENTS AND NOT AdminSidebar ──────────────────────────────
 * `collapsed` is post-mount localStorage state, so a server render of
 * AdminSidebar is ALWAYS expanded and half of these assertions could not be
 * made at all. SidebarItem, AdminSidebarHeader and AdminSidebarFooter each take
 * it as a prop; AdminSidebar passes exactly the state it already had. Round B
 * did this for the footer and said why.
 *
 * ── WHAT THIS TIER CANNOT SEE ───────────────────────────────────────────────
 * Class strings, not computed geometry. `h-9` and `w-9` are asserted as CLASSES
 * — this file cannot tell you the tile rendered 36 physical pixels, that the
 * icon is optically centred in it, that the collapsed column lines up with the
 * footer, or that a Thai label at 13px fits a 240px rail without wrapping.
 * Named as unverified in the round report.
 */

const ITEM = { href: '/admin/courses', label: 'คอร์สเรียน', icon: 'GraduationCap', pageKey: 'courses' };
const OTHER = { href: '/admin/banners', label: 'แบนเนอร์', icon: 'Image', pageKey: 'banners' };

const row = (props) => renderToStaticMarkup(createElement(SidebarItem, { item: ITEM, ...props }));

const footer = (props) => renderToStaticMarkup(createElement(AdminSidebarFooter, {
  userName: 'Somchai Jaidee',
  userEmail: 'somchai@9expert.co.th',
  badgeLabel: 'Content',
  onLogout() {},
  ...props,
}));

const tags = (markup, name) => [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) ?? [])[1];
const classes = (tag) => new Set((attr(tag, 'class') ?? '').split(/\s+/).filter(Boolean));

/** The classes that decide a row's BOX — height, width, padding, gap. */
const BOX = /^(h-|w-|p-|px-|py-|pt-|pb-|gap-|min-h-|max-h-)/;
const boxOf = (tag) => [...classes(tag)].filter((c) => BOX.test(c)).sort();

/** The classes that decide an icon's SIZE. */
const sizeOf = (tag) => [...classes(tag)].filter((c) => /^[hw]-/.test(c)).sort();

// ── D6.1: ROW PARITY, in both states ────────────────────────────────────────
for (const collapsed of [false, true]) {
  const state = collapsed ? 'collapsed' : 'expanded';

  test(`${state}: the active row and an inactive row resolve to the SAME box`, () => {
    const active = tags(row({ isActive: true, collapsed }), 'a')[0];
    const inactive = tags(row({ isActive: false, collapsed }), 'a')[0];
    assert.ok(active && inactive, 'a row failed to render');
    assert.deepEqual(
      boxOf(active), boxOf(inactive),
      'the active row has different box classes from an inactive one, so the list '
      + 'changes height as you navigate and every row below the current one moves',
    );
    // …and the box really is the one the rail declares, rather than the two
    // branches agreeing on some third value.
    assert.ok(classes(active).has('h-9'), `active row box: ${boxOf(active).join(' ')}`);
    assert.ok(classes(inactive).has('h-9'), `inactive row box: ${boxOf(inactive).join(' ')}`);
    // No vertical padding at all: height is set once, by h-9. A py-* here would
    // add to it and reintroduce the same drift by a different name.
    for (const tag of [active, inactive]) {
      assert.ok(![...classes(tag)].some((c) => /^py-/.test(c)),
        `a row carries vertical padding on top of h-9: ${boxOf(tag).join(' ')}`);
    }
  });

  test(`${state}: the active icon and an inactive icon are the SAME size`, () => {
    const active = tags(row({ isActive: true, collapsed }), 'svg')[0];
    const inactive = tags(row({ isActive: false, collapsed }), 'svg')[0];
    assert.ok(active && inactive, 'a row rendered no icon');
    assert.deepEqual(sizeOf(active), sizeOf(inactive),
      'the active row carries a bigger icon, which changes the row height with it');
    assert.deepEqual(sizeOf(active), ['h-[18px]', 'w-[18px]']);
  });
}

test('the box is the same ACROSS the two states as well, not just within each', () => {
  // The height is what has to hold: a rail that changes row height when it
  // collapses is the same reflow one step out. The WIDTH is meant to differ —
  // that is the tile — so only the height class is compared.
  const expanded = tags(row({ isActive: true, collapsed: false }), 'a')[0];
  const collapsed = tags(row({ isActive: true, collapsed: true }), 'a')[0];
  assert.ok(classes(expanded).has('h-9') && classes(collapsed).has('h-9'));
  assert.deepEqual(
    sizeOf(tags(row({ isActive: false, collapsed: false }), 'svg')[0]),
    sizeOf(tags(row({ isActive: false, collapsed: true }), 'svg')[0]),
    'the icon changes size when the rail collapses',
  );
});

// ── D6.2: THE COLLAPSED ACTIVE ROW IS A TILE, NOT A SQUEEZED PILL ───────────
test('collapsed: the active row is a centred SQUARE tile', () => {
  const tag = tags(row({ isActive: true, collapsed: true }), 'a')[0];
  const cls = classes(tag);
  assert.ok(cls.has('w-9'), `the collapsed row is not 36px wide: ${boxOf(tag).join(' ')}`);
  assert.ok(cls.has('h-9'), 'the collapsed row is not 36px tall — the tile is not square');
  assert.ok(cls.has('mx-auto'), 'the tile is not centred on the rail');
  assert.ok(cls.has('justify-center'), 'the icon is not centred inside the tile');
  // The radius is the expanded pill's radius, so the two states read as one
  // component at two widths rather than as two designs.
  assert.ok(cls.has('rounded-9e-sm'), 'the tile does not share the pill radius');
  // And it is still painted as the active row.
  assert.match(tag, /bg-\[var\(--admin-rail-active-bg\)\]/);
});

test('collapsed: the active row does NOT carry the expanded pill classes', () => {
  // THE ASSERTION FOR THE DEFECT ITSELF. `w-full` is what turns the tile back
  // into a capsule stretched across a 64px rail with the label clipped off;
  // gap-3 and px-3 are the rest of the expanded box coming with it.
  const tag = tags(row({ isActive: true, collapsed: true }), 'a')[0];
  for (const banned of ['w-full', 'gap-3', 'px-3']) {
    assert.ok(!classes(tag).has(banned),
      `the collapsed active row carries "${banned}" — that is the expanded row's box, `
      + 'and on a 64px rail it renders as a stretched capsule rather than a tile');
  }
});

test('collapsed: an INACTIVE row is the same tile, so only the paint differs', () => {
  const active = tags(row({ isActive: true, collapsed: true }), 'a')[0];
  const inactive = tags(row({ isActive: false, collapsed: true }), 'a')[0];
  assert.deepEqual(boxOf(active), boxOf(inactive));
  assert.ok(classes(inactive).has('mx-auto') && classes(inactive).has('w-9'));
});

test('expanded: the row IS full width — the tile is the collapsed state only', () => {
  // The other direction. If RAIL_TILE were applied in both states, every
  // assertion above would still pass and the expanded menu would be a column of
  // 36px squares with the labels gone.
  const tag = tags(row({ isActive: true, collapsed: false }), 'a')[0];
  assert.ok(classes(tag).has('w-full'), `the expanded row is not full width: ${boxOf(tag).join(' ')}`);
  assert.ok(!classes(tag).has('mx-auto'), 'the expanded row is centred as a tile');
  assert.match(tag, /gap-3/);
});

// ── D6.3: ACCESSIBLE NAMES IN THE COLLAPSED RAIL ────────────────────────────
test('collapsed: every nav row exposes a non-empty accessible name', () => {
  // With the label gone the link's only child is an aria-hidden <svg>, so
  // without a name the row announces as "link" and nothing else. `title` alone
  // is a description most screen readers will fall back to using as a name —
  // which is not the same as having one.
  for (const item of [ITEM, OTHER]) {
    const tag = tags(renderToStaticMarkup(
      createElement(SidebarItem, { item, isActive: false, collapsed: true }),
    ), 'a')[0];
    const label = attr(tag, 'aria-label');
    assert.ok(label && label.trim().length > 0, `${item.href} collapses to an unnamed link`);
    assert.equal(label, item.label, 'the name is not the row’s own label');
    assert.equal(attr(tag, 'title'), item.label, 'the visual tooltip is gone');
  }
});

test('expanded: the rows do NOT carry aria-label — it would override the visible text', () => {
  // Adding it "for consistency" is the likely next edit and it is wrong: an
  // aria-label REPLACES the accessible name computed from the content, so the
  // Thai label a sighted user reads and the string a screen reader announces
  // become two things that can drift.
  const tag = tags(row({ isActive: false, collapsed: false }), 'a')[0];
  assert.equal(attr(tag, 'aria-label'), undefined);
  assert.match(tag + row({ isActive: false, collapsed: false }), /คอร์สเรียน/);
});

test('collapsed: the footer controls expose names too, not just the nav', () => {
  // The rail does not end at the nav list. Logout is the one that had only a
  // `title`; the theme toggle and the profile link already had labels and are
  // asserted here so a later "tidy-up" cannot quietly drop one.
  const markup = footer({ collapsed: true, canReachProfile: true });
  const named = [...tags(markup, 'a'), ...tags(markup, 'button')];
  assert.ok(named.length >= 3, `only ${named.length} footer controls found`);
  for (const tag of named) {
    const label = attr(tag, 'aria-label');
    assert.ok(label && label.trim().length > 0, `an unnamed collapsed footer control: ${tag}`);
  }
});

test('collapsed: the header exposes a name as well, so the rail says what it is', () => {
  // Completes the sweep the round asks for — every nav row AND the header.
  // The header's name is the mark's alt; adminRailHeader owns the detail.
  const img = tags(renderToStaticMarkup(
    createElement(AdminSidebarHeader, { collapsed: true, onToggleCollapsed() {} }),
  ), 'img')[0];
  assert.ok((attr(img, 'alt') ?? '').trim().length > 0, 'the collapsed header has no name');
});

// ── D4: the footer aligns with the nav ──────────────────────────────────────
test('collapsed: the footer controls are the same tile as the nav rows', () => {
  // "The footer avatar, theme toggle and logout icons align to the same centre
  // line and the same tile size as the nav icons." Same classes, so the same
  // line — this tier cannot measure the line itself, but it can insist the two
  // are described identically.
  const markup = footer({ collapsed: true, canReachProfile: true });
  const controls = [...tags(markup, 'a'), ...tags(markup, 'button')];
  const navBox = boxOf(tags(row({ isActive: false, collapsed: true }), 'a')[0]);
  for (const tag of controls) {
    assert.deepEqual(boxOf(tag), navBox, `a footer control has a different box: ${tag}`);
  }
  // …and the icons match the nav's icons.
  for (const svg of tags(markup, 'svg')) {
    assert.deepEqual(sizeOf(svg), ['h-[18px]', 'w-[18px]'], svg);
  }
});

test('collapsed: the avatar is still 36px, inside that same tile', () => {
  // The one thing in the footer that is not an icon, and the round says it
  // keeps its size in both states. It happens to fill the tile exactly, which
  // is why the tile is 36 rather than anything else.
  const img = tags(footer({ collapsed: true, canReachProfile: true }), 'img')[0];
  assert.equal(attr(img, 'width'), '36');
  assert.equal(attr(img, 'height'), '36');
});

test('expanded: the footer rows are full-width again, and the card is untouched', () => {
  const markup = footer({ collapsed: false, canReachProfile: true });
  const card = tags(markup, 'a').find((t) => /href="\/admin\/profile"/.test(t));
  assert.ok(card, 'the identity card is gone');
  assert.match(card, /rounded-9e-md/, 'the card lost its radius');
  // ONE link, ONE ring — the round-B rule, restated because this file rewrote
  // the boxes around it.
  assert.equal(tags(markup, 'a').length, 1, 'the footer grew a second link');
  const buttons = tags(markup, 'button');
  assert.ok(buttons.length >= 2, `only ${buttons.length} footer buttons`);
  for (const b of buttons) assert.ok(classes(b).has('w-full'), b);
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: boxOf really extracts classes, and really distinguishes two boxes', () => {
  // Every parity assertion is a deepEqual over boxOf(). If it returned [] for
  // everything — a class attribute it could not read, a regex that matched
  // nothing — every one of them would pass over two empty arrays.
  const expanded = boxOf(tags(row({ isActive: true, collapsed: false }), 'a')[0]);
  const collapsed = boxOf(tags(row({ isActive: true, collapsed: true }), 'a')[0]);
  assert.ok(expanded.length >= 3, `boxOf extracted ${expanded.length} classes`);
  assert.notDeepEqual(expanded, collapsed, 'the two states produce the same box classes');
  assert.deepEqual(boxOf('<a class="text-red-500 flex">'), [], 'boxOf matched a non-box class');
  assert.deepEqual(boxOf('<a>'), [], 'boxOf invented classes for a bare tag');
});

test('CONTROL: the active and inactive rows really do render differently', () => {
  // Everything above asserts the two are the SAME in some respect. If the
  // `isActive` prop did nothing, all of it would be trivially true.
  assert.notEqual(row({ isActive: true, collapsed: true }), row({ isActive: false, collapsed: true }));
  assert.match(row({ isActive: true, collapsed: true }), /aria-current="page"/);
  assert.ok(!/aria-current/.test(row({ isActive: false, collapsed: true })));
});

'use client';

import { usePathname } from 'next/navigation';
import { ScrollToTopButton } from '@/components/ui/ScrollToTopButton';
import { dockLiftsForBottomBar, shouldRenderFloatingDock } from '@/lib/floatingDock';

/**
 * FloatingActionDock — the ONE fixed container that owns the bottom-right
 * floating stack.
 *
 * ── WHY A DOCK AND NOT TWO FIXED BUTTONS ────────────────────────────────────
 * Positioning lives HERE and nowhere else. `ScrollToTopButton` is now a plain
 * button: no `fixed`, no `z-`, no `bottom-`, no `right-`. Two independently
 * fixed elements have to agree about each other's height and offset, and that
 * agreement is a pair of magic numbers in two files that nothing checks — the
 * first time one of them changes size, they overlap or drift apart silently.
 * Here the spacing is STRUCTURAL: `flex flex-col` with a gap, so the browser
 * does the arithmetic.
 *
 * ── ANCHORED AT THE BOTTOM, WHICH IS THE WHOLE POINT OF THE ORDER ───────────
 * Slot order is upper → lower, so the chat launcher is LAST and therefore
 * bottom-most. Because the container is pinned by `bottom-*` and grows upward,
 * removing an upper slot cannot move the bottom one: `ScrollToTopButton`
 * returns null below 400px of scroll, and the launcher does not jump when it
 * appears or disappears. Anchoring at the top would invert that and make the
 * launcher move on every scroll.
 *
 * ── POINTER EVENTS ──────────────────────────────────────────────────────────
 * The container is `pointer-events-none` and re-enables them on its direct
 * children. With `items-end` the box is only as wide as its widest child, so
 * once the launcher expands into a capsule (Phase 3) the container is capsule-
 * wide while the back-to-top button is a small circle — leaving dead space
 * beside the button, plus the gap between the two, that would otherwise
 * swallow clicks meant for the page underneath.
 *
 * ── z-50, UNCHANGED ─────────────────────────────────────────────────────────
 * The app's elevated-UI tier, the same one the back-to-top button always used:
 * above CourseStickyCTA (z-40) so both stay clickable over that bar, below
 * PublicHeader (z-60). See the ladder in tailwind.config.js.
 *
 * Mounted ONCE from the root layout — see src/app/layout.jsx for why that is
 * not the (public) layout.
 */

/**
 * The dock proper, with `pathname` supplied rather than read.
 *
 * Split out so the geometry and slot order can be rendered under any path
 * without a router — the same reason CourseStickyCTA exports its own resolvers.
 * `FloatingActionDock` below is the one-line seam that reads the real router.
 */
export function FloatingActionDockView({ pathname, bottomSlot = null }) {
  if (!shouldRenderFloatingDock(pathname)) return null;

  return (
    // `data-floating-dock` below is a TEST HOOK, NOT DEAD MARKUP.
    // test/render/floatingDock.test.mjs finds this container by that attribute
    // and every assertion in that file reads the tag it returns; the extractor
    // THROWS when it is missing rather than returning an empty string, which
    // for a "does not contain" check would look exactly like a pass.
    // Do not delete it as unused.
    <div
      data-floating-dock=""
      className={`fixed right-4 z-50 flex flex-col items-end gap-3 pointer-events-none [&>*]:pointer-events-auto lg:bottom-8 lg:right-8 ${
        dockLiftsForBottomBar(pathname) ? 'bottom-24' : 'bottom-8'
      }`}
    >
      {/* SLOT 1 — upper. Hides itself near the top of the page. */}
      <ScrollToTopButton />
      {/* SLOT 2 — bottom, and it stays bottom-most whether or not slot 1 is
          rendered. The dock names the POSITION and nothing else: what goes in
          here is the caller's business, so this file never learns that a chat
          feature exists. */}
      {bottomSlot}
    </div>
  );
}

export function FloatingActionDock({ bottomSlot = null }) {
  const pathname = usePathname();
  return <FloatingActionDockView pathname={pathname} bottomSlot={bottomSlot} />;
}

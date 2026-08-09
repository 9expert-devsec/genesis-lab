'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { ScrollToTopButton } from '@/components/ui/ScrollToTopButton';
import { dockLiftsForBottomBar, shouldRenderFloatingDock } from '@/lib/floatingDock';
import {
  subscribe as subscribeBottomInset,
  getRevision as getBottomInsetRevision,
  getServerRevision as getServerBottomInsetRevision,
  bottomInsetAcross,
} from '@/lib/viewportBottomInset';

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
 * children — EXCEPT any child carrying `data-dock-passthrough`, which stays
 * click-through.
 *
 * That opt-out wins by SPECIFICITY, not by luck: `.dock > [data-…]` is (0,2,0)
 * and `.dock > *` is (0,1,0). Putting `pointer-events-none` on the child
 * itself instead would be a (0,1,0) vs (0,1,0) tie decided by Tailwind's emit
 * order — which is not a rule, and would flip silently. A decorative slot
 * occupant (the reading-progress ring) must not become a dead zone in the
 * corner of every article page. With `items-end` the box is only as wide as its widest child, so
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
 *
 * ── CLEARING A PAGE'S BOTTOM BAR: padding, NOT a bottom-* offset ────────────
 * `bottomInset` is applied as an inline `padding-bottom`, and the mechanism is
 * deliberate three times over:
 *
 *   1. The container is bottom-ANCHORED and grows upward (see the section
 *      above — that is what keeps the bottom slot still). Padding pushes the
 *      children up without moving the anchor, so the "removing an upper slot
 *      cannot move the lower one" property survives untouched. Changing the
 *      anchor instead would move the very thing the anchor exists to hold.
 *   2. The anchor tokens stay untouched. test/pure/floatingDockStack and
 *      test/render/stickyBarButtonCoordination read this file as RAW TEXT and
 *      match the anchor and lift classes as literals: `lg:bottom-8`, the
 *      `'bottom-24'` / `'bottom-8'` register pair, and the absence of the old
 *      `bottom-36` lift. They survive because the anchor and lift rules
 *      genuinely are not what changed here.
 *
 *      This paragraph used to refuse to name any of those tokens, because
 *      those guards read this file RAW and prose naming a class was
 *      indistinguishable from the class itself — a comment could satisfy a
 *      positive assertion after the real class had been deleted, and could
 *      break a negative one just by quoting what it forbids. Both happened on
 *      the first draft. They now read the file through test/sourceScan.mjs,
 *      which strips comments, so the docstring is free to say what it means.
 *   3. A computed class could not work at all. Tailwind's content scan reads
 *      source text, so a class assembled at runtime from an interpolated pixel
 *      value — `bottom-[${n}px]` — emits no CSS and fails SILENTLY, with markup
 *      that looks correct. This
 *      repo has already shipped that exact defect once (the schedule-status
 *      colours). An inline style is not scanned and cannot fail that way.
 *
 * The TRANSITION is a static class trio, `transition-[padding-bottom]
 * duration-300 ease-in-out`, matching CourseStickyCTA's own
 * `transition-transform duration-300 ease-in-out` so the dock travels with the
 * bar instead of snapping. Classes rather than an inline `transition` string
 * because the two are NOT equivalent: Tailwind's `ease-in-out` is
 * cubic-bezier(0.4, 0, 0.2, 1), while the CSS keyword of the same name is
 * cubic-bezier(0.42, 0, 0.58, 1) — writing the keyword inline would silently
 * desynchronise the two curves. Measured through this project's own config,
 * not assumed. Static classes are literals, so the JIT hazard in (3) does not
 * apply to them.
 *
 * Reduced motion needs NO rule here: globals.css already forces
 * `transition-duration: 0.01ms !important` on `*` under
 * prefers-reduced-motion, and an !important declaration in a stylesheet beats
 * both a class and an inline style. A second rule would be a duplicate.
 */

/**
 * The dock proper, with `pathname` and `bottomInset` supplied rather than read.
 *
 * Split out so the geometry and slot order can be rendered under any path
 * without a router — the same reason CourseStickyCTA exports its own resolvers.
 * `FloatingActionDock` below is the one-line seam that reads the real router
 * and the real store.
 *
 * `bottomInset` is a PROP rather than a store read inside this component, and
 * that is load-bearing for testability rather than a style preference:
 * useSyncExternalStore takes its getServerSnapshot branch under
 * renderToStaticMarkup, which is 0 by construction. A component that read the
 * store here would render 0 in every render-tier test no matter what the store
 * held, so the non-zero case would be untestable — and untestable in the
 * direction that fails silently. Verified by probe, not assumed.
 */
export function FloatingActionDockView({
  pathname,
  bottomInset = 0,
  containerRef = null,
  topSlot = null,
  bottomSlot = null,
}) {
  if (!shouldRenderFloatingDock(pathname)) return null;

  return (
    // `data-floating-dock` below is a TEST HOOK, NOT DEAD MARKUP.
    // test/render/floatingDock.test.mjs finds this container by that attribute
    // and every assertion in that file reads the tag it returns; the extractor
    // THROWS when it is missing rather than returning an empty string, which
    // for a "does not contain" check would look exactly like a pass.
    // Do not delete it as unused.
    <div
      ref={containerRef}
      data-floating-dock=""
      className={`fixed right-4 z-50 flex flex-col items-end gap-3 transition-[padding-bottom] duration-300 ease-in-out pointer-events-none [&>*]:pointer-events-auto [&>[data-dock-passthrough]]:pointer-events-none lg:bottom-8 lg:right-8 ${
        dockLiftsForBottomBar(pathname) ? 'bottom-24' : 'bottom-8'
      }`}
      // Inline, never a class — see the header. 0 today for every page,
      // because no publisher exists yet.
      style={{ paddingBottom: bottomInset }}
    >
      {/* SLOT 1 — top. Empty on most pages; an absent slot renders no flex
          item, so `gap-3` adds nothing and the slots below do not move. */}
      {topSlot}
      {/* SLOT 2 — middle. Hides itself near the top of the page. */}
      <ScrollToTopButton />
      {/* SLOT 3 — bottom, and it stays bottom-most whether or not the slots
          above it render. The dock names POSITIONS and nothing else: what goes
          in them is the caller's business, so this file never learns that a
          chat feature or an article exists. */}
      {bottomSlot}
    </div>
  );
}

export function FloatingActionDock({ topSlot = null, bottomSlot = null }) {
  const pathname = usePathname();
  const containerRef = useRef(null);

  // The dock's OWN horizontal extent in viewport coordinates. `null` until the
  // first measurement, which resolves the query to 0 — the same value the
  // server rendered, so the first frame holds still instead of flashing.
  const [span, setSpan] = useState(null);

  // One-directional: the dock READS. It never publishes, never imports a bar,
  // and never learns what kind of furniture is down there — it asks how much of
  // the bottom edge is occupied in ITS column and clears that much.
  const revision = useSyncExternalStore(
    subscribeBottomInset,
    getBottomInsetRevision,
    getServerBottomInsetRevision
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    // ── HORIZONTAL ONLY, AND THAT SCOPE IS LOAD-BEARING ────────────────────
    // Reading the height here would be a feedback loop, not a detail: the
    // query's answer becomes this element's padding, padding changes its
    // height, the observer fires on that height, and the measurement feeds its
    // own output back into its input. Left and right are unaffected by
    // padding-bottom, so the loop has no path to close. The bail-out below is
    // the second half of the same protection — the observer DOES fire on every
    // padding change, and returning the previous object means React re-renders
    // nothing and the cascade stops on the first hop.
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSpan((prev) =>
        prev && prev.left === rect.left && prev.right === rect.right
          ? prev
          : { left: rect.left, right: rect.right },
      );
    };

    measure();

    // ── ResizeObserver, not a window resize listener ───────────────────────
    // The chat launcher expands into a capsule on hover and the dock is
    // `items-end`, so expanding grows this box LEFTWARD. At the narrow band of
    // widths where a bar's right edge falls between the collapsed and expanded
    // left edges, that hover genuinely changes the answer — and a window
    // listener would never fire, because the window did not resize.
    //
    // The visible consequence of getting this wrong is not a stale number, it
    // is the original defect in miniature: the expanded capsule would sit on
    // top of the bar's button with the dock at z-50, making that button
    // unclickable exactly while the user is reaching for it. So the dock moves,
    // and the padding transition turns the move into a glide rather than a
    // snap. An observer also catches the layout changes a resize listener
    // structurally cannot — font loading, zoom, a scrollbar appearing.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pathname]); // the dock renders null on some paths, so the node can come and go

  const bottomInset = useMemo(
    () => (span ? bottomInsetAcross(span.left, span.right) : 0),
    // `revision` is not read in the body on purpose: it is the store's "the
    // boxes moved" signal, and recomputing on it is the entire point.
    [revision, span],
  );

  return (
    <FloatingActionDockView
      pathname={pathname}
      bottomInset={bottomInset}
      containerRef={containerRef}
      topSlot={topSlot}
      bottomSlot={bottomSlot}
    />
  );
}

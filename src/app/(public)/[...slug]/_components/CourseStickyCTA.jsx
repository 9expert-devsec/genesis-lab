"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { setOccupiedBox, clearOccupiedBox } from "@/lib/viewportBottomInset";
import { stickyBarOccupancyHeight } from "@/lib/stickyBarOccupancy";

/**
 * Pure resolver for the bar's single action. Exported so the three behaviours
 * are testable without a DOM — the render path below just executes whatever
 * this returns (onClick scroll vs <Link> navigation).
 *
 *   1. hasSchedules            → "ลงทะเบียน", smooth-scroll to #schedule
 *   2. public, no open sessions → "ขอใบเสนอราคา", smooth-scroll to the TOP of the
 *                                 page, where the hero's own "ขอใบเสนอราคา
 *                                 Public/Inhouse" buttons let the user pick a flow
 *   3. inhouse-only            → "ขอใบเสนอราคา", navigate to the INHOUSE quotation
 *
 * Branches 1 and 2 are in-page scrolls; only branch 3 navigates. `inhouseHref`
 * is the discriminator between 2 and 3: the caller passes it ONLY for an
 * inhouse-only course, so a truthy value here means branch 3. It's never
 * consulted for branches 1 or 2, so we never send a public course down the
 * inhouse flow.
 */
export function stickyCtaAction({ hasSchedules, inhouseHref }) {
  if (hasSchedules) {
    return { label: "ลงทะเบียน", kind: "scroll-schedule" };
  }
  if (inhouseHref) {
    return { label: "ขอใบเสนอราคา", kind: "navigate", href: inhouseHref };
  }
  return { label: "ขอใบเสนอราคา", kind: "scroll-top" };
}

/**
 * Pure reveal predicate. Exported so the show/hide window is testable without a
 * DOM — the effect below just feeds it live `getBoundingClientRect()` values.
 *
 * Lower bound (unchanged): branch 1 reveals once #schedule has scrolled fully
 * above the viewport top; branches 2 & 3 reveal past 3/4 of a viewport.
 *
 * Upper bound (both branches), whichever comes first:
 *   - the related-courses section (#related) is intersecting the viewport — its
 *     top edge has entered — hide immediately; show again only once it's fully
 *     back below the fold; OR
 *   - there is no related section, so fall back to the content zone
 *     (#course-content) having scrolled past the viewport top.
 * `relatedTop == null` (no related section) and `contentBottom == null` (marker
 * absent) both mean "don't force-hide", so a missing element never silently
 * kills the bar.
 */
export function shouldShowStickyBar({
  hasSchedules,
  scheduleBottom,
  contentBottom,
  relatedTop,
  relatedBottom,
  scrollY,
  innerHeight,
}) {
  const relatedVisible =
    relatedTop != null && relatedTop < innerHeight && relatedBottom > 0;
  const pastContent = contentBottom != null && contentBottom < 0;
  if (relatedVisible || pastContent) return false;

  if (hasSchedules) {
    return scheduleBottom != null && scheduleBottom < 0;
  }
  return scrollY > innerHeight * 0.75;
}

/**
 * Sticky bottom CTA bar for the course detail page. Ported from the
 * masterclass detail page's bar (MasterclassDetailClient.jsx ~L813) so the
 * two pages feel like one product — same z-index, positioning, translate
 * transition and X-dismiss behaviour.
 *
 * The action shape comes from `stickyCtaAction` (above). This component never
 * receives the `course` object: the public-vs-inhouse decision is resolved at
 * the page level where the course shape is known, and handed here as
 * `inhouseHref` (null for anything but an inhouse-only course). A narrow prop
 * list keeps the next data-shape difference visible instead of silent.
 *
 * Reveal is keyed on `hasSchedules`:
 *   • branch 1 mirrors masterclass — reveal once #schedule has scrolled above
 *     the top of the viewport;
 *   • branches 2 & 3 use a scroll-depth threshold (an inhouse-only course
 *     renders no #schedule anchor to key on).
 *
 * The scroll-to-top action in branch 2 intentionally lifts the user above that
 * threshold, so the bar slides itself away — a desired self-dismiss, distinct
 * from the X button. Because the reveal check is re-evaluated on every scroll,
 * the bar comes back normally when the user scrolls down again; only the X
 * button (`barDismissed`) hides it for the rest of the visit.
 */
export function CourseStickyCTA({
  title,
  coverUrl,
  hasSchedules,
  inhouseHref,
}) {
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [barDismissed, setBarDismissed] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Upper bound: hide as soon as the related-courses section (#related)
      // intersects the viewport. Fallback for a course with no related section:
      // hide once the content zone (#course-content) has scrolled past the top.
      const relatedEl = document.getElementById("related");
      const relatedRect = relatedEl ? relatedEl.getBoundingClientRect() : null;

      const contentEl = document.getElementById("course-content");
      const contentBottom = contentEl
        ? contentEl.getBoundingClientRect().bottom
        : null;

      let scheduleBottom = null;
      if (hasSchedules) {
        const scheduleEl = document.getElementById("schedule");
        if (!scheduleEl) return; // no #schedule yet — leave the current state
        scheduleBottom = scheduleEl.getBoundingClientRect().bottom;
      }

      setShowStickyBar(
        shouldShowStickyBar({
          hasSchedules,
          scheduleBottom,
          contentBottom,
          relatedTop: relatedRect ? relatedRect.top : null,
          relatedBottom: relatedRect ? relatedRect.bottom : null,
          scrollY: window.scrollY,
          innerHeight: window.innerHeight,
        }),
      );
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasSchedules]);

  // ── Publishing the clearance ────────────────────────────────────────────
  // EVERYTHING from here to the early return is hooks, and it has to stay on
  // this side of it: `if (barDismissed) return null` is below, and a hook
  // placed after it would be a conditional hook that throws the moment someone
  // presses X.
  //
  // Note the early return does NOT unmount this component — it keeps rendering,
  // just as null — so dismiss does not fire any cleanup. Dismiss is handled by
  // the VALUE going to 0, not by teardown. Teardown is a separate concern
  // (navigation), handled by its own effect below.
  const barKey = useId();
  const shellRef = useRef(null);
  const cardRef = useRef(null);
  const [metrics, setMetrics] = useState({
    cardHeight: 0,
    bottomOffset: 0,
    cardLeft: 0,
    cardRight: 0,
  });

  // Measure once the bar exists, and again on resize. Everything here is
  // genuinely responsive and none of it may be assumed:
  //   - the card's height. It is min-h-[7rem] but GROWS: the cover thumbnail is
  //     `hidden sm:block`, so a course with a cover is taller from sm up.
  //   - the bar's own bottom offset, which is bottom-2 md:bottom-6.
  //   - the card's horizontal extent. The card is capped at 860px and
  //     left-aligned inside a 1200px box, so it does NOT span the viewport and
  //     its right edge moves with the width.
  //
  // TWO DIFFERENT READS, on purpose. offsetHeight and the computed `bottom` are
  // LAYOUT reads, unaffected by the translate that hides the bar — using a rect
  // for the height would report a position in flight during the 300ms slide and
  // the consumer would chase it down the screen. The rect IS used for left and
  // right, and that is safe for the same reason it is unsafe for the height:
  // the transition is `translate-y`, purely vertical, so the horizontal edges
  // of the rect sit still throughout it.
  useEffect(() => {
    const measure = () => {
      const card = cardRef.current;
      const shell = shellRef.current;
      if (!card || !shell) return;
      const cardHeight = card.offsetHeight;
      const rect = card.getBoundingClientRect();
      const bottomOffset =
        Number.parseFloat(window.getComputedStyle(shell).bottom) || 0;
      // Bail out of the state update when nothing moved: resize fires in
      // streams, and an unconditional setState would re-render the bar on every
      // frame of a window drag.
      setMetrics((prev) =>
        prev.cardHeight === cardHeight &&
        prev.bottomOffset === bottomOffset &&
        prev.cardLeft === rect.left &&
        prev.cardRight === rect.right
          ? prev
          : { cardHeight, bottomOffset, cardLeft: rect.left, cardRight: rect.right },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const occupancyHeight = stickyBarOccupancyHeight({
    dismissed: barDismissed,
    revealed: showStickyBar,
    cardHeight: metrics.cardHeight,
    bottomOffset: metrics.bottomOffset,
  });

  // Publish the box this bar occupies: how far up it reaches, and WHERE across
  // the width it reaches there. The height goes to 0 when the bar is dismissed
  // or scrolled away while the span stays — the bar is still that wide, it is
  // simply covering nothing, and a consumer outside its column was never
  // affected either way.
  //
  // Deliberately does NOT clear on cleanup: this effect re-runs on every
  // change, and clearing first would drop the box between two live values,
  // making a consumer animate down and back up on something as ordinary as a
  // resize. Primitives in the deps rather than an object, so an identical
  // measurement does not re-publish.
  useEffect(() => {
    setOccupiedBox(barKey, {
      height: occupancyHeight,
      left: metrics.cardLeft,
      right: metrics.cardRight,
    });
  }, [barKey, occupancyHeight, metrics.cardLeft, metrics.cardRight]);

  // Teardown, and ONLY teardown. Empty deps, so this cleanup runs exactly once,
  // when the component really unmounts — which is what a route change does. If
  // this is missing, the dock stays lifted on every page the user visits after
  // leaving a course page: a bug that only appears after a navigation, so it
  // survives casual testing and never gets reproduced from a bug report.
  useEffect(() => () => clearOccupiedBox(barKey), [barKey]);

  if (barDismissed) return null;

  const action = stickyCtaAction({ hasSchedules, inhouseHref });

  return (
    <div
      ref={shellRef}
      className={`fixed inset-x-0 bottom-2 md:bottom-6 z-40

            transition-transform duration-300 ease-in-out
            ${showStickyBar ? "translate-y-0" : "translate-y-[calc(100%+2rem)]"}`}
    >
      {/* Page-centered at every width: a max-w-[900px] pill centered on the
          viewport (`mx-auto`), with `px-4` so it never touches the edges on
          small screens. At lg+ this box passes UNDER the two-column sidebar
          track — that's intentional and acceptable: the sidebar is raised above
          this bar in the stacking order (aside `relative z-50`, this bar `z-40`;
          see page.jsx), so the Course Outline buttons stay clickable where the
          bar's box sits behind them. The bar still paints above ordinary flow
          content, which is un-positioned.

          The bottom-right floating dock is a DIFFERENT case, and this
          paragraph used to say the opposite. The dock carries z-50 for both of
          its slots, so where it overlapped this bar the taps landed on the dock
          and the bar's own controls became unreachable — measured at 390px, the
          chat launcher sat on top of the CTA button and the back-to-top button
          sat squarely on top of the X. That is not the harmless z-order overlap
          described above for the sidebar; it is two live controls fighting.

          It is now resolved, and NOT by a lift rule in this file. This bar
          publishes how much of the bottom edge it occupies and the dock pads
          itself clear of whatever it is told. No offset here has to agree with
          an offset there — that coupling is exactly what the dock was created
          to remove, and it stays removed, because the number is measured rather
          than authored and travels in one direction. */}
      <div className="mx-auto flex max-w-[1200px] justify-start min-[1920px]:justify-center">
        <div className="max-w-[860px] px-4 w-full min-[1920px]:max-w-[900px]">
          <div
            ref={cardRef}
            className="relative flex min-h-[7rem] items-center overflow-clip bg-white dark:bg-9e-navy rounded-2xl shadow-[0_0_36px_rgba(36,134,255,0.3)]"
          >
            {/* Cover image — flush left, full bar height, 16:9, no padding */}
            {coverUrl ? (
              <div className="hidden sm:block shrink-0 self-stretch p-3 ">
                {/* aspect-video = 16:9; height constrained by parent (items-stretch) */}
                <img
                  src={coverUrl}
                  alt={title}
                  className="h-[6rem] w-auto aspect-video object-cover rounded-xl"
                />
              </div>
            ) : null}

            {/* Inner row: text + actions */}
            <div className="flex flex-1 items-center gap-3 pl-6 pr-6 md:pr-10 py-3 min-w-0">
              {/* Text */}
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-xs md:text-xs leading-tight font-medium text-gray-500 dark:text-gray-400">
                  สนใจหลักสูตร
                </p>

                <p className="truncate text-sm md:text-lg leading-tight font-bold text-9e-navy dark:text-white">
                  &ldquo;{title}&rdquo;
                </p>

                <p className="text-xs md:text-sm leading-tight text-gray-500 dark:text-gray-400">
                  {hasSchedules
                    ? "กดลงทะเบียนเพื่อกลับไปเลือกรอบอบรมที่เปิดรับสมัคร"
                    : "ขอใบเสนอราคาเพื่อรับรายละเอียดหลักสูตรและจัดอบรมให้องค์กรของคุณ"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setBarDismissed(true)}
                className="absolute right-1.5 top-1.5 p-1 rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              >
                <X size={16} />
              </button>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                {action.kind === "navigate" ? (
                  <Link
                    href={action.href}
                    className="min-w-24 md:min-w-32 text-center rounded-full bg-9e-action px-5 py-2 md:py-3 text-sm md:text-base font-bold text-white hover:bg-9e-brand"
                  >
                    {action.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (action.kind === "scroll-schedule") {
                        document
                          .getElementById("schedule")
                          ?.scrollIntoView({ behavior: "smooth" });
                      } else {
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }
                    }}
                    className="min-w-24 md:min-w-32 rounded-full bg-9e-action px-5 py-2 md:py-3 text-sm md:text-base font-bold text-white hover:bg-9e-brand"
                  >
                    {action.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

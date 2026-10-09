'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import ScheduleCard from '@/components/ScheduleCard';

/**
 * ── THE ROUNDS OF ONE COURSE TILE, TWO AT A TIME ───────────────────────────
 *
 * ── WHAT THIS REPLACED, AND WHY A CAROUSEL RATHER THAN A SMALLER CHIP ─────
 * The tile drew every offered round in a `grid-cols-[repeat(auto-fill,
 * minmax(0,var(--bundle-chip-w)))]` track whose width was the longest date
 * label anywhere in the bundle. On a ~200-230px tile that width fits ONE
 * column, so a five-round course stacked five chips one per row and the tile
 * grew to about three times the height of its neighbours — a row of tiles in
 * which the tallest was the one with the most choice.
 *
 * Making the chip narrower was the other option and it is the worse one: the
 * date is the whole content, so every rem taken off the chip comes off a Thai
 * date that then wraps. The tile cannot show five rounds at once at this width.
 * So it shows TWO, and the rest are a scroll away.
 *
 * ── THE SHARED WIDTH WENT WITH IT, AND THAT IS NOT A LOSS ────────────────
 * `--bundle-chip-w` existed to make every chip in every tile measure the same
 * — `bundleChipWidthStyle` computed it from the longest label in the section,
 * because a wrapping row sized each chip to its own date and came out ragged.
 * Two visible boxes of equal width are a stronger version of the same
 * property: they are equal to each other, equal across every tile (both are
 * half a tile), and they need no estimate of how wide a Thai date renders. The
 * per-character factor, its five measured labels and the fallback-font caveat
 * are all gone because nothing has to guess any more.
 *
 * ── WHY THIS IS A CLIENT COMPONENT, ON AN OTHERWISE SERVER-RENDERED CARD ──
 * Stated rather than slipped in: `promotion_bundle` was wholly server-rendered
 * and this is the one island in it. Three things here cannot be done without
 * state — arrows that DISABLE at the ends rather than disappear, a
 * `กำลังแสดงรอบ a–b จาก N` line that follows the track, and the two of them
 * agreeing with a finger-swipe. The alternative is CSS-only snap scrolling with
 * no arrows and no position line, which is the mobile half of the requirement
 * and none of the desktop half.
 *
 * The ROWS are still decided on the server — `offeredRowsFor` reads the live
 * status map and `roundChoices`, and the date labels come from
 * `formatRoundDays` through the section's single threaded clock read. This
 * component formats nothing and decides nothing about pickability.
 *
 * ── TOKENS ONLY, NO `dark:` ─────────────────────────────────────────────────
 * Every colour here is a semantic token. The tile can carry
 * `.pb-bundle-tile-light`, which re-declares those tokens so the tile stays
 * light inside a Navy card — and Tailwind's `dark:` compiles to `:is(.dark *)`,
 * which matches a descendant of ANY `.dark` ancestor and cannot be cancelled by
 * nesting. A `dark:` utility in here would paint its dark form on the
 * deliberately light tile. That is why there is no `lit()` call site in this
 * file: there is nothing for it to strip.
 */

/** How many boxes are visible at once. The gap below is paired to it. */
const PER_VIEW = 2;

/**
 * ── HOW FAR AN ARROW MOVES: ONE ROUND, NOT ONE PAGE ───────────────────────
 *
 * It was `PER_VIEW`, which paged. On five rounds that gave 1–2 → 3–4 → 4–5:
 * the second press lands on index 2, the third asks for 4 and is clamped to
 * `total - PER_VIEW` = 3, so ROUND 4 IS SHOWN TWICE and round 3 is skipped on
 * the way back. A visitor pressing ไปรอบถัดไป twice sees a round they have
 * already seen and never sees the one between.
 *
 * Stepping by one gives 1–2 → 2–3 → 3–4 → 4–5 and the same four positions in
 * reverse. Every round appears in two of them, which is what a two-up window
 * sliding over a list does.
 *
 * It also makes the arrows agree with a SWIPE, which has always moved by one:
 * every box is a `snap-start` point and `read()` derives the position from
 * `scrollLeft / step` where `step` is one box plus one gap. The arrows were
 * the only thing in this component that counted in pages.
 *
 * The clamp is unchanged and is what keeps the last position a FULL PAIR
 * rather than a lone box: `goTo` never sets a start above
 * `total - PER_VIEW`.
 */
const STEP = 1;

/**
 * ── THE POSITION ARITHMETIC, IN ONE PLACE AND EXPORTED ────────────────────
 *
 * The clamp was written out three times — inside `goTo`, inside the scroll
 * reader, and implicitly in the `from`/`to` pair — and the arrows paging by
 * two was only visible as a defect once all three were read together. Three
 * copies of one rule is three places for the next change to miss one.
 *
 * EXPORTED because it is the only part of this component a test can reach
 * without layout: `goTo` measures a box with `getBoundingClientRect`, which
 * is 0 in jsdom, so a simulated arrow press moves nothing and proves nothing.
 * The sequence of positions IS the requirement, and this is where it lives.
 */
export function clampStart(index, total, perView = PER_VIEW) {
  // Never past the last FULL pair — the final position shows two boxes, not a
  // lone one. `Math.max(…, 0)` covers a list shorter than the window.
  return Math.min(Math.max(index, 0), Math.max(total - perView, 0));
}

/** Which rounds `start` is showing, 1-based, for the กำลังแสดงรอบ line. */
export function roundWindow(start, total, perView = PER_VIEW) {
  return { from: start + 1, to: Math.min(start + perView, total) };
}

/**
 * ── THE BOX WIDTH, AND WHY IT IS NOT EXACTLY HALF ─────────────────────────
 *
 * It WAS `calc(50% - 0.25rem)`. With `gap-2` (0.5rem) that makes two boxes
 * plus one gap total EXACTLY 100% of the track — arithmetically perfect and
 * wrong on screen, because it leaves the second box's right border sitting on
 * the overflow clip edge with nothing to spare. MEASURED in Chrome, the second
 * box's right edge against the track's end:
 *
 *     1440px   -0.02px        768px    0.00px
 *      640px    0.00px        375px    0.00px
 *
 * Zero at every width. A border is 2px of the box, device-pixel rounding moves
 * sub-pixel values either way, and the third box begins on that same pixel —
 * so the second chip reads as cut off at the right, which is how it was
 * reported (`8-9 ธ.ค. 6…`). Nothing was wrong with the chip or its text: no
 * date overflows its chip at any width (`scrollWidth === clientWidth`
 * throughout). It was this subtraction.
 *
 * A FULL GAP is subtracted instead, so the pair occupies `100% - 0.5rem` and
 * the clip edge falls half a gap clear of the second box's border. The 8px
 * that frees up shows a sliver of the third box, which is the ordinary
 * carousel affordance for "there is more this way" and costs the two visible
 * chips nothing.
 *
 * AN INLINE STYLE RATHER THAN `basis-[calc(50%-0.5rem)]`, and the reason is a
 * real Tailwind trap rather than a preference: inside an arbitrary value a
 * space must be written as an underscore, so the readable spelling compiles to
 * `flex-basis: calc(50%-0.5rem)` — invalid CSS, which the browser drops, with
 * nothing on screen saying the boxes lost their width. The value is one layout
 * constant paired to one gap; it is written once, here.
 */
const BOX_WIDTH = { flexBasis: 'calc(50% - 0.5rem)' };

const ARROW_CLASS =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-9e-sm border ' +
  'border-[var(--surface-border)] text-[var(--text-primary)] transition-colors ' +
  'hover:border-9e-action/40 hover:text-9e-action ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action ' +
  'focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface)] ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--surface-border)] ' +
  'disabled:hover:text-[var(--text-primary)]';

/**
 * @param {object} o
 * @param {Array<{key: string, dateLabel: string, pickable: boolean,
 *   reason: string, reasonLabel: string, type: string}>} o.rows
 *   the offered rounds, from `offeredRowsFor` in promotion_bundle.jsx
 */
export function BundleRoundCarousel({ rows }) {
  const list = Array.isArray(rows) ? rows : [];
  const total = list.length;
  /** Below three rounds both fit, so there is nothing to page through. */
  const paged = total > PER_VIEW;

  const trackRef = useRef(null);
  const [start, setStart] = useState(0);
  /*
    A GENERATED id, not a literal. A card draws one of these per course tile,
    so a hard-coded `id` would put several copies of the same id in one
    document and every arrow would claim to control the first tile's track.
  */
  const trackId = useId();

  /**
   * ONE BOX PLUS ITS GAP, MEASURED rather than recomputed from the constants.
   * The track can be narrower than the shared width on a phone, and `calc` on
   * a percentage is not a number this module knows — so it asks the DOM, which
   * is also what keeps the arrows and a swipe agreeing about where box 3 is.
   */
  const stepPx = useCallback(() => {
    const el = trackRef.current;
    const first = el?.firstElementChild;
    if (!el || !first) return 0;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    return first.getBoundingClientRect().width + gap;
  }, []);

  /**
   * The index the track is actually showing. Derived from `scrollLeft` rather
   * than tracked alongside it, so a SWIPE moves the position line and the
   * arrows exactly as a click does — two sources of truth for "which round is
   * first" is how a carousel comes to say `1–2 จาก 5` while showing rounds 3
   * and 4.
   */
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !paged) return;
    const read = () => {
      const step = stepPx();
      if (!step) return;
      const i = Math.round(el.scrollLeft / step);
      setStart(clampStart(i, total));
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => {
      el.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, [paged, total, stepPx]);

  const goTo = (index) => {
    const el = trackRef.current;
    const step = stepPx();
    if (!el || !step) return;
    const clamped = clampStart(index, total);
    el.scrollTo({ left: clamped * step, behavior: 'smooth' });
    // Set it here too: `scroll` fires asynchronously, and on a track that
    // cannot actually scroll (a very narrow tile) it may not fire at all.
    setStart(clamped);
  };

  const atStart = start <= 0;
  const atEnd = start + PER_VIEW >= total;
  // From the same helper the arrows and the scroll reader clamp with, so the
  // line cannot say 1–2 while the track shows 3 and 4.
  const { from, to } = roundWindow(start, total);

  if (!total) return null;

  return (
    <div data-testid="bundle-round-list" className="flex flex-col gap-2">
      {/*
        ── THE HEADING ROW HOLDS THE HEADING, AND NOTHING ELSE ─────────────
        The arrows used to sit here, at the row's right. They are `h-6` — 24px
        — against an 11px label, so on a tile with more than two rounds the
        row grew to the buttons' height and `items-center` pushed the text
        down inside it. MEASURED in Chrome against a card holding a five-round
        and a two-round course side by side:

            tile        headingTop    chip-row top
            5 rounds        385.8          413.3
            2 rounds        381.3          404.3

        4.5px of heading and 9px of chip row, so neighbouring tiles in one
        bundle drew their rounds at different heights and the difference was
        caused by how many rounds each course happened to offer. The controls
        moved BELOW the chips, where nothing they do can push the chips down.

        `gap-2` between the heading and the track survives from the stacked
        version — measured in the builder canvas at a 207px tile, where `gap-1`
        left four pixels between an 11px label and the first box and read as
        the box sitting ON the word.
      */}
      <span
        data-testid="bundle-round-heading"
        className="block text-[11px] font-bold text-[var(--text-secondary)]"
      >
        {/*
          ── THE COUNT IS IN THE HEADING, AND THE WORDING IS NEW ───────────
          This read `รอบอบรม` — one string, deliberately, after a round in
          which it had been `offeredRows.length > 1 ? 'รอบที่เลือกได้' :
          'รอบอบรม'` and a row of tiles headed its rounds two different ways.
          That ruling was about the LABEL changing with the count, and it
          still holds: this label does not change, it merely states the
          number, which a visitor now needs because only two of them are on
          screen at a time. `(N รอบ)` is also what tells them to scroll.
        */}
        รอบอบรมที่เข้าร่วม ({total} รอบ)
      </span>

      {/*
        THE TRACK IS WHAT SCROLLS, never the page. `overflow-x-auto` with
        `snap-x snap-mandatory` is the whole of the touch story — a finger drag
        is the browser's own scroll, snapped to a box edge, so there is no drag
        library here and none is needed. `scroll-smooth` is what makes the
        arrows glide; it is on the element rather than only in `scrollTo` so a
        keyboard scroll of the track behaves the same.

        The scrollbar is hidden with an inline style, as
        registration/ScheduleCarousel does: `scrollbar-width` has no Tailwind
        utility and an arbitrary property for it would be a new class to guard.
      */}
      <div
        ref={trackRef}
        id={trackId}
        data-testid="bundle-round-track"
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {list.map((row, i) => (
          <div
            key={row.key}
            data-testid="bundle-round-box"
            data-pickable={row.pickable ? 'yes' : 'no'}
            data-reason={row.reason ?? undefined}
            /*
              `min-w-0` lets the box shrink below its content so a long date
              wraps inside it instead of widening the track; `shrink-0 grow-0`
              with the basis above is what keeps exactly two in view whatever
              the dates measure.
            */
            className="flex min-w-0 shrink-0 grow-0 snap-start flex-col gap-1"
            style={BOX_WIDTH}
          >
            {/*
              ── `รอบที่ k` ──────────────────────────────────────────────────
              The ordinal the position line counts in. Without it, two boxes
              showing `8-9 ธ.ค. 69` and `27-28 ม.ค. 70` out of five give a
              visitor no way to tell WHICH two they are looking at — the dates
              are the content, not an index.

              It is the round's place in the author's list, which is the order
              the chips were always drawn in.
            */}
            <span
              data-testid="bundle-round-ordinal"
              className="text-[10px] font-bold leading-none text-[var(--text-secondary)]"
            >
              รอบที่ {i + 1}
            </span>

            {/*
              ── THE CHIP'S RULES ARE UNCHANGED ──────────────────────────────
              No `status`, so no badge: the only pill ScheduleCard would draw
              for an open round is the green ลงทะเบียน one, and a bundle chip
              must not offer it — registration happens through the bundle's own
              button, and a register pill per round would say each round is
              separately bookable. These boxes are not links and not buttons.

              A NON-PICKABLE ROUND SHOWS NO WORD, only the greyed `muted` tone,
              and therefore carries `srStatus`: greying is a colour and WCAG
              1.4.1 does not let colour be the only carrier. The Thai reason is
              the same `PICK_REASON_TEXT` the wizard words its refusals with.

              `scoped` rather than the default tone, because a tile can carry
              `.pb-bundle-tile-light` and stay light inside a Navy card — where
              ScheduleCard's own `dark:text-white` would paint the date white on
              near-white.

              NO DOT: on a course card the dot names the delivery type against
              a legend printed above it, and a bundle tile has no legend, so it
              was an undecodable colour the chip's border already carries.

              `fillHeight={false}` with `flex-1` in its place. `h-full` is 100%
              of the BOX, and the box now has a label above the chip — so the
              percentage would overflow by the label's height. `flex-1` fills
              what is left, which is what equalises the two chips when one date
              wraps and the other does not.
            */}
            <ScheduleCard
              dateLabel={row.dateLabel}
              type={row.type}
              status=""
              tone={row.pickable ? 'scoped' : 'muted'}
              srStatus={row.pickable ? '' : row.reasonLabel}
              showDot={false}
              fillHeight={false}
              className="flex-1"
            />
          </div>
        ))}
      </div>

      {/*
        ── THE FOOTER: WHERE THE CONTROLS LIVE NOW ─────────────────────────
        Position text on the LEFT, arrows on the RIGHT, below the chips.

        WHY BELOW. The arrows were beside the heading, and they are 24px tall
        against an 11px label — so a tile with three or more rounds had a
        taller heading row than its two-round neighbour and drew its chips 9px
        lower. Nothing in a footer can push the chips down, so every tile in a
        bundle now starts its heading and its chip row at the same height
        whatever each course happens to offer.

        WHY TEXT LEFT, ARROWS RIGHT. The text is the longer element and reads
        left-to-right from the chips above it; the arrows are the thing a
        thumb reaches for, and the right edge is where this card already puts
        its only other control. `justify-between` rather than two columns, so
        a narrow tile lets the sentence wrap instead of squeezing the buttons.

        ONE ROW, ONE CONDITION. Both halves describe scrolling, so both are
        absent together below three rounds — `กำลังแสดงรอบ 1–2 จาก 2` beside a
        pair of permanently dead buttons is chrome about something that cannot
        happen.

        It does NOT disturb `ดูรายละเอียดหลักสูตร`: that button is pinned to
        the tile bottom by `mt-auto`, and the tiles share a grid row, so the
        extra row is absorbed above it rather than pushing it out of line.
      */}
      {paged && (
        <div className="flex items-center justify-between gap-2">
          {/*
            WHICH TWO OF HOW MANY. `aria-live="polite"` because the arrows
            change it without moving focus, so a screen-reader user who presses
            ไปรอบถัดไป would otherwise get no confirmation that anything
            happened.
          */}
          <p
            data-testid="bundle-round-position"
            aria-live="polite"
            className="min-w-0 text-[10px] leading-none text-[var(--text-secondary)]"
          >
            กำลังแสดงรอบ {from}–{to} จาก {total}
          </p>

          {/*
            DISABLED AT THE ENDS RATHER THAN HIDDEN, which is where this differs
            from registration/ScheduleCarousel: a control that vanishes at the
            end of a track takes its own position with it, and the row would
            then reflow as a visitor reached the last round.
          */}
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-testid="bundle-round-prev"
              aria-label="เลื่อนไปรอบก่อนหน้า"
              aria-controls={trackId}
              disabled={atStart}
              onClick={() => goTo(start - STEP)}
              className={ARROW_CLASS}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              data-testid="bundle-round-next"
              aria-label="เลื่อนไปรอบถัดไป"
              aria-controls={trackId}
              disabled={atEnd}
              onClick={() => goTo(start + STEP)}
              className={ARROW_CLASS}
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

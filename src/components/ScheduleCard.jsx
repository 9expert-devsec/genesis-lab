"use client";

import { NEUTRAL_STATUS, resolveScheduleBadge } from "@/lib/scheduleStatus";
import { trainingTypeColor } from "@/lib/schedule/trainingTypeColor";

/**
 * One round on a course card: a type-coloured border, a corner dot, the date
 * and the status.
 *
 * ── THE SVG BOX HAD TO GO, AND THAT IS A MEASUREMENT ────────────────────────
 * This used to draw its border as a hand-authored SVG `<path>` inside a fixed
 * `viewBox="0 0 90 80"`, in a fixed `h-[70px] w-[83px]` box, with the type
 * colour on the path stroke and a notch cut out of the top-left corner for the
 * dot. The path geometry is ABSOLUTE — 89 units wide, with every curve written
 * out — so the box could not grow to fit its contents, and the contents changed:
 * a Thai round label is `8, 10, 12 ต.ค. 69`, which overflows 83px, and the inner
 * text was `whitespace-nowrap`, so it overflowed VISIBLY rather than wrapping.
 *
 * The replacement is an ordinary element with a CSS `border-color`. The visual
 * result is the one that was asked for — type-coloured border, dot, date,
 * status — and only the drawing mechanism changes. What it buys is that the box
 * now sizes to its content, which no amount of editing the path could do.
 *
 * Retired with the path: the `<mask>`, the `useId` maskId it needed to stay
 * unique across instances, and the `TYPE_STYLES` table (whose `stroke` and `dot`
 * were always the same value). Nothing else read them — checked before removal.
 *
 * ── THE COLOURS: THE FOLLOW-UP WAS TAKEN ────────────────────────────────────
 * This paragraph used to argue FOR the divergence. It said the SVG's
 * `#005eff` / `#a854f7` / `#22C55E` were "deliberately NOT unified with
 * /schedule's TYPE_COLOR", on the reasoning that repainting this card's rounds
 * was not what a box-geometry change should do, and flagged it as a follow-up.
 *
 * That was right about the sequencing and wrong as a resting state. The
 * follow-up is now taken: the palette lives in lib/schedule/trainingTypeColor
 * and this card reads it, so classroom moves `#005eff` → `#00CCFF` and hybrid
 * `#a854f7` → `#8B5CF6`. That is a VISIBLE change to this card, intended.
 *
 * /schedule's values won rather than these because that page's table, its mobile
 * rows and both of its legends already agreed on them — it is the largest
 * surface showing a delivery type, and the one a visitor is most likely to have
 * seen first. `online` was `#22C55E` in every copy and does not move.
 *
 * The docstring is rewritten rather than left in place because prose arguing for
 * a divergence the code no longer has is worse than no prose: the next reader
 * trusts it and reintroduces the fifth copy.
 */

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

/**
 * ── `tone`: WHO DECIDES THE INK, AND WHY THE DEFAULT CANNOT MOVE ────────────
 * This chip was built for one caller (training-course/CourseCard) on an
 * ordinarily themed page, where `text-9e-navy dark:text-white` is exactly
 * right. The bundle card is a SECOND caller and neither half of that pair
 * works there:
 *
 *   · Its tiles can carry `.pb-bundle-tile-light`, which re-declares the
 *     semantic tokens so a tile stays light INSIDE a navy card. Tailwind's
 *     `dark:` compiles to `:is(.dark *)` — it matches a descendant of ANY
 *     `.dark` ancestor and cannot be cancelled by nesting — so `dark:text-white`
 *     would paint white-on-near-white in the one place the tile is deliberately
 *     light. That is the same trap the tile's other colours need `lit()` for.
 *   · A non-pickable round has to read as greyed out, which this had no way to
 *     say at all.
 *
 * So `tone` names the three cases rather than letting a caller fight the
 * classes from outside, which it could not win: Tailwind emits variant
 * utilities after base ones, so a `className` override loses to `dark:` inside
 * `.dark` regardless of attribute order.
 *
 *   type    the original, UNCHANGED — type-coloured border, themed ink.
 *   scoped  type-coloured border, ink from the surrounding token scope.
 *   muted   the WHOLE chip fades — fill, border, dot and ink together.
 *
 * `'type'` is the default so CourseCard renders byte-identically.
 *
 * ── `muted` FADES THE CHIP, NOT JUST THE WORDS ─────────────────────────────
 * It used to grey the border, dot and ink to `--text-secondary` and leave the
 * fill transparent, which read as a chip drawn in dark slate rather than a
 * chip that had receded — a closed round looked emphasised next to an open
 * one. It now takes a pale fill as well, from the three `--round-chip-muted-*`
 * tokens globals.css declares (and `.pb-bundle-tile-light` re-declares, so the
 * Navy card's light tile keeps the light values in both themes).
 *
 * NOT `opacity`. Fading the element would scale the ink's contrast against
 * whatever is behind it by an amount that depends on that surface — the one
 * way to make a faded state drift under AA with nothing on screen saying so.
 * The tokens carry measured values instead; see the note in globals.css.
 */
const TONE_INK = {
  type: "text-9e-navy dark:text-white",
  scoped: "text-[var(--text-primary)]",
  muted: "text-[var(--round-chip-muted-ink)]",
};

export default function ScheduleCard({
  dateLabel = "-",
  type = "classroom",
  status = "open",
  statusLabel,
  tone = "type",
  /**
   * A status for assistive technology only, with NO visible badge.
   *
   * The bundle card shows a non-pickable round as a greyed chip and nothing
   * else — no `ปิดรับ`, no `เต็ม`. Greying is a colour, and WCAG 1.4.1 is that
   * colour may not be the only carrier of information, so the word still has to
   * be IN the chip for a screen reader even though no sighted visitor sees it.
   * Distinct from `statusLabel`, which overrides the VISIBLE badge's text.
   */
  srStatus = "",
  /**
   * THE CORNER DOT, and it is on by default because the course card's chip has
   * always had one.
   *
   * ── WHY A BUNDLE CHIP TURNS IT OFF, AND WHY `dotPlacement` IS GONE ────────
   * 3b74d7a6 added `dotPlacement="inline"` for exactly one caller: the corner
   * dot is out of flow, so on a narrow bundle chip a wrapped Thai label ran
   * underneath it. Inline fixed the overlap and cost WIDTH — a dot plus its
   * gap, on the one surface that had none to spare.
   *
   * The dot was never carrying information here. On a course card it names the
   * delivery type against the Classroom/Hybrid legend printed directly above
   * it; a bundle tile has no legend, and the chip's BORDER already carries the
   * same colour. So the second copy of a signal nobody could decode is dropped
   * rather than squeezed in, and the width goes to the date.
   *
   * With that, `dotPlacement` had no caller left. It is REMOVED rather than
   * kept "in case" — a prop with no reader is a control wired to nothing, and
   * the inline branch it selected was five elements of layout that no render
   * could reach. `data-dot` survives as the marker, now reporting
   * `corner`/`none`, so CourseCard's markup is unchanged to the byte.
   */
  showDot = true,
  /**
   * `h-full` ON THE CHIP, and why a wrapping row has to turn it off.
   *
   * It exists for the course card's two-up GRID: the grid gives each cell its
   * column and `h-full` is what makes both cells the same height when one
   * label wraps and the other does not. A grid cell's height is definite, so
   * the percentage resolves cleanly.
   *
   * In the bundle's wrapping flex row it does not. MEASURED on a two-round
   * tile at 207px: the chips came out 76.8px tall — the height of the whole
   * two-line row — beside 34.4px chips on every single-round tile. Setting
   * `height: auto` on the chip in the live DOM returned them to 34.4 while the
   * row stayed 76.8, which is the correct two lines; neither `align-items`
   * nor `align-self` nor `flex-shrink` moved it, so the percentage was the
   * whole cause and not a stretch.
   *
   * A flex row does not need it anyway: `align-items: stretch` is the default
   * and already equalises the chips within a line.
   */
  fillHeight = true,
  className = "",
}) {
  // The `|| classroom` fallback moved INTO the shared helper, which is where it
  // stops being a thing each consumer has to remember.
  const color = tone === "muted" ? "var(--round-chip-muted-border)" : trainingTypeColor(type);
  // Accepts either MSDB's `nearly_full` or the camel-cased `nearFull` that
  // formatStatusFromAPI hands in — both resolve to the same entry, so a
  // nearly-full session can no longer fall through to green "open".
  const statusStyle = resolveScheduleBadge(status);

  return (
    <div
      /*
        THE COMPONENT'S OWN MARKERS, so a caller's test can pin THIS COMPONENT
        rather than the classes it happens to emit. A bundle chip asserted by
        `border-[var(--text-secondary)]` would go green against a hand-rolled
        div that copied the class, which is the drift reusing this component
        exists to prevent; `[data-schedule-card]` can only be satisfied by the
        shared chip. `data-tone` carries the variant for the same reason — the
        greyed state is checkable without naming a colour.
      */
      data-schedule-card=""
      data-tone={tone}
      /*
        The dot, as a marker for the same reason `data-tone` is one: "the
        bundle draws no dot and CourseCard still corners it" is then checkable
        without asserting on a positioning class, or on the absence of an
        element that a selector typo would also report absent.

        `corner` is still the value a default render emits, so CourseCard's
        markup does not move when the `inline` case it never used goes away.
      */
      data-dot={showDot ? "corner" : "none"}
      /*
        `h-full` and no width: the two-up grid above gives this its column, and
        `h-full` is what keeps both cells the same height when one label wraps to
        two lines and the other does not. The old fixed `h-[70px] w-[83px]` is
        exactly what could not do that.

        `border-2` rather than `border`, because the SVG path it replaces was a
        2-unit stroke and the type colour is the card's main identifier.
      */
      className={cx(
        // Split either side of `h-full` so the class keeps the POSITION it has
        // always had in this string. Appending it at the end would render the
        // same but diff against every stored expectation of the markup.
        "relative flex",
        fillHeight && "h-full",
        "flex-col items-center justify-center gap-1 rounded-9e-md border-2 px-2 py-2 text-center",
        // The fill is the `muted` tone's and nothing else's, so every other
        // caller's chip keeps the transparent background it has always had.
        tone === "muted" && "bg-[var(--round-chip-muted-bg)]",
        className,
      )}
      style={{ borderColor: color }}
    >
      {/*
        The dot the SVG used to notch out of its own corner. As an ordinary
        positioned circle it needs no mask, no path and no unique id.

        INSIDE THE BOX (`left-1 top-1`), NOT hanging off it. The card's link
        wrapper is `relative overflow-hidden` — required by EarlyBirdRibbon, whose
        diagonal tails clip against it — so a dot at a negative offset is not
        merely outside the border, it is CLIPPED AWAY ENTIRELY. That is also
        where the SVG had it: `<circle cx="6.5" cy="5.5">` sat inside the 90x80
        viewBox, with the border notched around it rather than the dot escaping.
      */}
      {showDot && (
        <span
          className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}

      {/*
        NO `whitespace-nowrap`, AND THAT IS LOAD-BEARING IN BOTH DIRECTIONS.

        It is the line that used to overflow the old fixed box, so on the
        course card — whose chips sit in fixed grid columns — it must be free
        to wrap. And a bundle chip keeps a one-line date by being SIZED to it
        (`w-max`, see the call site) rather than by being forbidden to break:
        a chip that cannot break is a chip that overflows its tile, and the
        tile is `overflow-hidden`, so the date would be CLIPPED on a narrow
        screen rather than wrapped. Sizing to content gets the same one line
        everywhere it fits and degrades to a wrap where it does not.

        `leading-tight` keeps a wrapped label from doubling the chip's height.
      */}
      <span
        data-schedule-card-date=""
        className={cx("text-[0.72rem] font-bold leading-tight", TONE_INK[tone] ?? TONE_INK.type)}
      >
        {dateLabel}
      </span>

      {/* The state a sighted visitor reads off the greying. See `srStatus`. */}
      {srStatus && <span className="sr-only">{srStatus}</span>}

      {/* No badge at all when the status is missing/blank — never a green
          default. See resolveScheduleBadge. */}
      {(statusStyle || statusLabel) && (
        <span
          className={cx(
            "whitespace-nowrap rounded-full px-2 py-[2px] text-[0.6rem] font-bold leading-none",
            statusStyle?.solid ?? NEUTRAL_STATUS.solid,
          )}
        >
          {statusLabel || statusStyle.action}
        </span>
      )}
    </div>
  );
}

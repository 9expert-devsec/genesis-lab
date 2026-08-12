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

export default function ScheduleCard({
  dateLabel = "-",
  type = "classroom",
  status = "open",
  statusLabel,
  className = "",
}) {
  // The `|| classroom` fallback moved INTO the shared helper, which is where it
  // stops being a thing each consumer has to remember.
  const color = trainingTypeColor(type);
  // Accepts either MSDB's `nearly_full` or the camel-cased `nearFull` that
  // formatStatusFromAPI hands in — both resolve to the same entry, so a
  // nearly-full session can no longer fall through to green "open".
  const statusStyle = resolveScheduleBadge(status);

  return (
    <div
      /*
        `h-full` and no width: the two-up grid above gives this its column, and
        `h-full` is what keeps both cells the same height when one label wraps to
        two lines and the other does not. The old fixed `h-[70px] w-[83px]` is
        exactly what could not do that.

        `border-2` rather than `border`, because the SVG path it replaces was a
        2-unit stroke and the type colour is the card's main identifier.
      */
      className={cx(
        "relative flex h-full flex-col items-center justify-center gap-1 rounded-9e-md border-2 px-2 py-2 text-center",
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
      <span
        className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />

      {/*
        NO `whitespace-nowrap`. This is the line that used to overflow the fixed
        box; it is allowed to wrap now, and the box grows to hold it. `leading-
        tight` keeps a wrapped label from doubling the card's height.
      */}
      <span className="text-[0.72rem] font-bold leading-tight text-9e-navy dark:text-white">
        {dateLabel}
      </span>

      {/* No badge at all when the status is missing/blank — never a green
          default. See resolveScheduleBadge. */}
      {(statusStyle || statusLabel) && (
        <span
          className={cx(
            "whitespace-nowrap rounded-full px-2 py-[2px] text-[0.6rem] font-bold leading-none",
            statusStyle?.solid ?? NEUTRAL_STATUS.solid,
          )}
        >
          {statusLabel || statusStyle.label}
        </span>
      )}
    </div>
  );
}

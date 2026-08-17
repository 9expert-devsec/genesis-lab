import Link from "next/link";

/**
 * CoursePromoSection — promotions linked to a course.
 *
 * Layout: compact horizontal rows — thumbnail left, title + end-date right, and
 * ONE call to action whose form follows the card's own width. ONE column below
 * md, two from md up. Max two rows; the rest are reachable via
 * "ดูโปรโมชันทั้งหมด" → `/promotions`.
 *
 * Server component over `{ link, promotion }` rows from
 * `getActiveCoursePromos()`. Sort priority (set in the action):
 *   1. is_pinned === true
 *   2. start_date / createdAt descending
 *
 * Renders nothing on empty input. No state, no client boundary.
 *
 * ── THE EDGE RAIL IS BACK, AND IT IS GATED ON THE CARD, NOT THE VIEWPORT ────
 * 61df291 dropped the filled "ดูโปรโมชัน" rail at every width. Below md that
 * was right and stays right. Above it, it gave away a control the block had
 * room for. The rail returns — but on the measurement below, not on "desktop".
 *
 * MEASURE FIRST. "Desktop" is not "wide card" here, because the row's width is
 * a function of TWO layout rules pulling in opposite directions: this grid goes
 * `grid-cols-1 md:grid-cols-2`, while the page goes one column below lg and
 * `lg:grid-cols-[1fr_300px]` above it. Resolving the chain
 * (`mx-auto max-w-[1200px] px-4` → the page grid → this section's `p-4` and 1px
 * border → this grid's `gap-2`) gives the card's real width:
 *
 *      viewport   390    700    768   1023   1024   1280+
 *      card       324    634    347  474.5    309    397
 *
 * The card is WIDEST just below md, where it is one full-bleed column, and
 * NARROWEST at lg, where it is half of a column that has just surrendered 332px
 * to the sidebar. So `md:` would have revealed the rail at 309px — the single
 * most cramped width the row ever has — and hidden it at 634px. Backwards.
 *
 * 1023 is in that table because sampling only the breakpoints misses it. The
 * width has THREE regimes, not two, and the middle one has no name: from md to
 * lg the grid is already two columns while the page is still one, so the card
 * climbs to 474.5px — and then FALLS to 309px at lg when the sidebar takes its
 * 332px. That 165px cliff at a single pixel of viewport is the whole argument
 * against reasoning about this row in breakpoints at all.
 *
 * Hence `@container` on the row and `@[376px]:` on the rail.
 *
 * ── WHERE 376 COMES FROM, AND WHY IT IS NOT 480 ─────────────────────────────
 * 2412163 first shipped 480, derived from a title that NEVER TRUNCATES: it took
 * 61df291's ~360px "first width at which the row is a row" — which budgets the
 * title ~244px — and simply added the rail's cost on top. That budget is wrong,
 * and the evidence it is wrong is the rail's own history: the pre-61df291 rail
 * SHIPPED on the 397px desktop card with the title truncating, and that is the
 * approved appearance. The title is `line-clamp-2`. Truncation is the designed
 * behaviour of this row, not a failure state to be budgeted away. Budgeting for
 * a title that never clips demanded 480px of card, which no md-and-up width
 * reaches, so the rail rendered only in a ~546-767 band and never on desktop —
 * the exact opposite of what it was brought back for.
 *
 * Re-derived from what the row needs to stay READABLE with the rail present:
 *
 *      12   row `p-3` left inset (the right one is cancelled by the rail)
 *      80   thumbnail, `shrink-0`
 *      12   `gap-3`, thumbnail → text
 *     160   text column FLOOR — see below
 *      12   `gap-3`, text → rail
 *      32   rail `px-4`
 *      68   rail label "ดูโปรโมชัน" at `text-sm`, 8 advancing glyphs
 *     ───
 *     376
 *
 * The 160px floor is the DATE LINE, not the title, because the date is the only
 * thing in that column with no truncation mechanism: "ระยะเวลา: ถึง 5 ก.ย. 2569"
 * at `text-sm` is ~160px, and below that it wraps to a second line and the
 * compact row silently grows. The title is allowed to clip and does.
 *
 * That derivation is bracketed on both sides by behaviour that was already
 * approved, which is the check that it is not just arithmetic: 376 < 397, so
 * the desktop card that shipped the rail still gets it; 376 > 324, so the phone
 * still gets the inline affordance 61df291 was for. It also predicts the
 * screenshot — at 397px the text column is 397 − 216 = 181px, which at
 * `text-base` over two clamped lines is ~44 characters, and the approved
 * reference reads "9EXPERT Promotion Exclusive สำหรับ Public…" at ~42.
 *
 * ── WHERE THE RAIL ACTUALLY SHOWS ───────────────────────────────────────────
 * Scanned across every width rather than sampled, because sampling is what put
 * a wrong number in this docstring last time. Rail SHOWN at:
 *
 *      vw  442 – 767     regime A, one column, card 376 – 701
 *      vw  826 – 1023    regime B, grid split, card 376 – 474.5
 *      vw 1158 – ∞       regime C, sidebar taken, card 376 – 397 (capped)
 *
 * and hidden in the three gaps: below 442 (the phone), 768 – 825 where the grid
 * has just halved the card, and 1024 – 1157 where the sidebar has just taken
 * 332px. All three regimes reach it, which is the property that matters and the
 * one 480 failed — under 480 regime C topped out at 397 and could never qualify.
 *
 * The 1024 – 1157 gap is real and worth naming: the rail is on at 1023, off at
 * 1024, on again at 1158. That is not the threshold being unstable, it is the
 * card losing 165px at one pixel of viewport, and any rule keyed on how much
 * room the row HAS must follow it. A rule that stayed on across that cliff
 * would be putting the rail on the 309px card — the narrowest this row is at
 * any width, narrower than a phone's.
 *
 * THE BINDING CASE IS NOW THE DESKTOP CAP, not the 1023 peak that bound 480:
 * regime C maxes at 397px once `max-w-[1200px]` stops the growth, so the
 * threshold clears it by 21px and the guard pins that. The lower bound has 52px
 * of room (324px phone). If the page cap, the 300px sidebar or either padding
 * moves enough to pull the desktop card under 376, the rail silently leaves
 * desktop again — which is precisely the regression this file just had — so the
 * guard asserts reachability in each of the three regimes by name.
 *
 * This is also the codebase's existing vocabulary for "ask the element, not the
 * window": training-course/_components/CourseCard.jsx:209, ScheduleCard.jsx:35.
 *
 * A viewport rule cannot express this at all. The honest translation is now
 * `min-[442px]:max-md:` PLUS `min-[826px]:max-[1023px]:` PLUS `min-[1158px]:` —
 * three disjoint bands, none of which is a breakpoint, all of them arithmetic
 * on this page's layout chain (1200px cap, 300px sidebar, 32px gap, two
 * paddings) copied by hand into a leaf component, where they would go stale the
 * first time any one of those numbers moved and nobody would know. The card
 * knows its own width; nothing else here does.
 *
 * NOT A FOURTH DIALECT, which is the argument 61df291 made for dropping the
 * rail everywhere and which is hereby withdrawn. The premise was that a control
 * present at some widths and absent at others is its own dialect. The counter
 * is that the available space genuinely differs — 309px and 634px are not the
 * same card and should not be asked to seat the same control — and that the
 * comparison to /promotions was never like-for-like: that page renders a
 * VERTICAL card with the image on top and a full-width text row beneath, which
 * has somewhere to put an inline arrow link. This is a HORIZONTAL row whose
 * text competes with a thumbnail on the same line. The two were never going to
 * be the same shape. Please do not "fix" this back to a single form.
 *
 * ── THE BREAKPOINT, AND WHY md AND NOT sm ───────────────────────────────────
 * This grid used to be `grid-cols-2` at EVERY width, with no responsive
 * qualifier anywhere in the file. On a phone that is two ~160px columns, each
 * still trying to seat an 80px thumbnail, a two-line title, a date line and a
 * full-height button side by side.
 *
 * `md:grid-cols-2` rather than `sm:` is taken from /promotions, which lays its
 * own promotion cards out as `grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4`.
 * Matching that breakpoint is not deference for its own sake — at sm (640px)
 * two columns of this block are ~296px each, and after p-3, an 80px thumbnail
 * and the gap that leaves ~180px for a two-line title. md gives ~360px, which
 * is the first width where the row is actually a row.
 *
 * ── TWO ROWS IS A CONTENT CAP, NOT A LAYOUT ONE ─────────────────────────────
 * `slice(0, 2)` was sized for a two-column desktop grid — one visual row of
 * two. It stays 2 now that mobile is one column, deliberately:
 *   · this is a server component with no state, and it must stay one, so there
 *     is no breakpoint to read at render time. The cap has to be a single
 *     number for every width.
 *   · two stacked compact rows on a phone is ~220px, a teaser and not a wall,
 *     and the section already ends in "see all".
 *   · following the column count would mean showing phone users FEWER
 *     promotions than desktop users, which is the wrong direction for a promo
 *     block; and CSS-hiding the second row would ship markup nobody can see.
 */
export function CoursePromoSection({ coursePromos }) {
  if (!Array.isArray(coursePromos) || coursePromos.length === 0) return null;

  // A content cap, not a layout one — see the header. Independent of columns.
  const displayed = coursePromos.slice(0, 2);

  return (
    <section
      aria-label="โปรโมชัน"
      className="rounded-9e-lg border border-dashed border-9e-brand/30 p-4 dark:border-9e-brand/20"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold uppercase tracking-wider text-9e-action">
          โปรโมชัน
        </h2>
        <Link
          href="/promotions"
          className="font-en text-xs font-medium text-9e-action hover:underline"
        >
          ดูโปรโมชันทั้งหมด
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {displayed.map(({ link, promotion }) => (
          <PromoRow
            key={link._id ?? promotion.promotion_id}
            promotion={promotion}
          />
        ))}
      </div>
    </section>
  );
}

function PromoRow({ promotion }) {
  const href = `/promotions/${promotion.api_slug || promotion.promotion_id}`;

  const dateLabel = (() => {
    const end = promotion.end_date ? new Date(promotion.end_date) : null;
    if (!end || Number.isNaN(end.getTime())) return null;
    return `ถึง ${end.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  })();

  return (
    // THE WHOLE ROW IS THE LINK — ONE anchor, one tap target, whichever form
    // the CTA takes. That is the constraint the rail has to live inside, and it
    // is not a style preference: before 61df291 the rail was its own <a> nested
    // in the row, and re-adding it that way now would nest an anchor inside an
    // anchor. The browser un-nests that during parsing, so the live DOM stops
    // matching the JSX while any assertion over the rendered STRING still sees
    // what was written. The rail is therefore a <div>: a styled block, styled to
    // look like the control it replaced, carrying no href of its own.
    //
    // `@container` is here rather than on the section because the query has to
    // read THIS card's width — see the table in the header. The row is a grid
    // item, so `container-type: inline-size` takes its width from the track and
    // constrains nothing that matters.
    //
    // Padding stays here, on the row itself, exactly as 61df291 left it: the
    // whole card is the target, so the whole card is what must be padded. The
    // rail reaches the edge by cancelling that padding on its own three sides
    // (`-my-3 -mr-3`) instead of by the row giving it up for everybody.
    <Link
      href={href}
      className="group @container flex items-center gap-3 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] p-3 transition-colors duration-9e-micro hover:border-9e-brand/30"
    >
      {promotion.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={promotion.thumbnail_url}
          alt=""
          className="h-[80px] w-[80px] shrink-0 rounded-9e-sm object-cover"
        />
      ) : (
        // 80x80, matching the image it stands in for. It was 60x80, so a promo
        // with no thumbnail made its row 20px shorter than the one beside it.
        <div className="h-[80px] w-[80px] shrink-0 rounded-9e-sm bg-9e-ice dark:bg-9e-card" />
      )}

      <div className="min-w-0 flex-1">
        {promotion.is_pinned && (
          <span className="mb-1 inline-block rounded border border-9e-lime/30 bg-9e-lime/20 px-1.5 py-0.5 font-en text-[10px] font-bold text-9e-navy dark:text-9e-lime">
            Pinned
          </span>
        )}
        <p className="line-clamp-2 font-thai text-base font-medium leading-snug text-9e-navy dark:text-white">
          {promotion.title}
        </p>
        {dateLabel && (
          <p className="mt-0.5 font-thai text-sm text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
            ระยะเวลา: {dateLabel}
          </p>
        )}
        {/* THE INLINE AFFORDANCE AND THE RAIL SWAP — they never both show.
            Two calls to action in one row is worse than either alone: they
            compete for the same glance, and here they would be the same words
            twice, six centimetres apart, both leading to the same href. So the
            two carry complementary halves of ONE threshold — `@[376px]:hidden`
            here, `hidden @[376px]:flex` on the rail — and the row has exactly
            one control at every width. `hidden` is display:none, so the one
            that is off is out of the accessibility tree too and the label is
            announced once, not twice. */}
        <span className="mt-1 inline-flex items-center gap-1 font-en text-sm font-semibold text-9e-action transition-colors group-hover:text-9e-brand @[376px]:hidden">
          ดูโปรโมชัน
          <span
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </div>

      {/* THE RAIL. Treatment recovered from the pre-61df291 button rather than
          re-invented: brand fill `bg-9e-action`, `text-9e-ice`, `px-4`,
          `font-en text-sm font-medium`, the label, and `rounded-r-9e-md` so
          only the outer corners round and the inner edge stays flush.

          Three things deliberately NOT restored:
          · the <a>. It is a div now — see the row comment above.
          · `hover:bg-9e-brand` → `group-hover:`. The rail is no longer
            independently hoverable, so a self-hover would light it up only
            when the pointer is over the rail itself while the rest of the row
            it belongs to stayed cold.
          · `h-full` → `self-stretch` plus `-my-3`. `h-full` is a percentage
            against a parent of auto height, which is why the old rail's height
            was whatever the text happened to be rather than the card's. Stretch
            fills the flex line; the negative margins take it out through the
            row's padding to the card edge. `py-2` went with it: once the block
            stretches, it governed nothing, and a padding class that sets no
            height is a claim about the layout that is not true. */}
      <div className="-my-3 -mr-3 hidden shrink-0 items-center justify-center self-stretch rounded-r-9e-md bg-9e-action px-4 font-en text-sm font-medium text-9e-ice transition-colors group-hover:bg-9e-brand @[376px]:flex">
        ดูโปรโมชัน
      </div>
    </Link>
  );
}

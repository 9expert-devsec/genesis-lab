"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * The row of small cards under the featured card — "what is coming up next".
 *
 * ── THEY ARE BUTTONS, NOT LINKS ─────────────────────────────────────────────
 * Clicking one does not navigate: it promotes that item into the featured slot
 * above. So this is a <button> with the pool index it selects, and the parent
 * owns the index. A link here would take the reader off the page at the exact
 * moment they were browsing the pool, and the featured card already carries
 * the real destination on its own buttons.
 *
 * ── THE RIGHT-HAND META SLOT IS GONE FOR GOOD ───────────────────────────────
 * The Figma drew a second value opposite the chip — "4.8 ★ (120 รีวิว)",
 * "95K views", "เริ่มเรียนได้ทันที". Nothing in this system can supply any of
 * them: there is no rating, no review count and no view count anywhere in the
 * data, and inventing one would be a number on a card that means nothing. The
 * chip keeps the left of that row to itself.
 *
 * ── THE PRICE LINE IS BUILT AND RENDERS NOTHING ─────────────────────────────
 * `price` is populated for `course` records only, and no course record exists
 * yet — so today this slot collapses on every single card. That is deliberate
 * rather than premature: the collapse path is the one that actually runs in
 * production, so it is worth having under test before anything can fill it.
 * The mapper returns null, and null removes the element rather than leaving an
 * empty line pulling `gap-2` open.
 *
 * ── IMAGES ARE CONTAINED, NEVER CROPPED ─────────────────────────────────────
 * Same ruling as the featured card. The slot is the design's ~2.56:1, which is
 * close enough to the 1920×700 (2.74) legacy art that those letterbox by only
 * a few percent; a 16:9 YouTube thumbnail pillarboxes instead. The empty space
 * is the card's own panel colour and is meant to be visible — it marks which
 * records still carry legacy sizing, and it disappears by itself once Step C
 * gives the image type a 16:9 upload spec.
 *
 * ── COLOURS ─────────────────────────────────────────────────────────────────
 * Defined in the "FEATURE CONTENT SECTION" block at the bottom of
 * src/app/globals.css. TONE_CLASSES holds COMPLETE class literals, never
 * strings assembled from a key — Tailwind only emits what it can see as whole
 * text, and a class built by concatenation compiles to nothing at all while
 * the markup still looks perfect.
 */
const TONE_CLASSES = {
  gold: "bg-[var(--9e-fc-gold-bg)] text-[var(--9e-fc-gold)]",
  red: "bg-[var(--9e-fc-red-bg)] text-[var(--9e-fc-red)]",
  cyan: "bg-[var(--9e-fc-cyan-bg)] text-[var(--9e-fc-cyan)]",
};

export function FeatureContentCards({ cards = [], onSelect }) {
  if (!cards.length) return null;

  return (
    // MOBILE: a snap row that bleeds to the viewport edge. `-mx-4 px-4`
    // cancels the section's own horizontal padding for the TRACK only, so a
    // card can scroll all the way out to the screen edge instead of stopping
    // 16px short of it, while the first card still starts flush with the
    // heading above. Both are undone at md, where the row becomes a grid.
    //
    // `md:grid-cols-3` is fixed rather than derived from the count: with a
    // pool of 3 there are only 2 upcoming cards, and they should keep the
    // width they have in the design instead of stretching to half the row.
    //
    // `scrollbar-hide` is the repo's existing utility (globals.css) — the row
    // is snap-scrolled by finger, and a native bar under it on a dark panel
    // reads as a rendering fault.
    <div className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 md:pb-0">
      {cards.map(({ item, index }) => {
        const tone = TONE_CLASSES[item.tone] ?? TONE_CLASSES.cyan;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(index)}
            aria-label={`แสดง ${item.title} ในการ์ดหลัก`}
            className="group flex w-[280px] shrink-0 snap-start flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--9e-fc-panel-border)] bg-[var(--9e-fc-panel)] p-4 text-left transition-colors duration-9e-micro ease-9e hover:border-[var(--9e-fc-accent)] md:w-auto md:shrink"
          >
            {/* aspect-[2.56/1] rather than the Figma's flat 140px height: the
                ratio is the thing the ruling fixes, and a fixed height would
                drift off it at every column width the grid produces. */}
            <div className="relative aspect-[2.56/1] w-full shrink-0 overflow-hidden rounded-lg">
              <CardImage item={item} />
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              {item.cardBadge ? (
                <span
                  className={`w-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}
                >
                  {item.cardBadge}
                </span>
              ) : null}
              {/* No second value opposite the chip — see the note above. */}

              {/* Two lines on a phone, one line from md.
                  The Figma truncates to a single line, and at the designed
                  width (386px column at a 1200px container) the Thai titles
                  fit on that line. A mobile card is 280px and they do not —
                  a one-line rule there cuts "5 งาน Excel ประจำที่ Copilot…"
                  mid-phrase. There is no mobile frame to be faithful to, so
                  the phone gets the second line and md+ keeps the design. */}
              <p className="line-clamp-2 text-sm font-bold text-white md:truncate">
                {item.title}
              </p>

              {/* Course price. Null on every record today; see the header. The
                  three parts are independent — a course with a price but no
                  "was" price renders two spans, not a struck-through blank. */}
              {item.price ? (
                <div className="flex flex-wrap items-baseline gap-2">
                  {item.price.prefix ? (
                    <span className="text-xs text-[var(--9e-fc-text-muted)]">
                      {item.price.prefix}
                    </span>
                  ) : null}
                  {item.price.now ? (
                    <span className="text-[15px] font-extrabold text-[var(--9e-fc-emerald)]">
                      {item.price.now}
                    </span>
                  ) : null}
                  {item.price.was ? (
                    <span className="text-[11px] text-[var(--9e-fc-text-muted)] line-through">
                      {item.price.was}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Collapses on every image record — they have no slide_text. */}
              {item.cardSubtitle ? (
                <p className="line-clamp-2 text-xs text-[var(--9e-fc-text-muted)] md:truncate">
                  {item.cardSubtitle}
                </p>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Contained thumbnail with the same one-shot maxres→hq fallback the featured
 *  slot uses. Kept local rather than shared: the two differ in `sizes` and in
 *  nothing else, and a shared component would need both passed in anyway. */
function CardImage({ item }) {
  const [failed, setFailed] = useState(false);
  const src = failed && item.imageFallback ? item.imageFallback : item.image;

  return (
    <Image
      key={item.id}
      src={src}
      alt={item.imageAlt}
      fill
      sizes="(min-width: 768px) 33vw, 280px"
      className="object-contain object-center"
      onError={() => setFailed(true)}
    />
  );
}

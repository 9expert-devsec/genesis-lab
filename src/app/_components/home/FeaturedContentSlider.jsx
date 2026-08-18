"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Award,
  BookOpen,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Globe,
  GraduationCap,
  Lightbulb,
  LineChart,
  Play,
  PlayCircle,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Youtube,
  Zap,
} from "lucide-react";
import { useSwipe } from "@/hooks/useSwipe";
import { FeatureContentCards } from "./FeatureContentCards";

/**
 * The Feature Content board: section header, the one featured card, and the
 * three small cards under it.
 *
 * ── WHY ALL THREE PARTS ARE IN ONE COMPONENT ────────────────────────────────
 * They share one index and each one can change it. The prev/next buttons sit
 * in the header at the top right; the card they move is below; and clicking a
 * small card promotes it to the featured slot. One piece of state, so one
 * owner. The cards row is still its own file — it is just rendered from here
 * with a callback rather than from the server shell.
 *
 * The items arrive already mapped by src/lib/home/featureContentFromBanners.js.
 * NOTHING in this file knows what a Banner is; it reads a view model. That is
 * what lets Step C change the schema without touching a component.
 *
 * ── THE POOL AND THE THREE CARDS ────────────────────────────────────────────
 * The three small cards are the NEXT three items after the current one,
 * wrapping. So the row is always "what is coming up", never a duplicate of the
 * card above it. With 1 item there is nothing coming up: the row and both
 * arrows unmount. With 2 or 3 the row shows what exists and is not padded.
 *
 * NO AUTOPLAY, deliberately — see the note in FeatureContentSection.
 *
 * ── IMAGES ARE CONTAINED, NEVER CROPPED ─────────────────────────────────────
 * Both sources are designed graphics with text baked into them: 1920×700 promo
 * art (2.74) and YouTube's 1280×720 (1.78). There is no crop direction that is
 * safe — a cover fit in this 16:9 slot takes 35% off the WIDTH of the promo
 * art, which is exactly where its headline sits. So `object-contain`: whole
 * image, centred, and the leftover is the card's own panel colour.
 *
 * The letterbox this leaves on 2.74 art is not a defect to hide. It marks the
 * records still carrying legacy sizing. When Step C gives the image type a
 * 16:9 upload spec, contain and cover converge and the bars vanish on their
 * own. Do NOT add a blur-fill, a second image request, or a stretched copy
 * behind it.
 */

/**
 * The 16 icon names `feature_tags.icon` may hold — see FEATURE_TAG_ICONS in
 * src/lib/schemas/banner.js, which is what the admin form offers.
 *
 * COMPLETE LITERALS, mapped here rather than in the data module, because a
 * database can store `"Sparkles"` and cannot store a React component. An
 * unknown name renders no icon rather than throwing.
 */
const TAG_ICONS = {
  Users,
  TrendingUp,
  Rocket,
  Target,
  Award,
  Lightbulb,
  BookOpen,
  Briefcase,
  Globe,
  Cpu,
  LineChart,
  Sparkles,
  GraduationCap,
  ShieldCheck,
  Zap,
  Star,
};

export function FeaturedContentSlider({ copy, items = [] }) {
  const [index, setIndex] = useState(0);
  const cardRef = useRef(null);
  const total = items.length;

  const next = useCallback(() => {
    setIndex((i) => (total ? (i + 1) % total : 0));
  }, [total]);

  const prev = useCallback(() => {
    setIndex((i) => (total ? (i - 1 + total) % total : 0));
  }, [total]);

  // Swipe LEFT reveals the NEXT item — the same direction mapping the banner
  // carousel uses, so two bands on one page do not disagree about the gesture.
  useSwipe(cardRef, { onSwipeLeft: next, onSwipeRight: prev });

  if (!total) return null;

  const current = Math.min(index, total - 1);
  const item = items[current];

  // The next three, wrapping, and never the current one. `total - 1` is the
  // cap so a pool of 2 yields 1 card and a pool of 3 yields 2 — "show what
  // exists without padding".
  // Each entry carries its index in the POOL, not its position in this row —
  // clicking card 2 must promote pool item 7, and the row would otherwise have
  // to recompute the modulo a second time to find that out.
  const upcoming = [];
  for (let step = 1; step <= Math.min(3, total - 1); step += 1) {
    const at = (current + step) % total;
    upcoming.push({ item: items[at], index: at });
  }

  // One item means nothing is coming up and the arrows have nothing to move.
  const hasPool = total > 1;

  return (
    <>
      {/* ── Section header ───────────────────────────────────────────────
          `sm:items-end` so the buttons sit on the baseline of the description
          rather than floating level with the eyebrow. Below sm they drop under
          the copy — at 390px there is no room for the text block and two
          controls on one line. */}
      <div className="flex w-full flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-[800px] flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--9e-fc-accent)]">
            {copy.eyebrow}
          </p>
          <h2 className="text-2xl font-bold text-white lg:text-[32px]">
            {copy.title}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--9e-fc-text-muted)]">
            {copy.description}
          </p>
        </div>

        {hasPool ? (
          <div className="flex shrink-0 gap-3">
            <SliderButton label="คอนเทนต์ก่อนหน้า" onClick={prev}>
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </SliderButton>
            <SliderButton label="คอนเทนต์ถัดไป" onClick={next}>
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </SliderButton>
          </div>
        ) : null}
      </div>

      {/* ── The featured card ────────────────────────────────────────────
          `flex-col-reverse` below lg is what puts the THUMBNAIL ON TOP on a
          phone while leaving the heading before the image in DOM order, so the
          reading order a screen reader gets is still title-then-media.

          The card keeps its fixed `lg:h-[480px]`. That is not only the Figma
          constant: pool items carry between 0 and 340 characters of
          description, so a content-height card would jump by ~120px every time
          the reader pressed next. A fixed height makes the arrows feel like a
          slider instead of a page reflow.

          `overflow-hidden` here is fine, and is NOT the ban that applies to
          the section shell: this box has 24px corners and images that have to
          be clipped to them. The thing that must never be clipped is the
          aurora glow, and the aurora is not in this subtree. */}
      <div
        ref={cardRef}
        aria-roledescription="carousel"
        aria-label="คอนเทนต์เด่น"
        className="flex w-full flex-col-reverse gap-6 overflow-hidden rounded-[24px] border border-[var(--9e-fc-panel-border)] bg-[var(--9e-fc-panel)] p-4 shadow-[0_16px_32px_0_rgba(0,0,0,0.5)] sm:p-6 lg:h-[480px] lg:flex-row lg:gap-8 lg:p-8"
      >
        {/* Details. `lg:min-w-0` is load-bearing on a flex child holding long
            unbroken Thai — without it the panel refuses to shrink below its
            content's intrinsic width and shoves the thumbnail off the card. */}
        <div className="flex flex-col justify-center gap-5 lg:h-full lg:min-w-0 lg:flex-1 lg:gap-6">
          <div className="flex flex-col gap-4">
            {item.badge ? (
              <div className="flex w-fit items-center gap-1.5 rounded-lg bg-[var(--9e-fc-badge-bg)] px-3 py-1">
                <Star
                  className="h-3.5 w-3.5 shrink-0 text-[var(--9e-fc-accent)]"
                  strokeWidth={2}
                />
                <p className="text-xs font-bold text-[var(--9e-fc-accent)]">
                  {item.badge}
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              {/* Every slot below is guarded. The mapper returns null — never
                  '' — for anything the Banner model cannot supply, and today
                  that is kicker, both title accents and the subtitle on EVERY
                  record. A `''` would still occupy a line box and still pull
                  the `gap-2` above it; null removes the element. */}
              {item.kicker ? (
                <p className="text-sm font-semibold text-[var(--9e-fc-text-muted)]">
                  {item.kicker}
                </p>
              ) : null}

              {/* h3, not h2 — the section already spent its h2 on the heading
                  above, and this is one item inside that section. */}
              <h3 className="text-2xl font-extrabold leading-[1.2] text-white lg:text-[28px]">
                <span className="block">{item.title}</span>
                {item.titleAccent || item.titleHighlight ? (
                  <span className="block">
                    {item.titleAccent ? (
                      <span className="text-[var(--9e-fc-accent)]">
                        {item.titleAccent}
                      </span>
                    ) : null}
                    {item.titleAccent && item.titleHighlight ? " " : null}
                    {item.titleHighlight ? (
                      <span className="text-[var(--9e-fc-gold)]">
                        {item.titleHighlight}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </h3>

              {item.subtitle ? (
                <p className="text-sm font-medium text-[var(--9e-fc-text-body)]">
                  {item.subtitle}
                </p>
              ) : null}
            </div>

            {item.description ? (
              <p className="line-clamp-4 text-[13px] leading-relaxed text-[var(--9e-fc-text-muted)]">
                {item.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-5">
            {/* NEVER A DEAD BUTTON. Each renders only when the mapper found it
                a target — and on today's data exactly one of the two does, per
                type: image records have a page link and no video, youtube
                records have a video and a link_url that IS that video (folded
                into videoHref rather than duplicated as a details button). */}
            {item.href || item.videoHref ? (
              <div className="flex flex-wrap gap-3">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-1.5 rounded-[10px] bg-9e-action px-5 py-2.5 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-action-scale-100"
                  >
                    <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                    ดูรายละเอียด
                  </Link>
                ) : null}
                {item.videoHref ? (
                  <Link
                    href={item.videoHref}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--9e-fc-control-border)] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-9e-micro ease-9e hover:bg-[var(--9e-fc-control)]"
                  >
                    <Play className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                    ดูวิดีโอ
                  </Link>
                ) : null}
              </div>
            ) : null}

            {/* The hairline belongs TO the chip row, so it goes when the row
                goes. On an image record `meta` is empty and a rule with
                nothing under it would read as a rendering fault. */}
            {item.meta.length ? (
              <>
                <hr className="w-full border-0 border-t border-[var(--9e-fc-rule)]" />
                <MetaRow chips={item.meta} />
              </>
            ) : null}
          </div>
        </div>

        {/* Thumbnail. A 16:9 slot at every width — the video source is YouTube
            and YouTube is natively 16:9, so any other ratio would letterbox or
            crop every video forever.

            `self-center` from lg: 16:9 at the column width is shorter than the
            card's 480px, so the slot centres in the card rather than stretching
            to fill it. The width is a PERCENTAGE up to xl and the design's
            literal 640px only from xl — at exactly 1024 the container is 976px
            wide and a hard 640px thumbnail would leave the details panel ~240px
            with the Thai title breaking on every second word. */}
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-2xl lg:w-[58%] lg:self-center xl:w-[640px]">
          <ContainedImage
            item={item}
            sizes="(min-width: 1280px) 640px, (min-width: 1024px) 58vw, 100vw"
          />

          {/* NO SCRIM. There was one in Step A, to hold contrast for the chips
              over busy cover-cropped artwork. With `object-contain` the box
              corners the chips sit in are the card's own panel colour, so the
              scrim buys no contrast — and it would tint the letterbox bars a
              shade off the panel, drawing a visible rectangle around exactly
              the empty space the ruling says should read as card background. */}

          <div className="absolute left-5 top-5 flex items-center gap-1.5 rounded-lg bg-black/50 px-3 py-1.5">
            <span
              aria-hidden="true"
              className="block h-4 w-4 shrink-0 rounded-full bg-9e-action"
            />
            <p className="text-xs font-bold text-white">{item.brand}</p>
          </div>

          {/* The one literal hex in this file. It is YouTube's own red on a
              play button that means "this opens a video", not a palette
              decision — putting it in the token block would invite someone to
              re-theme it, which is the opposite of what a brand red is for. */}
          {item.videoHref ? (
            <Link
              href={item.videoHref}
              aria-label={`เล่นวิดีโอ ${item.title}`}
              className="absolute left-1/2 top-1/2 flex h-[50px] w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-[#FF0000] shadow-[0_8px_8px_0_rgba(255,0,0,0.4)] transition-transform duration-9e-micro ease-9e hover:scale-105"
            >
              <PlayCircle className="h-6 w-6 text-white" strokeWidth={2} />
            </Link>
          ) : null}

          {item.watchOnYouTube ? (
            <div className="absolute bottom-5 right-5 flex items-center gap-1.5 rounded-md bg-[var(--9e-fc-watermark-bg)] px-3 py-1.5">
              <p className="text-[11px] font-semibold text-white">Watch on</p>
              <Youtube
                className="h-3.5 w-3.5 shrink-0 text-white"
                strokeWidth={2}
              />
              <p className="text-xs font-extrabold text-white">YouTube</p>
            </div>
          ) : null}
        </div>
      </div>

      {hasPool ? (
        <FeatureContentCards cards={upcoming} onSelect={setIndex} />
      ) : null}
    </>
  );
}

/**
 * The chip row, and its shape changes with the breakpoint because the DATA is
 * a pair, not a sentence.
 *
 * `feature_tags` stores {icon, line1, line2} — a label and a value. Mobile
 * draws that as the mockup does: line1 above line2, with a vertical rule
 * between chips. Desktop has the width to lay the pair on one line, joined by
 * a middle dot. Nothing is dropped at either width.
 *
 * ── WHY MOBILE IS A 2-COLUMN GRID AND NOT A WRAPPING FLEX ROW ───────────────
 * The divider is a `border-l`, so it must only ever appear BETWEEN two chips
 * on the same line — never at the start of one. A wrapping flex row cannot
 * express that: CSS has no "is this item first on its line" selector, so the
 * third chip wraps and draws a stray rule down the left margin. Both the lg
 * row and the mobile row shipped that defect before this comment existed.
 *
 * A 2-column grid makes the position deterministic instead of wrap-dependent:
 * `nth-child(even)` is ALWAYS column two, so `max-lg:even:border-l` is always
 * an internal divider. Three chips give chip1│chip2 on row one and chip3 alone
 * on row two with no rule. Two chips give one divider. One chip gives none.
 *
 * From lg the grid becomes a flex row, the dividers are dropped entirely (the
 * pair joins on one line with a middle dot instead), and spacing moves to the
 * container's `gap-x` — a per-chip margin would travel with a wrapped chip and
 * indent whichever one starts the second line.
 */
function MetaRow({ chips }) {
  return (
    <div className="grid grid-cols-2 items-stretch gap-x-4 gap-y-3 lg:flex lg:flex-wrap lg:gap-x-6">
      {chips.map((chip, i) => {
        const Icon = chip.icon ? TAG_ICONS[chip.icon] : null;
        return (
          <div
            key={`${chip.line1 ?? ""}-${chip.line2 ?? ""}-${i}`}
            className="flex items-center gap-1.5 max-lg:even:border-l max-lg:even:border-[var(--9e-fc-rule)] max-lg:even:pl-4"
          >
            {Icon ? (
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-[var(--9e-fc-text-body)]"
                strokeWidth={2}
              />
            ) : null}
            <span className="flex min-w-0 flex-col leading-tight lg:flex-row lg:items-center lg:gap-1">
              {chip.line1 ? (
                <span className="text-xs text-[var(--9e-fc-text-body)]">
                  {chip.line1}
                </span>
              ) : null}
              {chip.line1 && chip.line2 ? (
                <span
                  aria-hidden="true"
                  className="hidden text-xs text-[var(--9e-fc-text-muted)] lg:inline"
                >
                  ·
                </span>
              ) : null}
              {chip.line2 ? (
                <span className="text-xs text-[var(--9e-fc-text-muted)]">
                  {chip.line2}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * `object-contain` image with a one-shot source fallback.
 *
 * WHY A FALLBACK AT ALL: a YouTube `maxresdefault.jpg` is only generated for
 * videos uploaded above a certain resolution. All five ids in the pool have
 * one today — that is an observation, not a guarantee about the sixth video
 * somebody uploads. `hqdefault.jpg` (480×360) always exists. On the error
 * event we swap once and never again, so a broken fallback cannot loop.
 *
 * `key` on the <Image> resets the swap when the item changes: without it, an
 * item that had fallen back would keep the previous item's fallback flag and
 * skip straight past its own maxres.
 */
function ContainedImage({ item, sizes }) {
  const [failed, setFailed] = useState(false);
  const src = failed && item.imageFallback ? item.imageFallback : item.image;

  return (
    <Image
      key={item.id}
      src={src}
      alt={item.imageAlt}
      fill
      sizes={sizes}
      // Contained and centred — the whole graphic, never a crop. See the note
      // at the top of this file for why neither source can safely be cropped.
      className="object-contain object-center"
      onError={() => setFailed(true)}
    />
  );
}

/** 36px round control, matching the frame. Real <button>s, so Tab / Enter /
 *  Space work natively and the label is announced. */
function SliderButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--9e-fc-control-border)] bg-[var(--9e-fc-control)] text-white transition-colors duration-9e-micro ease-9e hover:border-[var(--9e-fc-accent)] hover:text-[var(--9e-fc-accent)]"
    >
      {children}
    </button>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resolveScheduleBadge } from '@/lib/scheduleStatus';
import {
  Search,
  X,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  MonitorPlay,
  Sparkles,
  Map,
  Tag,
  TriangleAlert,
} from 'lucide-react';
import { courseHref, careerPathHref } from '@/lib/utils';
import { onlineCourseHref } from '@/lib/onlineCourseHref';
import { scheduleRegistrationHref } from '@/lib/schedule/scheduleRegistrationHref';
import {
  SEARCH_MIN_CHARS,
  emptySearchCounts,
  orderTagsByMatch,
} from '@/lib/search/matchSearch';
import {
  ALL_TAB,
  resolveActiveTab,
  tabCount,
  visibleSearchTabs,
} from '@/lib/search/searchTabs';

// ── Local re-implementations from ScheduleClient (not exported) ────
const MONTH_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const TYPE_COLOR = {
  classroom: '#00CCFF',
  hybrid:    '#8B5CF6',
  online:    '#22C55E',
};

const TYPE_LABEL = {
  classroom: 'Classroom',
  hybrid:    'Hybrid',
  online:    'Online',
};

function formatDateLabel(scheduleItem) {
  const dates = (scheduleItem?.dates ?? [])
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (dates.length === 0) return '-';
  const first = dates[0];
  const last  = dates[dates.length - 1];
  const firstM = MONTH_TH[first.getMonth()];
  if (dates.length === 1) {
    return `${first.getDate()} ${firstM} ${first.getFullYear() + 543}`;
  }
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()}-${last.getDate()} ${firstM} ${first.getFullYear() + 543}`;
  }
  const lastM = MONTH_TH[last.getMonth()];
  return `${first.getDate()} ${firstM} - ${last.getDate()} ${lastM} ${last.getFullYear() + 543}`;
}

// The article-date formatter that used to live here is gone with the date it
// rendered — the article card's bottom row is a tag row now. `siteDateParts`
// went with it; /articles still owns that formatting for its own list.

// Compact Thai-locale date for promo range labels — 2-digit BE year.
function formatPromoDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTH_TH[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
}

const SUGGESTIONS = ['Excel', 'Python', 'Power BI', 'AI', 'Power Automate', 'SQL'];

const priceLabel = (price) =>
  !price || Number(price) === 0 ? 'Call .-' : `${Number(price).toLocaleString('th-TH')} .-`;

// ── Highlight matched substring with brand lime ───────────────────
function highlightText(text, term) {
  if (!term || !text) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark
        key={i}
        className="rounded px-0.5 bg-[#D4F73F] not-italic text-[#0D1B2A]"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// ── Card components ────────────────────────────────────────────────

/**
 * THE SHARED LOOK, AS CONSTANTS — not as a shared component.
 *
 * All five result cards are the same object: a cover on the left, a text block
 * on the right, one border, one radius, one hover lift. What differs is the
 * METADATA, and it differs per type in ways that do not generalise — a course
 * shows program + days + price, an online course shows lessons and an outbound
 * marker, a career path a short description, a promotion a date range and
 * coloured tags, an article a date.
 *
 * A shared `<ResultCard>` taking all of that would end up branching on
 * `isPromotion` / `isCourse` inside itself, and this very change is per-card
 * tuning — so the shell would have to be broken open the first time anyone
 * touched it. Constants have no props and no branches: tuning one card means
 * editing that card's JSX and touching nothing else, while a global restyle is
 * still one edit here. `EARLY_BIRD_CHIP` in ScheduleClient.jsx is the same
 * pattern, shared by two deliberately separate components.
 */
const RESULT_CARD_BASE =
  'group grid overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md';

/**
 * THE COVER TRACK — a FIXED length, and that is the entire fix.
 *
 * ── THE CIRCULARITY THIS REPLACES ───────────────────────────────────────────
 * The slot was `grid-cols-[auto_1fr]` with the cover `aspect-video h-full`:
 *
 *     track width  ← cover intrinsic width
 *     cover width  ← aspect-video × cover height
 *     cover height ← h-full, i.e. the row height
 *     row height   ← THE TEXT COLUMN
 *
 * So the cover's WIDTH was a function of how much text the card happened to
 * have. Two results with different title lengths got different cover widths,
 * none of them the requested ratio, with `min-h-36` as a floor and nothing as a
 * ceiling. It is the single root cause behind the unsized covers, the article
 * cover drifting, and the career-path card being swallowed by its image.
 *
 * Now the width is declared and the height is derived — never the reverse.
 *
 * ── WHY 256px, AND WHY 144px FOR SQUARE ─────────────────────────────────────
 * 256 × 9/16 = 144 exactly. 144 is `min-h-36`, the height the cards were
 * already being floored at, so a 16:9 cover fills a default-height card edge to
 * edge with nothing left over. The square track is 144px for the same reason —
 * 144 × 1/1 = 144 — so a promotion card is the SAME HEIGHT as its neighbours
 * despite a different cover ratio. Deriving the track from the height instead
 * of picking a round number is what keeps the five types visually level.
 *
 * ── BELOW `sm` ──────────────────────────────────────────────────────────────
 * A NARROWER TRACK, not a stacked layout. At 360px a 256px cover leaves ~70px
 * of text, which is unusable; a full-width stacked cover is legible but turns
 * each result into a ~250px block, and a search results list is for SCANNING —
 * three stacked results fill a phone screen. 128px (72px tall) keeps the
 * compact row and leaves ~170px of text. Same 2:1 halving for the square track.
 */
const RESULT_COVER_TRACK = 'grid-cols-[128px_1fr] sm:grid-cols-[256px_1fr]';
const RESULT_COVER_TRACK_SQUARE = 'grid-cols-[72px_1fr] sm:grid-cols-[144px_1fr]';

const RESULT_CARD = RESULT_CARD_BASE + ' ' + RESULT_COVER_TRACK;
/** Promotions only — see RESULT_COVER_SQUARE for why the ratio differs. */
const RESULT_CARD_SQUARE = RESULT_CARD_BASE + ' ' + RESULT_COVER_TRACK_SQUARE;

/**
 * `self-stretch` AT EVERY WIDTH — and never `h-full`.
 *
 * ── WHY THIS IS NOT THE ORIGINAL BUG COMING BACK ────────────────────────────
 * The defect this file was rebuilt around was a cover whose WIDTH came from its
 * height:
 *
 *     track width  ← cover intrinsic width  ← ratio × height  ← row height
 *
 * The loop is closed by an `auto` TRACK, not by the direction of the height.
 * Both tracks are declared lengths (128/256 and 72/144), so the cover's width is
 * settled before layout begins and a height taken from the row has nowhere to
 * feed back to. Width pinned, height from the row is what a thumbnail strip
 * does; width from the row is what nothing should do.
 *
 * `h-full` is still banned, and the distinction is not pedantry. `h-full` is
 * `height: 100%` against a parent whose height is itself content-derived — the
 * circular half — whereas `align-self: stretch` is resolved by the GRID, which
 * has already sized the row. Same rendered height here, completely different
 * dependency.
 *
 * ── WHY THE `sm:` QUALIFIER WENT ────────────────────────────────────────────
 * It was there on the theory that a 256px 16:9 cover (144px tall) matched the
 * desktop text column, so `self-start` left nothing behind. It does not: the
 * course card's text column is ~154px, and — because grid items in one row share
 * that row's height — a card sitting beside a taller sibling is taller still. So
 * every card whose text ran long carried a strip of background under its cover.
 *
 * ── WHAT THE RATIO STILL DOES ───────────────────────────────────────────────
 * `aspect-video` / `aspect-square` are NOT dead weight under stretch. An item's
 * contribution to auto row sizing is unaffected by `align-self`, so the ratio
 * still sets the row's FLOOR (144px at both desktop tracks) and only then does
 * the cover stretch to whatever the text makes of it. That is why a promotion
 * card is still level with its neighbours and why a short card is unchanged.
 *
 * ── THE COST, NAMED ─────────────────────────────────────────────────────────
 * The crop is horizontal only — `object-cover` scales to the limiting dimension,
 * which is height, so the full height of every source is visible and the ends of
 * its width are lost. On desktop that is ~6% for the tallest card type and zero
 * for the other four; on a phone it is about half. Per-type figures are in the
 * report.
 */
const RESULT_COVER_BASE = 'relative w-full self-stretch overflow-hidden bg-gray-100';
/** 16:9 — courses, online courses, career paths, articles. */
const RESULT_COVER = RESULT_COVER_BASE + ' aspect-video';
/**
 * SQUARE — promotions only, and not a style preference.
 *
 * `thumbnail_url` is already rendered square everywhere else it appears
 * (/promotions renders it in `aspect-square`, CoursePromoSection at 80x80), so
 * the source images are authored square. Forcing them into a 16:9 box with
 * `object-cover` crops ~25% off the top AND bottom — on a promo poster that is
 * usually exactly where the headline and the price are. The slot keeps every
 * other shared property; only the ratio follows the source.
 */
const RESULT_COVER_SQUARE = RESULT_COVER_BASE + ' aspect-square';
const RESULT_COVER_IMG = 'h-full w-full object-cover';
/**
 * What the browser should DOWNLOAD, which is never the track width.
 *
 * `object-cover` scales the source until it COVERS the box, and the limiting
 * dimension is the height — so a 16:9 cover in a 154px-tall card is decoded
 * ~274px WIDE however narrow its track is. The visible box is 128px on a phone
 * and 256px on a desktop; the bitmap is ~274px on both.
 *
 * This was a media query — 304px below `sm`, 256px above — back when the desktop
 * cover was pinned to its 144px ratio height and 256px really was its rendered
 * width. Dropping the `sm:` qualifier from the slot converged the two halves on
 * one worst case, and left the desktop half under-requesting from the moment a
 * cover could grow past 144px. One value is now both simpler and more correct.
 *
 * 304 is that ~274 rounded up past the next `imageSizes` step, so the 1x
 * candidate next/image picks is 384w rather than 256w.
 */
const RESULT_COVER_SIZES = '304px';
const RESULT_COVER_FALLBACK = 'flex h-full w-full items-center justify-center text-gray-300';
/**
 * The rendered pixel size of a cover at the `sm`-and-up track, written on every
 * raw `<img>` as width/height ATTRIBUTES.
 *
 * Not for CSS — `RESULT_COVER_IMG` already sizes them. They exist so the
 * browser has an intrinsic box before the stylesheet settles: an `<img>` with
 * no dimensions is laid out at its natural size first, which for a 1200px-wide
 * career-path banner meant the cover column blew out and crushed the text
 * column to a sliver. That is the "image swallows the card" symptom, and it is
 * a pre-CSS layout artefact rather than a CSS bug.
 */
const COVER_W = 256;
const COVER_H = 144;
const COVER_SQUARE = 144;
/** `flex flex-col` so a card can anchor a row to the BOTTOM with `mt-auto`. */
const RESULT_BODY = 'flex min-w-0 flex-1 flex-col p-4';
const RESULT_TITLE = 'line-clamp-2 text-sm font-semibold text-[#0D1B2A] group-hover:text-[#005CFF]';
const RESULT_TEASER = 'mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500';
const RESULT_META = 'mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500';
/**
 * A metadata row pinned to the bottom of the text block.
 *
 * Its own constant rather than `RESULT_META + ' mt-auto'`: both set
 * `margin-top`, and which one wins is decided by the order Tailwind emits them
 * in the stylesheet — not by the order they appear in the class attribute. A
 * composed string would look right and be a coin flip.
 */
const RESULT_META_BOTTOM =
  'mt-auto flex items-center justify-between gap-3 pt-2 text-xs text-gray-500';

/**
 * WHY this result matched, when the reason is not visible in the title.
 *
 * Keeping curriculum-level recall (a course found by a bullet in its outline)
 * creates a credibility problem on its own: the card shows a title with no
 * highlight in it, which reads as a wrong result even when it is a good one.
 * The label chip plus the italic body are what make the line read as an
 * EXCERPT rather than as the item's own summary.
 *
 * `snippet` is computed on the SERVER — the fields it quotes (objectives, topic
 * lists, a path's course names) never cross the wire themselves.
 */
function MatchSnippet({ snippet, term }) {
  if (!snippet?.text) return null;
  return (
    <p className="mt-1 line-clamp-1 text-xs text-gray-500">
      <span className="mr-1.5 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-semibold not-italic text-gray-500">
        {snippet.label}
      </span>
      <span className="italic">{highlightText(snippet.text, term)}</span>
    </p>
  );
}

function CourseResultCard({ course, term }) {
  const id = course.course_id ?? '';
  const href = courseHref(id ? String(id).toLowerCase() : '');
  const cover = course.course_cover_url;

  return (
    <Link href={href} className={RESULT_CARD}>
      {/* next/image: `course_cover_url` is already rendered through it by
          /training-course's CourseCard, so its hosts are proven against
          next.config.mjs `remotePatterns` in production. */}
      <div className={RESULT_COVER}>
        {cover ? (
          <Image src={cover} alt={course.course_name ?? ''} fill sizes={RESULT_COVER_SIZES} className={RESULT_COVER_IMG} />
        ) : (
          <span className={RESULT_COVER_FALLBACK}>
            <GraduationCap className="h-7 w-7" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className={RESULT_BODY}>
        {/* CODE ABOVE THE TITLE, as a small muted line — it is an identifier,
            and reading it first is how people who know the catalogue scan. */}
        <p className="font-mono text-[11px] leading-none text-gray-400">
          {highlightText(id, term)}
        </p>
        <h3 className={RESULT_TITLE + ' mt-1'}>{highlightText(course.course_name, term)}</h3>
        {/*
          NO PROGRAM LINE, and no match snippet.

          The program name is still SEARCHABLE — a query for `Power BI` returns
          every course in that program — but it is no longer displayed, so a
          course matched only on its program shows no on-card reason. Accepted:
          program names are broad and the connection is self-evident to whoever
          typed one.

          The snippet is gone because every field this card now matches on is
          printed here: code, name, teaser. Explaining a match the visitor can
          already see was making the card long without making it convincing.
        */}
        {course.course_teaser && (
          <p className={RESULT_TEASER}>{highlightText(course.course_teaser, term)}</p>
        )}
        {/* Days LEFT, price RIGHT — the reverse of the old order — pinned to
            the card's baseline with the same constant the online card uses. */}
        <div className={RESULT_META_BOTTOM}>
          <span>{course.course_trainingdays ? `${course.course_trainingdays} วัน` : ''}</span>
          <span className="font-semibold text-[#0D1B2A]">{priceLabel(course.course_price)}</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * An ONLINE course result.
 *
 * The link LEAVES THE SITE: `target="_blank"`, and an external-link icon in
 * place of the internal cards' arrow, so the difference is visible before the
 * click rather than after it. The href itself comes from
 * @/lib/onlineCourseHref, shared with the home-page card — that is behaviour,
 * not styling, and it has one home regardless of how the cards look.
 */
function OnlineCourseResultCard({ course, term }) {
  const href = onlineCourseHref(course);
  const cover = course.o_course_cover_url;
  const lessons = Number(course.o_number_lessons) || 0;
  const price = Number(course.o_course_price) || 0;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={RESULT_CARD}>
      {/* next/image: `o_course_cover_url` is already rendered through it by the
          home page's OnlineCourseCard. */}
      <div className={RESULT_COVER}>
        {cover ? (
          <Image src={cover} alt={course.o_course_name ?? ''} fill sizes={RESULT_COVER_SIZES} className={RESULT_COVER_IMG} />
        ) : (
          <span className={RESULT_COVER_FALLBACK}>
            <MonitorPlay className="h-7 w-7" aria-hidden="true" />
          </span>
        )}
        {/*
          THE OUTBOUND MARKER, as an icon alone.

          The "ไปที่ 9Expert Academy" text link is gone: the whole card is
          already the link, so a call-to-action inside it was a second one for
          the same destination. This is a decorative <span> — NOT a nested
          <a> or <button>, which would be a focusable element inside an anchor.
          The screen-reader equivalent is the sr-only line below, since an
          aria-hidden icon says nothing.
        */}
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[#2486FF] shadow-sm"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className={RESULT_BODY}>
        <h3 className={RESULT_TITLE}>
          {highlightText(course.o_course_name, term)}
          <span className="sr-only"> (เปิดเว็บไซต์ภายนอก)</span>
        </h3>
        {/* The teaser is the card's body. No snippet: this card matches only
            on name, code, program and teaser, and three of those four are
            printed right here. */}
        {course.o_course_teaser && (
          <p className={RESULT_TEASER}>{highlightText(course.o_course_teaser, term)}</p>
        )}
        {/*
          Lessons left, price right, and PINNED TO THE BOTTOM via `mt-auto` in a
          column-flex body — so it stays on the card's baseline instead of
          floating up under the title when the teaser is short or absent.
        */}
        <div className={RESULT_META_BOTTOM}>
          <span>{lessons > 0 ? `${lessons} บทเรียน` : ''}</span>
          <span className="font-semibold text-[#0D1B2A]">
            {price === 0 ? 'ฟรี' : `${price.toLocaleString('th-TH')} .-`}
          </span>
        </div>
      </div>
    </a>
  );
}

function CareerPathResultCard({ careerPath, term }) {
  const slug = careerPath.api_slug ?? careerPath.slug ?? '';
  const href = careerPathHref(slug);
  // Cache stores the upstream `coverImage.url` as `hero_image_url`; fall
  // back to `icon_url` so this card also works against the raw API shape.
  const cover = careerPath.hero_image_url || careerPath.icon_url;

  return (
    <Link href={href} className={RESULT_CARD}>
      {/*
        RAW <img>, NOT next/image, and deliberately.

        `hero_image_url` is synced from the upstream `coverImage.url` and is
        rendered with a plain <img> by BOTH of its existing consumers
        (/career-path-project and CareerPathDetail) — so unlike the course
        covers, no code path has ever proven its hosts against next.config.mjs
        `remotePatterns`. next/image THROWS at runtime on an unlisted host, and
        it would do so only for the paths whose cover happens to come from one.
        Adding a host to next.config.mjs is out of scope for this change, so
        this card stays where its siblings already are.
      */}
      <div className={RESULT_COVER}>
        {cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover}
            alt={careerPath.title ?? ''}
            width={COVER_W}
            height={COVER_H}
            className={RESULT_COVER_IMG}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className={RESULT_COVER_FALLBACK}>
            <Map className="h-7 w-7" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className={RESULT_BODY}>
        <h3 className={RESULT_TITLE}>{highlightText(careerPath.title, term)}</h3>
        {careerPath.short_description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
            {careerPath.short_description}
          </p>
        )}
        <MatchSnippet snippet={careerPath.snippet} term={term} />
      </div>
    </Link>
  );
}

function PromotionResultCard({ promotion, term }) {
  const href = promotion.api_slug
    ? `/promotions/${promotion.api_slug}`
    : `/promotions/${promotion.promotion_id}`;
  const startLabel = formatPromoDate(promotion.start_date);
  const endLabel   = formatPromoDate(promotion.end_date);
  const dateLabel =
    startLabel && endLabel ? `${startLabel} – ${endLabel}` : (startLabel || endLabel || null);
  const tags = Array.isArray(promotion.tags) ? promotion.tags : [];

  return (
    <Link href={href} className={RESULT_CARD_SQUARE}>
      {/* RAW <img> for the same reason as the career-path card: `thumbnail_url`
          is rendered with a plain <img> by every existing consumer, so its
          hosts are unproven against `remotePatterns`. SQUARE slot — see
          RESULT_COVER_SQUARE. */}
      <div className={RESULT_COVER_SQUARE}>
        {promotion.thumbnail_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={promotion.thumbnail_url}
            alt={promotion.image_alt || promotion.title || ''}
            width={COVER_SQUARE}
            height={COVER_SQUARE}
            className={RESULT_COVER_IMG}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className={RESULT_COVER_FALLBACK}>
            <Tag className="h-7 w-7" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className={RESULT_BODY}>
        <h3 className={RESULT_TITLE}>{highlightText(promotion.title, term)}</h3>
        {dateLabel && <p className="mt-0.5 text-xs text-gray-500">{dateLabel}</p>}
        <MatchSnippet snippet={promotion.snippet} term={term} />
        {/* The tag row is PROMOTION-ONLY and lives here, nowhere else. Colours
            are editor-set per promotion and are not ours to normalise; the grey
            pill is the fallback for a tag that carries none. */}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.slice(0, 4).map((tag, i) => {
              const hasColor = Boolean(tag?.color);
              return (
                <span
                  key={i}
                  className={
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                    (hasColor ? 'text-white' : 'bg-gray-100 text-gray-600')
                  }
                  style={hasColor ? { backgroundColor: tag.color } : undefined}
                >
                  {tag?.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </Link>
  );
}

/**
 * How many article tags fit on the card's single line before `+N`.
 *
 * CAPPED BY COUNT, NOT BY MEASURED WIDTH, and that is a deliberate ceiling on
 * ambition: a true fit-to-width row needs client-side measurement, which this
 * suite cannot assert and which shifts between the server render and hydration.
 * Three is what fits a 3-4 word English tag comfortably at the sm-and-up track;
 * a long Thai tag will ellipsise instead of pushing its neighbours out, because
 * each chip is `min-w-0 truncate`.
 */
const ARTICLE_TAG_CAP = 3;

/**
 * The article card's tag row — neutral chips, one line, matched tag first.
 *
 * NOT the promotion card's coloured pills: article tags are plain strings with
 * no `color`, so borrowing that treatment would imply a per-tag meaning that
 * does not exist. Grey is the honest rendering.
 *
 * Renders nothing at all — not an empty row, not a gap — when there are no
 * tags, because `RESULT_META_BOTTOM` carries padding that would otherwise show.
 */
function ArticleTagRow({ tags, term }) {
  const ordered = orderTagsByMatch(tags, term);
  if (ordered.length === 0) return null;
  const shown = ordered.slice(0, ARTICLE_TAG_CAP);
  const hidden = ordered.length - shown.length;

  return (
    <div className={RESULT_META_BOTTOM}>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {shown.map((tag, i) => (
          <span
            key={i}
            className="min-w-0 truncate rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600"
          >
            {highlightText(tag, term)}
          </span>
        ))}
      </div>
      {hidden > 0 ? (
        <span className="shrink-0 text-[10px] text-gray-400">+{hidden}</span>
      ) : null}
    </div>
  );
}

function ArticleResultCard({ article, term }) {
  return (
    <Link href={`/articles/${article.slug}`} className={RESULT_CARD}>
      {/* next/image: article covers are admin-uploaded to Cloudinary and are
          already rendered through it on /articles. */}
      <div className={RESULT_COVER}>
        {article.coverUrl ? (
          <Image src={article.coverUrl} alt={article.title ?? ''} fill sizes={RESULT_COVER_SIZES} className={RESULT_COVER_IMG} />
        ) : (
          <span className={RESULT_COVER_FALLBACK}>
            <BookOpen className="h-7 w-7" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className={RESULT_BODY}>
        <h3 className={RESULT_TITLE}>{highlightText(article.title, term)}</h3>
        {article.excerpt && (
          <p className={RESULT_TEASER}>{highlightText(article.excerpt, term)}</p>
        )}
        {/*
          NO SNIPPET, NO DATE.

          The snippet is gone because this card matches on title, excerpt and
          tags — and all three are now printed here, the tags as the row below.
          The date went with it, and the cost is real and worth naming: an
          article result no longer carries any recency signal at all. Tags say
          what a piece is ABOUT, which is what a searcher is choosing between;
          nothing on the card says how old it is.
        */}
        <ArticleTagRow tags={article.tags} term={term} />
      </div>
    </Link>
  );
}

/**
 * THE COMPACT ROW'S SURFACE, below `md`.
 *
 * The same OBJECT as /schedule's mobile round row — filled surface, own border,
 * rounded, declared 44px tap floor, `active:` press — in this page's palette
 * rather than /schedule's tokens, and that difference is not laziness. The
 * /schedule row sits INSIDE a white card, so it fills with `bg-9e-ice` (the page
 * background) to read as a step DOWN off the card. A schedule result on /search
 * has no card around it: it sits directly on the page's own `#F8FAFD`, so the
 * same fill would make it invisible. It takes `bg-white` + `border-gray-100` +
 * `rounded-xl` + `shadow-sm` — which is not a third look either, it is exactly
 * `RESULT_CARD_BASE`, the surface its five neighbours in this list already use.
 *
 * /search carries no `dark:` variants anywhere, so none are added here; the
 * status pill's `soft` tokens bring their own and are simply inert on this page.
 *
 * `min-h-[44px]` is the point, not padding that happens to land near it: the
 * next round is directly beneath, so a mis-tap does not miss — it opens the
 * wrong round's registration page.
 */
const SCHEDULE_ROW_SURFACE =
  'flex min-h-[44px] items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm';
/** Touch has no hover, so the feedback is `active:`. Same reasoning as RoundRow. */
const SCHEDULE_ROW_PRESS =
  'transition-all duration-150 hover:shadow-md active:scale-[0.99] active:bg-[#F8FAFD]';

/**
 * A round in the `ตารางอบรม` section.
 *
 * ── TWO SUBTREES, SWITCHED AT `md` ──────────────────────────────────────────
 * Below `md` the shipped row stacked into a ~150px card — a type pill on its own
 * line, the name, the date, a status line, a price line and a full-width
 * `สมัครเรียน →` button — so three of the eighteen rounds this query returns
 * filled a phone screen. That is what the compact row replaces.
 *
 * From `md` up the shipped row is already ONE horizontal line and is left
 * untouched, deliberately: `md` is where the existing component already flips,
 * so every viewport that renders the horizontal form today renders exactly the
 * same computed layout after this change. The recommendation for it is in the
 * report, not in this file.
 *
 * The cost of the split is the doubled subtree — the same cost /schedule pays
 * for its table-vs-cards break, and paid for the same reason: a JS media query
 * has no answer on the server. What must NOT double is the facts, so the href,
 * the status policy, the date label and the price label are each read from one
 * place by both forms.
 *
 * ── WHY THE MOBILE ROW HAS NO BUTTON ────────────────────────────────────────
 * The whole row is the registration link. A `สมัครเรียน` button inside it would
 * be a second call to action for the same destination AND a focusable element
 * nested in an anchor — the same call already made on the online-course card.
 * The chevron is the affordance, and it is `aria-hidden` decoration.
 */
function ScheduleResultRow({ schedule, term }) {
  // The course is resolved ONCE in the corpus builder and travels with the row
  // as `course_ref` — there is no courseMap on the client any more, because
  // there is no course corpus on the client any more.
  const course = schedule.course_ref;
  const courseName = course?.course_name ?? '(ไม่ทราบชื่อหลักสูตร)';
  const type = schedule.type ?? 'classroom';
  const status = resolveScheduleBadge(schedule.status);
  const typeColor = TYPE_COLOR[type] ?? TYPE_COLOR.classroom;
  const typeLabel = TYPE_LABEL[type] ?? type;
  const price = course?.course_price;

  const courseId = course?.course_id;
  /**
   * Built by @/lib/schedule/scheduleRegistrationHref, which /schedule's table
   * and round row also call. This file used to carry a byte-identical copy of
   * the template; /schedule's own "one builder" guard could not see it, so the
   * `&class=` half — which is what lets RegisterWizard skip its round-confirm
   * step — was one careless edit away from diverging on this surface only.
   */
  const href = scheduleRegistrationHref(schedule, courseId);
  const isInternal = Boolean(href?.startsWith('/'));

  /**
   * The compact row's contents. Name on line one; date, status and price on
   * line two — a wrapping row, so a long date pushes the price down instead of
   * squeezing it out. `flex-none` on the dot, the pill and the chevron; `min-w-0
   * flex-1` on the middle column, so the column is what absorbs overflow.
   */
  const compactInner = (
    <>
      {/*
        THE TYPE DOT, and its screen-reader equivalent.

        /schedule can render a bare coloured dot because that page carries a
        legend saying what each colour means. /search does not and should not
        grow one for a four-row section — so the colour is decoration here
        (`aria-hidden`) and the word rides along in an `sr-only` span. Dropping
        the visible `Classroom` / `Hybrid` / `Online` pill must not drop the
        fact for anyone who was reading it aloud.
      */}
      <span
        className="h-2.5 w-2.5 flex-none rounded-full"
        style={{ backgroundColor: typeColor }}
        aria-hidden="true"
      />
      {/* Outside the clamped title on purpose: `line-clamp-1` is an
          `overflow: hidden` box, and an absolutely-positioned sr-only child of
          one is a clipping question nobody should have to think about. */}
      <span className="sr-only">{typeLabel}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-1 text-sm font-semibold text-[#0D1B2A]">
          {highlightText(courseName, term)}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          <span>{formatDateLabel(schedule)}</span>
          {/* Omitted entirely when the status is missing/blank — no empty pill
              and no default label. `soft` is the tinted-pill treatment
              lib/scheduleStatus already declares for exactly this shape. */}
          {status && (
            <span
              className={`flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${status.soft}`}
            >
              {status.label}
            </span>
          )}
          <span className="font-semibold text-[#0D1B2A]">{priceLabel(price)}</span>
        </span>
      </span>
      {href ? (
        <span
          aria-hidden="true"
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#005CFF]/10 text-[#005CFF]"
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      ) : null}
    </>
  );

  /** A round with nowhere to go renders the same object, minus the affordances. */
  let compact;
  if (!href) {
    compact = <div className={SCHEDULE_ROW_SURFACE}>{compactInner}</div>;
  } else if (isInternal) {
    compact = (
      <Link href={href} className={`${SCHEDULE_ROW_SURFACE} ${SCHEDULE_ROW_PRESS}`}>
        {compactInner}
      </Link>
    );
  } else {
    compact = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${SCHEDULE_ROW_SURFACE} ${SCHEDULE_ROW_PRESS}`}
      >
        {compactInner}
      </a>
    );
  }

  return (
    <div>
      {/* ONE wrapper per result, so the section's `space-y-3` gaps ROUNDS rather
          than gapping the two forms of the same round — with the two subtrees as
          bare siblings, the first visible row on desktop would inherit a 12px
          top margin from the hidden mobile row in front of it. */}
      <div className="md:hidden">{compact}</div>

      {/* ── Everything below this line is the shipped desktop row, unchanged
             except for the visibility switch: `flex` became `hidden md:flex`,
             which at `md` and up computes to exactly what it did before. ── */}
      <div className="hidden flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-150 hover:shadow-md md:flex md:flex-row md:items-center md:gap-4">
      <span
        className="inline-flex h-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
        style={{ backgroundColor: `${typeColor}1A`, color: typeColor }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: typeColor }} />
          {typeLabel}
      </span>

      <div className="min-w-0 flex-1">
        {courseId ? (
          <Link
            href={courseHref(String(courseId).toLowerCase())}
            className="line-clamp-1 text-sm font-semibold text-[#0D1B2A] hover:text-[#005CFF]"
          >
            {highlightText(courseName, term)}
          </Link>
        ) : (
          <span className="line-clamp-1 text-sm font-semibold text-[#0D1B2A]">
            {highlightText(courseName, term)}
          </span>
        )}
        <p className="mt-0.5 text-xs text-gray-500">{formatDateLabel(schedule)}</p>
      </div>

      {/* Omitted entirely when the status is missing/blank. */}
      {status && (
        <span
          className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${status.text}`}
        >
          <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
          {status.label}
        </span>
      )}

      <span className="shrink-0 text-sm font-bold text-[#0D1B2A]">
        {priceLabel(price)}
      </span>

      {href ? (
        href.startsWith('/') ? (
          <Link
            href={href}
            className="shrink-0 rounded-9e-md bg-[#005CFF] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0046cc]"
          >
            สมัครเรียน →
          </Link>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-9e-md bg-[#005CFF] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0046cc]"
          >
            สมัครเรียน →
          </a>
        )
      ) : null}
      </div>
    </div>
  );
}

// ── Section helpers ────────────────────────────────────────────────

/** The one label, so the visible words and the accessible name cannot drift. */
const SEE_ALL_LABEL = 'ดูทั้งหมด';

/**
 * The section header, and the ONE home of `ดูทั้งหมด`.
 *
 * ── WHY THE LINK MOVED UP HERE ──────────────────────────────────────────────
 * It used to sit under the results grid, so WHERE it appeared depended on how
 * many rows that section happened to have — six courses put it 300px lower than
 * four promotions did. A control whose position is a function of the content
 * above it is one the eye has to search for every time. In the header it is
 * always in the same place, opposite the title, on the row the reader is already
 * looking at when they decide whether this section is the one they want.
 *
 * ── AND WHY IT LOST ITS COUNT ───────────────────────────────────────────────
 * `ดูทั้งหมด (18) →` beside a badge reading `18` renders the same number twice
 * within a few centimetres. The badge is the count; the link is the action.
 *
 * ── THE LABEL IS ALWAYS VISIBLE, AND THERE IS NO ARROW ──────────────────────
 * It briefly rendered as `hidden sm:inline` words plus a `→`, so a phone showed
 * a bare arrow at the end of a heading. That does not read as a control at all;
 * it reads as decoration. The words are unconditional now, and the arrow went
 * with the responsive branch — it was compensating for a label that was
 * sometimes absent, and that reason is gone.
 *
 * The label is NOT shortened to `ทั้งหมด`, deliberately. The tab row a few lines
 * above already has a tab of exactly that name meaning "all TYPES"; this control
 * means "all results in THIS section". The same word at two scopes, a few
 * centimetres apart, is worse than four extra characters.
 *
 * ── THE 360px ROW ───────────────────────────────────────────────────────────
 * Four things share one line. Measured out of the shipped font binaries — the
 * `<h2>` is `font-heading font-bold` (LINE Seed Sans TH Bd at 18px), the badge
 * and the button resolve to Google Sans through the base layer — against the
 * 328px content box a 360px viewport leaves:
 *
 *   Career Path      20 + 8 + 107 + 8 + 23 + 8 + 51 = 225px   ← the widest
 *   คอร์สออนไลน์      104px title → 223px
 *   ตารางอบรม         92px title → 216px
 *   บทความ            65px title → 190px
 *   หลักสูตร           66px title → 189px
 *   โปรโมชัน           66px title → 184px
 *
 * Every section clears it by ~100px. The one that did NOT was the schedule
 * section under its old name, `ตารางอบรมที่กำลังเปิดรับสมัคร` — 237px of
 * unbreakable Thai on its own, 361px for the row, 33px over. It is `ตารางอบรม`
 * now, which is also what its own tab has always been called.
 *
 * `min-w-0 truncate` on the title and `shrink-0` on the other three stay as the
 * BACKSTOP, not as the fix: they are what makes a future long title clip instead
 * of overflowing the row. `min-w-0` is the load-bearing half — a flex item will
 * not shrink below its min-content width, and for spaceless Thai that width is
 * the whole title, so `truncate` alone does nothing. Thai has no word boundaries
 * either, so a clip lands mid-word; the backstop is a floor, not a good outcome.
 *
 * The `aria-label` names the section, which the visible words alone do not — six
 * controls reading `ดูทั้งหมด` in a row say nothing about which is which.
 */
function SectionHeader({ icon: Icon, title, count, tone = 'brand', onSeeAll = null }) {
  const iconClass = tone === 'amber' ? 'text-amber-500' : 'text-[#005CFF]';
  const chipClass =
    tone === 'amber'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-[#005CFF]/10 text-[#005CFF]';
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <h2 className="min-w-0 truncate text-lg font-bold text-[#0D1B2A]">{title}</h2>
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${chipClass}`}
      >
        {count}
      </span>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          aria-label={`${SEE_ALL_LABEL}: ${title}`}
          className="ml-auto shrink-0 text-sm font-semibold text-[#2486FF] hover:underline"
        >
          {SEE_ALL_LABEL}
        </button>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden="true">
      <div className="h-20 rounded-xl bg-gray-100" />
      <div className="h-20 rounded-xl bg-gray-100" />
      <div className="h-20 rounded-xl bg-gray-100" />
    </div>
  );
}

/**
 * The six (now seven) sections, declared as data.
 *
 * `preview` is how many rows the `ทั้งหมด` tab shows before "ดูทั้งหมด".
 */
const SECTIONS = [
  { key: 'courses',       title: 'หลักสูตร',                      icon: GraduationCap, preview: 6, grid: true },
  { key: 'onlineCourses', title: 'คอร์สออนไลน์',                  icon: MonitorPlay,   preview: 4, grid: true },
  { key: 'careerPaths',   title: 'Career Path',                    icon: Map,           preview: 4, grid: true },
  /* `ตารางอบรม`, not the `…ที่กำลังเปิดรับสมัคร` it used to be: 237px of
     unbreakable Thai at `text-lg` overflowed the 360px header row on its own,
     and Thai truncation has no word boundaries to cut on. The short form is
     what this section's TAB has always been called — see SEARCH_TABS — so the
     rename also ends a disagreement between the two labels for one thing. */
  { key: 'schedules',     title: 'ตารางอบรม',                     icon: CalendarDays,  preview: 4, grid: false },
  { key: 'promotions',    title: 'โปรโมชัน',                       icon: Tag,           preview: 4, grid: true,  tone: 'amber' },
  { key: 'articles',      title: 'บทความ',                         icon: BookOpen,      preview: 6, grid: true },
];

function ResultRow({ type, row, term }) {
  if (type === 'courses') return <CourseResultCard course={row} term={term} />;
  if (type === 'onlineCourses') return <OnlineCourseResultCard course={row} term={term} />;
  if (type === 'careerPaths') return <CareerPathResultCard careerPath={row} term={term} />;
  if (type === 'schedules') return <ScheduleResultRow schedule={row} term={term} />;
  if (type === 'promotions') return <PromotionResultCard promotion={row} term={term} />;
  return <ArticleResultCard article={row} term={term} />;
}

const rowKey = (type, row, i) =>
  row?._id ?? row?.slug ?? row?.course_id ?? row?.o_course_id ?? row?.api_slug ?? i;

/**
 * The results panel — a PURE function of `{ status, term, data, requestedTab }`.
 *
 * Exported so the render tier can put it in each of its states without a
 * network: loading, ready, empty and error are four different renders, and
 * three of them are unreachable from a static render of the shell.
 */
export function SearchResults({
  status,
  term,
  data,
  requestedTab = ALL_TAB,
  onTabChange = () => {},
  onRetry = () => {},
}) {
  const counts = data?.counts ?? emptySearchCounts();
  const total = data?.total ?? 0;
  const results = data?.results ?? {};

  // DERIVED, not stored: typing narrows results, and the tab the user last
  // clicked may no longer exist. See resolveActiveTab's docstring for why this
  // is not a useEffect.
  const activeTab = resolveActiveTab(requestedTab, counts, total);
  const isAll = activeTab === ALL_TAB;
  const tabs = visibleSearchTabs(counts, total);

  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite">
        <p className="mb-4 text-sm text-gray-500">กำลังค้นหา…</p>
        <ResultsSkeleton />
      </div>
    );
  }

  // FAILURE IS NOT EMPTINESS. Rendering "ไม่พบผลลัพธ์" here would tell the
  // visitor their query has no matches — a statement this component has no
  // evidence for, because it never got an answer.
  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-16 text-center"
      >
        <TriangleAlert className="h-10 w-10 text-amber-500" aria-hidden="true" />
        <p className="text-base font-semibold text-gray-700">ค้นหาไม่สำเร็จ</p>
        <p className="text-sm text-gray-500">
          เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-9e-md bg-[#005CFF] px-4 py-2 text-sm font-bold text-white hover:bg-[#0046cc]"
        >
          ลองอีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Summary + tabs */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-gray-500">
          ผลการค้นหา{' '}
          <span className="font-semibold text-[#0D1B2A]">
            &ldquo;{term}&rdquo;
          </span>{' '}
          — พบ{' '}
          <span className="font-bold text-[#005CFF]">{total}</span>{' '}
          รายการ
        </p>
        {/* `min-h` reserves the tab row's height so appearing/disappearing tabs
            reflow WITHIN a fixed band instead of moving the results up and down
            on every keystroke. The row itself still rewraps; the panel below it
            does not jump. */}
        <div className="flex min-h-9 flex-wrap gap-2">
          {tabs.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                aria-pressed={active}
                className={
                  'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ' +
                  (active
                    ? 'bg-[#005CFF] text-white shadow-sm'
                    : 'border border-gray-200 bg-white text-[#0D1B2A] hover:border-[#005CFF]/40')
                }
              >
                {t.label} ({tabCount(t.key, counts, total)})
              </button>
            );
          })}
        </div>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Search className="h-10 w-10 text-gray-300" aria-hidden="true" />
          <p className="text-base font-semibold text-gray-500">
            ไม่พบผลลัพธ์สำหรับ &ldquo;{term}&rdquo;
          </p>
          <p className="text-sm text-gray-400">ลองใช้คำค้นหาอื่น</p>
        </div>
      ) : (
        <div className="space-y-10">
          {SECTIONS.map((section) => {
            const count = counts[section.key] ?? 0;
            // A section with nothing in it is not rendered at all — its tab is
            // gone too, so a "ไม่พบ…" placeholder would be describing a
            // category the user can no longer even select.
            if (count === 0) return null;
            if (!isAll && activeTab !== section.key) return null;

            const rows = results[section.key] ?? [];
            const visible = isAll ? rows.slice(0, section.preview) : rows;
            const Icon = section.icon;

            return (
              <section
                key={section.key}
                role="region"
                aria-label={`ผลการค้นหา: ${section.title}`}
              >
                {/* The condition is unchanged — a section only offers
                    `ดูทั้งหมด` when the ทั้งหมด tab is truncating it. Only the
                    PLACE it renders moved, from below the grid into the header,
                    so it is passed down rather than rendered here. */}
                <SectionHeader
                  icon={Icon}
                  title={section.title}
                  count={count}
                  tone={section.tone}
                  onSeeAll={
                    isAll && count > visible.length
                      ? () => onTabChange(section.key)
                      : null
                  }
                />
                <div
                  className={
                    section.grid
                      ? 'grid grid-cols-1 gap-3 md:grid-cols-2'
                      : 'space-y-3'
                  }
                >
                  {visible.map((row, i) => (
                    <ResultRow
                      key={rowKey(section.key, row, i)}
                      type={section.key}
                      row={row}
                      term={term}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────

export function SearchClient({ initialQ }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [q, setQ] = useState(initialQ);
  const [debouncedQ, setDebouncedQ] = useState(initialQ);
  const [requestedTab, setRequestedTab] = useState(ALL_TAB);
  const [retryToken, setRetryToken] = useState(0);
  // 'idle' — below the minimum, show suggestions
  // 'loading' | 'ready' | 'error' — three DISTINCT rendered states
  const [state, setState] = useState({ status: 'idle', data: null });

  // Auto-focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce + URL sync. 200ms ≈ feels instant but cheap to compute.
  // Unchanged from the client-side implementation: the debounce now governs
  // when a REQUEST is issued rather than when a filter is recomputed.
  useEffect(() => {
    if (q === debouncedQ) return undefined;
    const t = setTimeout(() => {
      setDebouncedQ(q);
      const next = q.trim()
        ? `/search?q=${encodeURIComponent(q.trim())}`
        : '/search';
      router.replace(next, { scroll: false });
    }, 200);
    return () => clearTimeout(t);
  }, [q, debouncedQ, router]);

  /**
   * The request. Three things this has to get right, none of which the
   * in-memory filter it replaces had to think about:
   *
   *  1. LOADING — a network round trip is visible, so the skeleton is wired to
   *     the in-flight request rather than to the debounce timer.
   *  2. OUT-OF-ORDER REPLIES — typing outruns the network. `seq` is the
   *     invariant: a reply whose sequence number is not the latest is DROPPED,
   *     whatever order it arrived in. The AbortController is best-effort on top
   *     — it saves the bandwidth, but it cannot be relied on for correctness
   *     because a response can already be in flight when abort() lands. Timing
   *     is not part of either mechanism.
   *  3. FAILURE — an error sets its own status. It must never fall through to
   *     the empty state, which asserts something about the query that a failed
   *     request gives no evidence for.
   */
  const seq = useRef(0);
  useEffect(() => {
    const term = debouncedQ.trim();
    if (term.length < SEARCH_MIN_CHARS) {
      setState({ status: 'idle', data: null });
      return undefined;
    }

    const mine = ++seq.current;
    const controller = new AbortController();
    // Keep the previous data while loading so the panel does not collapse to
    // zero height and bounce the page between keystrokes.
    setState((prev) => ({ status: 'loading', data: prev.data }));

    fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (mine !== seq.current) return; // a newer query already won
        setState({ status: 'ready', data: json });
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (mine !== seq.current) return;
        setState({ status: 'error', data: null });
      });

    return () => controller.abort();
  }, [debouncedQ, retryToken]);

  const clearQuery = useCallback(() => {
    setQ('');
    inputRef.current?.focus();
  }, []);

  function handleSuggestionClick(value) {
    setQ(value);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      // Force the debounce to flush immediately for keyboard users.
      setDebouncedQ(q);
    }
  }

  const isSearching = debouncedQ.trim().length >= SEARCH_MIN_CHARS;

  return (
    <div className="min-h-screen bg-[#F8FAFD]">
      {/* Hero */}
      <section className="bg-[#0D1B2A] py-12">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="text-3xl font-bold text-white">ค้นหา</h1>
          <p className="mt-1 text-sm text-white/60">
            ค้นหาหลักสูตร บทความ และตารางอบรมที่ 9Expert
          </p>

          {/*
            THE RING IS ON THE WRAPPER, NOT ON THE INPUT.

            globals.css declares `*:focus-visible { ring-2 ring-offset-2 }` for
            the whole site. `*` matches this `<input>`, which is `h-full w-full`
            INSIDE the rounded pill, so the ring drew a square-cornered
            rectangle floating inside a rounded container — the blue box that
            looked like a component bug and was actually a global rule.

            `focus:outline-none` on the input did nothing about it, because the
            global rule uses `ring`, not `outline`. The suppression below has to
            be `focus-visible:ring-0 focus-visible:ring-offset-0` — same variant
            as the rule it is overriding — and it wins twice over: Tailwind
            emits utilities in a later layer than base, AND `.focus-visible\:
            ring-0:focus-visible` (class + pseudo-class) outranks `*:focus-visible`
            (pseudo-class alone) on specificity. A pure test computes both
            specificities from the real globals.css rather than trusting this
            paragraph.

            `focus-within` (not `focus-visible`) on the wrapper because the
            wrapper is a plain <div> that is never itself focused; the ring has
            to follow focus into a descendant. The offset colour is pinned to
            the hero so the 2px gap reads as part of the background instead of
            as a white halo.
          */}
          <div className="mx-auto mt-8 flex h-14 w-full max-w-2xl items-center gap-3 rounded-2xl bg-white px-5 shadow-lg focus-within:ring-2 focus-within:ring-9e-brand focus-within:ring-offset-2 focus-within:ring-offset-[#0D1B2A]">
            <Search className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            {/*
              `type="text"`, NOT `type="search"`.

              Chrome renders its own `::-webkit-search-cancel-button` inside a
              search input, so restoring the app's clear button produced TWO ✕
              in one field. The alternative — hiding the native control with
              `[&::-webkit-search-cancel-button]:appearance-none` — is
              WebKit-only, needs a second rule for iOS, and leaves the outcome
              resting on a vendor pseudo-element. Changing the type removes the
              second control at the source, and the app already owns a working
              one.

              `role="searchbox"` is the cost of that: `type="search"` maps to
              the searchbox role and `type="text"` maps to textbox, so without
              it the fix would quietly downgrade what assistive tech announces.
              The aria-label is unchanged.
            */}
            <input
              ref={inputRef}
              type="text"
              role="searchbox"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ค้นหาหลักสูตร, บทความ, รอบอบรม…"
              aria-label="ค้นหา"
              className="h-full w-full bg-transparent text-lg text-[#0D1B2A] placeholder:text-gray-400 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {/* The ONE clear control. It sits AFTER the input in DOM order, so
                Tab reaches the field first — a clear button a keyboard user hits
                on the way IN is worse than none. */}
            {q.length > 0 && (
              <button
                type="button"
                onClick={clearQuery}
                aria-label="ล้างคำค้นหา"
                className="shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#0D1B2A]"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Results */}
      <div className="mx-auto max-w-6xl px-4 py-10">
        {!isSearching ? (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-gray-300" aria-hidden="true" />
            <p className="mt-3 text-base font-semibold text-gray-500">ลองค้นหา</p>
            <p className="mt-1 text-sm text-gray-400">
              พิมพ์อย่างน้อย {SEARCH_MIN_CHARS} ตัวอักษร หรือเลือกจากคำค้นยอดนิยมด้านล่าง
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestionClick(s)}
                  className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-[#0D1B2A] transition-colors hover:bg-[#F8FAFD] hover:border-[#005CFF]/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <SearchResults
            status={state.status}
            term={debouncedQ}
            data={state.data}
            requestedTab={requestedTab}
            onTabChange={setRequestedTab}
            onRetry={() => setRetryToken((n) => n + 1)}
          />
        )}
      </div>
    </div>
  );
}

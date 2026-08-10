'use client';

import { useState, useEffect, useId, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Award, Clock, MonitorPlay, ChevronLeft, ChevronRight } from 'lucide-react';
import { INHOUSE_ONLY_LABEL, isInhouseOnlyPrice } from '@/lib/coursePriceLabel';

/**
 * Hero for the course detail page.
 *
 * Layout: a contained rounded card inside a page gradient. The
 * `max-w-[1280px]` + `rounded-2xl overflow-hidden` combo clips both the
 * left info panel and the right cover image at the card boundary — no
 * viewport-edge bleed.
 *
 * `heroColor` is the upstream program color (preferred) or the first
 * skill's color (fallback). Dark and saturated colors lighten
 * aggressively so the gradient never competes with the white card.
 */
export function CourseHero({ course, heroColor, gallery = [] }) {
  // Build ordered slide list for the cover zone:
  //  1. YouTube items (from gallery, in order)
  //  2. Cover image (course_cover_url) — always before image slides
  //  3. Image items (from gallery, in order)
  const youtubeSlides = gallery
    .filter((g) => g.type === 'youtube')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const imageSlides = gallery
    .filter((g) => g.type === 'image')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const coverSlide = course.course_cover_url
    ? [{ type: 'cover', url: course.course_cover_url, alt: course.course_name }]
    : [];

  // Final ordered list
  const coverSlides = [...youtubeSlides, ...coverSlide, ...imageSlides];

  const base = heroColor || '#005CFF';
  const isDark = perceivedBrightness(base) < 100;
  // Dark anchor: use the raw brand color almost as-is (tiny 0.05 lighten
  // just to avoid a harsh pure-saturated corner). Light anchor: lighten
  // aggressively if the source is dark, mildly if it's already light —
  // so the gradient always reads as a visible dark→light sweep regardless
  // of what color is set in Program/Skill master data.
  const bgA = lightenColor(base, 0.05);
  const bgB = lightenColor(base, 0.75);
  const sectionStyle = {
    background: `linear-gradient(135deg, ${bgA} 0%, ${bgB} 100%)`,
  };

  const registrationHref = `/registration/public?course=${String(
    course.course_id
  ).toLowerCase()}`;

  // course_price === 0 means inhouse-only (no public schedule, no public price).
  // Shared predicate so this page's price line, the catalog table's cell and
  // /schedule's column cannot disagree about what counts as priceless.
  const isInhouseOnly = isInhouseOnlyPrice(course.course_price);

  const inhouseHref = `/registration/in-house?course=${String(course.course_id).toLowerCase()}`;

  const hours =
    course.course_traininghours ??
    (course.course_trainingdays ? course.course_trainingdays * 6 : null);

  const hasPromotion =
    course.course_netprice != null &&
    Number(course.course_netprice) > 0 &&
    Number(course.course_netprice) !== Number(course.course_price);

  // Below lg the hero is EDGE-TO-EDGE: no section padding, no gap between the
  // cover and the card, no rounding on either. The offsets are STRIPPED rather
  // than cancelled with negative margins — a negative margin has to match the
  // padding exactly or every course page grows a horizontal scrollbar, whereas
  // removing the padding cannot produce one at all.
  //
  // Accepted consequence: the programme-colour gradient is INVISIBLE below lg,
  // because the cover and the card together cover the whole section. That is
  // the intent; there is deliberately no surviving sliver of it.
  //
  // `py-6` had no lg variant, so it is re-added as `lg:py-6` — dropping it
  // outright would have taken the desktop vertical padding with it.
  return (
    <section style={sectionStyle} className="w-full lg:px-6 lg:py-6">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col lg:flex-row lg:items-stretch lg:gap-6">
          {/* MOBILE — cover zone above the info card.
              A SECOND element rather than responsive classes on the desktop
              one: a single node cannot simultaneously be the full-width block
              above the card and the clipped right-hand column, because the two
              sit at different points in the flow. Of the two ways to get it
              above the card, this — a `lg:hidden` sibling placed first in
              source — is the cheaper: the container is already `flex-col`
              below lg, so source order alone puts it on top and no `order-*`
              utility is needed at all (the masterclass block carries
              `order-first`, which is likewise a no-op there). Restructuring the
              flex row into a reorderable grid would have touched the desktop
              layout, which must stay exactly as it was.

              Not rounded and no shadow: below lg the section has no padding at
              all, so `w-full` here is the full viewport width — flush left,
              right and top, directly under the site header. The desktop block
              below keeps rounded-2xl. */}
          <div className="relative aspect-video w-full overflow-hidden lg:hidden">
            {coverSlides.length === 0 ? (
              /* Same empty state as desktop — no cover and no gallery still
                 has to paint the programme colour, not collapse to nothing. */
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: sectionStyle.background }}
              >
                {course.program?.programiconurl && (
                  <Image
                    src={course.program.programiconurl}
                    alt=""
                    width={120}
                    height={120}
                    className="object-contain opacity-80"
                  />
                )}
              </div>
            ) : (
              <CoverSlider slides={coverSlides} />
            )}
          </div>

          {/* LEFT — standalone info card; rounded and floating only at lg. */}
          {/* dark:ring — color-agnostic edge separator. On the dark card the
              runtime hero gradient (programcolor/skillcolor) can, for a rare
              dark-navy source, lighten to a tone near #1E3A5F and blur the
              card's outer edge. A faint inset light ring keeps the edge
              readable for ANY gradient without special-casing a colour.
              Dark-only, so light mode is unchanged.

              It is now lg-ONLY, and so are rounded-2xl and shadow-9e-sm,
              because below lg the thing each of them exists to do has gone
              away. The ring separates the card from the gradient; edge-to-edge
              there IS no gradient, so all it draws is a 1px hairline hugging
              the left and right viewport edges against nothing. The shadow
              says "card floating above the gradient"; with the card flush to
              both edges its left and right halves are clipped clean off by the
              viewport and what survives reads as a smudge rather than a lift.
              Neither is load-bearing below lg; both are exactly as before at lg.

              What this does NOT solve is the cover/card seam — see the commit
              message. A top-edge separator is a different utility (border-t,
              one side) from an inset ring (four sides), so keeping the ring on
              mobile would not have bought it. */}
          <div className="min-w-0 flex flex-col justify-center bg-[var(--surface-raised)] p-6 lg:w-[40%] lg:flex-none lg:rounded-2xl lg:px-8 lg:py-6 lg:shadow-9e-sm lg:dark:ring-1 lg:dark:ring-inset lg:dark:ring-white/10">
            <div className="w-full">
              <p className="mb-1 text-xs font-bold  tracking-wider text-[var(--text-secondary)]">
                {course.course_id}
              </p>

              <h1 className="mb-4 line-clamp-2 min-h-[3.5rem] text-xl font-bold leading-tight text-[var(--text-primary)] lg:text-2xl">
                {course.course_name}
              </h1>

              <div className="mb-4 flex flex-wrap items-center gap-1.5 text-lg text-[var(--text-secondary)]">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span className="font-bold text-[var(--text-primary)]">
                  {course.course_trainingdays} วัน
                  {hours ? ` (${hours} ชม.)` : ''}
                </span>
                <span>/ ช่วงเวลา 9:00 - 16:00 น.</span>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {course.course_type_public && (
                  <span className="rounded-full border border-9e-brand bg-white px-3 py-1 text-xs font-bold text-9e-action">
                    Classroom
                  </span>
                )}
                <span className="rounded-full border border-purple-400 bg-white px-3 py-1 text-xs font-bold text-purple-600">
                  Hybrid
                </span>
                {course.course_type_inhouse && (
                  <span className="rounded-full border border-9e-slate-lt-400 dark:border-9e-slate-dp-400 bg-white px-3 py-1 text-xs font-bold text-9e-slate-dp-50">
                    Inhouse
                  </span>
                )}
              </div>

              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                {isInhouseOnly ? (
                  /* The widest slot the label has to fit: 3xl extrabold, and
                     the only surface where it is the headline rather than a
                     figure in a row. It holds — ~200px against a 360px viewport
                     less the card's padding — but only as one line, so the
                     break is disallowed explicitly rather than left to luck.
                     The Thai gloss underneath (*รับเฉพาะ InHouse Training
                     เท่านั้น) already carries the full explanation, so the
                     label does not have to grow to say more. */
                  <span className="whitespace-nowrap text-3xl font-extrabold text-9e-action dark:text-9e-air">
                    {INHOUSE_ONLY_LABEL}
                  </span>
                ) : (
                  <>
                    <span className="text-3xl font-extrabold text-9e-action dark:text-9e-air">
                      {Number(
                        hasPromotion ? course.course_netprice : course.course_price
                      ).toLocaleString('th-TH')}
                    </span>
                    <span className="text-lg font-bold text-9e-action dark:text-9e-air">บาท</span>
                    {hasPromotion && (
                      <span className="text-sm text-[var(--text-secondary)] line-through">
                        ปกติ {Number(course.course_price).toLocaleString('th-TH')} บาท
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="mb-4 text-xs text-[var(--text-secondary)]">
                {isInhouseOnly ? '*รับเฉพาะ InHouse Training เท่านั้น' : '*ราคาดังกล่าวยังไม่รวมภาษีมูลค่าเพิ่ม'}
              </p>

              {(course.course_workshop_status ||
                course.course_certificate_status) && (
                <div className="mb-4 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
                  {course.course_workshop_status && (
                    <span className="flex items-center gap-1">
                      <MonitorPlay
                        className="h-3.5 w-3.5 text-9e-action dark:text-9e-air"
                        strokeWidth={2}
                      />
                      Workshop
                    </span>
                  )}
                  {course.course_certificate_status && (
                    <span className="flex items-center gap-1">
                      <Award
                        className="h-3.5 w-3.5 text-9e-action dark:text-9e-air"
                        strokeWidth={2}
                      />
                      e-Certificate
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-row gap-3">
                {!isInhouseOnly && (
                  <Link
                    href={registrationHref}
                    className="rounded-xl w-full text-center border-2 border-9e-action bg-9e-action px-5 py-2.5 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-brand hover:border-9e-brand"
                  >
                    ขอใบเสนอราคา Public
                  </Link>
                )}
                <Link
                  href={inhouseHref}
                  className="rounded-xl w-full text-center border-2 border-9e-action px-5 py-2.5 text-sm font-bold text-9e-action transition-colors duration-9e-micro ease-9e hover:bg-9e-action hover:text-white dark:border-9e-air dark:text-9e-air"
                >
                  ขอใบเสนอราคา Inhouse
                </Link>
              </div>
            </div>
          </div>

          {/* RIGHT — cover zone: static or slider */}
          <div className="relative hidden min-w-0 flex-1 overflow-hidden rounded-2xl shadow-9e-sm lg:block lg:aspect-video lg:self-start">
            {coverSlides.length === 0 ? (
              /* No cover + no gallery → colour placeholder */
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: sectionStyle.background }}
              >
                {course.program?.programiconurl && (
                  <Image
                    src={course.program.programiconurl}
                    alt=""
                    width={120}
                    height={120}
                    className="object-contain opacity-80"
                  />
                )}
              </div>
            ) : (
              <CoverSlider slides={coverSlides} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Cover zone slider ──────────────────────────────────────────────────────────
// Fixed size: matches the existing hero grid right column (min-h 360).
// YouTube slides render an iframe; image/cover slides render Next Image.

const COVER_AUTO_MS = 5000;

function CoverSlider({ slides }) {
  // The hero mounts this component TWICE — once for the mobile slot, once for
  // the desktop column — so a module-constant iframe id would be emitted twice
  // into one document. getElementById would then hand both instances the SAME
  // (first-in-document) iframe and initPlayers would wire the YT.Player to the
  // wrong one, or to the display:none one. `useId` is per-instance, so the two
  // mounts namespace apart. Mirrors MasterclassCoverSlider, which hit this
  // first. Every id — the attribute below and the getElementById lookup in
  // initPlayers — is built through `iframeId`, so there is exactly one place
  // the format is defined and no pair of literals that have to stay in sync.
  const uid = useId();
  const [current, setCurrent] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(false);
  const ytPlayersRef = useRef({});   // { slideIndex: YT.Player }
  const ytApiReadyRef = useRef(false);
  const total = slides.length;

  const iframeId = (i) => `yt-${uid}-${i}`;

  // ── Auto-advance ──────────────────────────────────────────────
  // Pauses ONLY when: user hovers, or YouTube is actively playing.
  // Slides continue to advance through YouTube slides that haven't been played.
  useEffect(() => {
    if (total <= 1 || hovered || ytPlaying) return;
    const t = setInterval(() => setCurrent((i) => (i + 1) % total), COVER_AUTO_MS);
    return () => clearInterval(t);
  }, [total, hovered, current, ytPlaying]);

  // ── YouTube IFrame API — load script once ─────────────────────
  useEffect(() => {
    const hasYoutube = slides.some((s) => s.type === 'youtube');
    if (!hasYoutube) return;

    if (window.YT && window.YT.Player) {
      ytApiReadyRef.current = true;
      initPlayers();
      return;
    }

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      ytApiReadyRef.current = true;
      if (prevReady) prevReady();
      initPlayers();
    };

    if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function initPlayers() {
    slides.forEach((slide, i) => {
      if (slide.type !== 'youtube') return;
      const id = iframeId(i);
      const el = document.getElementById(id);
      if (!el || ytPlayersRef.current[i]) return;
      ytPlayersRef.current[i] = new window.YT.Player(id, {
        events: {
          onStateChange: (e) => {
            // 1 = PLAYING → pause auto-advance
            // 0 = ENDED, 2 = PAUSED → resume auto-advance
            if (e.data === 1) {
              setYtPlaying(true);
            } else if (e.data === 0 || e.data === 2) {
              setYtPlaying(false);
            }
          },
        },
      });
    });
  }

  // Re-try init when current slide changes (iframe may just have mounted)
  useEffect(() => {
    if (!ytApiReadyRef.current) return;
    const t = setTimeout(initPlayers, 150);
    return () => clearTimeout(t);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  // When leaving a YouTube slide, reset playing state
  useEffect(() => {
    const isYt = slides[current]?.type === 'youtube';
    if (!isYt) setYtPlaying(false);
  }, [current, slides]);

  const prev = () => setCurrent((i) => (i - 1 + total) % total);
  const next = () => setCurrent((i) => (i + 1) % total);

  return (
    <div
      className="relative h-full w-full"
      // style={{ minHeight: '360px' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Slide track */}
      <div className="h-full overflow-hidden">
        <div
          className="flex h-full transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className="relative h-full w-full flex-shrink-0"
              style={{ minWidth: '100%' }}
            >
              {slide.type === 'youtube' ? (
                <iframe
                  id={iframeId(i)}
                  className="absolute inset-0 h-full w-full"
                  src={`https://www.youtube.com/embed/${slide.videoId}?rel=0&enablejsapi=1`}
                  title="Course video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading={i === current ? 'eager' : 'lazy'}
                />
              ) : (
                <Image
                  src={slide.url}
                  alt={slide.alt || ''}
                  fill
                  sizes="640px"
                  className="object-cover object-center"
                  priority={i === 0}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Prev/Next — only when > 1 slide */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="ก่อนหน้า"
            className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 shadow-9e-md transition-colors hover:bg-white dark:bg-9e-navy/80 dark:hover:bg-9e-navy"
          >
            <ChevronLeft className="h-4 w-4 text-9e-navy dark:text-white" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="ถัดไป"
            className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 shadow-9e-md transition-colors hover:bg-white dark:bg-9e-navy/80 dark:hover:bg-9e-navy"
          >
            <ChevronRight className="h-4 w-4 text-9e-navy dark:text-white" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`ไปยังสไลด์ ${i + 1}`}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === current ? 'bg-white' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Perceived brightness (Rec.601) on a 0–255 scale. Used to decide how
 * aggressively to lighten saturated brand colors toward a pastel.
 */
function perceivedBrightness(colorStr) {
  if (!colorStr) return 255;
  let r, g, b;
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length !== 6) return 255;
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (colorStr.startsWith('rgb')) {
    const parts = colorStr.match(/\d+/g);
    if (!parts || parts.length < 3) return 255;
    [r, g, b] = parts.map(Number);
  } else {
    return 255;
  }
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Lighten a color toward white by `amount` (0–1). Accepts `rgb(r,g,b)`
 * or `#rrggbb`. Returns `rgb(r,g,b)`; falls through unchanged for any
 * other input so the caller can treat this as best-effort.
 */
function lightenColor(colorStr, amount) {
  if (!colorStr) return colorStr;
  let r, g, b;
  if (colorStr.startsWith('rgb')) {
    const parts = colorStr.match(/\d+/g);
    if (!parts || parts.length < 3) return colorStr;
    [r, g, b] = parts.map(Number);
  } else if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length !== 6) return colorStr;
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    return colorStr;
  }
  r = Math.min(255, Math.round(r + (255 - r) * amount));
  g = Math.min(255, Math.round(g + (255 - g) * amount));
  b = Math.min(255, Math.round(b + (255 - b) * amount));
  return `rgb(${r},${g},${b})`;
}

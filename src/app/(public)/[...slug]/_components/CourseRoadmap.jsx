'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { sanitizeRoadmapSvg } from '@/lib/roadmap/sanitizeRoadmapSvg';
import { ContentSection } from './ContentSection';

const isSvgUrl = (url) => /\.svg(\?|#|$)/i.test(url || '');

// The container no longer forces a 16:9 box (`aspect-video`) — roadmaps are wide
// and short (e.g. Power BI's 5:1) and letterboxed badly inside it. Each path
// below sizes the container to the asset's real proportions instead. `relative`
// stays because the SVG skeleton/overlay are positioned against it; `w-full` and
// `overflow-hidden` stay per spec.
const CONTAINER = 'relative w-full overflow-hidden';

// Reserve a non-zero height while the SVG's real aspect ratio is still unknown
// (during load, or if a fetched SVG has no viewBox to measure). Prevents the
// container collapsing to 0 and the skeleton vanishing / the page below jumping
// from 0 → full height once the markup lands.
const HEIGHT_RESERVE = 'min-h-[200px]';

/**
 * Derive the intrinsic w/h ratio from an SVG's `viewBox` so the container can
 * reserve the asset's true proportions before injecting the markup. Returns null
 * when there's no usable viewBox (caller falls back to HEIGHT_RESERVE).
 */
function parseSvgAspect(svg) {
  const m =
    /viewBox\s*=\s*["']\s*[\d.eE+-]+[\s,]+[\d.eE+-]+[\s,]+([\d.eE+-]+)[\s,]+([\d.eE+-]+)\s*["']/.exec(
      svg || '',
    );
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  return w > 0 && h > 0 ? w / h : null;
}

/**
 * Raster roadmap (png/jpg). `next/image` with `fill` needs a positioned ancestor
 * of KNOWN size — exactly the fixed box we're removing — so it can't inherit an
 * intrinsic height. Switched to width/height-based sizing (the repo's standard
 * `h-auto w-full` pattern, see ImageSection): the width/height only seed an
 * aspect ratio to reserve space pre-load; once the image loads the browser uses
 * its true intrinsic ratio, so no fixed letterbox and no zero-height collapse.
 */
function RasterRoadmap({ src, alt, className }) {
  return (
    <div className={`${CONTAINER} ${className}`} data-roadmap-container>
      <Image
        src={src}
        alt={alt}
        width={1600}
        height={900}
        sizes="(max-width: 1024px) 100vw, 800px"
        className="h-auto w-full object-contain"
      />
    </div>
  );
}

/**
 * Interactive SVG roadmap. The SVG carries embedded <a> links / actions
 * per node, so we inline the (sanitized) markup into the DOM rather than
 * rasterizing it through <img>/next/image, which would strip them.
 *
 * Sanitized with DOMPurify (SVG profile) before injection — these come
 * from our own MSDB admin uploads, but inline SVG can still carry script,
 * so raw injection is never acceptable. `sanitizeRoadmapSvg` strips scripts +
 * on* handlers (DOMPurify) and additionally scrubs the CSS inside any <style>
 * block (allowed so roadmaps can author hover as safe CSS `:hover` instead of
 * the `onmouseover` handlers DOMPurify strips — see that module).
 */
function InteractiveSvgRoadmap({ src, alt, className }) {
  const wrapperRef = useRef(null);
  // 'loading' | 'ready' | 'error'
  const [status, setStatus] = useState('loading');
  const [markup, setMarkup] = useState('');
  // Intrinsic w/h from the SVG's viewBox; null until measured.
  const [aspect, setAspect] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setMarkup('');
    setAspect(null);

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`roadmap fetch ${res.status}`);
        return res.text();
      })
      .then(async (svgText) => {
        if (cancelled) return;
        // Load DOMPurify lazily, in the browser only. A static top-level
        // import would be evaluated in the server bundle during SSR (even
        // though this is a client component), pulling in jsdom →
        // cssstyle → the ESM-only @csstools/css-calc, which Next's CJS
        // server build can't require(). The dynamic import keeps it off
        // the server entirely — this .then() runs only in the browser.
        const { default: DOMPurify } = await import('isomorphic-dompurify');
        if (cancelled) return;
        const clean = sanitizeRoadmapSvg(svgText, DOMPurify);
        setAspect(parseSvgAspect(clean));
        setMarkup(clean);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  // After injection, force external anchors to open in a new, isolated tab.
  useEffect(() => {
    if (status !== 'ready' || !wrapperRef.current) return;
    const anchors = wrapperRef.current.querySelectorAll('a');
    anchors.forEach((a) => {
      const href =
        a.getAttribute('href') ||
        a.getAttribute('xlink:href') ||
        '';
      if (/^https?:\/\//i.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }, [status, markup]);

  // Failed fetch/sanitize → still show the roadmap, non-interactive. The <img>
  // flows normally (`h-auto w-full`) so the container takes the image's intrinsic
  // height — no positioned ancestor, no reserve, and it can't collapse to zero.
  if (status === 'error') {
    return (
      <div className={`${CONTAINER} ${className}`} data-roadmap-container>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="h-auto w-full object-contain" />
      </div>
    );
  }

  // When the viewBox is known, drive the container height from the asset's real
  // aspect ratio so the injected SVG (w-full, h-auto) fills it with no empty
  // band. Until then (loading, or a viewBox-less SVG) fall back to a min-height
  // reserve so the skeleton is visible and the layout doesn't jump from zero.
  return (
    <div
      className={`${CONTAINER} ${aspect ? '' : HEIGHT_RESERVE} ${className}`}
      style={aspect ? { aspectRatio: aspect } : undefined}
      data-roadmap-container
    >
      {status === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-[var(--surface-muted)]" />
      )}
      {status === 'ready' && (
        <div
          ref={wrapperRef}
          role="img"
          aria-label={alt}
          className="absolute inset-0 flex items-center justify-center [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      )}
    </div>
  );
}

function RoadmapAsset({ src, alt, className }) {
  return isSvgUrl(src) ? (
    <InteractiveSvgRoadmap src={src} alt={alt} className={className} />
  ) : (
    <RasterRoadmap src={src} alt={alt} className={className} />
  );
}

/**
 * Decide which roadmap asset(s) to inline and how each is gated responsively.
 *
 * Returns `[]` (→ no section) when neither URL is set. Otherwise:
 *   - Different resolved URLs → TWO copies, mobile `block md:hidden` +
 *     desktop `hidden md:block` (unchanged behaviour).
 *   - SAME resolved URL (the common desktop-only case) → ONE copy shown at all
 *     breakpoints. Inlining the identical SVG twice duplicates every `id` in the
 *     file within one document; `url(#gradient)` refs then resolve to the FIRST
 *     match — which sits in the `display:none` mobile copy — and paint nothing.
 *     Rendering it once removes the collision while showing the same asset at
 *     every breakpoint. Compare the RESOLVED src strings, not which DB field was
 *     populated (both fields set to the same URL must also collapse to one).
 *
 * Pure + exported so the dedup decision is unit-testable without a client mount
 * (the SVG itself is injected in a browser-only effect).
 */
export function roadmapAssetPlan(course) {
  const desktop = course?.course_roadmap_desktop_url || '';
  const mobile = course?.course_roadmap_mobile_url || '';

  if (!desktop && !mobile) return [];

  // Fall back to whichever asset exists so a single-image course still
  // renders at every breakpoint.
  const desktopSrc = desktop || mobile;
  const mobileSrc = mobile || desktop;

  if (desktopSrc === mobileSrc) {
    return [{ src: desktopSrc, className: 'block' }];
  }
  return [
    { src: mobileSrc, className: 'block md:hidden' },
    { src: desktopSrc, className: 'hidden md:block' },
  ];
}

export function CourseRoadmap({ course }) {
  const assets = roadmapAssetPlan(course);
  if (assets.length === 0) return null;

  const alt = `${course.course_name} roadmap`;

  return (
    <ContentSection id="roadmap" title="Road Map">
      {assets.map((asset) => (
        <RoadmapAsset
          key={asset.className}
          src={asset.src}
          alt={alt}
          className={asset.className}
        />
      ))}
    </ContentSection>
  );
}

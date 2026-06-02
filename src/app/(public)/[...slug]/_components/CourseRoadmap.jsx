'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import DOMPurify from 'isomorphic-dompurify';
import { ContentSection } from './ContentSection';

const isSvgUrl = (url) => /\.svg(\?|#|$)/i.test(url || '');

const CONTAINER =
  'relative aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-9e-ice';

/**
 * Raster roadmap (png/jpg) — keep next/image optimization.
 */
function RasterRoadmap({ src, alt, className }) {
  return (
    <div className={`${CONTAINER} ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 800px"
        className="object-contain"
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
 * so raw injection is never acceptable.
 */
function InteractiveSvgRoadmap({ src, alt, className }) {
  const wrapperRef = useRef(null);
  // 'loading' | 'ready' | 'error'
  const [status, setStatus] = useState('loading');
  const [markup, setMarkup] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setMarkup('');

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`roadmap fetch ${res.status}`);
        return res.text();
      })
      .then((svgText) => {
        if (cancelled) return;
        const clean = DOMPurify.sanitize(svgText, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_ATTR: ['target', 'href', 'xlink:href'],
          ADD_TAGS: ['use'],
        });
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

  // Failed fetch/sanitize → still show the roadmap, non-interactive.
  if (status === 'error') {
    return (
      <div className={`${CONTAINER} ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className={`${CONTAINER} ${className}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-gray-100" />
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

export function CourseRoadmap({ course }) {
  const desktop = course?.course_roadmap_desktop_url || '';
  const mobile = course?.course_roadmap_mobile_url || '';

  if (!desktop && !mobile) return null;

  // Fall back to whichever asset exists so a single-image course still
  // renders at every breakpoint.
  const desktopSrc = desktop || mobile;
  const mobileSrc = mobile || desktop;
  const alt = `${course.course_name} roadmap`;

  return (
    <ContentSection id="roadmap" title="Road Map">
      {/* Mobile asset < md */}
      <RoadmapAsset src={mobileSrc} alt={alt} className="block md:hidden" />
      {/* Desktop asset >= md */}
      <RoadmapAsset src={desktopSrc} alt={alt} className="hidden md:block" />
    </ContentSection>
  );
}

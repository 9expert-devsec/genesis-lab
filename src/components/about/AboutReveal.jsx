'use client';

import { useEffect } from 'react';

/**
 * /about-us scroll reveal (round AB-3c). Renders nothing; after mount it
 * arms the page's [data-reveal] elements and reveals each ONCE as it first
 * enters the viewport. The sections stay server components and only carry
 * the data attributes.
 *
 * Visible by default: the hidden start state is CSS that applies only under
 * the ready class this component adds to <main> (see globals.css, About
 * block), so server HTML, crawlers, no-JS and a slow hydration all show
 * everything. Nothing is armed under prefers-reduced-motion, and anything
 * already on screen (or above it) at mount is marked revealed before the
 * ready class goes on, so it never flashes out and back in. The hero carries
 * no attribute: it is the first paint and the LCP.
 *
 * Units: a [data-reveal-group] reveals all of its [data-reveal] descendants
 * together, staggered 80ms (capped at the 6th item); a lone [data-reveal]
 * reveals by itself. A group is observed as one box, so cards inside a
 * horizontal swipe row reveal with their row, not when swiped to.
 */
const STAGGER_MS = 80;
const STAGGER_CAP = 5;
const DURATION_MS = 500;

export default function AboutReveal() {
  useEffect(() => {
    const main = document.querySelector('main[data-page="about"]');
    if (!main || typeof IntersectionObserver === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const units = new Map();
    main.querySelectorAll('[data-reveal-group]').forEach((g) => {
      units.set(g, [...g.querySelectorAll('[data-reveal]')]);
    });
    main.querySelectorAll('[data-reveal]').forEach((el) => {
      if (!el.closest('[data-reveal-group]')) units.set(el, [el]);
    });

    const pending = new Map();
    units.forEach((items, box) => {
      if (box.getBoundingClientRect().top < window.innerHeight) {
        items.forEach((el) => el.classList.add('is-revealed'));
      } else {
        pending.set(box, items);
      }
    });
    main.classList.add('reveal-ready');

    const timers = [];
    const reveal = (items) => {
      items.forEach((el, i) => {
        const delay = Math.min(i, STAGGER_CAP) * STAGGER_MS;
        el.style.setProperty('--reveal-delay', `${delay}ms`);
        el.classList.add('is-revealing', 'is-revealed');
        timers.push(setTimeout(() => {
          el.classList.remove('is-revealing');
          el.style.removeProperty('--reveal-delay');
        }, DURATION_MS + delay + 100));
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          reveal(pending.get(e.target) ?? []);
          pending.delete(e.target);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );
    pending.forEach((_, box) => io.observe(box));

    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
      main.classList.remove('reveal-ready');
    };
  }, []);

  return null;
}
